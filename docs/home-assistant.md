# Home Assistant

> [!NOTE]
> Home Assistant is not deployed. Its entry in `kubernetes/apps/home/kustomization.yaml` is commented out.

## Before enabling it

- Its `ks.yaml` depends on `emqx-cluster`, which no longer exists. Remove that dependency or restore EMQX.
- Its volume restores from the last Kopia snapshot if one exists, and otherwise starts empty.
- It sits behind Envoy Gateway, so `configuration.yaml` must trust the pod network:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 10.244.0.0/16
```
