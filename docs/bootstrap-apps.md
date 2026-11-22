# Bootstrap apps

Flux cannot install the network it needs to run on. helmfile installs just enough for Flux to start, then Flux
takes over.

## Before you start

- [ ] [Talos is bootstrapped](bootstrap-talos.md) and all nodes are registered
- [ ] Backup jobs are [paused in Git](before-you-wipe.md#3-pause-destructive-backup-jobs)
- [ ] The [database recovery choice](before-you-wipe.md#4-choose-how-databases-come-back) is merged

> [!WARNING]
> Flux deploys what is on `main`, not your checkout, as soon as this stage finishes.

## Run it

```bash
just bootstrap apps
```

It is safe to run again if a step fails.

## What it does

### 1. Reach the API

It fetches a kubeconfig that points at a node IP, waits for each API server, then waits for the nodes to
register as `NotReady`.

### 2. Create what cannot wait for Flux

`bootstrap/resources.yaml` creates:

- The `external-secrets`, `security`, `observability`, and `networking` namespaces.
- The credential External Secrets uses to reach the secret store.
- The existing wildcard certificate.

### 3. Install CRDs

`bootstrap/helmfile.d/00-crds.yaml` provides CRDs for External Secrets, Envoy Gateway, KEDA,
kube-prometheus-stack, and the Grafana operator.

### 4. Install the core releases

`bootstrap/helmfile.d/01-apps.yaml` installs these one after another, waiting for each.

| Order | Release | Namespace | Purpose |
|---|---|---|---|
| 1 | `cilium` | `kube-system` | Networking. Nodes become `Ready` after it |
| 2 | `coredns` | `kube-system` | Cluster DNS |
| 3 | `spegel` | `kube-system` | Image sharing between nodes |
| 4 | `cert-manager` | `cert-manager` | Certificates |
| 5 | `flux-operator` | `flux-system` | Manages the Flux controllers |
| 6 | `flux-instance` | `flux-system` | Connects Flux to this repository |

A hook after Cilium applies the BGP configuration, the LoadBalancer pool, and the API Service.

Values come from each app's HelmRelease. Chart versions are written separately in the helmfiles and must be
kept equal, or Flux changes the release straight after bootstrap.

### 5. Switch to the shared API address

The kubeconfig is fetched again and points at `k8s.internal`.

## Hand over to Flux

![rook-ceph and volsync come before the Ceph cluster, which Plex waits for along with its GPU driver](assets/flux-dependencies.svg)

Flux adopts the six releases and deploys everything else in `dependsOn` order.

```bash
kubectl get nodes
flux get sources git -A
flux get ks -A
kubectl get clustersecretstores
kubectl -n rook-ceph get cephcluster
```

Expect this order:

1. Secrets.
2. Certificates, gateways, and DNS.
3. OpenEBS, snapshots, VolSync, then Rook/Ceph.
4. Garage's metadata restore, Garage, then the databases.
5. Apps.

`dependency not ready` means something earlier failed: fix the first item in the chain.

> [!WARNING]
> Do not run `just kube prune-pods` during a rebuild. It deletes every `Pending` pod, including those waiting
> on restores.

## Register the webhook

The webhook path changes with each new cluster:

```bash
kubectl -n flux-system get receiver github-webhook -o jsonpath='{.status.webhookPath}'
```

In GitHub, set the webhook URL to `https://flux-webhook.pipitonelabs.com` followed by that path and keep the
existing token. Until then Flux checks Git every hour.
