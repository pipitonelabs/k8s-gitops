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

The last argument picks the snapshot: `0` is the latest, `1` the one before it. The recipe needs the
Kustomization, HelmRelease, and PVC to share the app's name.

> [!WARNING]
> The recipe does not work for `garage-meta` or `grafana`, which have no HelmRelease of that name. It suspends
> the Kustomization and then fails. If you ran it, use `flux -n NAMESPACE resume kustomization NAME`.

### Apps with the NFS scaler

KEDA can restart jellyfin, metube, openbooks, plex, radarr, sabnzbd, and sonarr during a restore. Pause it
around the restore:

```bash
kubectl -n media annotate scaledobject plex autoscaling.keda.sh/paused=true
just kube restore media plex 0
kubectl -n media annotate scaledobject plex autoscaling.keda.sh/paused-
```

### If the restore fails partway

The app stays stopped and suspended. Once you have dealt with the cause:

```bash
flux -n media resume kustomization plex
flux -n media resume helmrelease plex
flux -n media reconcile helmrelease plex --force
```

## Recreate a PVC on a running cluster

A `<name>-dst` object restores only once and keeps that image. A PVC recreated from it gets data as old as that
first restore, which may be empty or months old. Before recreating a PVC:

1. Delete `replicationdestination/<name>-dst`.
2. Reconcile the Kustomization that owns it, and wait for `LAST SYNC` to update.
3. Recreate the PVC.
