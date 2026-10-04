# Rebuild the cluster from scratch

End-to-end runbook for rebuilding the cluster on bare nodes and restoring all data. Read this first; the two
stages have their own detail pages:

- [bootstrap-talos.md](bootstrap-talos.md) - machine configs, installing Talos, bootstrapping Kubernetes
- [bootstrap-apps.md](bootstrap-apps.md) - secrets, CRDs, Cilium/CoreDNS/Spegel/cert-manager/Flux

> **Status of this document.** The commands were written from the repo as it is today. The machine-config
> rendering, `generate-talosconfig`, and the `kube` recipes were exercised against the live cluster without
> changing it (validation, dry runs, read-only calls). **A full rebuild has never been run with this
> procedure**, and the restore paths (VolSync manual restore, CNPG recovery) are untested end to end.
> Steps marked *(untested)* are the ones to rehearse before you depend on them.

## The big picture

```
workstation prep ──▶ boot nodes from ISO ──▶ just bootstrap talos ──▶ just bootstrap apps
                                                                              │
                      data restore ◀── Flux reconciles everything from git ◀──┘
```

1. **Prep** - tools, 1Password, network, NFS (this page).
2. **Talos** - apply machine configs, bootstrap etcd, fetch kubeconfig (`just bootstrap talos`).
3. **Apps** - bootstrap secrets/CRDs, then helmfile installs only what Flux itself needs; Flux takes over
   (`just bootstrap apps`).
4. **Flux** reconciles `kubernetes/apps` in `dependsOn` order. Apps that use the `volsync` component get their
   PVC restored automatically from the Kopia repository on NFS.
5. **Databases** (CloudNative-PG) are restored manually from the WAL/base backups in Garage.

## What survives a rebuild and what does not

| Data | Where it lives | After a rebuild |
|---|---|---|
| Git repo, manifests | GitHub | Survives. Flux re-applies everything. |
| All secrets | 1Password vault `Kubernetes` | Survives. **The 1Password items are the root of trust**; losing them means re-creating the cluster PKI. |
| App config PVCs (`ceph-block`, volsync component) | Rook/Ceph on each node's `nvme1n1` | **Lost** with the disks. Restored automatically from the Kopia repo. |
| Kopia backup repository | NFS `mars.internal:/mnt/sharecache/VolsyncKopia` | Survives (not on the cluster). **Must not be touched.** |
| Garage (S3) data and metadata | NFS `mars.internal:/mnt/user/Kubernetes/garage/{data,meta}` | Survives. Needed before any database recovery. |
| PostgreSQL data (CNPG, `openebs-hostpath`) | Node-local `/var/mnt/extra/openebs` | **Lost** on wipe. Restored from barman backups in Garage. |
| Postgres logical dumps | NFS `mars.internal:/mnt/user/Kubernetes/apps/postgres` (4-hourly, outline) | Survives. Fallback if barman recovery fails. |
| Media | NFS `mars.internal:/mnt/user/data/media` | Survives. |
| Prometheus, VictoriaLogs data | `ceph-block` | Lost. Not backed up by design. |
| `*-cache` PVCs (sonarr, radarr, plex, tautulli, seerr, overseerr, home-assistant) | `ceph-block` | Lost. Not backed up; they start empty. |
| Wildcard TLS cert `pipitonelabs-com-tls` | 1Password (pushed by `certificates/export`) | Survives. Restored at bootstrap, which avoids Let's Encrypt rate limits. |
| Authentik configuration | Being moved to blueprints in git | Partly outside git today; check before a rebuild. |

Two PVCs are backed up but never mounted (`garage` and `outline` in the volsync component). They restore
empty and that is fine.

## Prerequisites

### Workstation

```bash
just workstation brew      # just, gum, talosctl, kubectl, helm, helmfile, flux, yq, jq, minijinja-cli, op ...
just workstation krew      # kubectl plugins (cnpg, rook-ceph, cert-manager, view-secret)
```

- `talosctl` **v1.14 or newer** is required. The Brewfile installs whatever Homebrew has; check
  `talosctl version --client`. Older clients cannot parse the typed config documents used in `talos/`.
- Sign in to 1Password: `eval $(op signin)` (or the desktop app integration). Every render runs `op inject`.
- Clone the repo and work from its root. The `.justfile` exports `KUBECONFIG`, `TALOSCONFIG` and
  `MINIJINJA_CONFIG_FILE` itself, so mise is optional.

### 1Password items (vault `Kubernetes`)

The rebuild needs these items to exist and be correct. The first four are needed before Flux is up.

| Item | Used for |
|---|---|
| `talos` | All machine and cluster PKI, tokens, secretbox key (`MACHINE_*`, `CLUSTER_*`). Also regenerates `talosconfig`. |
| `1password` | `OP_CREDENTIALS_JSON`, `OP_CONNECT_TOKEN` for the 1Password Connect server that External Secrets uses. |
| `pipitonelabs-com-tls` | Wildcard cert restored at bootstrap (note: lowercase vault name `kubernetes` in `bootstrap/resources.yaml`). |
| `volsync-template` | `KOPIA_PASSWORD`, the Kopia repository password. **Without it the backups are unreadable.** |
| `cloudnative-pg` | Database superuser and per-app credentials, Garage S3 keys used by barman. |
| `garage`, `flux`, `cloudflare`, `unifi`, `rook-ceph`, `authentik`, `tradeforge`, `budget`, `grafana`, ... | Per-app secrets, pulled by ExternalSecrets once Flux is up. |

### Network and infrastructure

- Nodes `192.168.10.10`, `.11`, `.12` (hostnames `m0`, `m1`, `m2`) on the main VLAN with DHCP, LACP bond on the
  two `igc` NICs, VLANs 20 and 30 trunked.
- `k8s.internal` must resolve to the API VIP `192.168.20.2`.
- UniFi BGP peering for Cilium (router side: [bgp-config.conf](bgp-config.conf); cluster ASN 64514, router 64513,
  peer `10.69.1.1`). LoadBalancer IPs come from `192.168.20.0/24`.
- NFS server `mars.internal` reachable, with the `VolsyncKopia`, `garage`, `apps/postgres` and media shares intact.
- GitHub reachable (the Flux `GitRepository` is the public HTTPS URL, no deploy key).
- DNS/Cloudflare records are managed by external-dns after the cluster is up.

### Disks

Each node installs Talos to the disk matched by serial (see `talos/nodes/baremetal/<ip>.yaml.j2`) and gives
Rook/Ceph the whole `nvme1n1` (`deviceFilter: nvme1n1`). **Ceph OSDs need clean disks.** On a rebuild over an
old cluster, wipe `nvme1n1` and `/var/lib/rook` first; see [rook-ceph.md](rook-ceph.md) ("Clean Rook Directory
on Storage Device") and `tools/wipe-rook.yaml`.

## Procedure

### 1. Bootstrap Talos

Follow [bootstrap-talos.md](bootstrap-talos.md). Short version:

```bash
just talos download-image v1.14.0      # write the ISO to USB; boot all three nodes from it
just talos generate-talosconfig        # talosconfig rebuilt from 1Password
just bootstrap talos                   # apply configs, bootstrap etcd, write kubernetes/kubeconfig
```

Nodes will show `NotReady`; that is expected until the CNI exists.

### 2. Bootstrap the apps

Follow [bootstrap-apps.md](bootstrap-apps.md). Short version:

```bash
just bootstrap apps
```

When it finishes, Cilium, CoreDNS, Spegel, cert-manager and Flux are running and Flux is pulling this repo.

### 3. Let Flux converge

```bash
flux get ks -A                   # everything should reach Ready, in dependsOn order
flux get hr -A
kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph status
```

Expect a long tail: Rook/Ceph must come up before any `ceph-block` PVC binds, and most media apps
`dependsOn` `rook-ceph/rook-ceph-cluster`. If something sits on "dependency not ready", look at the root of the
chain, not the leaf. `just kube sync ks` nudges all Kustomizations; `just kube prune-pods` clears Failed/Pending
pods that block waits.

### 4. Restore app data from VolSync

Automatic. Each app that uses the `kubernetes/components/volsync` component has a PVC whose `dataSourceRef`
points at its `ReplicationDestination` (`<app>-dst`). On a fresh cluster the volume populator runs that
destination once (`trigger.manual: restore-once`), restores the **latest** Kopia snapshot for that app from the
NFS repository into the new PVC, and only then does the pod start. The label
`kustomize.toolkit.fluxcd.io/ssa: IfNotPresent` stops Flux re-triggering it later.

What the restore depends on, in order: Rook/Ceph healthy (`ceph-block`, snapshot class `csi-ceph-block`),
`snapshot-controller`, `openebs-hostpath` (Kopia cache), the `volsync` HelmRelease (perfectra1n fork), the
`onepassword` ClusterSecretStore (for `<app>-volsync-secret`, which carries `KOPIA_PASSWORD`), and NFS reachable
(the repository is injected into every `volsync-*` Job by a MutatingAdmissionPolicy).

Watch it:

```bash
kubectl get pvc -A | rg -v Bound                     # Pending PVCs are waiting on their restore
kubectl get replicationdestination -A                # LAST SYNC should populate
kubectl get jobs -A | rg volsync-dst                 # the restore movers
```

Apps restored this way: home-assistant, autobrr, maintainerr, openbooks, overseerr, pinchflat, plex, prowlarr,
radarr, recyclarr, sabnzbd, seerr, sonarr, tautulli, grafana (plus the unused garage and outline PVCs).

**Manual or point-in-time restore** of a single app on a running cluster *(untested end to end)*:

```bash
just kube snapshot media plex          # take a fresh snapshot first if the app is healthy
just kube restore media plex 0         # 0 = latest snapshot, 1 = the one before, ...
```

`restore` suspends the Flux Kustomization and HelmRelease, scales the workload to zero, waits for pods using
the PVC to stop, runs a one-off `ReplicationDestination` (`<app>-manual`, copy method `Direct`) into the existing
PVC, then resumes Flux. It assumes the app is deployed by a HelmRelease named like its Kustomization and PVC,
as all apps using the volsync component are. The Kopia backend has no "unlock" step, so none of the old restic
unlock tasks exist any more.

### 5. Restore databases

CloudNative-PG clusters store data on node-local `openebs-hostpath`, which a wipe destroys. Backups are
WAL archives plus daily base backups sent by the barman-cloud plugin to **Garage**, which runs in the cluster
but keeps its data on NFS. That creates an ordering dependency:

1. Garage must be up and reachable at `https://s3.pipitonelabs.com` before any recovery can read backups. Garage
   only needs the `onepassword` store (its data is on NFS), but the hostname also needs envoy-internal, DNS and
   the wildcard certificate. Confirm: `curl -sI https://s3.pipitonelabs.com` and that the `garage-*` ObjectStores
   are healthy.
2. Recover each cluster from its ObjectStore. The manifests in
   `kubernetes/apps/database/cloudnative-pg/cluster/` carry a commented-out recovery stanza and a
   `serverName` convention (`<cluster>-vN`, with the previous name under `externalClusters`). The pattern
   *(untested in this repo)*: uncomment `bootstrap.recovery.source: source`, point the `externalClusters`
   entry's `serverName` at the name the backups were written under, and give the cluster's own plugin
   `serverName` a **new** suffix (for example `postgres17-v18`) so the new archive does not collide with the
   old one. Commit, let Flux apply, and watch `kubectl cnpg status <cluster> -n database`.

| Cluster | Backups (bucket) | `serverName` in use today |
|---|---|---|
| `postgres17` | `s3://cloudnative-pg/` | `postgres17-v17` |
| `outline` | `s3://outline-pg/` | `outline-v16` |
| `tradeforge-pg` | `s3://tradeforge-pg/` | `tradeforge-pg-v1` - bootstraps with `initdb` + seed SQL today, so a rebuild creates an empty schema unless you add a recovery source |

If barman recovery fails, `outline` also has 4-hourly logical dumps on NFS
(`mars.internal:/mnt/user/Kubernetes/apps/postgres`).

Apps that need a database (outline, authentik, tradeforge, budget, supabase-studio) wait on
`database/cloudnative-pg-cluster`, so they come up after the recovery completes.

### 6. Loose ends

- **GitHub webhook**: the receiver token comes from 1Password item `flux`, but the webhook URL path changes
  with a new cluster; re-register it in the repo settings.
- **Cloudflare/UniFi DNS**: recreated by external-dns from the Gateway/HTTPRoute resources; if names are
  missing, check the external-dns pod logs.
- **Authentik**: verify blueprints applied and users/providers exist.
- **Cilium/BGP**: `kubectl get ciliumbgpclusterconfigs,ciliumbgppeerconfigs,ciliumbgpadvertisements` and check the session on the
  router.
- **API VIP**: Talos advertises `192.168.20.2` on `bond0`, and a Cilium `kube-vip` LoadBalancer Service also
  requests `192.168.20.2`. Confirm which one answers after bootstrap and that they are not fighting.

## Verification checklist

- [ ] `kubectl get nodes` - three nodes `Ready`, version v1.37.x
- [ ] `flux get ks -A` and `flux get hr -A` - nothing `False`
- [ ] `ceph status` - `HEALTH_OK` (the four `AUTH_INSECURE_*` codes are muted on purpose)
- [ ] `kubectl get pvc -A` - all `Bound`
- [ ] `kubectl cnpg status` for each cluster - healthy, with a recent backup
- [ ] Spot-check restored apps (plex library, sonarr/radarr history, grafana dashboards)
- [ ] `https://s3.pipitonelabs.com`, Authentik login, `flux` webhook delivering

## Known gaps to close before you rely on this

- No end-to-end rebuild has been rehearsed. Do one on spare hardware or VMs, at least through steps 1-4.
- CNPG recovery is manual and depends on Garage; consider a scripted recovery or an S3 target outside the
  cluster for the barman archives.
- `talos/schematics/baremetal.yaml.j2` lists `intel-ice-firmware`, but the running nodes were installed without it (see
  [bootstrap-talos.md](bootstrap-talos.md)). A fresh install would therefore not match today's nodes.
- Keep a copy of the 1Password vault backup somewhere that does not depend on the cluster.
