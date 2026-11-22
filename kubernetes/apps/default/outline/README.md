# Outline

Internal wiki at https://outline.pipitonelabs.com, through `envoy-internal`.

| Needs | Provided by |
|---|---|
| PostgreSQL | The dedicated `outline` CloudNativePG cluster, through the `cnpg` component |
| Redis | `outline-dragonfly`, through the `dragonfly` component |
| Uploads | The `outline` bucket in Garage |
| Login | Authentik, over OIDC |
| Mail | `smtp-relay` |

Settings are in `app/configmap.yaml`. Secrets come from `app/externalsecret.yaml`.

## Create the bucket

This is only needed if Garage starts without its metadata. A normal rebuild restores the bucket and key.

```sh
garage() { kubectl -n default exec deploy/garage -- /garage "$@"; }

garage bucket create outline
garage key import --yes -n outline KEY_ID SECRET_KEY    # the existing key pair
garage bucket allow --read --write outline --key KEY_ID
```

See [Restore Garage](../../../../docs/restore-garage.md) and
[Restore databases](../../../../docs/restore-databases.md).
