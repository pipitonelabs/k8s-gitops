set no-exit-message
set default-script
set quiet
set script-interpreter := ['bash', '-euo', 'pipefail']
set shell := ['bash', '-euo', 'pipefail', '-c']

controller := `talosctl config info -o yaml 2>/dev/null | yq -r -e '.endpoints[0]' 2>/dev/null || true`
nodes := `just talos node-ips`
controlplanes := `just talos controlplane-ips`

[private]
default:
    just --list bootstrap

# Every stage is safe to re-run. See docs/rebuild-cluster.md for the full procedure.
[confirm('Bootstrap Talos and Kubernetes apps end-to-end? [y|N]')]
[doc('Bootstrap a Talos & Kubernetes cluster end-to-end')]
cluster: talos apps

[confirm('Bootstrap Talos? [y|N]')]
[doc('Stage 1: apply machine configs, bootstrap etcd/Kubernetes and fetch kubeconfig')]
talos: nodes k8s (kubeconfig "node")

[confirm('Bootstrap Kubernetes apps? [y|N]')]
[doc('Stage 2: secrets, CRDs, Cilium, CoreDNS, Spegel, cert-manager and Flux via helmfile')]
apps: (kubeconfig "node") base helmfile kubeconfig

[private]
nodes:
    just log info "Running stage..." "stage" "{{ recipe_name() }}"
    [[ -n "{{ nodes }}" ]] || just log fatal "No node files in talos/nodes" "stage" "{{ recipe_name() }}"
    for n in {{ nodes }}; do
        if ! op=$(just --yes talos apply-node "$n" --insecure 2>&1); then
            if [[ "$op" == *"certificate required"* ]]; then
                just log info "Talos already configured, skipping apply of config" "stage" "{{ recipe_name() }}" "node" "$n"
                continue
            fi
            just log fatal "Failed to apply Talos configuration" "stage" "{{ recipe_name() }}" "node" "$n" "output" "$op"
        fi
    done

[private]
k8s:
    just log info "Running stage..." "stage" "{{ recipe_name() }}"
    until op=$(talosctl -n "{{ controller }}" bootstrap 2>&1 || true) && [[ "$op" == *"AlreadyExists"* ]]; do
        just log info "Kubernetes bootstrap in progress. Retrying in 5 seconds..." "stage" "{{ recipe_name() }}"
        sleep 5
    done

# With lb=node the kubeconfig points at a node IP, because the k8s.internal VIP is not reachable
# before Cilium is installed. The final stage fetches it again so it points back at the VIP.
[private]
kubeconfig lb="vip":
    just log info "Running stage..." "stage" "{{ recipe_name() }}" "lb" "{{ lb }}"
    if ! talosctl kubeconfig -n "{{ controller }}" -f --force-context-name k8s "{{ justfile_directory() }}/kubernetes"; then
        just log fatal "Failed to fetch kubeconfig" "stage" "{{ recipe_name() }}"
    fi
    if [[ "{{ lb }}" == "node" ]]; then
        if ! kubectl config set-cluster k8s --server "https://{{ controller }}:6443"; then
            just log fatal "Failed to set kubectl cluster server address" "stage" "{{ recipe_name() }}"
        fi
    fi

# Wait for the API, then nodes register as Ready=False. They only become Ready=True once the CNI is healthy.
[private]
ready:
    just log info "Running stage..." "stage" "{{ recipe_name() }}"
    for n in {{ controlplanes }}; do
        until [[ "$(curl -ks -o /dev/null -w '%{http_code}' --connect-timeout 2 "https://${n}:6443/readyz")" =~ ^(200|401)$ ]]; do
            just log info "Waiting for kube-apiserver. Retrying in 5 seconds..." "stage" "{{ recipe_name() }}" "node" "$n"
            sleep 5
        done
    done
    if ! kubectl wait nodes --for=condition=Ready=True --all --timeout=10s &>/dev/null; then
        until kubectl wait nodes --for=condition=Ready=False --all --timeout=10s &>/dev/null; do
            just log info "Nodes not registered yet. Retrying in 5 seconds..." "stage" "{{ recipe_name() }}"
            sleep 5
        done
    fi

# Namespaces and the secrets Flux/External Secrets need before 1Password is reachable, then CRDs
[private]
base: ready
    just log info "Running stage..." "stage" "{{ recipe_name() }}"
    if ! op inject --in-file "{{ source_directory() }}/resources.yaml" | kubectl apply --server-side -f -; then
        just log fatal "Failed to apply bootstrap resources" "stage" "{{ recipe_name() }}"
    fi
    if ! helmfile --file "{{ source_directory() }}/helmfile.d/00-crds.yaml" template --quiet | yq ea -e 'select(.kind == "CustomResourceDefinition")' | kubectl apply --server-side --field-manager bootstrap --force-conflicts -f -; then
        just log fatal "Failed to apply base CRDs" "stage" "{{ recipe_name() }}"
    fi

[private]
helmfile:
    just log info "Running stage..." "stage" "{{ recipe_name() }}"
    if ! helmfile --file "{{ source_directory() }}/helmfile.d/01-apps.yaml" sync --hide-notes; then
        just log fatal "Failed to sync helmfile" "stage" "{{ recipe_name() }}"
    fi
