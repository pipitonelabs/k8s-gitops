# Known gaps

Close these before relying on a rebuild.

## Never rehearsed

- A full rebuild.
- A restore of Garage from its metadata backup.
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
| Backup jobs run on a half-restored cluster | [Pause them in Git](before-you-wipe.md#3-pause-destructive-backup-jobs) |
| Talos installer tags are updated by hand | [Match tuppr's version](machine-config.md#version-pins) |
| Barman recovery is a manual manifest edit | [Merge it before bootstrap](restore-databases.md#option-a-recover-with-barman) |
| Part of Authentik's configuration is outside Git | Restore its database |
