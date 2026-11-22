# GitOps with Flux

A merge to `main` is a deploy.

## From merge to running

1. A pull request passes CI and is merged.
2. GitHub calls the Flux webhook. Without it, Flux checks every hour.
3. `flux-repositories` applies the shared chart sources.
4. `cluster-apps` applies `kubernetes/apps`, which holds a Kustomization for each app.
5. Each app waits for its `dependsOn`, then applies its HelmRelease and resources.

## Defaults for every app

`kubernetes/flux/cluster/ks.yaml` patches these into each child:

| Setting | Value |
|---|---|
| Deletion policy | `WaitForTermination` |
| Drift detection | On, ignoring replica counts |
| Install | Retry on failure, create or replace CRDs |
| Upgrade | Remediate on failure, two retries |
| Rollback | Clean up on failure |

Manual `kubectl` edits to managed resources are reverted.

## Components

| Component | Adds | Main variables |
|---|---|---|
| `namespace` | Namespace, Pod Security labels, alerts | None |
| `volsync` | PVC, hourly backup, restore | `APP`, `VOLSYNC_CAPACITY`, `VOLSYNC_PUID`, `VOLSYNC_PGID` |
| `cnpg` | Database secrets and a dump every 4 hours | `APP`, `CNPG_NAME` |
| `dragonfly` | A Dragonfly cache | `APP` |
| `nfs-scaler` | Scale to zero while NFS is down | `APP` |

## CI

| Check | What it does |
|---|---|
| Flate test | Renders and tests every manifest |
| Flate diff | Posts the cluster diff on the pull request, which is public |
| Image pull | Pulls new images onto a node before merge |
| Zizmor | Audits the workflows |

Renovate opens update pull requests. A short list of trusted updates merges by itself after three days.

## Useful commands

```bash
flux get ks -A
flux get hr -A
flux -n flux-system reconcile kustomization flux-system --with-source
flux -n media reconcile helmrelease plex --force
```
