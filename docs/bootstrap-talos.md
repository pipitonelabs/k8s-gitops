# Bootstrap Talos

This stage turns machines in maintenance mode into a Kubernetes control plane.

## Before you start

- [ ] [Backups are protected](before-you-wipe.md)
- [ ] [The network is ready](network-prerequisites.md)
- [ ] All nodes are [in maintenance mode with clean disks](install-talos.md)
- [ ] You are [signed in to the secret store](workstation.md#4-sign-in-to-the-secret-store)

## 1. Check which nodes exist

The bootstrap applies every file in `talos/nodes/`. It skips a worker it cannot reach and lists it when that
stage ends. An unreachable control-plane node stops it.

`w0` and `w1` are skipped while their VMs do not exist. If `w2` is listed, fix it and run the bootstrap again.

## 2. Generate the talosconfig

```bash
just talos generate-talosconfig
```

This writes the Git-ignored `talos/talosconfig` from the machine CA in the secret store, so any signed-in
workstation can recreate it. The bootstrap reads its first endpoint, so it must exist before step 4.

## 3. Validate every config

```bash
for ip in 192.168.10.10 192.168.10.11 192.168.10.12 192.168.10.15; do
  just talos validate-node "$ip"
done
```

## 4. Bootstrap

```bash
just bootstrap talos
```

| Stage | What happens | When run again |
|---|---|---|
| `nodes` | Applies each config through the maintenance API | Skips configured nodes and unreachable workers |
| `k8s` | Creates etcd on the first control-plane node | Continues on `AlreadyExists` |
| `kubeconfig` | Writes `kubernetes/kubeconfig`, pointed at a node IP | Overwrites it |

The nodes install to disk and reboot. Remove the USB drives if they boot the installer again.

> [!WARNING]
> etcd is bootstrapped once per cluster. Never run `talosctl bootstrap` on a second node. The others join by
> themselves.

## 5. Check the result

```bash
talosctl -n 192.168.10.10 service etcd
talosctl -n 192.168.10.10 etcd members
kubectl get nodes
```

- [ ] etcd is healthy with three members
- [ ] Four nodes are registered
- [ ] The nodes are `NotReady`, which is correct until Cilium is installed

## 6. Continue

Once all four nodes are registered, [bootstrap the apps](bootstrap-apps.md).
