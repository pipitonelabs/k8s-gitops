# Verify the cluster

A rebuild is finished when every section passes.

## Platform

```bash
kubectl get nodes -o wide
flux get ks -A
flux get hr -A
kubectl -n rook-ceph exec deploy/rook-ceph-tools -- ceph status
kubectl get pvc -A
```

- [ ] Four nodes are `Ready` on tuppr's Talos and Kubernetes versions
- [ ] No Kustomization or HelmRelease has failed
- [ ] Ceph is `HEALTH_OK`. Four `AUTH_INSECURE_*` warnings are muted on purpose
- [ ] Every PVC is `Bound`

## Networking

```bash
kubectl get gateway -A
kubectl get ciliumbgpclusterconfigs,ciliumbgppeerconfigs,ciliumbgpadvertisements
kubectl get --raw /readyz
```

- [ ] Both gateways are programmed
- [ ] The router shows four established BGP sessions
- [ ] The API answers through `k8s.internal`
- [ ] An internal app and an external app load over HTTPS

## Data

- [ ] All three PostgreSQL clusters are healthy with three instances
- [ ] Garage lists its five buckets and an object downloads
- [ ] Plex has its library, Sonarr and Radarr their history
- [ ] Outline has its documents and its uploads
- [ ] Forgejo has its repositories
- [ ] Authentik login works, with users and providers present

## Turn backups back on

Do this last.

1. Revert the [pause pull request](before-you-wipe.md#3-pause-destructive-backup-jobs).
2. Watch each kind of backup succeed:

    ```bash
    kubectl get replicationsource -A
    kubectl get backups.postgresql.cnpg.io -n database
    kubectl get cronjob -A
    ```

- [ ] A volume backup succeeded
- [ ] A database backup succeeded
- [ ] An offsite copy succeeded
- [ ] A push to `main` delivered the Flux webhook
