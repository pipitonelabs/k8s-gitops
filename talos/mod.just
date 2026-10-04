set default-script
set quiet
set script-interpreter := ['bash', '-euo', 'pipefail']
set shell := ['bash', '-euo', 'pipefail', '-c']

[private]
default:
    just --list talos

# Nodes are addressed by IP, e.g. `just talos apply-node 192.168.10.10`
[confirm('Apply Talos config to ' + node + ' [y|N] ?')]
[doc('Apply Talos config to a node (pass e.g. --mode try for a safe first apply)')]
apply-node node *args:
    just talos render-config {{ node }} | talosctl -n {{ node }} apply-config -f /dev/stdin {{ args }}

[doc('Render the full machine config for a node to stdout (contains secrets)')]
render-config node:
    export SCHEMATIC="$(just talos schematic-id "$(just talos hardware {{ node }})")"
    talosctl machineconfig patch <(just template "{{ source_directory() }}/cluster.yaml.j2") \
        -p @<(just template "{{ source_directory() }}/hardware/$(just talos hardware {{ node }}).yaml.j2") \
        -p @<(just template "{{ source_directory() }}/$(just talos machine-type {{ node }}).yaml.j2") \
        -p @<(just template "$(just talos node-file {{ node }})")

[doc('Show what applying the config would change on a node (dry run, secrets not redacted)')]
diff-node node:
    just talos render-config {{ node }} | talosctl -n {{ node }} apply-config --dry-run -f /dev/stdin

[doc('Validate the rendered config for a node')]
validate-node node:
    mode="metal"
    [[ "$(just talos hardware {{ node }})" == "baremetal" ]] || mode="cloud"
    just talos render-config {{ node }} | talosctl validate --mode "$mode" --config /dev/stdin

[doc('Regenerate talosconfig from the 1Password secrets (needed on a fresh workstation or rebuild)')]
generate-talosconfig:
    secrets="$(mktemp)"
    trap 'rm -f "$secrets"' EXIT
    just template "{{ source_directory() }}/secrets.yaml.j2" > "$secrets"
    talosctl gen config k8s https://k8s.internal:6443 --with-secrets "$secrets" \
        --output-types talosconfig --output "{{ source_directory() }}/talosconfig" --force
    nodes="$(just talos node-ips)"
    talosctl config endpoint $(just talos controlplane-ips)
    talosctl config node $nodes
    just log info "Generated talosconfig" "path" "{{ source_directory() }}/talosconfig" "nodes" "${nodes// /,}"

[doc('Write the kubeconfig to kubernetes/kubeconfig')]
kubeconfig:
    talosctl kubeconfig -n "$(talosctl config info -o yaml | yq -r -e '.endpoints[0]')" -f --force-context-name k8s "{{ justfile_directory() }}/kubernetes"

[doc('Print the Talos factory schematic ID for talos/schematics/<hardware>.yaml.j2 (baremetal or proxmox)')]
schematic-id hardware='baremetal':
    just template "{{ source_directory() }}/schematics/{{ hardware }}.yaml.j2" \
        | curl -sX POST --data-binary @- https://factory.talos.dev/schematics | jq -r '.id'

[doc('Download the bare-metal Talos ISO for a version, e.g. v1.14.0 (VMs get their image from talos-vm-workers)')]
download-image version:
    schematic="$(just talos schematic-id baremetal)"
    curl -fL --remove-on-error --retry 5 --retry-delay 5 --retry-all-errors --progress-bar \
        -o "{{ source_directory() }}/talos-{{ version }}-${schematic:0:8}.iso" \
        "https://factory.talos.dev/image/${schematic}/{{ version }}/metal-amd64.iso"
    just log info "Downloaded Talos" "version" "{{ version }}" "schematic" "${schematic}"

[confirm('Upgrade node ' + node + ' [y|N] ?')]
[doc('Upgrade Talos on a node using the installer image from the rendered config')]
upgrade-node node *args:
    talosctl -n {{ node }} upgrade -i "$(just talos machine-image {{ node }})" --timeout=10m {{ args }}

[confirm('Upgrade Kubernetes to ' + version + ' [y|N] ?')]
[doc('Upgrade Kubernetes on the cluster')]
upgrade-k8s version:
    talosctl -n "$(talosctl config info -o yaml | yq -r -e '.endpoints[0]')" upgrade-k8s --to {{ version }}

[confirm('Reboot node ' + node + ' [y|N] ?')]
[doc('Reboot a node')]
reboot-node node *args:
    talosctl -n {{ node }} reboot {{ args }}

[confirm('Shutdown node ' + node + ' [y|N] ?')]
[doc('Shutdown a node')]
shutdown-node node *args:
    talosctl -n {{ node }} shutdown --force {{ args }}

[confirm('Shutdown the whole cluster [y|N] ?')]
[doc('Shutdown every node in talosconfig')]
shutdown-cluster:
    talosctl -n "$(just talos node-ips | tr ' ' ',')" shutdown --force

[confirm('Reset node ' + node + ' [y|N] ?')]
[doc('Reset (wipe) a node')]
reset-node node *args:
    talosctl -n {{ node }} reset --graceful=false {{ args }}

[confirm('Reset the whole cluster [y|N] ?')]
[doc('Reset (wipe) every node in talosconfig')]
reset-cluster:
    talosctl -n "$(just talos node-ips | tr ' ' ',')" reset --graceful=false

# Node IPs come from the files in talos/nodes/<hardware>/ (talosconfig may hold hostnames, or not exist yet)
[private]
node-ips:
    for f in "{{ source_directory() }}"/nodes/*/*.yaml.j2; do basename "$f" .yaml.j2; done | sort -V | paste -sd' ' -

[private]
controlplane-ips:
    for n in $(just talos node-ips); do
        if [[ "$(just talos machine-type "$n")" == "controlplane" ]]; then echo "$n"; fi
    done | paste -sd' ' -

[private]
node-file node:
    files=("{{ source_directory() }}"/nodes/*/"{{ node }}".yaml.j2)
    [[ -f "${files[0]}" ]] || { echo "No node file for {{ node }} under talos/nodes/" >&2; exit 1; }
    echo "${files[0]}"

# The hardware class is the directory the node file lives in: baremetal or proxmox
[private]
hardware node:
    basename "$(dirname "$(just talos node-file {{ node }})")"

[private]
machine-type node:
    just template "$(just talos node-file {{ node }})" | yq -r -e 'select(.machine) | .machine.type'

[private]
machine-image node:
    export SCHEMATIC="$(just talos schematic-id "$(just talos hardware {{ node }})")"
    just template "{{ source_directory() }}/hardware/$(just talos hardware {{ node }}).yaml.j2" | yq -r -e 'select(.kind == "UnattendedInstallConfig") | .installer.image'
