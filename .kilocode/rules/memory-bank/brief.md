# k8s-gitops Project Brief

A comprehensive GitOps monorepo managing a production-grade Talos Kubernetes homelab cluster with FluxCD, automating Infrastructure as Code deployment and continuous updates for diverse home services.

**Objectives:**
- Automate IaC deployment and updates for comprehensive home services
- Maintain declarative, reproducible infrastructure state
- Enable self-hosted capabilities across AI/ML, media, development, and productivity domains

**Key Features:**
- **GitOps Framework:** Flux CD with Kustomize overlays and HelmReleases for declarative deployments
- **AI/ML Stack:** Ollama (LLM inference), Qdrant (vector database), Nomic Embed Text (embeddings)
- **Media Services:** Plex, Seerr, Openbooks, Tautulli with extensive archived media applications
- **Productivity Suite:** N8n (automation), Outline (collaborative docs), Wiki, Blog platform
- **Database Infrastructure:** CloudNativePG (PostgreSQL operator), MinIO (S3-compatible storage)
- **CI/CD Platform:** Self-hosted GitHub Actions runners for automated workflows
- **Security & Secrets:** External-secrets integration with 1Password Connect
- **Storage & Backup:** VolSync for PVC replication, Rook-Ceph for distributed storage
- **Infrastructure:** Cert-Manager (TLS automation), monitoring, networking components
- **Automation:** Renovate bot for dependency updates, automated cluster maintenance

**Technologies:**
- **Container Platform:** Kubernetes with Talos Linux, Cilium CNI, eBPF networking
- **GitOps Tools:** Flux v2, Kustomize, Helm, SOPS for secrets
- **Storage:** Rook-Ceph, VolSync, persistent volume management
- **Monitoring:** Comprehensive observability stack with Prometheus metrics
- **CI/CD:** GitHub Actions, self-hosted runners, automated deployments

**Significance:**
This repository represents a sophisticated, production-ready homelab infrastructure demonstrating enterprise-grade Kubernetes practices in a residential environment. It serves as a complete blueprint for self-hosting AI/ML workloads, media services, development tools, and automation platforms with automated maintenance, security hardening, and declarative state management. The setup showcases advanced GitOps workflows, multi-service orchestration, and cloud-native storage solutions suitable for high-availability home computing.