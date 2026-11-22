# How machine configs work

A node's config is built on demand from four layers of templates. No rendered config or secret is stored in Git.

## Layers

| Order | File in `talos/` | Applies to | Contains |
|---|---|---|---|
| 1 | `cluster.yaml.j2` | Every node | Kubelet, pod and service ranges, sysctls, NFS options, containerd, time, DNS |
| 2 | `hardware/<class>.yaml.j2` | A hardware class | Installer image, links, VLANs, CPU and NIC tuning, GPU label |
| 3 | `controlplane.yaml.j2` or `worker.yaml.j2` | A role | Control plane and VIP, or the worker's zone label |
| 4 | `nodes/<class>/<ip>.yaml.j2` | One node | Role, hostname, install disk, bond MAC |

`render-config` renders each layer with `minijinja-cli`, injects secrets with `op inject`, and merges them with
`talosctl machineconfig patch`. A node file's directory is its hardware class and its name is the node's IP.

`secrets.yaml.j2` is separate. It is only used to generate the talosconfig.

## Hardware classes

| Class | Nodes | Installer |
|---|---|---|
| `baremetal` | `m0`, `m1`, `m2` | Metal, Intel schematic |
| `baremetal-amd` | `w2` | Metal, AMD schematic |
| `proxmox` | `w0`, `w1`, not built | Nocloud, VM schematic |

## Inspect a config

```bash
just talos validate-node 192.168.10.10   # check it
just talos diff-node 192.168.10.10       # compare with the live node
just talos render-config 192.168.10.10   # print it
```

> [!WARNING]
> `diff-node` and `render-config` print secrets. Never paste their output anywhere.

## Version pins

| Pin | File | Updated by |
|---|---|---|
| Kubelet | `cluster.yaml.j2` | Renovate |
| API server, controller manager, scheduler, kube-proxy | `controlplane.yaml.j2` | Renovate |
| Talos installer | `hardware/*.yaml.j2` | By hand |

All of them must equal tuppr's targets. Applying an older pin downgrades that node.

## Decisions worth knowing

- **No CNI from Talos.** It installs Flannel only if a `KubeFlannelCNIConfig` document exists. There is none.
  There is no `cni: none` setting in the typed config.
- **No kube-proxy or Talos CoreDNS.** Both are disabled. Cilium and the CoreDNS chart replace them.
- **No control-plane taint.** `KubeNodeConfig` sets no taints. `allowSchedulingOnControlPlanes` is rejected
  next to it.
- **Labels are explicit.** Talos removes a label it owns when that label leaves `KubeNodeConfig`.
- **The kubelet stays in the legacy document.** The typed `KubeletConfig` has no `extraMounts`, which OpenEBS
  needs.
- **Authorizers are explicit.** Without `KubeAuthorizerConfig` documents, the API server crash-loops with
  "at least one authorization mode must be defined".
