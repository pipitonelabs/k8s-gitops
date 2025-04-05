- Have not debugged yet, but to get home-assistant to work, get a shell into the pod and update configuration.yaml:

```
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 10.0.0.0/8
    - 10.244.0.0/16
```