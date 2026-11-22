# Install Talos Linux

Talos has no interactive installer. A node boots an ISO into maintenance mode, then installs itself when it
receives a machine config.

## 1. Choose the version

```bash
version=$(yq '.spec.talos.version' kubernetes/apps/system-upgrade/tuppr/upgrades/talos.yaml)
echo "$version"
rg 'installer/' talos/hardware
```

The installer tags must match tuppr's version.

## 2. Build the images

A schematic lists the extensions and kernel arguments in an image. The Image Factory turns it into an ID.
Keep the extensions in their order, because the order changes the ID.

### MS-01: m0, m1, m2

```bash
just talos download-image "$version"
```

| Extensions | Kernel argument |
|---|---|
| `i915`, `intel-ucode`, `mei`, `nfsrahead` | `iommu.passthrough=1` |

### GMKtec: w2

`download-image` only builds the MS-01 image, so download this one directly:

```bash
schematic=$(just talos schematic-id baremetal-amd)
curl -fL -o "talos/talos-$version-amd.iso" \
  "https://factory.talos.dev/image/$schematic/$version/metal-amd64.iso"
```

| Extensions | Kernel argument |
|---|---|
| `amd-ucode`, `amdgpu`, `nfsrahead`, `realtek-firmware` | None |

The ISOs are saved in `talos/` and are not ignored by Git. Do not commit them.

## 3. Write the USB drive

On macOS, replace `N` with the USB drive's number:

```bash
diskutil list external physical
diskutil unmountDisk /dev/diskN
sudo dd if=talos/IMAGE.iso of=/dev/rdiskN bs=4m
diskutil eject /dev/diskN
```

> [!WARNING]
> `dd` erases whichever disk you name. Check the size and name first.

## 4. Boot each node

If a node already runs Talos, [reset it](talos-nodes.md#reset-a-node) first. The reset also clears
`/var/lib/rook`.

Boot from USB in UEFI mode, wait for maintenance mode, then check that the node answers at its IP:

```bash
for ip in 192.168.10.10 192.168.10.11 192.168.10.12 192.168.10.15; do
  echo "== $ip"
  talosctl get disks --insecure -n "$ip"
done
```

`certificate required` means the node still has a config.

## 5. Clean the Ceph disks

Skip this for new disks. Ceph will not create an OSD on a disk with an old cluster's data.

1. Find the install disk by its [serial](hardware.md#disks). The other NVMe is the Ceph disk.
2. Check that the Ceph disk is `nvme1n1` on the MS-01 nodes. Rook selects it by that name.
3. Wipe it:

    ```bash
    talosctl wipe disk CEPH_DEVICE --insecure -n NODE_IP --method ZEROES
    ```

> [!WARNING]
> This cannot be undone. Use `ZEROES`: the faster default can leave Ceph's backup labels behind.

## Done when

- [ ] All four nodes are in maintenance mode at their expected IPs
- [ ] Every install serial matches its node file
- [ ] Every Ceph disk is empty
