# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a GitOps-managed Kubernetes homelab cluster using Talos Linux as the OS and Flux CD for continuous delivery. The repository is a mono-repo managing both infrastructure (Talos/Terraform) and Kubernetes applications.

## Common Commands

This project uses Task (Taskfile) for automation. Run `task --list` to see all available tasks.

**Kubernetes Operations:**
```bash
task kubernetes:sync-secrets         # Sync all ExternalSecrets
task kubernetes:cleanse-pods         # Clean up Failed/Pending pods
task kubernetes:browse-pvc CLAIM=X   # Mount PVC to container for debugging
```

**Talos Operations:**
```bash
task talos:apply-node NODE=X         # Apply Talos config to a node
task talos:upgrade-node NODE=X       # Upgrade Talos version on a node
task talos:generate-kubeconfig       # Generate kubeconfig from Talos
task talos:generate-iso VERSION=X    # Generate bootable Talos ISO
```

**VolSync Backup/Restore:**
```bash
task volsync:snapshot NS=X APP=Y              # Create backup snapshot
task volsync:restore NS=X APP=Y PREVIOUS=Z    # Restore from backup
```

**Bootstrap:**
```bash
task bootstrap:talos    # Bootstrap Talos cluster
task bootstrap:apps     # Bootstrap Kubernetes apps via helmfile
```

## Architecture

### Directory Structure
- `kubernetes/apps/` - Applications organized by namespace (default, observability, networking, media, home, database, etc.)
- `kubernetes/components/` - Reusable kustomize components (namespace, volsync, cnpg, nfs-scaler, dragonfly)
- `kubernetes/flux/` - Flux configuration and Helm/OCI repository sources
- `talos/` - Talos machine configs with Minijinja templating
- `bootstrap/` - Initial cluster bootstrap (helmfile.d with CRDs and apps)
- `terraform/` - Infrastructure as Code for non-K8s resources
- `.taskfiles/` - Task automation scripts

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
