# Restore databases

PostgreSQL lives on node-local disks, so a wipe destroys it. Both ways back are **untested**.

| | Barman recovery | Logical dump |
|---|---|---|
| Restores | A whole cluster | One database |
| Covers | All three clusters | Six databases |
| Recovery point | Last WAL in Garage's restored index, up to about an hour old | Last dump, up to 4 hours old |
| Needs | [Garage](restore-garage.md) | NFS |
| Decide | Before Flux creates the cluster | Any time |

## Clusters

| Cluster | Manifest | Bucket | Reads from | Writes to after recovery |
|---|---|---|---|---|
| `postgres17` | `cluster17.yaml` | `cloudnative-pg` | `postgres17-v17` | `postgres17-v18` |
| `outline` | `outline.yaml` | `outline-pg` | `outline-v16` | `outline-v17` |
| `tradeforge-pg` | `tradeforge.yaml` | `tradeforge-pg` | `tradeforge-pg-v1` | `tradeforge-pg-v2` |

The manifests are in `kubernetes/apps/database/cloudnative-pg/cluster/`. The current `serverName` is the one to
read from. After a recovery, update this table.

## Option A: recover with Barman

Merge these changes **before** `just bootstrap apps`. For `postgres17`, the fields that change are:

```yaml
spec:
  plugins:
    - name: barman-cloud.cloudnative-pg.io
      isWALArchiver: true
      parameters:
        barmanObjectName: &barmanObjectName garage-s3-postgres17
        serverName: postgres17-v18    # new name to write to
  bootstrap:
    recovery:
      source: source
  externalClusters:
    - name: source
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters:
          barmanObjectName: *barmanObjectName
          serverName: postgres17-v17  # current name to read from
```

- Always write to a new `serverName`. The old archive is not empty, and CloudNativePG refuses to reuse it.
- `outline` follows the same pattern.
- `tradeforge-pg` has no recovery stanza. Add one in place of its `initdb` block, or it starts with an empty
  schema.

Recovery retries until Garage, the internal gateway, DNS, and the certificate all work.

```bash
kubectl cnpg status postgres17 -n database
```

## Option B: load a logical dump

| Database | Cluster | App namespace |
|---|---|---|
| `atuin` | `postgres17` | `home` |
| `authentik` | `postgres17` | `security` |
| `forgejo` | `postgres17` | `default` |
| `reactiveresume` | `postgres17` | `default` |
| `taskview` | `postgres17` | `default` |
| `outline` | `outline` | `default` |

TradeForge has no logical dump.

Dumps are in `/var/nfs/shared/kubernetes/apps/postgres`, newest in `last/`. Use the copy you
[set aside](before-you-wipe.md#2-set-backups-aside). For Forgejo:

1. Let the app start once on a new cluster, so that its init container creates the database role. Then stop it.

    ```bash
    flux -n default suspend kustomization forgejo
    flux -n default suspend helmrelease forgejo
    kubectl -n default scale deploy -l helm.toolkit.fluxcd.io/name=forgejo --replicas=0
    ```

2. Recreate the empty database and load the dump. This deletes what is in that database.

    ```bash
    primary=$(kubectl -n database get cluster.postgresql.cnpg.io postgres17 \
      -o jsonpath='{.status.currentPrimary}')
    pg() { kubectl -n database exec -i "$primary" -c postgres -- "$@"; }

    pg dropdb --if-exists --force forgejo
    pg createdb -O forgejo forgejo
    gunzip -c forgejo-latest.sql.gz | pg psql -v ON_ERROR_STOP=1 -d forgejo
    ```

3. Start the app and check its data.

    ```bash
    flux -n default resume kustomization forgejo
    flux -n default resume helmrelease forgejo
    flux -n default reconcile helmrelease forgejo --force
    ```
