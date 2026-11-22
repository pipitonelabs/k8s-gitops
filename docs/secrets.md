# Secrets

No secret values are stored in Git. The secret store is the source of truth.

## How secrets get where they are used

| Consumer | Mechanism | When |
|---|---|---|
| Talos machine configs | `op inject` on rendered templates | Each render |
| talosconfig | `just talos generate-talosconfig` | On demand |
| Bootstrap credential and certificate | `op inject` on `bootstrap/resources.yaml` | Bootstrap |
| Everything else | ExternalSecret | Continuously, through External Secrets |

## What a rebuild needs

- The Talos and Kubernetes PKI, tokens, and etcd encryption key.
- The credential External Secrets uses for the store.
- The wildcard certificate.
- The Kopia repository password.
- Database and Garage credentials.
- The offsite storage credentials and encryption passwords.
- Each app's own secrets.

To see exactly which references the repository uses:

```bash
rg -n 'op://' bootstrap talos
rg -n -A3 'remoteRef:|extract:' kubernetes
```

## Check and refresh

```bash
kubectl get clustersecretstores
kubectl get externalsecrets -A
just kube sync es
```

> [!WARNING]
> This repository and its pull request comments are public. Never put a secret value in a manifest, commit,
> branch, or doc.
