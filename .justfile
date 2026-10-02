#!/usr/bin/env -S just --justfile

set minimum-version := '1.55.0'

set default-script
set lazy
set quiet
set script-interpreter := ['bash', '-euo', 'pipefail']
set shell := ['bash', '-euo', 'pipefail', '-c']

# Exported to every recipe so `just` works without mise activated (same values as .mise.toml)
export KUBECONFIG := justfile_directory() / 'kubernetes/kubeconfig'
export MINIJINJA_CONFIG_FILE := justfile_directory() / '.minijinja.toml'
export TALOSCONFIG := justfile_directory() / 'talos/talosconfig'

# Bootstrap Recipes
[group('Bootstrap')]
mod bootstrap "bootstrap"

# Kube Recipes
[group('Kube')]
mod kube "kubernetes"

# Talos Recipes
[group('Talos')]
mod talos "talos"

# Workstation Recipes
[group('Workstation')]
mod workstation ".workstation"

[private]
default:
    just --list

[private]
log lvl msg *args:
    gum log -t rfc3339 -s -l "{{ lvl }}" "{{ msg }}" {{ args }}

[private]
template file *args:
    minijinja-cli "{{ file }}" {{ args }} | op inject
