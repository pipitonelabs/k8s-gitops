# Backups

## Schedules

Times are UTC.

| What | Schedule | Destination | Kept |
|---|---|---|---|
| App volumes | Hourly | Kopia on NFS | 24 hourly, 7 daily, 4 weekly, 6 monthly |
| Garage metadata | Hourly | Kopia on NFS | Same |
| Garage's own metadata snapshots | Every 6 hours | Inside `garage-meta` | The latest two |
| `postgres17` | WAL, plus a base backup at 01:20 | Garage | 30 days |
| `outline` | WAL, plus a base backup at 01:35 | Garage | 30 days |
| `tradeforge-pg` | WAL, plus a base backup at 01:50 | Garage | 30 days |
| Logical dumps of six databases | Every 4 hours at :05 | NFS | 7 daily, 4 weekly, 6 monthly |
| etcd | 03:15 | NFS | 7 days |
| Kopia maintenance | Every 6 hours at :30 | Kopia on NFS | Not applicable |
| Offsite copy | 04:20 | Offsite S3 | A mirror |

The offsite copy contains the Kopia repository, the dumps, the etcd snapshots, and the contents of the five
Garage buckets. The dumps, snapshots, and buckets are encrypted by rclone, and Kopia encrypts its own data.

Not backed up: Minecraft, VM disks, shared downloads, caches, metrics, and logs. Media is only on the NAS.

## Check

```bash
kubectl get replicationsource -A
kubectl get backups.postgresql.cnpg.io -n database
kubectl get cronjob -A
```

## Snapshot a volume now

```bash
just kube snapshot media plex
```

A manual trigger pauses the hourly schedule until Flux removes it. Remove it straight away with:

```bash
flux -n media reconcile kustomization plex
```

For Garage the Kustomization is `garage-meta-backup`, in `default`.

## Pause VolSync

```bash
just kube volsync suspend
just kube volsync resume
```

## Recover etcd from a snapshot

A rebuild from Git does not need this. It is for losing etcd quorum while the data disks are intact.
**Untested.** After resetting the etcd members as described in the
[Talos disaster recovery guide](https://docs.siderolabs.com/talos/v1.14/build-and-extend-talos/cluster-operations-and-maintenance/disaster-recovery):

```bash
talosctl -n 192.168.10.10 bootstrap --recover-from=./etcd.snapshot
```
