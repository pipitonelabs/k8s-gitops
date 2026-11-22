# Troubleshooting

## Start here

```bash
kubectl get nodes
flux get sources git -A
flux get ks -A
flux get hr -A
kubectl -n NAMESPACE get pods -o wide
kubectl -n NAMESPACE describe pod POD
kubectl -n NAMESPACE logs POD -f
kubectl -n NAMESPACE get events --sort-by=.metadata.creationTimestamp
```

## Talos and bootstrap

| Symptom | Cause and fix |
|---|---|
| `unknown document kind` or `not registered` | `talosctl` is older than 1.14 |
| `certificate required` from an apply | The node has a config. Drop `--insecure` |
| `network is unreachable` with an IPv6 address | A node name resolved to IPv6. Use `-e IP -n IP` |
| `op inject` fails | Sign in again and check the reference exists |
| A schematic request fails | The workstation cannot reach `factory.talos.dev` |
| Talos bootstrap skipped a worker | [Check it is reachable, then run it again](bootstrap-talos.md#1-check-which-nodes-exist) |
| Waiting for kube-apiserver forever | Run `talosctl -n 192.168.10.10 service etcd` |
| helmfile times out | Check Cilium, registry access, and missing CRDs |

## Flux

| Symptom | Cause and fix |
|---|---|
| `dependency not ready` | Fix the first failed item in the chain |
| A merge is not live | Check the GitRepository revision, then the webhook |
| HelmRelease stalled | `flux -n NS reconcile helmrelease APP --force` |
| A manual edit disappeared | Flux reverted it. Change Git |
| Secrets are missing | Check `kubectl get clustersecretstores,externalsecrets -A` |

## Storage

| Symptom | Cause and fix |
|---|---|
| PVC `Pending` after a rebuild | Its restore is running, or Ceph is not ready |
| A recreated PVC has old or empty data | [Refresh the restore image](restore-volumes.md#recreate-a-pvc-on-a-running-cluster) |
| Hourly backups stopped after a manual one | [Check for a leftover trigger](backups.md#snapshot-a-volume-now) |
| Apps scaled to zero | The NFS scaler cannot see the NAS |
| A drain never finishes | [Move the PostgreSQL primaries](talos-operations.md#drain-a-node) |
| tuppr will not upgrade | Ceph is not `HEALTH_OK`, or a backup is running |

## A PVC stuck in `Terminating`

Find what still uses it first:

```bash
kubectl -n NAMESPACE describe pvc NAME
kubectl get volumeattachments
```

> [!WARNING]
> Remove a finalizer only when nothing uses the volume and you no longer need the data.

```bash
kubectl -n NAMESPACE patch pvc NAME --type=merge -p '{"metadata":{"finalizers":[]}}'
```
