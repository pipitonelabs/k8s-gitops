# Git workflow

- Never commit or push directly to `main`.
- Branch from an up-to-date `main` before editing: `git checkout -b feature/<name>`.
- Open a pull request for the change.
- Do not merge the pull request unless the user explicitly asks to merge that PR. Flux applies `main`, so a merge is a deploy.
