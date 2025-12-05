# Tech

## Technologies Used
- **Cluster Platform**: Talos Linux (bare-metal immutable OS), Kubernetes (high-availability control plane)
- **Networking**: Cilium (eBPF-based CNI), Envoy Gateway (ingress controller), ExternalDNS (Cloudflare + UniFi webhook provider)
- **GitOps & Deployment**: FluxCD v2 (operator/instance), Kustomize (overlays/bases), Helm (via HelmReleases)
- **Secrets Management**: SOPS (age-encrypted YAML in Git), External Secrets Operator (ESO) + 1Password Connect
- **TLS Automation**: Cert-Manager (Let's Encrypt staging/production via Cloudflare issuer)
- **Storage & Backup**: Rook-Ceph (distributed block storage), VolSync (PVC replication with Kopia), OpenEBS (local PV?), UnRAID NFS/SMB (bulk storage)
- **Observability**: kube-prometheus-stack (Prometheus/Grafana), KEDA (autoscaling)
- **CI/CD & Automation**:
  - GitHub Actions (self-hosted runners via actions-runner-controller)
  - Renovate (dependency updates: Helm charts, images, Actions)
  - Taskfile (task runner with includes: bootstrap, talos, kubernetes)
  - mise (dev environment/toolchain manager)
  - minijinja (templating for Talos configs)
- **Key Applications**:
  - AI/ML: Ollama (LLM), Qdrant (vector DB), Nomic Embed-Text
  - Media: Tautulli, SABnzbd, Maintainerr (archived: Plex, Radarr, Sonarr, Prowlarr)
  - Database: CloudNativePG (PostgreSQL operator)
  - Other: Wiki, Garage (default ns)

## Development & Deployment Setup
- **Local Tools**: `mise install` (talosctl, kubectl, flux, helm, helmfile, yq, sops, age, op, cloudflared, etc.)
- **Templating**: Minijinja processes cluster.yaml/nodes.yaml → talosconfig, kubeconfig, patches
- **Bootstrap Sequence**:
  1. `task init` / `task configure` (template configs)
  2. `task bootstrap:talos` (apply Talos)
  3. `task bootstrap:apps` (helmfile: CRDs → Cilium/CoreDNS/Spegel/Cert-Manager/Flux)
- **Runtime**: Flux watches repo, Renovate PRs → merge → reconcile
- **Kubeconfig**: Generated in kubernetes/kubeconfig

## Technical Constraints
- **Hardware**: Min 3 nodes (HA CP), 4c/16GB RAM/256GB SSD each; NVMe for Ceph OSDs
- **Networking**: Cloudflare account/domain required (DNS, TLS, tunnel?)
- **Repo**: GitHub (deploy key for private), public recommended for community
- **Secrets**: 1Password vault "Kubernetes" with OP_CONNECT_TOKEN, credentials
- **No Interactive**: All declarative, no imperative kubectl post-bootstrap

## Dependencies & Updates
- Renovate scans entire repo (Helm charts, images, GH Actions, Flux itself)
- OCI mirrors (ghcr.io/home-operations/charts-mirror) for bootstrap
- Flux webhook for instant reconcile on push