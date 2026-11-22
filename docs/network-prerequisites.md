# Prepare the network

Finish this before applying a machine config. A wrong switch port takes the node off the network as soon as
the bond is created.

## DHCP reservations

| Node | IP | Bond MAC |
|---|---|---|
| `m0` | `192.168.10.10` | `58:47:ca:7b:ec:1a` |
| `m1` | `192.168.10.11` | `58:47:ca:7b:f4:22` |
| `m2` | `192.168.10.12` | `58:47:ca:7b:f3:ca` |
| `w2` | `192.168.10.15` | Not pinned in Git, check the existing reservation |

On the MS-01 nodes the bond takes the first SFP+ port's MAC. In maintenance mode there is no bond, so a node
can show another port's MAC and get another IP. The bootstrap needs each node at the IP in its file name.

## Switch ports

- [ ] Both ports of each node are in an LACP group
- [ ] The nodes network is untagged, and VLANs 20, 30, and 70 are trunked
- [ ] Jumbo frames are on for the switches that carry node traffic

> [!TIP]
> If a node has no network in maintenance mode, its LACP group may be refusing a node without a bond. Use one
> port without aggregation until the config is applied, then restore the group.

## DNS and routing

- [ ] `k8s.internal` resolves to `192.168.20.2`
- [ ] The router has a [BGP neighbor](bgp-config.conf) for `.10`, `.11`, `.12`, and `.15`
- [ ] Nodes can reach GitHub, the container registries, and `factory.talos.dev`

## NFS

- [ ] `superheavy.internal` resolves and answers
- [ ] NFSv4 is enabled in UniFi Drive
- [ ] The `volsync`, `kubernetes`, and `media` shares are exported to all four node IPs
