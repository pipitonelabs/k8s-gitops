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
| `download-image` only builds the MS-01 image | [Download w2's image directly](install-talos.md#gmktec-w2) |
| Backup jobs run on a half-restored cluster | [Pause them in Git](before-you-wipe.md#3-pause-destructive-backup-jobs) |
| Talos installer tags are updated by hand | [Match tuppr's version](machine-config.md#version-pins) |
| Barman recovery is a manual manifest edit | [Merge it before bootstrap](restore-databases.md#option-a-recover-with-barman) |
| Part of Authentik's configuration is outside Git | Restore its database |
