# Proxmox workers

Worker VMs are created by [talos-vm-workers](https://github.com/pipitonelabs/talos-vm-workers) with OpenTofu.
This repository only supplies their machine configs.

> [!NOTE]
> `w0` and `w1` are not in the cluster today.

## How they differ from bare metal

| | Proxmox VM |
|---|---|
| Image | Talos `nocloud` |
| Address | Static, from the cloud-init drive |
| NIC | `eth0` |
| Extensions | `nfsrahead`, `qemu-guest-agent` |
| Ceph | Client only, no OSD |

Talos has no cloud-init program to reset or rerun. It reads only the network settings from that drive. To
change them, change them in talos-vm-workers.

## Join a worker

1. In talos-vm-workers, add the node, then `just apply` and `just wait NAME`.
2. Check that both repositories produce the same schematic ID:

    ```bash
    just talos schematic-id proxmox    # here
    tofu output schematic_id           # in talos-vm-workers
    ```

3. Add a [BGP neighbor](bgp-config.conf). `.13` and `.14` are not in the router config today.
4. Join it:

    ```bash
    just talos validate-node 192.168.10.13
    just talos apply-node 192.168.10.13 --insecure
    kubectl get nodes -w
    ```

Cilium's `devices` must keep `eth+`, or the node never becomes `Ready`.
