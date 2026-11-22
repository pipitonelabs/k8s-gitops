# Restore volumes

Volumes backed up with VolSync restore themselves on a new cluster.

## What is protected

| Namespace | Volumes |
|---|---|
| `default` | forgejo, garage-meta, taskview |
| `media` | jellyfin, maintainerr, metube, openbooks, plex, profilarr, prowlarr, radarr, sabnzbd, seerr, sonarr, tautulli |
| `networking` | crowdsec, network-optimizer |
| `observability` | grafana |

Only each app's main volume is backed up. `*-cache` volumes start empty.

## Automatic restore

1. Flux creates the PVC, which points at the `<name>-dst` ReplicationDestination.
2. VolSync restores the latest Kopia snapshot from NFS.
3. The PVC binds and the pod starts.

This needs Ceph, the snapshot controller, OpenEBS, VolSync, the secret store, and NFS.

```bash
kubectl get pvc -A
kubectl get replicationdestination -A
kubectl get jobs -A | rg volsync-dst
```

> [!WARNING]
> If Kopia finds no snapshot, the restore succeeds with an empty volume. Open each app and look for its data.

## Restore one app in place

**Untested end to end.** This overwrites the app's current data.

```bash
just kube restore media prowlarr 0
```

The last argument picks the snapshot: `0` is the latest, `1` the one before it. The second is the PVC's name,
so use `garage-meta` for Garage.

The recipe stops the app for the restore. It suspends Flux, pauses KEDA and the Grafana operator where they
manage the app, and starts everything again afterwards.

### If the restore fails partway

The app stays stopped, so it cannot start on half-restored data, and the recipe prints the commands that start
it again. Run the restore again, or run those commands.

## Recreate a PVC on a running cluster

A `<name>-dst` object restores only once and keeps that image. A PVC recreated from it gets data as old as that
first restore, which may be empty or months old. Before recreating a PVC:

1. Delete `replicationdestination/<name>-dst`.
2. Reconcile the Kustomization that owns it, and wait for `LAST SYNC` to update.
3. Recreate the PVC.
