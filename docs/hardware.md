# Hardware and nodes

## Nodes

| Node | IP | Role | Machine | Memory | Network | GPU |
|---|---|---|---|---|---|---|
| `m0` | `192.168.10.10` | Control plane | MS-01, i9-12900H | 64 GB | 2 × 10G SFP+ | Intel |
| `m1` | `192.168.10.11` | Control plane | MS-01, i9-12900H | 64 GB | 2 × 10G SFP+ | Intel |
| `m2` | `192.168.10.12` | Control plane | MS-01, i9-12900H | 64 GB | 2 × 10G SFP+ | Intel |
| `w2` | `192.168.10.15` | Worker | GMKtec M5 Plus, Ryzen 7 5825U | 32 GB | 2 × 2.5G | AMD |

The control-plane nodes have no taint and run workloads too.

> [!NOTE]
> `w0` (`192.168.10.13`) and `w1` (`192.168.10.14`) have node files for Proxmox VMs, but are not in the cluster.

## Disks

| Node | Talos install disk, by serial | Ceph disk |
|---|---|---|
| `m0` | `24514D235ECB` | `nvme1n1` |
| `m1` | `25014D60E51E` | `nvme1n1` |
| `m2` | `24514D121897` | `nvme1n1` |
| `w2` | `215186493404` | `/dev/disk/by-id/nvme-ZETTASTONE_CP200_1024GB_ZSP02OV1TCB824344536` |

NVMe device names can change between boots. Compare serials before wiping anything.

## GPUs

| Nodes | Talos extensions | Kubernetes driver | Used by |
|---|---|---|---|
| `m0`, `m1`, `m2` | `i915`, `intel-ucode` | Intel GPU resource driver (DRA) | Plex |
| `w2` | `amdgpu`, `amd-ucode` | AMD GPU DRA driver | Jellyfin |

## Supporting devices

| Device | Job |
|---|---|
| UniFi UCG Fiber | Router, firewall, BGP peer, NVR |
| UniFi USW Aggregation | 10G SFP+ switching for the MS-01 nodes |
| UniFi USW Pro XG 10 PoE | 10G switching for storage, workstations, and access points |
| UniFi USW Pro Max 24 PoE | 1/2.5G switching for `w2`, cameras, and IoT |
| UniFi UNAS Pro (`superheavy`) | 7 × 16 TB of NFS for media and backups |

Photos of the rack are in the [repository README](https://github.com/pipitonelabs/k8s-gitops#readme).
