# Pipitone Labs Kubernetes

A four-node homelab cluster on Talos Linux, declared in Git and delivered by Flux.

These pages are the Markdown files in `docs/` of
[k8s-gitops](https://github.com/pipitonelabs/k8s-gitops). [docs.pipitonelabs.com](https://docs.pipitonelabs.com)
is built from them. If the cluster is down, read them on GitHub or in a clone. They work the same.

## Build the cluster from scratch

Start with [the rebuild overview](rebuild-cluster.md), then follow the steps in order.

| Step | Pages | Result |
|---|---|---|
| 1. Prepare | [Protect backups](before-you-wipe.md), [workstation](workstation.md), [network](network-prerequisites.md) | Safe backups and working tools |
| 2. Install Talos | [Install Talos Linux](install-talos.md) | Nodes in maintenance mode with clean disks |
| 3. Bootstrap Talos | [Machine configs](machine-config.md), [bootstrap Talos](bootstrap-talos.md) | A Kubernetes API |
| 4. Bootstrap apps | [Bootstrap apps](bootstrap-apps.md) | Networking and Flux |
| 5. Restore data | [Volumes](restore-volumes.md), [Garage](restore-garage.md), [databases](restore-databases.md) | Apps with their data |
| 6. Verify | [Verify the cluster](verify-cluster.md) | A finished rebuild |

## Understand the cluster

| Page | Covers |
|---|---|
| [Architecture](architecture.md) | The stack and how its layers fit together |
| [Hardware and nodes](hardware.md) | Machines, disks, and GPUs |
| [Networking](networking.md) | Addresses, VLANs, BGP, gateways, DNS, certificates |
| [Storage](storage.md) | Ceph, node-local storage, and NFS |
| [Applications](applications.md) | Everything deployed, by namespace |
| [GitOps with Flux](flux.md) | How a merge becomes a deploy |
| [Secrets](secrets.md) | How secrets reach nodes and pods |

## Run the cluster

| I want to | Page |
|---|---|
| Deploy an app | [Add an app](add-app.md) |
| Change or upgrade Talos | [Talos operations](talos-operations.md) |
| Add, reset, or remove a node | [Node lifecycle](talos-nodes.md) |
| Add a Proxmox worker | [Proxmox workers](proxmox-cloud-init.md) |
| Check or run a backup | [Backups](backups.md) |
| Work on PostgreSQL | [PostgreSQL](postgres.md) |
| Work on Ceph | [Rook and Ceph](rook-ceph.md) |
| Find a command | [Command reference](commands.md) |
| Fix something broken | [Troubleshooting](workingnotes.md) |
| Know what is still fragile | [Known gaps](known-gaps.md) |
