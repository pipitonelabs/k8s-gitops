# Storage

## Choosing storage

| Storage | Type | Survives losing a node | Survives wiping the cluster | Use for |
|---|---|---|---|---|
| `ceph-block` (default) | Replicated block | Yes | Only through backups | App config, single-writer volumes, VM disks |
| `ceph-filesystem` | Replicated file system | Yes | Only through backups | Volumes shared by pods |
| `openebs-hostpath` | Node-local | No | Only through backups | Self-replicating databases, caches |
| NFS on `superheavy` | Network file system | Yes | Yes | Media, backups, bulk data |

## Ceph

- Four OSDs, one on each node.
- Three replicas, with the host as the failure domain.
- Three monitors and two managers, all on control-plane nodes.
- Proxmox workers, if added, are clients only.

## Node-local storage

OpenEBS writes to `/var/mnt/extra/openebs/local`, on the Talos ephemeral partition. Resetting a node deletes it,
including that node's PostgreSQL instances.

## NFS

| Mount | Version | Path format | Example |
|---|---|---|---|
| Static PV with `mountOptions` | 4.1 | `/<share>/...` | `/media`, `/kubernetes/garage/data` |
| Inline pod `nfs:` volume | 3, no locking | `/var/nfs/shared/<share>/...` | `/var/nfs/shared/volsync` |

Inline volumes cannot pass mount options, so Talos's `nfsmount.conf` puts them on version 3. A PV's NFS path is
immutable: changing it means recreating the PV.

> [!WARNING]
> Keep LMDB and SQLite off NFS. LMDB on NFS corrupted Garage's metadata on 2026-11-02.

## Garage

Garage splits its data, and both halves are needed to read a bucket.

| Part | Location | Protection |
|---|---|---|
| Object blocks | NFS, `/kubernetes/garage/data` | Outlives the cluster. Buckets are copied offsite nightly |
| Metadata: index, layout, node key | `garage-meta` on `ceph-block` | Hourly VolSync backup, copied offsite nightly |
