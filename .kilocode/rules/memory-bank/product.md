# Product Overview

## Purpose
This project is a comprehensive GitOps monorepo designed to manage a production-grade Talos Linux Kubernetes homelab cluster. It automates Infrastructure as Code (IaC) deployment and continuous updates for a diverse set of home services spanning AI/ML workloads, media management, productivity tools, databases, CI/CD pipelines, and more.

The core goal is to enable self-hosting of sophisticated services in a residential environment while adhering to enterprise-grade Kubernetes practices, ensuring declarative, reproducible, and automated infrastructure management.

## Problems Solved
- **Manual Operations**: Eliminates repetitive manual deployments, configurations, and updates that lead to inconsistencies, errors, and downtime.
- **Reproducibility**: Provides a complete blueprint for rebuilding the entire homelab from scratch using Git as the single source of truth.
- **Dependency Management**: Automates updates for Helm charts, container images, and other dependencies via Renovate, reducing vulnerability exposure.
- **Secret Management**: Integrates External Secrets Operator with 1Password Connect for secure, externalized secrets handling.
- **Storage and Backup**: Implements distributed storage (Rook-Ceph) and replication (VolSync) for data persistence and disaster recovery.
- **TLS Automation**: Cert-Manager handles automated certificate issuance and renewal.
- **Scalability and Observability**: Supports high-availability workloads with Cilium CNI, Prometheus monitoring, and GitHub Actions self-hosted runners.

## How It Works
1. **Bootstrap**: Initial cluster setup using Taskfile-driven helmfile deployments for core components (Cilium, CoreDNS, Spegel, Cert-Manager, Flux).
2. **GitOps Pipeline**: FluxCD reconciles changes from the `kubernetes/` directory:
   - Top-level `kustomization.yaml` per namespace/app defines Namespace + Flux Kustomization (`ks.yaml`).
   - `ks.yaml` points to `app/helmrelease.yaml`, ExternalSecrets, PVCs, etc.
3. **Automation**:
   - Renovate scans repo and creates PRs for updates.
   - GitHub Actions for CI/CD workflows.
   - Flux webhook for real-time reconciliation on push.
4. **Templating**: Minijinja for config generation during bootstrap/setup.

## User Experience Goals
- **Simplicity**: Commit changes to Git; Flux handles the rest—no kubectl imperative commands needed.
- **Visibility**: Flux status commands (`flux get all`) and kromgo dashboards for cluster health.
- **Reliability**: Idempotent, declarative state ensures consistency; automated backups and monitoring prevent data loss.
- **Extensibility**: Standardized app pattern allows easy addition of new services without deep Kubernetes knowledge.
- **Maintenance-Free**: Renovate + Flux keep everything current; troubleshooting guides in docs/.