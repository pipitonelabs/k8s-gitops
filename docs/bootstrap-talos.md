# Bootstrap Talos

How the machine configs are built, how to install Talos on bare nodes, and how `just bootstrap talos` brings up
etcd and Kubernetes. Part of [rebuild-cluster.md](rebuild-cluster.md).

Requirements: `talosctl` **v1.14+**, `minijinja-cli`, `op` (signed in to 1Password), `yq`, `jq`, `curl`, `gum`,
`just`. `just workstation brew` installs them.

## How the machine config is built

Nodes are configured from layered Jinja templates in `talos/`. Each layer is rendered with `minijinja-cli`,
passed through `op inject` (which replaces every `op://Kubernetes/talos/...` reference with the real secret),
and the layers are merged with `talosctl machineconfig patch`. Nothing with a secret in it is stored in git.

| File | Applies to | Contents |
|---|---|---|
| `cluster.yaml.j2` | every node | Shared settings that do not depend on the machine: CA/tokens, resolver, NTP, discovery, sysctls, NFS mount options, containerd customisation, kubelet, watchdog, Kube network/prism/node config |
| `hardware/baremetal.yaml.j2` | m0, m1, m2 | Installer image (metal, computed schematic), `bond0` (LACP over `enp87s0` + `enp89s0`), VLANs 20 and 30, NIC ring sizes, thunderbolt, CPU frequency tuning, hugepages, GPU label |
| `hardware/proxmox.yaml.j2` | Proxmox VMs | Installer image (nocloud, the VM schematic). No link config: the NIC is `eth0` and gets its address from the cloud-init drive |
| `controlplane.yaml.j2` | control-plane nodes | Control-plane CA keys, etcd, API VIP `192.168.20.2`, API server / controller-manager / scheduler / kube-proxy / CoreDNS config, etcd encryption, Talos API access for the runner and tuppr |
| `worker.yaml.j2` | worker nodes | Zone label |
| `nodes/<hardware>/<ip>.yaml.j2` | one node | Machine type, hostname, install disk serial (bare metal). The directory name is the node's hardware class |
| `schematics/baremetal.yaml.j2`, `schematics/proxmox.yaml.j2` | factory image | System extensions (and kernel args) for each hardware class. The IDs are computed at render time |
| `secrets.yaml.j2` | talosconfig only | Secrets bundle rebuilt from 1Password, used by `generate-talosconfig` |

The layering logic lives in `talos/mod.just` (`render-config`). Nodes are addressed by IP everywhere
(`192.168.10.10`, `.11`, `.12` = `m0`, `m1`, `m2`).

```bash
just talos render-config 192.168.10.10     # print the merged config (contains secrets, do not paste it anywhere)
just talos validate-node 192.168.10.10     # talosctl validate --mode metal
just talos diff-node 192.168.10.10         # dry run against the live node (secrets NOT redacted in the output)
```

Things deliberately still in the legacy `v1alpha1` document because there is no typed equivalent:
`machine.kubelet` (including `extraMounts` for `/var/mnt/extra`, which openebs-hostpath needs, and
`disableManifestsDirectory`), CA/token fields, etcd settings, and `machine.features` (`rbac`,
`apidCheckExtKeyUsage`, `diskQuotaSupport`). A typed `KubeletConfig` cannot be combined with `machine.kubelet`,
and `KubeNodeConfig` cannot be combined with `machine.kubelet.nodeIP`, so node IP and labels are typed while the
rest of the kubelet stays legacy.

### Image and versions

The installer image is `factory.talos.dev/metal-installer/<schematic-id>:<version>`. The schematic ID is
**computed at render time** by POSTing `talos/schematics/<hardware>.yaml.j2` to the factory (`just talos schematic-id <hardware>`);
the version is written in `cluster.yaml.j2`.

**Versions are driven by tuppr, not by this repo.** tuppr upgrades Talos and Kubernetes
(`kubernetes/apps/system-upgrade/tuppr/upgrades/`). The versions in the templates must be kept equal to tuppr's
targets by hand, or applying the template rolls a node backwards: applying the old pinned Kubernetes images once
downgraded a node's control plane until tuppr repaired it (PRs #2364 and #2365 fixed the template).
The pinned values are the installer tag in `cluster.yaml.j2` and the kubelet / kube-apiserver /
kube-controller-manager / kube-scheduler / kube-proxy images in `cluster.yaml.j2` and `controlplane.yaml.j2`.
They carry `# renovate:` comments, but Renovate's custom manager does not match `.yaml.j2` files yet, so nothing
bumps them automatically.

> **Open question: schematic drift.** The running nodes have extensions `i915`, `intel-ucode`, `mei`,
> `nfsrahead`, `thunderbolt` (schematic `7af7f1f3...`). `schematics/baremetal.yaml.j2` also lists `intel-ice-firmware`, so
> the computed schematic is `10884449...` and a fresh install or `just talos upgrade-node` would add that
> extension. Decide whether it is wanted; if not, remove it from `schematics/baremetal.yaml.j2`. Rendered configs embed the
> computed image, so this matters the next time the image is used.

## Fresh install

### 1. Network prerequisites

DHCP reservations so the nodes come up as `192.168.10.10` / `.11` / `.12`. After bonding, the bond takes the MAC
of the first NIC: `58:47:ca:7b:ec:1c` (m0), `58:47:ca:7b:f4:24` (m1), `58:47:ca:7b:f3:cc` (m2). Verify
against your DHCP server, because in maintenance mode (before the bond exists) the node uses a NIC's own
address. The switch ports must already trunk VLANs 20 and 30 with LACP on the two NICs, or the node will lose
the network when the bond is applied.

### 2. Build and boot the installer

```bash
just talos download-image v1.14.0       # writes talos/talos-v1.14.0-<schematic>.iso
```

Write the ISO to USB, boot each node from it, and leave it in maintenance mode (the API listens on port 50000
without client authentication until a config is applied). It installs to the disk whose serial matches
`nodes/baremetal/<ip>.yaml.j2`:

| Node | Install disk serial |
|---|---|
| `192.168.10.10` (m0) | `24514D235ECB` |
| `192.168.10.11` (m1) | `25014D60E51E` |
| `192.168.10.12` (m2) | `24514D121897` |

Rook/Ceph takes the whole `nvme1n1` later; do not point the install selector at it.

### 3. Generate `talosconfig`

```bash
just talos generate-talosconfig         # writes talos/talosconfig (gitignored), endpoints and nodes = the three IPs
```

The client certificate is regenerated from the machine CA in 1Password, so any workstation with 1Password
access can recreate it; nothing needs to be saved. Verified: a config generated this way authenticates to the
live nodes.

### 4. Apply configs and bootstrap

```bash
just bootstrap talos
```

Stages, all safe to re-run:

1. **nodes** - for each file in `talos/nodes/`, `just talos apply-node <ip> --insecure`. If a node already has a
   config (the API answers `certificate required`), it is skipped.
2. **k8s** - `talosctl bootstrap` against the first endpoint, retried until it reports `AlreadyExists`. This is
   the step that creates etcd; run it only once per cluster (the retry loop is how it tolerates re-runs).
3. **kubeconfig (node)** - `talosctl kubeconfig` into `kubernetes/kubeconfig` (context `k8s`), pointed at the
   first node's IP, because the `k8s.internal` VIP is not reachable before the CNI exists.

Nodes reboot after the install and come back with the real config. They stay `NotReady` until Cilium is
installed by [bootstrap-apps.md](bootstrap-apps.md). Check with:

```bash
talosctl -n 192.168.10.10 health --server=false      # etcd up, API up
kubectl get nodes                                     # NotReady is expected here
```

## Adding a worker VM

Worker VMs are created by [talos-vm-workers](https://github.com/pipitonelabs/talos-vm-workers) (OpenTofu,
Proxmox). Each VM boots the Talos `nocloud` image at a static address and waits in maintenance mode. This
repo only supplies its machine config.

1. In talos-vm-workers, add the node to `nodes` and `just apply`. `just wait <name>` blocks until it answers.
2. Here, add `talos/nodes/proxmox/<ip>.yaml.j2` (machine type `worker` and a hostname), then check it:

   ```bash
   just talos validate-node 192.168.10.13
   ```

3. Join it:

   ```bash
   just talos apply-node 192.168.10.13 --insecure
   kubectl get nodes -w
   ```

Things that must be true first:

- Cilium's `devices` includes `eth+` (the VM NIC is `eth0`), or the agent fails and the node never goes Ready.
- The node's address is a BGP neighbor on the router (`docs/bgp-config.conf` lists `.13` and `.14`), or
  LoadBalancer services with `externalTrafficPolicy: Local` are unreachable when their pod lands there.
- `just talos schematic-id proxmox` here prints the same ID as `tofu output schematic_id` in talos-vm-workers
  (`talos/schematics/proxmox.yaml.j2` is a copy of that repo's `schematic.yaml`; keep them in sync).

Workers use the existing Rook/Ceph storage as clients and get no OSD. **No worker has been joined with this
procedure yet.**

## Changing the config on a running cluster

1. Edit the template, then `just talos diff-node <ip>` for each node and read the diff.
2. First apply with a rollback safety net, especially for anything touching the network:

   ```bash
   just talos apply-node 192.168.10.10 --mode try     # reverts by itself after the timeout (default 1m)
   ```

   If the node is still reachable and healthy, re-run without `--mode try` to keep it.
3. Do one node at a time. Check `kubectl get nodes`, `ceph status` and `flux get ks -A` before the next.
4. Most settings apply without a reboot; the tool prints `Applied configuration without a reboot` when that is
   the case. Kubelet settings restart the kubelet.

### Migrating the running cluster to these templates

**The layered templates have not been applied to the live nodes yet.** They replaced a single
`machineconfig.yaml.j2` in the legacy format. They validate (`talosctl validate --mode metal`, all three nodes)
and were compared to the live config with a dry run, but applying moves the bond, VLANs and VIP into new
document types, so do it with care:

- Do m0 first with `--mode try`, confirm it stays reachable on `192.168.10.10`, then apply for real.
- Wait for `kubectl get nodes` and `ceph status` to settle, then m1, then m2.
- Expected differences versus the old config: hostname is now a `HostnameConfig` (same value,
  `mN.k8s.internal`); the bond is explicit about its member NICs (`enp87s0`, `enp89s0`, the same on all three
  nodes) instead of selecting by MAC prefix and driver; `DHCPv4Config` uses the `mac` client identifier;
  `topology.kubernetes.io/zone: m` moved to the control-plane `KubeNodeConfig`.
- Intentionally dropped because the typed documents reject them or they are the new default:
  `cluster.network.cni: none`, `allowSchedulingOnControlPlanes` (nodes have no taints today and none are
  added), `cluster.discovery.registries.kubernetes.disabled`, `apiServer.disablePodSecurityPolicy`.
- The bond config leaves `updelay`/`downdelay` unset to match today's behaviour; `validate` prints a warning
  for that.

## Upgrades, reboots, resets

- **Normal path:** tuppr upgrades Talos and Kubernetes from `kubernetes/apps/system-upgrade/tuppr/upgrades/`.
  Then update the pinned versions in the templates (see above).
- **Manual:** `just talos upgrade-node <ip>` (uses the installer image from the rendered config; see the schematic
  note), `just talos upgrade-k8s <version>`, `just talos reboot-node <ip>`.
- **Reset:** `just talos reset-node <ip>` / `reset-cluster` wipe the node (`--graceful=false`). The ephemeral
  partition includes `/var/mnt/extra`, so **this destroys node-local PostgreSQL data** (openebs-hostpath). Make
  sure database backups are current before a reset, and see the database section of
  [rebuild-cluster.md](rebuild-cluster.md).
- **Shutdown:** `just talos shutdown-node <ip>` / `shutdown-cluster`.

## Troubleshooting

- `unknown document kind` / `not registered` while rendering: your `talosctl` is older than v1.14.
- `talosctl` reaching a node by a name and failing with `network is unreachable` over an IPv6 address: the
  name resolved to an IPv6 address your network no longer routes. Use the node IP (`-e <ip> -n <ip>`). Your
  default `~/.talos/config` lists nodes by name; `talos/talosconfig` from `generate-talosconfig` uses IPs.
- `apply-node` says `certificate required`: the node already has a config and needs authenticated access; drop
  `--insecure`.
- `op inject` fails: sign in again, and check the item/field exists (`op item get talos --vault Kubernetes`).
- Schematic POST fails or hangs: factory.talos.dev must be reachable from the workstation.
