# Writing pages

`docs/` is the only copy of these pages. GitHub shows them directly, and Zensical builds the site from them.

## Add a page

1. Create `docs/NAME.md`, starting with a `# Title`.
2. List it in `docs/kustomization.yaml`.
3. Add it to `nav` in `kubernetes/apps/default/zensical/app/resources/zensical.toml`.
4. Open a pull request. The site rebuilds after it merges.

## Keep pages readable on GitHub

- Link with relative paths, such as `[Storage](storage.md)`.
- Use GitHub alerts: `NOTE`, `TIP`, and `WARNING`.
- Avoid Zensical-only syntax, such as `!!!` admonitions, content tabs, and icons.
- Put SVG diagrams in `docs/assets/` and list them in `docs/kustomization.yaml`.
- For a file outside `docs/`, write its path in backticks or use its GitHub URL.

## Limits

- Pages are flat files, with no subfolders.
- Everything listed shares a 1 MiB ConfigMap, so keep photos out.
- A broken link fails the build, and the previous site keeps serving.

> [!WARNING]
> The repository is public. Do not write secrets or private details here, even on a branch.
