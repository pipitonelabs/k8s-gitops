# PostgreSQL

CloudNativePG runs three clusters in the `database` namespace, each with three instances on node-local storage.

| Cluster | Used by |
|---|---|
| `postgres17` | Atuin, Authentik, Forgejo, Reactive Resume, TaskView |
| `outline` | Outline |
| `tradeforge-pg` | TradeForge |

## Status

```bash
kubectl get cluster.postgresql.cnpg.io -n database
kubectl cnpg status postgres17 -n database
```

## Back up now

```bash
kubectl cnpg backup postgres17 -n database \
  --method=plugin --plugin-name=barman-cloud.cloudnative-pg.io
kubectl get backups.postgresql.cnpg.io -n database
```

## Open a SQL shell

```bash
kubectl cnpg psql postgres17 -n database
```

| In psql | Does |
|---|---|
| `\l` | List databases |
| `\c NAME` | Connect to a database |
| `\dt` | List tables |
| `\du` | List roles |
| `\q` | Quit |

## Change the primary

```bash
kubectl cnpg promote postgres17 postgres17-2 -n database
```

## Give a new app a database

1. Add its database credentials to the secret store, following the `cnpg` component's ExternalSecret.
2. Add the `cnpg` component to its `ks.yaml`, with `APP` set and `CNPG_NAME` if it is not `postgres17`.
3. Depend on `cloudnative-pg-cluster` in `database`.
4. Add a `postgres-init` init container that reads `<app>-initdb-secret`.
5. Read the connection from `<app>-pguser-secret`.

`tradeforge-pg` needs its `supabase_admin` and `dashboard_user` roles. Realtime's migrations fail without them.

To restore, see [Restore databases](restore-databases.md).
