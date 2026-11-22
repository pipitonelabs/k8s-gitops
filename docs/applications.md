# Applications

What Flux deploys, by namespace. Each lives in `kubernetes/apps/<namespace>/`.

## Apps

| Namespace | App | Purpose |
|---|---|---|
| `default` | blog | Personal blog |
| `default` | forgejo | Self-hosted Git |
| `default` | garage, garage-webui | S3 object storage and its UI |
| `default` | graph-mock | Microsoft Graph emulator for testing |
| `default` | minecraft | Game server |
| `default` | nginx | Resume site (Kustomization `platform-nginx`) |
| `default` | outline | Team wiki |
| `default` | reactive-resume | Resume builder |
| `default` | smtp-relay | Outgoing mail for apps |
| `default` | taskview | Task management |
| `default` | zensical | This documentation site |
| `home` | atuin | Shell history sync |
| `media` | plex, jellyfin | Media servers |
| `media` | jellyplex-watched | Watched-state sync |
| `media` | sonarr, radarr | TV and movie management |
| `media` | prowlarr | Indexer management |
| `media` | profilarr | Quality profiles |
| `media` | sabnzbd, metube | Downloaders |
| `media` | openbooks | Ebook search |
| `media` | seerr | Media requests |
| `media` | maintainerr | Library cleanup |
| `media` | tautulli | Plex statistics |
| `tradeforge` | tradeforge | Self-built trading app |
| `vms` | win11 | Windows 11 VM |

## Platform

| Namespace | App | Purpose |
|---|---|---|
| `actions-runner-system` | actions-runner-controller | GitHub Actions runners |
| `cert-manager` | cert-manager | Certificates |
| `database` | cloudnative-pg | PostgreSQL |
| `database` | dragonfly | Redis-compatible cache |
| `external-secrets` | external-secrets | Secret sync, with its store backend |
| `flux-system` | flux-operator, flux-instance | GitOps |
| `forgejo-runner` | forgejo-runner | Forgejo CI runners |
| `kube-system` | cilium, coredns, spegel | Networking, DNS, image mirror |
| `kube-system` | csi-driver-nfs, snapshot-controller | NFS and volume snapshots |
| `kube-system` | intel-gpu-resource-driver, k8s-gpu-dra-driver | Intel and AMD GPUs |
| `kube-system` | generic-device-plugin | Device access for pods |
| `kube-system` | kubevirt, kubevirt-manager, cdi | Virtual machines |
| `kube-system` | descheduler, irqbalance | Pod and interrupt balancing |
| `kube-system` | metrics-server, reloader | Resource metrics, restarts on config change |
| `networking` | envoy-gateway, cloudflared | Ingress |
| `networking` | external-dns, certificates | DNS records, shared certificate |
| `networking` | multus | Extra pod and VM networks |
| `networking` | crowdsec | Log-based threat detection |
| `networking` | echo-server | Request testing |
| `networking` | network-optimizer | UniFi analysis |
| `networking` | sing-box, sing-box-dashboard | Proxy and its dashboard |
| `networking` | tailscale-operator | Private remote access |
| `observability` | kube-prometheus-stack, karma, silence-operator | Metrics and alerts |
| `observability` | grafana | Dashboards |
| `observability` | victoria-logs | Logs |
| `observability` | gatus, blackbox-exporter | Health checks |
| `observability` | clusterstats, kromgo | Cluster statistics and badges |
| `observability` | keda | Autoscaling, including scale to zero when NFS is down |
| `observability` | smartctl-exporter, unpoller | Disk and UniFi metrics |
| `openebs-system` | openebs | Node-local volumes |
| `rook-ceph` | rook-ceph, ceph-csi-drivers | Replicated storage |
| `security` | authentik | Single sign-on |
| `system-upgrade` | tuppr | Talos and Kubernetes upgrades |
| `system-upgrade` | etcd-backup, etcd-defrag | etcd maintenance |
| `volsync-system` | volsync, kopia, offsite-backup | Backups |

## In the repository, not deployed

| App | State |
|---|---|
| budget | Commented out of its namespace |
| home-assistant | Commented out. See [Home Assistant](home-assistant.md) |
| homebridge | Commented out |
| snmp-exporter | Commented out |
