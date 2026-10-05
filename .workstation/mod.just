set default-script
set quiet
set script-interpreter := ['bash', '-euo', 'pipefail']
set shell := ['bash', '-euo', 'pipefail', '-c']

[private]
default:
    just --list workstation

[doc('Install workstation tools with Homebrew')]
brew:
    brew bundle --file "{{ source_directory() }}/Brewfile"

[doc('Install kubectl plugins with krew')]
krew: brew
    kubectl krew install cert-manager cnpg rook-ceph view-secret
