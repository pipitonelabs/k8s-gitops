# Writing pages

1. Add a Markdown file to `kubernetes/apps/default/zensical/app/resources/docs/`.
2. List it under `zensical-docs` in `kubernetes/apps/default/zensical/app/kustomization.yaml`.
3. Open a pull request. The site rebuilds after it merges.

Pages are flat files, with no folders or images, and share a 1MiB limit.
A broken link fails the build, and the previous version keeps serving.
