# Before you wipe

A new cluster runs the same backup jobs against the same destinations. Do this first so that an empty cluster
cannot replace good backups.

If the old cluster is already gone, skip to [set backups aside](#2-set-backups-aside).

## 1. Take final backups

The order matters: databases write into Garage, so Garage's metadata comes after them, and the offsite copy
comes last.

1. Snapshot each app volume.

    ```bash
    kubectl get replicationsource -A
    just kube snapshot media plex    # repeat for each, except garage-meta
    ```

2. Back up each database cluster and wait for `completed`.

    ```bash
    for cluster in postgres17 outline tradeforge-pg; do
      kubectl cnpg backup "$cluster" -n database \
        --method=plugin --plugin-name=barman-cloud.cloudnative-pg.io
    done
    kubectl get backups.postgresql.cnpg.io -n database
    ```

3. Snapshot Garage's metadata.

    ```bash
    just kube snapshot default garage-meta
    ```

4. Copy everything offsite.

    ```bash
    job="offsite-backup-$(date +%s)"
    kubectl -n volsync-system create job "$job" --from=cronjob/offsite-backup
    kubectl -n volsync-system wait "job/$job" --for=condition=complete --timeout=2h
    ```

5. Copy anything you need from the rows marked **Lost** in
   [what survives a wipe](rebuild-cluster.md#what-survives-a-wipe).

## 2. Set backups aside

On the NAS, snapshot or copy these paths:

- [ ] `/var/nfs/shared/volsync`
- [ ] `/var/nfs/shared/kubernetes/apps/postgres`
- [ ] `/var/nfs/shared/kubernetes/apps/etcd`
- [ ] `/var/nfs/shared/kubernetes/garage`

## 3. Pause destructive backup jobs

In a pull request merged **before** the rebuild, set `suspend: true` under `spec` in:

- [ ] `kubernetes/apps/volsync-system/offsite-backup/app/cronjob.yaml`. It mirrors deletions, so an empty source
      deletes from the offsite copy.
- [ ] `kubernetes/components/cnpg/cronjob.yaml`. A dump of an empty database replaces the `latest` file.

## 4. Choose how databases come back

CloudNativePG reads `bootstrap` only when it creates a cluster.

> [!WARNING]
> To recover with Barman, merge the [recovery changes](restore-databases.md#option-a-recover-with-barman)
> before running `just bootstrap apps`. Otherwise Flux creates empty databases.
