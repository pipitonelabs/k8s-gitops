# Command reference

Run these from the repository root. `just --list` and `just --list MODULE` show the same recipes.

## Bootstrap

| Command | Does |
|---|---|
| `just bootstrap talos` | Apply configs, create etcd, fetch the kubeconfig |
| `just bootstrap apps` | Secrets, CRDs, core releases, Flux |
| `just bootstrap cluster` | Both |

## Talos

Nodes are addressed by IP.

| Command | Does |
|---|---|
| `just talos render-config IP` | Print the config, including secrets |
| `just talos validate-node IP` | Validate the config |
| `just talos diff-node IP` | Diff against the live node, including secrets |
| `just talos apply-node IP [ARGS]` | Apply the config |
| `just talos generate-talosconfig` | Rebuild the talosconfig |
| `just talos kubeconfig` | Fetch the kubeconfig |
| `just talos schematic-id [CLASS]` | Print a schematic ID |
| `just talos download-image VERSION` | Download the MS-01 ISO |
| `just talos upgrade-node IP` | Upgrade Talos on a node |
| `just talos upgrade-k8s VERSION` | Upgrade Kubernetes |
| `just talos reboot-node IP` | Reboot a node |
| `just talos shutdown-node IP` | Shut down a node |
| `just talos shutdown-cluster` | Shut down every node in `talos/nodes/` |
| `just talos reset-node IP` | Wipe a node |
| `just talos reset-cluster` | Wipe every node in `talos/nodes/` |

## Kubernetes

| Command | Does |
|---|---|
| `just kube sync KIND` | Force-sync every `es`, `hr`, `ks`, `gitrepo`, or `ocirepo` |
| `just kube prune-pods` | Delete all Failed, Pending, and Succeeded pods |
| `just kube browse-pvc NS CLAIM` | Mount a PVC in a temporary pod |
| `just kube debug-node NODE` | Privileged shell on a node |
| `just kube view-secret NS SECRET` | Print a decoded secret |
| `just kube snapshot NS NAME` | Back up a volume now |
| `just kube restore NS APP [PREVIOUS]` | Restore a volume in place |
| `just kube volsync suspend` | Pause VolSync |
| `just kube volsync resume` | Resume VolSync |

## Workstation

| Command | Does |
|---|---|
| `just workstation brew` | Install the tools |
| `just workstation krew` | Install the kubectl plugins |
