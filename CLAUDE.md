# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a GitOps-managed Kubernetes homelab cluster using Talos Linux as the OS and Flux CD for continuous delivery. The repository is a mono-repo managing both infrastructure (Talos/Terraform) and Kubernetes applications.

## Common Commands

This project uses [just](https://just.systems) for automation (Taskfile was replaced). Run `just --list` for modules and `just --list <module>` for recipes. Tools: `just workstation brew`. Talos recipes need talosctl v1.14+ and you must be signed in to 1Password (`op`).

**Kubernetes Operations (`just kube`):**
```bash
just kube sync es                    # Force-sync all ExternalSecrets (also: hr, ks, gitrepo, ocirepo)
just kube prune-pods                 # Delete Failed/Pending/Succeeded pods
just kube browse-pvc NS CLAIM        # Mount a PVC in a throwaway pod
just kube debug-node NODE            # Privileged shell on a node
```

**Talos Operations (`just talos`, nodes are addressed by IP):**
```bash
just talos render-config IP          # Render the layered machine config (contains secrets)
just talos diff-node IP              # Dry-run diff against the live node
just talos apply-node IP --mode try  # Apply config (try = auto-rollback)
just talos upgrade-node IP           # Upgrade Talos on a node
just talos generate-talosconfig      # Rebuild talos/talosconfig from 1Password
just talos kubeconfig                # Fetch kubeconfig
just talos download-image vX.Y.Z     # Download the Talos ISO
```

**VolSync Backup/Restore (`just kube`):**
```bash
just kube snapshot NS APP            # Manual snapshot, waits for completion
just kube restore NS APP [PREVIOUS]  # In-place restore (0 = latest snapshot)
just kube volsync suspend|resume     # Pause VolSync
```

**Bootstrap (`just bootstrap`, see docs/rebuild-cluster.md):**
```bash
just bootstrap talos    # Apply configs, bootstrap etcd, fetch kubeconfig
just bootstrap apps     # Secrets, CRDs, Cilium/CoreDNS/Spegel/cert-manager/Flux via helmfile
just bootstrap cluster  # Both stages
```

## Architecture

### Directory Structure
- `kubernetes/apps/` - Applications organized by namespace (default, observability, networking, media, home, database, etc.)
- `kubernetes/components/` - Reusable kustomize components (namespace, volsync, cnpg, nfs-scaler, dragonfly)
- `kubernetes/flux/` - Flux configuration and Helm/OCI repository sources
- `talos/` - Talos machine configs: layered Minijinja templates (`cluster`, `hardware/<class>`, `controlplane`/`worker`, `nodes/<class>/<ip>`) merged by `talosctl machineconfig patch`
- `bootstrap/` - Initial cluster bootstrap (helmfile.d with CRDs and apps)
- `terraform/` - Infrastructure as Code for non-K8s resources
- `.justfile` + `*/mod.just` - `just` automation (modules: bootstrap, kube, talos, workstation in `.workstation/`)
- `docs/` - Rebuild runbooks (rebuild-cluster, bootstrap-talos, bootstrap-apps)

### Core Stack
- **OS**: Talos Linux (immutable, minimal)
- **GitOps**: Flux CD (watches `kubernetes/` folder)
- **CNI**: Cilium (eBPF-based)
- **Ingress**: Envoy Gateway
- **Storage**: Rook/Ceph (block), NFS (file)
- **Secrets**: External Secrets Operator with 1Password
- **Backups**: VolSync with Restic
- **DNS**: External DNS (dual: UniFi private, Cloudflare public)

### Manifest Patterns

**App structure follows this convention:**
```
kubernetes/apps/<namespace>/<app-name>/
├── ks.yaml              # Flux Kustomization resource
└── app/
    ├── kustomization.yaml
    ├── helmrelease.yaml
    └── resources/       # ConfigMaps, secrets, etc.
```

**HelmRelease uses OCI repositories:**
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
spec:
  chartRef:
    kind: OCIRepository
    name: app-template   # or specific chart repo
```

**Kustomization uses components and postBuild substitution:**
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
spec:
  components:
    - ../../../../components/namespace
    - ../../../../components/volsync
  postBuild:
    substitute:
      APP: app-name
```

### Secret Management

Secrets use 1Password via ExternalSecrets with `op://` URI syntax:
```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
spec:
  secretStoreRef:
    kind: ClusterSecretStore
    name: onepassword-connect
  data:
    - secretKey: key-name
      remoteRef:
        key: op://vault/item/field
```

## CI/CD

- **flux-local.yaml** - Validates manifests on PRs using `flux-local test`
- **Renovate** - Automated dependency updates with auto-merge for trusted sources
- Changes merged to `main` are automatically synced by Flux (1h interval)

## Conventions

- 2-space indentation for YAML files
- Semantic commit messages with prefixes (e.g., `chore:`, `fix:`)
- Apps should include `dependsOn` in ks.yaml for proper deployment ordering
- Use existing components from `kubernetes/components/` when adding new apps
