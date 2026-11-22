# cnpg component

Gives an app a database on a shared CloudNativePG cluster:

- `<app>-initdb-secret`, for a `postgres-init` init container.
- `<app>-pguser-secret`, for the app's connection.
- A CronJob that dumps the database to NFS every four hours.

## Use it

1. Add a username and generated password to the secret store, as `externalsecret.yaml` expects.
2. In the app's `ks.yaml`:

    ```yaml
    spec:
      components:
        - ../../../../components/cnpg
      dependsOn:
        - name: cloudnative-pg-cluster
          namespace: database
      postBuild:
        substitute:
          APP: myapp
          CNPG_NAME: postgres17    # the default, or another cluster
    ```

3. Add a `postgres-init` init container that reads `<app>-initdb-secret`. It creates the role and database.

See [PostgreSQL](../../../docs/postgres.md).
