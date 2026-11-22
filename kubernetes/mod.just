set default-script
set quiet
set script-interpreter := ['bash', '-euo', 'pipefail']
set shell := ['bash', '-euo', 'pipefail', '-c']

[private]
default:
    just --list kube

[arg('resource', pattern='hr|ks|gitrepo|ocirepo|es')]
[doc('Force-sync every resource of a kind (es = ExternalSecrets, replaces task kubernetes:sync-secrets)')]
sync resource:
    kubectl get {{ resource }} --no-headers -A | while read -r ns name _; do
        kubectl -n "$ns" annotate --field-manager flux-client-side-apply --overwrite {{ resource }} "$name" \
            "force-sync=$(date +%s)" \
            "reconcile.fluxcd.io/requestedAt=$(date +%s)" \
            "reconcile.fluxcd.io/forceAt=$(date +%s)"
    done

[doc('Delete finished pods, Failed or Succeeded (replaces task kubernetes:cleanse-pods)')]
prune-pods:
    for phase in Failed Succeeded; do
        kubectl delete pods -A --field-selector status.phase="$phase" --ignore-not-found=true
    done

[doc('Mount a PVC in a throwaway alpine pod at /mnt (replaces task kubernetes:browse-pvc)')]
browse-pvc ns claim:
    kubectl run -n {{ ns }} browse-pvc-{{ claim }} -it --rm --restart=Never \
        --image=mirror.gcr.io/alpine:latest \
        --overrides='{"spec":{"containers":[{"name":"browse-pvc-{{ claim }}","image":"mirror.gcr.io/alpine:latest","stdin":true,"tty":true,"command":["/bin/sh"],"workingDir":"/mnt","volumeMounts":[{"mountPath":"/mnt","name":"data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"{{ claim }}"}}]}}'

[doc('Open a privileged debug shell on a node (replaces task kubernetes:node-shell)')]
debug-node node:
    trap 'kubectl delete pod -n kube-system -l app.kubernetes.io/managed-by=kubectl-debug --field-selector spec.nodeName={{ node }} --ignore-not-found --wait=false' EXIT
    kubectl debug node/{{ node }} -n kube-system -it --image=mirror.gcr.io/alpine:latest --profile=sysadmin

[doc('Print a decoded secret (needs the krew view-secret plugin)')]
view-secret ns secret:
    kubectl view-secret -n {{ ns }} {{ secret }}

[arg('state', pattern='suspend|resume')]
[doc('Suspend or resume VolSync')]
volsync state:
    flux -n volsync-system {{ state }} kustomization volsync
    flux -n volsync-system {{ state }} helmrelease volsync
    kubectl -n volsync-system scale deployment volsync --replicas {{ if state == "suspend" { "0" } else { "1" } }}

[doc('Take a manual VolSync (Kopia) snapshot of one app and wait for it to finish')]
snapshot ns app:
    now="$(date +%s)"
    schedule="$(kubectl -n {{ ns }} get replicationsources {{ app }} -o jsonpath='{.spec.trigger.schedule}')"
    # A manual trigger overrides the schedule, so always take it out again.
    if [[ -n "$schedule" ]]; then
        trap "kubectl -n {{ ns }} patch replicationsources {{ app }} --type merge -p '{\"spec\":{\"trigger\":{\"manual\":null}}}'" EXIT
    fi
    kubectl -n {{ ns }} patch replicationsources {{ app }} --type merge \
        -p "{\"spec\":{\"trigger\":{\"manual\":\"${now}\"}}}"
    kubectl -n {{ ns }} wait replicationsources/{{ app }} \
        --for=jsonpath='{.status.lastManualSync}'="${now}" --timeout=120m

# `app` is the PVC name. The Kustomization comes from the PVC's labels, and the HelmReleases from the
# workloads that mount it. Pauses KEDA and the Grafana operator, which would restart a stopped app.
[confirm('Restore ' + ns + '/' + app + ' PVC from VolSync (overwrites current data) [y|N] ?')]
[doc('Restore an app PVC from VolSync in place (previous=0 is the latest snapshot)')]
restore ns app previous='0':
    ks="$(kubectl -n {{ ns }} get pvc {{ app }} -o json | jq -r '.metadata.labels["kustomize.toolkit.fluxcd.io/name"] // empty')"
    users="$(kubectl -n {{ ns }} get deploy,sts -o json | jq -c --arg c '{{ app }}' \
        '[.items[] | select(any(.spec.template.spec.volumes[]?; .persistentVolumeClaim.claimName == $c))]')"
    [[ -n "$ks" ]] || just log fatal "PVC has no Flux Kustomization label" "pvc" "{{ app }}"
    [[ "$users" != "[]" ]] || just log fatal "No workload mounts the PVC" "pvc" "{{ app }}"
    kubectl -n {{ ns }} get replicationdestination {{ app }}-dst -o name >/dev/null

    releases="$(jq -r '[.[].metadata.labels["helm.toolkit.fluxcd.io/name"] // empty] | unique[]' <<<"$users")"
    grafanas="$(jq -r '[.[].metadata.ownerReferences[]? | select(.kind == "Grafana") | .name] | unique[]' <<<"$users")"
    scalers="$(kubectl -n {{ ns }} get scaledobjects.keda.sh -o json | jq -r --argjson users "$users" \
        '.items[] | select(.spec.scaleTargetRef.name as $t | any($users[]; .metadata.name == $t)) | .metadata.name')"
    workloads="$(
        {
            jq -r '.[] | (.kind | ascii_downcase) + "/" + .metadata.name' <<<"$users"
            for hr in $releases; do
                kubectl -n {{ ns }} get deploy,sts -l "helm.toolkit.fluxcd.io/name=$hr" -o json \
                    | jq -r '.items[] | (.kind | ascii_downcase) + "/" + .metadata.name'
            done
        } | sort -u
    )"
    replicas=""
    for w in $workloads; do
        replicas="$replicas $w=$(kubectl -n {{ ns }} get "$w" -o jsonpath='{.spec.replicas}')"
    done

    # On failure leave the app stopped, so it cannot start on half-restored data.
    trap 'rc=$?; if ((rc)); then
        echo "Restore failed. The app is left stopped. Run it again, or to start the app as it is:" >&2
        for g in $grafanas; do echo "  kubectl -n {{ ns }} patch grafanas.grafana.integreatly.org $g --type merge -p {\\\"spec\\\":{\\\"suspend\\\":null}}" >&2; done
        for s in $scalers; do echo "  kubectl -n {{ ns }} annotate scaledobjects.keda.sh $s autoscaling.keda.sh/paused-" >&2; done
        for r in $replicas; do echo "  kubectl -n {{ ns }} scale ${r%=*} --replicas=${r##*=}" >&2; done
        echo "  flux -n {{ ns }} resume kustomization $ks" >&2
        for hr in $releases; do echo "  flux -n {{ ns }} resume helmrelease $hr" >&2; done
    fi' EXIT

    flux -n {{ ns }} suspend kustomization "$ks"
    for hr in $releases; do flux -n {{ ns }} suspend helmrelease "$hr"; done
    for g in $grafanas; do
        kubectl -n {{ ns }} patch grafanas.grafana.integreatly.org "$g" --type merge -p '{"spec":{"suspend":true}}'
    done
    for s in $scalers; do
        kubectl -n {{ ns }} annotate scaledobjects.keda.sh "$s" autoscaling.keda.sh/paused=true --overwrite
        kubectl -n {{ ns }} wait "scaledobjects.keda.sh/$s" --for=condition=Paused --timeout=60s
    done
    for w in $workloads; do kubectl -n {{ ns }} scale "$w" --replicas=0; done
    until [[ -z "$(kubectl -n {{ ns }} get pods -o json | jq -r --arg c '{{ app }}' '.items[] | select(any(.spec.volumes[]?; .persistentVolumeClaim.claimName == $c)) | .metadata.name')" ]]; do
        just log info "Waiting for pods using the PVC to stop..." "app" "{{ app }}"
        sleep 5
    done

    trigger="restore-{{ previous }}-$(date +%s)"
    kubectl -n {{ ns }} get replicationdestination {{ app }}-dst -o json \
        | jq --arg trigger "$trigger" 'del(.status)
            | .metadata = {name: "{{ app }}-manual", namespace: .metadata.namespace}
            | .spec.trigger.manual = $trigger
            | .spec.kopia.copyMethod = "Direct"
            | .spec.kopia.destinationPVC = "{{ app }}"
            | .spec.kopia.previous = {{ previous }}' \
        | kubectl apply --server-side -f -
    # VolSync deletes the job as soon as it finishes, so wait on the ReplicationDestination.
    kubectl -n {{ ns }} wait replicationdestination/{{ app }}-manual \
        --for=jsonpath='{.status.lastManualSync}'="$trigger" --timeout=120m
    kubectl -n {{ ns }} delete replicationdestination {{ app }}-manual

    # A zero is left to Helm, KEDA or the operator, it can come from an earlier failed run.
    for r in $replicas; do
        if [[ "${r##*=}" != 0 ]]; then kubectl -n {{ ns }} scale "${r%=*}" --replicas="${r##*=}"; fi
    done
    for g in $grafanas; do
        kubectl -n {{ ns }} patch grafanas.grafana.integreatly.org "$g" --type merge -p '{"spec":{"suspend":null}}'
    done
    for s in $scalers; do kubectl -n {{ ns }} annotate scaledobjects.keda.sh "$s" autoscaling.keda.sh/paused-; done
    flux -n {{ ns }} resume kustomization "$ks"
    for hr in $releases; do
        flux -n {{ ns }} resume helmrelease "$hr"
        flux -n {{ ns }} reconcile helmrelease "$hr" --force
    done
