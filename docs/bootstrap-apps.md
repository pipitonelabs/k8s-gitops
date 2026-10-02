# Bootstrap Kubernetes apps

What `just bootstrap apps` does, why it is ordered the way it is, and how Flux takes over. Part of
[rebuild-cluster.md](rebuild-cluster.md). Run it after [bootstrap-talos.md](bootstrap-talos.md) has finished
(nodes exist and etcd is bootstrapped).

```bash
just bootstrap apps        # all stages; safe to re-run
```

## The problem this solves

A fresh cluster has no CNI, so nodes are `NotReady` and nothing can be scheduled. Flux is itself a set of pods
that need a CNI, DNS, and certificates. So a small fixed set of components is installed with **helmfile**, in
dependency order, until Flux can run. After that, everything else, including those same components, is managed
by Flux from git.

## Stages

Defined in `bootstrap/mod.just`. Each is idempotent.

1. **kubeconfig (node)** - fetch `kubernetes/kubeconfig` (context `k8s`) and point it at a node IP, because the
   `k8s.internal` VIP (`192.168.20.2`) is not reachable yet.
2. **ready** - wait for every node's `kube-apiserver` to answer `/readyz`, then wait for all nodes to register.
   Nodes register as `Ready=False` and only become `Ready=True` once Cilium is healthy, so the recipe waits for
   `Ready=False`.
3. **base** - applies `bootstrap/resources.yaml` through `op inject`, then the CRDs:
   - **Namespaces**: `external-secrets`, `security`, `observability`, `networking`.
   - **`external-secrets/onepassword-secret`**: `1password-credentials.json` and `token` for the 1Password
     Connect server, from 1Password item `1password` (`OP_CREDENTIALS_JSON`, `OP_CONNECT_TOKEN`). This is the
     one secret External Secrets cannot fetch for itself, so it is injected by hand.
   - **`networking/pipitonelabs-com-tls`**: the wildcard certificate and key from 1Password item
     `pipitonelabs-com-tls`, annotated for cert-manager. Restoring the existing cert avoids Let's Encrypt rate
     limits on a rebuild (it is pushed back to 1Password by `kubernetes/apps/networking/certificates/export`).
   - **CRDs** rendered from `bootstrap/helmfile.d/00-crds.yaml` and applied server-side: external-secrets,
     envoy-gateway, keda, kube-prometheus-stack, grafana-operator. They are installed first so that resources
     in the later HelmReleases (ServiceMonitors, ExternalSecrets, Gateways) have their CRDs.
4. **helmfile** - `helmfile sync` of `bootstrap/helmfile.d/01-apps.yaml`, one release at a time, each waiting for
   readiness (`wait`, `waitForJobs`), in this chain:

   | Order | Release | Why it is here |
   |---|---|---|
   | 1 | `kube-system/cilium` | CNI, kube-proxy replacement. **Postsync hook** applies `kubernetes/apps/kube-system/cilium/config` (BGP peering and advertisements, the LoadBalancer IP pool `192.168.20.0/24`, and the `kube-vip` Service for the API). Nodes go `Ready` after this. |
   | 2 | `kube-system/coredns` | Cluster DNS (Talos CoreDNS is disabled). |
   | 3 | `kube-system/spegel` | Peer-to-peer image mirror, so later pulls are served by the other nodes. |
   | 4 | `cert-manager/cert-manager` | Certificates; Flux's webhook and gateways need it. |
   | 5 | `flux-system/flux-operator` | Installs and manages the Flux controllers. |
   | 6 | `flux-system/flux-instance` | Creates the Flux `GitRepository` and starts reconciling. |

5. **kubeconfig** - fetch the kubeconfig again without the node override, so it points back at `k8s.internal`.

## Single source of truth for versions and values

The helmfile has no versions or values of its own. `bootstrap/helmfile.d/templates/values.yaml.gotmpl` reads the
values from the matching Flux `HelmRelease` under `kubernetes/apps/<namespace>/<name>/app/helmrelease.yaml`
(`spec.values`). What Renovate bumps in the repo is therefore what a rebuild installs. Two things to remember:

- The chart **versions** in `01-apps.yaml` and `00-crds.yaml` are written in those files. Renovate's helmfile
  support should bump them, but confirm after a bump that they still equal the versions in the `HelmRelease` /
  `OCIRepository` of each app. A mismatch means Flux will change the release again right after bootstrap, which
  is usually harmless but worth knowing.
- To add a release to the bootstrap chain, add it to `01-apps.yaml` with a `needs:` entry, and make sure its
  `HelmRelease` exists at the path above.

## Flux takes over

`flux-instance` creates a `GitRepository` for `https://github.com/pipitonelabs/k8s-gitops` (public HTTPS, branch
`main`, path `./kubernetes/flux/cluster`, no deploy key). From there:

1. `kubernetes/flux/cluster/ks.yaml` defines `flux-repositories` (Helm/OCI sources) and `cluster-apps`
   (`./kubernetes/apps`, after the sources, patching every child with retry and remediation defaults).
2. Every app's `ks.yaml` carries `dependsOn`, so Flux brings things up in order: External Secrets and the
   1Password store, then Rook/Ceph, VolSync, and the databases, then the apps that need them.
3. Flux adopts the helmfile-installed releases (cilium, coredns, spegel, cert-manager, flux-operator,
   flux-instance) as normal `HelmRelease`s and keeps them up to date from then on. The GitHub webhook token is
   pulled by an ExternalSecret (item `flux`) once External Secrets is running.

```bash
flux get sources git -A          # flux-system should be Ready and on the latest main commit
flux get ks -A                   # watch the tree fill in
kubectl -n flux-system get pods
```

## What is *not* done by this stage

- No Ceph, no storage classes, no apps: Flux does that. PVCs stay `Pending` until Rook/Ceph is up.
- No data restore: see [rebuild-cluster.md](rebuild-cluster.md) (VolSync is automatic once Flux creates the PVCs;
  databases are a manual step).
- No SOPS/age and no `flux bootstrap`: the secrets chain is 1Password only.

## Troubleshooting

- **`ready` loops forever on "Waiting for kube-apiserver"**: etcd is not bootstrapped or the node IPs are wrong;
  run `just bootstrap talos` first and check `talosctl -n 192.168.10.10 service etcd`.
- **`helmfile sync` times out on a release**: `kubectl get pods -A` and `kubectl describe` the stuck pod. Usual
  causes: Cilium not ready (nodes still `NotReady`), registry unreachable (Spegel has no peers yet, so images
  come from upstream), or an operator's CRDs missing from `00-crds.yaml`.
- **Flux `GitRepository` not ready**: the repo is fetched over HTTPS without credentials; check outbound access
  to GitHub and `flux logs -n flux-system`.
- **ExternalSecrets fail**: the `onepassword-secret` was not injected or the Connect server is not running
  (`kubectl -n external-secrets get pods`, `just kube view-secret external-secrets onepassword-secret`). Re-run
  `just bootstrap apps` after fixing 1Password access.
- **Re-running is safe**: CRDs and resources use server-side apply, and `helmfile sync` upgrades in place. The
  only step that must run once per cluster is `talosctl bootstrap` in the Talos stage.
