# Rook and Ceph

## Run Ceph commands

```bash
ceph() { kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph "$@"; }

ceph status
ceph health detail
ceph osd tree
ceph df
```

The rest of this page uses that function.

Four `AUTH_INSECURE_*` warnings are muted in the cluster HelmRelease. The CSI client keys cannot move to
`aes256k` until the nodes run kernel 7.0 or newer.

## Clear crash warnings

```bash
ceph crash ls
ceph crash archive-all
```

## Remove an OSD

> [!WARNING]
> Remove one OSD at a time. If the disk still works, wait for `safe-to-destroy` before purging.

1. Remove the disk or node from the Rook cluster HelmRelease and merge it.
2. Stop the operator from restarting the OSD, then remove it:

    ```bash
    id=3
    flux -n rook-ceph suspend kustomization rook-ceph
    flux -n rook-ceph suspend helmrelease rook-ceph
    kubectl -n rook-ceph scale deploy/rook-ceph-operator --replicas=0

    ceph osd out "$id"
    ceph osd safe-to-destroy "$id"    # repeat until it says it is safe
    kubectl -n rook-ceph scale "deploy/rook-ceph-osd-$id" --replicas=0
    ceph osd purge "$id" --yes-i-really-mean-it
    kubectl -n rook-ceph delete "deploy/rook-ceph-osd-$id"
    ```

3. If the host has no OSDs left, remove it with `ceph osd crush remove HOSTNAME`.
4. Start the operator again:

    ```bash
    kubectl -n rook-ceph scale deploy/rook-ceph-operator --replicas=1
    flux -n rook-ceph resume kustomization rook-ceph
    flux -n rook-ceph resume helmrelease rook-ceph
    ```

`purge` also removes the OSD's auth key and CRUSH entry.

## Clean a disk for reuse

With the node in maintenance mode, follow [Clean the Ceph disks](install-talos.md#5-clean-the-ceph-disks).
A full Talos reset clears `/var/lib/rook`.

## An OSD cannot authenticate

This happens when an OSD's disk is intact but its key was deleted from Ceph.

1. Start maintenance mode and read the keyring:

    ```bash
    kubectl rook-ceph -n rook-ceph maintenance start rook-ceph-osd-ID
    kubectl -n rook-ceph exec deploy/rook-ceph-osd-ID-maintenance -- cat /var/lib/ceph/osd/ceph-ID/keyring
    ```

2. Save it as `osd.export`, outside the repository, with these capabilities:

    ```ini
    [osd.ID]
    key = KEY
    caps mon = "allow profile osd"
    caps mgr = "allow profile osd"
    caps osd = "allow *"
    ```

3. Import it, stop maintenance mode, and delete the file:

    ```bash
    kubectl -n rook-ceph exec -i deploy/rook-ceph-tools -- ceph auth import -i - < osd.export
    kubectl rook-ceph -n rook-ceph maintenance stop rook-ceph-osd-ID
    rm osd.export
    ```
