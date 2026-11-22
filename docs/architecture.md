# Architecture

Everything in the cluster is declared in one repository. `just` applies the Talos machine configs. Flux applies
everything under `kubernetes/` when it lands on `main`.

![A change opens a pull request, CI checks it, and a merge makes Flux reconcile the cluster](assets/gitops-flow.svg)

## The stack

| Layer | Components | Job |
|---|---|---|
| Operating system | Talos Linux | Immutable, API-managed OS with no SSH |
| Cluster network | Cilium, Multus | CNI, kube-proxy replacement, BGP, extra VM networks |
| Delivery | Flux Operator, Flux | Reconcile the cluster from Git |
| Ingress | Envoy Gateway | Internal and external gateways |
| Remote access | cloudflared, Tailscale | Public and private access |
| DNS | CoreDNS, ExternalDNS | Cluster DNS and automatic records |
| Certificates | cert-manager | TLS |
| Secrets | External Secrets | Sync from the secret store |
| Storage | Rook/Ceph, OpenEBS, csi-driver-nfs | Replicated, node-local, and bulk storage |
| Data | CloudNativePG, Dragonfly, Garage | PostgreSQL, cache, and S3 |
| Backups | VolSync with Kopia, Barman Cloud | Volume and database backups |
| Identity | Authentik | Single sign-on |
| Observability | Prometheus, Grafana, VictoriaLogs, Gatus | Metrics, logs, and health checks |
| Virtual machines | KubeVirt, CDI | VMs as Kubernetes resources |
| Upgrades | tuppr, Renovate | OS, Kubernetes, and dependency updates |

## Layers

Each layer needs the one before it, which is also the order of a rebuild.

1. **Hardware and network:** nodes, switches, VLANs, DNS, and NFS.
2. **Talos:** the OS, etcd, and the control plane.
3. **Bootstrap apps:** Cilium, CoreDNS, Spegel, cert-manager, and Flux.
4. **Platform:** secrets, storage, gateways, databases, and backups.
5. **Apps:** everything people use.

See [Repository layout](cluster-template.md) for where each layer lives.
