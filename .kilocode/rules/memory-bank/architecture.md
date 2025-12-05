# Architecture

## System Overview
Production-grade Talos Linux Kubernetes homelab cluster using FluxCD for GitOps declarative management. Semi-hyperconverged architecture: compute workloads and block storage (Rook-Ceph) share node resources; separate UnRAID server for NFS/SMB bulk storage and backups. High availability control plane, Cilium eBPF networking, automated TLS, secrets, monitoring, and dependency updates.

## Directory Structure and Key Paths
```
.
├── bootstrap/                 # Initial helmfile-based core infra deployment
│   ├── resources.yaml         # Base namespaces (external-secrets, networking, etc.) + secrets
│   └── helmfile.d/            # 00-crds.yaml (CRDs), 01-apps.yaml (Cilium, CoreDNS, Spegel, Cert-Manager, Flux)
├── kubernetes/                # Flux-managed manifests
│   ├── apps/                  # Namespaced apps (recursive Flux discovery)
│   │   ├── ai/                # Ollama, Qdrant, Nomic-Embed-Text
│   │   ├── media/             # Tautulli, SABnzbd, Maintainerr
│   │   ├── database/          # CloudNativePG
│   │   ├── default/           # Wiki, Garage
│   │   ├── actions-runner-system/ # GH Actions runners
│   │   ├── cert-manager/      # TLS automation
│   │   ├── rook-ceph/         # Distributed storage
│   │   ├── volsync-system/    # PVC replication (Kopia)
│   │   └── ... (external-secrets, flux-system, networking, observability, etc.)
│   │       └── <app>/         # Per-app: kustomization.yaml → namespace + ks.yaml
│   │           └── app/       # helmrelease.yaml, externalsecret.yaml, pvc.yaml, prometheusrule.yaml
│   ├── components/            # Reusable Kustomize patches/bases (e.g., volsync)
│   └── flux/                  # Flux system config
├── archived/                  # Deprecated apps (Plex, Radarr, Sonarr, old Rook/VolSync)
├── docs/                      # Guides: cluster-template.md (setup), rook-ceph.md, workingnotes.md
├── Taskfile.yaml              # Task runner includes (bootstrap, talos, kubernetes)
├── .renovaterc.json5          # Dependency update automation
└── talos/                     # Talos configs (templated via minijinja)
```

## Design Patterns
- **GitOps**: Flux watches `kubernetes/apps/`, applies top-level `kustomization.yaml` → `ks.yaml` → `HelmRelease`.
- **App Template**: `kustomization.yaml` (ns + ks) → `app/helmrelease.yaml` + `externalsecret.yaml` + PVCs.
- **Bootstrap**: Helmfile deploys CRDs first, then core apps (CNI → DNS → mirror → certs → Flux).
- **Secrets**: SOPS-encrypted in Git + ESO pulls from 1Password Connect.
- **Storage**: Rook-Ceph (distributed block), VolSync (PVC sync), OpeneNBs (local?).
- **Networking**: Cilium CNI, Envoy Gateway ingress, ExternalDNS (Cloudflare + UniFi webhook).
- **Observability**: Kube-Prometheus-Stack, Loki? (from open tabs).
- **Automation**: Renovate PRs → GH Actions → Flux webhook reconcile.

## Component Relationships
```
Git (SOPS secrets) → Flux GitRepository → Namespace Kustomizations → App Kustomizations
                                                            ↓
1Password Connect ← ExternalSecretsOperator ← HelmReleases ← Cert-Manager (TLS)
                                                            ↓
Rook-Ceph/VolSync ← PVCs ← Stateful apps (Ollama, DBs)
Cilium ← Networking/Ingress (Envoy, ExternalDNS)
Prometheus ← Metrics (PromRules)
Renovate → PRs → Flux Reconcile
```

## Critical Implementation Paths
1. **Bootstrap**: `task bootstrap:talos` → `bootstrap:apps` (helmfile).
2. **App Deploy**: Edit `kubernetes/apps/<ns>/<app>/`, commit → Flux reconcile.
3. **Update**: Renovate PR → merge → Flux.
4. **Talos Upgrade**: `task talos:upgrade-k8s/node`.