# Known gaps

Close these before relying on a rebuild.

## Never rehearsed

- A full rebuild.
- Starting Garage on restored metadata. [The restore itself is tested](restore-garage.md).
- Barman recovery and logical dump restores.
- An etcd recovery.

## No backup

- The Minecraft world.
- VM disks.
- The shared downloads volume.
- A logical dump for TradeForge. It relies on Barman alone.
- Media, beyond the NAS itself.

## Automation that needs care

| Gap | Workaround |
|---|---|
| `bootstrap talos` stops at node files for machines that do not exist | [Park the files](bootstrap-talos.md#1-set-aside-nodes-that-do-not-exist) |
| `download-image` only builds the MS-01 image | [Download w2's image directly](install-talos.md#gmktec-w2) |
| `kube restore` does not work for Grafana or Garage | [See the warning](restore-volumes.md#restore-one-app-in-place) |
| `kube restore` does not pause KEDA | [Pause it by hand](restore-volumes.md#apps-with-the-nfs-scaler) |
| `kube snapshot` pauses the backup schedule | [Reconcile afterwards](backups.md#snapshot-a-volume-now) |
| Backup jobs run on a half-restored cluster | [Pause them in Git](before-you-wipe.md#3-pause-destructive-backup-jobs) |
| Talos installer tags are updated by hand | [Match tuppr's version](machine-config.md#version-pins) |
| Barman recovery is a manual manifest edit | [Merge it before bootstrap](restore-databases.md#option-a-recover-with-barman) |
| Part of Authentik's configuration is outside Git | Restore its database |
