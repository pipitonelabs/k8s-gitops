# Node lifecycle

## Reboot or shut down

```bash
just talos reboot-node 192.168.10.12
just talos shutdown-node 192.168.10.12
```

## Reset a node

> [!WARNING]
> A reset erases the Talos disk, including that node's PostgreSQL data and `/var/lib/rook`. The recipe does not
> drain the node or leave etcd. On a running cluster, reset one node at a time, with healthy Ceph and current
> backups.

```bash
just talos reset-node 192.168.10.12
```

The node shuts down with no OS. Boot it from the [installer](install-talos.md). The Ceph disk is not wiped.

`reset-cluster` and `shutdown-cluster` act on every file in `talos/nodes/`, including nodes that do not exist.
Use the single-node recipes, or park those files first.

## Add a bare-metal node

1. Add a DHCP reservation, switch ports, and a [BGP neighbor](bgp-config.conf).
2. Create `talos/nodes/<class>/<ip>.yaml.j2` with the role, hostname, and install disk serial.
3. Boot it from the installer for its class.
4. Join it:

    ```bash
    just talos validate-node NODE_IP
    just talos apply-node NODE_IP --insecure
    kubectl get nodes -w
    ```

5. For an OSD, add the node and disk to the Rook cluster HelmRelease in a pull request.
6. Update [Hardware](hardware.md) and [Networking](networking.md).

## Remove a worker

1. Confirm that Ceph can keep three replicas on the remaining hosts.
2. Drain the node.
3. Remove it from the Rook cluster HelmRelease, then [remove its OSD](rook-ceph.md#remove-an-osd).
4. Reset it, then run `kubectl delete node NAME`.
5. Remove its node file, BGP neighbor, and docs entries.

## Replace a control-plane node

If it is still running, leave etcd cleanly before resetting it:

```bash
talosctl -n NODE_IP reset --graceful --reboot
```

If it is dead, remove its member from a healthy node:

```bash
talosctl -n HEALTHY_IP etcd members
talosctl -n HEALTHY_IP etcd remove-member MEMBER_ID
```

Then install the replacement and apply its config. Do not bootstrap etcd again.
