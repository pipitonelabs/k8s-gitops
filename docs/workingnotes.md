## Troubleshooting and command reference

- Upgrade Talos to specific schematic, version
```
talosctl upgrade --nodes 10.20.30.40 \
  --image factory.talos.dev/installer/ab86bd395e263b78e5f54c800e4d319dae786d9ae25ecb129462a9e0e9491615:v1.9.5 \
  --wait
```

- Patch a stuck PVC
```
kubectl patch pvc radarr -p '{"metadata":{"finalizers":[]}}' --type=merge
kubectl patch pvc tautulli -p '{"metadata":{"finalizers":[]}}' --type=merge
```

- Scale replicas
```
kubectl scale deployment plex -n media --replicas=1
```

- Encode something to base 64 for external-secrets
```
base64 -w 0 inputfile.txt > output.txt
```

1. Verify the Git Repository is up-to-date and in a ready state.

    ```sh
    flux get sources git -A
    ```

    Force Flux to sync your repository to your cluster:

    ```sh
    flux -n flux-system reconcile ks flux-system --with-source
    ```

2. Verify all the Flux kustomizations are up-to-date and in a ready state.

    ```sh
    flux get ks -A
    ```

3. Verify all the Flux helm releases are up-to-date and in a ready state.

    ```sh
    flux get hr -A
    ```

4. Do you see the pod of the workload you are debugging?

    ```sh
    kubectl -n <namespace> get pods -o wide
    ```

5. Check the logs of the pod if its there.

    ```sh
    kubectl -n <namespace> logs <pod-name> -f
    ```

6. If a resource exists try to describe it to see what problems it might have.

    ```sh
    kubectl -n <namespace> describe <resource> <name>
    ```

7. Check the namespace events

    ```sh
    kubectl -n <namespace> get events --sort-by='.metadata.creationTimestamp'
    ```

- Bootstrap prerequisites

```
export ROOK_DISK=nvme1n1
eval ($op signin)
```

