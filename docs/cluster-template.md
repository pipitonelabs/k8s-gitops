# Repository layout

The repository began as a cluster template and has since diverged. It does not use Taskfile, talhelper,
makejinja, SOPS, ingress-nginx, or `flux bootstrap`.

```text
k8s-gitops/
├── .justfile            entry point for all automation
├── .workstation/        workstation tools
├── .github/workflows/   CI, Renovate, labels, tags
├── .renovate/           Renovate rules
├── bootstrap/
│   ├── mod.just         bootstrap stages
│   ├── resources.yaml   what cannot wait for Flux
│   └── helmfile.d/      CRDs and core releases
├── docs/                these pages, also built into the docs site
├── kubernetes/
│   ├── mod.just         day-two recipes
│   ├── apps/            apps, grouped by namespace
│   ├── components/      reusable Kustomize components
│   └── flux/            Flux entry point and shared sources
├── talos/
│   ├── mod.just         Talos recipes
│   ├── cluster.yaml.j2  settings for every node
│   ├── hardware/        one file for each hardware class
│   ├── nodes/           one file for each node, named by IP
│   └── schematics/      Image Factory definitions
└── terraform/           older infrastructure code
```

## What replaced the template's tools

| Template | This repository |
|---|---|
| Taskfile | [just](commands.md) |
| talhelper, makejinja | [Layered Minijinja templates](machine-config.md) |
| SOPS | [External Secrets and a secret store](secrets.md) |
| ingress-nginx | [Envoy Gateway](networking.md#gateways-and-dns) |
| `flux bootstrap` | [helmfile and Flux Operator](bootstrap-apps.md) |
| flux-local | flate, in [CI](flux.md#ci) |
