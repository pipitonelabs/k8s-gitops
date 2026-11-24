# Rebuild the cluster from scratch

The path from empty machines to a running cluster with its data. Follow the pages in order.

> [!WARNING]
> This procedure has never been run from start to finish. It was checked against the repository and the running
> cluster with read-only commands and dry runs. Steps marked **Untested** carry the most risk, so rehearse them
> on spare hardware.

## The steps

| # | Step | Done when |
|---|---|---|
| 1 | [Protect the backups](before-you-wipe.md) | Backups are fresh, copied, and paused |
| 2 | [Set up a workstation](workstation.md) | Tools work and you are signed in |
| 3 | [Prepare the network](network-prerequisites.md) | DHCP, switches, DNS, BGP, port forwards, and NFS are ready |
| 4 | [Install Talos Linux](install-talos.md) | All four nodes are in maintenance mode |
| 5 | [Bootstrap Talos](bootstrap-talos.md) | The API answers and nodes are `NotReady` |
| 6 | [Bootstrap apps](bootstrap-apps.md) | Nodes are `Ready` and Flux is reconciling |
| 7 | [Restore volumes](restore-volumes.md) | Protected PVCs are bound and hold data |
| 8 | [Restore Garage](restore-garage.md) | Every bucket is readable |
| 9 | [Restore databases](restore-databases.md) | All three clusters hold their data |
| 10 | [Verify](verify-cluster.md) | The checklist passes and backups run again |

## What survives a wipe

| Data | Location | After a wipe | Comes back by |
|---|---|---|---|
| Manifests | GitHub | Safe | Flux |
| Secrets and cluster PKI | Secret store | Safe | Bootstrap and External Secrets |
| Wildcard certificate | Secret store | Safe | Bootstrap |
| Kopia repository | NFS, copied offsite | Safe | Used by VolSync |
| App volumes with VolSync | Ceph | Lost | Automatic restore |
| Garage object blocks | NFS | Safe | Reused as they are |
| Garage metadata | Ceph | Lost | Automatic restore from VolSync |
| PostgreSQL data | Node-local disks | Lost | Barman or logical dumps |
| PostgreSQL dumps | NFS, copied offsite | Safe | Manual load |
| etcd snapshots | NFS, copied offsite | Safe | Not needed for a rebuild from Git |
| Media | NFS | Safe | Reused as it is |
| Minecraft world, VM disks, shared downloads | Ceph | **Lost** | No backup |
| Metrics, logs, `*-cache` volumes | Ceph | **Lost** | Start empty |
| Authentik settings outside blueprints | PostgreSQL | Lost | Database restore |

The secret store is the root of trust. Without it the cluster PKI and the Kopia repository password are gone,
and the backups cannot be read.

## The short version

Use this only after reading the pages above.

```bash
just workstation brew
just workstation krew
eval "$(op signin)"

version=$(yq '.spec.talos.version' kubernetes/apps/system-upgrade/tuppr/upgrades/talos.yaml)
just talos download-image "$version"            # MS-01 only, w2 has its own image

# Boot all nodes from their installers first.
just talos generate-talosconfig
just bootstrap talos
just bootstrap apps

flux get ks -A
```

`just bootstrap cluster` runs both stages. On a real rebuild, run them separately and check the first before
starting the second.

## Why this order

- Nodes cannot become `Ready` without Cilium.
- Flux runs as pods, so it needs networking and DNS first.
- Volumes cannot restore until Ceph, secrets, and VolSync work.
- Garage needs its metadata volume restored before it starts.
- Barman recovery needs Garage.
