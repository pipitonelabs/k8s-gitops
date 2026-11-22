# Talos operations

## Change a machine config

1. Edit the [right layer](machine-config.md#layers).
2. Validate it and read the diff. The diff contains secrets.

    ```bash
    just talos validate-node 192.168.10.12
    just talos diff-node 192.168.10.12
    ```

3. Check that Ceph is `HEALTH_OK`.
4. Apply it to one node.

    ```bash
    just talos apply-node 192.168.10.12
    ```

5. Check nodes, Ceph, and Flux before the next node.

### Apply modes

| Mode | Behavior | Use for |
|---|---|---|
| `auto` (default) | Reboots if needed | Most changes |
| `--mode try` | Rolls back after one minute | Testing. The rollback disturbs the network again |
| `--mode no-reboot` | Refuses changes that need a reboot | Changes that must not reboot |
| `--mode staged` | Applies on the next reboot | Bond member changes |

After a successful `try`, apply again without it to keep the change. In scripts, use
`just --yes talos apply-node ...` to skip the confirmation.

Network changes briefly flap the node. Expect short Ceph warnings, and possibly a short API VIP outage.

## Upgrades

tuppr performs upgrades from `kubernetes/apps/system-upgrade/tuppr/upgrades/`.

1. Merge the version change.
2. tuppr waits until Ceph is `HEALTH_OK` and no VolSync backup is running, then upgrades.
3. Make the [template pins](machine-config.md#version-pins) equal to the new versions.

To upgrade by hand:

```bash
just talos upgrade-node 192.168.10.12
just talos upgrade-k8s vX.Y.Z
```

`upgrade-node` uses the installer tag in the hardware template, so update that first. Upgrading the node that
holds the API VIP can abort its drain with a connection reset. Run the upgrade again.

## Drain a node

PostgreSQL primaries have disruption budgets that block a drain. Move them first:

```bash
kubectl get cluster.postgresql.cnpg.io -n database
kubectl cnpg promote postgres17 INSTANCE_ON_ANOTHER_NODE -n database
kubectl drain m2 --ignore-daemonsets --delete-emptydir-data
kubectl uncordon m2    # when finished
```

CloudNativePG does not move primaries back afterwards.
