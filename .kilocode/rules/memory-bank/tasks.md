# Memory Bank Tasks

## Add New Application
**Last performed:** N/A

**Files to create/modify:**
- `kubernetes/apps/<namespace>/<app>/kustomization.yaml`
- `kubernetes/apps/<namespace>/<app>/ks.yaml`
- `kubernetes/apps/<namespace>/<app>/app/helmrelease.yaml`
- `kubernetes/apps/<namespace>/<app>/app/externalsecret.yaml` (secrets)
- `kubernetes/apps/<namespace>/<app>/app/pvc.yaml` (storage)
- Optionally `app/prometheusrule.yaml`

**Steps:**
1. mkdir -p `kubernetes/apps/<namespace>/<app>/app`
2. `kustomization.yaml`: `resources: [namespace.yaml, ks.yaml]`
3. `ks.yaml`: `apiVersion: kustomize.toolkit.fluxcd.io/v1 kind: Kustomization ... path: ./app`
4. `app/kustomization.yaml`: `resources: [helmrelease.yaml, externalsecret.yaml, pvc.yaml]`
5. Fill `helmrelease.yaml` with chart, values; `externalsecret.yaml` with 1P refs.
6. git add/commit/push → Flux applies.

**Important notes:**
- Reuse `kubernetes/components/` for common patches (e.g., volsync).
- Encrypt secrets with SOPS before commit.
- Dry-run: `flux-local reconcile kustomization.yaml`
- Namespace must match app grouping.

## Bootstrap New Cluster
**Steps:**
1. `task init` (gen configs)
2. Edit cluster.yaml/nodes.yaml
3. `task configure` (template)
4. `task bootstrap:talos`
5. `task bootstrap:apps`
6. Monitor `kubectl get pods -A -w`