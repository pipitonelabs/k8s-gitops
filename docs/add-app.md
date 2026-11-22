# Add an app

## 1. Create the files

```text
kubernetes/apps/<namespace>/<app>/
├── ks.yaml
└── app/
    ├── kustomization.yaml
    └── helmrelease.yaml
```

## 2. Write `ks.yaml`

This example has a backed-up volume. Drop `components`, `dependsOn`, and `postBuild` if the app is stateless.

```yaml
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: &app myapp
  namespace: &namespace default
spec:
  commonMetadata:
    labels:
      app.kubernetes.io/name: *app
  components:
    - ../../../../components/volsync
  dependsOn:
    - name: rook-ceph-cluster
      namespace: rook-ceph
    - name: volsync
      namespace: volsync-system
  interval: 1h
  path: ./kubernetes/apps/default/myapp/app
  postBuild:
    substitute:
      APP: *app
      VOLSYNC_CAPACITY: 5Gi
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
    namespace: flux-system
  targetNamespace: *namespace
  wait: true
```

## 3. Write `app/kustomization.yaml`

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ./helmrelease.yaml
```

## 4. Write the HelmRelease

Most apps use the shared `app-template` chart. Start from `kubernetes/apps/networking/echo-server`, then:

- Pin the image by tag and digest.
- Set probes, requests, and a memory limit.
- Run as non-root with a read-only root filesystem and all capabilities dropped.
- Route through `envoy-internal` unless the app must be public.
- Add the Gatus annotation to the route.
- Take secrets from an [ExternalSecret](secrets.md), never from Git.

## 5. Register it

Add `./myapp/ks.yaml` to `kubernetes/apps/<namespace>/kustomization.yaml`. Without this, Flux never sees it.

## 6. Test and open a pull request

```bash
version=$(yq '.env.FLATE_VERSION' .github/workflows/ci.yaml)
mise exec "github:home-operations/flate@$version" -- flate test all --path ./kubernetes
```

Add the app to [Applications](applications.md) in the same pull request.
