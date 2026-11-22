# Restore Garage

Garage provides S3 for database backups and app uploads.

> [!NOTE]
> Tested on 2026-11-22: the backup restored into a scratch PVC, and both its database and its newest snapshot
> were read offline with the node key, layout, keys, and five buckets present. **Untested:** starting Garage on a
> restored volume and reading objects through it.

It needs two things: the object blocks, which stay on NFS, and the `garage-meta` volume, which holds the index,
layout, and node key.

## Normal rebuild

There is nothing to run.

1. The `garage-meta-backup` Kustomization creates the restore.
2. The `garage-meta` PVC fills from the latest hourly backup.
3. Garage starts with the same node ID, keys, and buckets.

## Check it

```bash
kubectl -n default get pvc garage-meta
kubectl -n default exec deploy/garage -- /garage status
kubectl -n default exec deploy/garage -- /garage bucket list
curl -sI https://s3.pipitonelabs.com
```

- [ ] The PVC is `Bound`
- [ ] The node has a role, with no `NO ROLE ASSIGNED`
- [ ] These five buckets exist
- [ ] The S3 address answers `403`

| Bucket | Holds |
|---|---|
| `cloudnative-pg` | `postgres17` backups |
| `outline-pg` | Outline database backups |
| `tradeforge-pg` | TradeForge database backups |
| `outline` | Outline uploads |
| `reactive-resume` | Reactive Resume uploads |

Objects written after the last metadata backup are not in the index. Objects deleted since then can be listed
but fail to read.

## If the database is corrupt

The volume also holds Garage's own snapshots, taken every 6 hours, in `/meta/snapshots/`.

1. Suspend the `garage` Kustomization and HelmRelease, pause its ScaledObject, and scale it to zero.
2. Mount the volume with `just kube browse-pvc default garage-meta`.
3. In that shell, put the newest good snapshot in place. A snapshot's `db.lmdb` is a single file, but Garage
   needs a directory with that file inside as `data.mdb`. Copying it straight to `db.lmdb` does not work.

    ```sh
    cd /mnt
    ls snapshots
    snapshot=TIMESTAMP    # one of the names listed
    mv db.lmdb db.lmdb.broken
    mkdir db.lmdb
    cp "snapshots/$snapshot/db.lmdb" db.lmdb/data.mdb
    chown -R 1000:100 db.lmdb
    exit
    ```

4. Undo step 1, then run `/garage repair --yes tables` in the pod.

## If the metadata backup is gone

The buckets are also copied offsite every night, as objects.

1. Give the empty Garage a layout:

    ```bash
    kubectl -n default exec deploy/garage -- /garage status
    kubectl -n default exec deploy/garage -- /garage layout assign -z dc1 -c 1T NODE_ID
    kubectl -n default exec deploy/garage -- /garage layout apply --version 1
    ```

2. Create the five buckets with `/garage bucket create`.
3. Import the existing keys from the secret store with `/garage key import`, and grant access with
   `/garage bucket allow`.
4. Use `rclone copy` from the encrypted offsite remote, path `garage/<bucket>`, into each bucket. Both remotes
   are defined in `kubernetes/apps/volsync-system/offsite-backup/app/cronjob.yaml`.

> [!WARNING]
> Use `copy`, never `sync`, and keep the offsite CronJob suspended until every bucket is verified.
