# Set up a workstation

## 1. Clone the repository

```bash
git clone https://github.com/pipitonelabs/k8s-gitops.git
cd k8s-gitops
```

Run every command in these docs from the repository root.

## 2. Install the tools

```bash
brew install just
just workstation brew
just workstation krew
```

| Tool | Used for |
|---|---|
| `just` 1.55 or newer | Every automated step |
| `talosctl` 1.14 or newer | Talos API and config merging |
| `minijinja-cli` | Rendering templates |
| `op` | Injecting secrets into rendered templates |
| `kubectl`, `helm`, `helmfile` | Kubernetes bootstrap |
| `flux` | Watching and controlling GitOps |
| `yq`, `jq`, `gum`, `curl` | Used by the recipes |
| `mise` | Setting the environment and running flate |
| `rg` (`brew install ripgrep`) | Used by commands in these docs |
| krew plugins | `cnpg`, `rook-ceph`, `cert-manager`, `view-secret` |

Older `talosctl` versions cannot read the typed config documents in `talos/`.

## 3. Set the environment

The `.justfile` sets these for its own recipes. Direct `kubectl` and `talosctl` commands need them too. mise
sets the first three automatically, once you run `mise trust`.

```bash
export KUBECONFIG="$PWD/kubernetes/kubeconfig"
export TALOSCONFIG="$PWD/talos/talosconfig"
export MINIJINJA_CONFIG_FILE="$PWD/.minijinja.toml"
export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"
```

## 4. Sign in to the secret store

```bash
eval "$(op signin)"
```

Keep a backup of the secret store that does not depend on this cluster.

## Checklist

- [ ] `just --list` shows `bootstrap`, `kube`, `talos`, and `workstation`
- [ ] `talosctl version --client` reports 1.14 or newer
- [ ] `kubectl cnpg version` works
- [ ] `op whoami` succeeds
- [ ] `curl -sI https://factory.talos.dev` answers
