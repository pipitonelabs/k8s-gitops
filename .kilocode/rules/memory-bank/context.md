# Context

## Current Work Focus
Recent activity centers on AI/ML applications (Ollama LLM inference, Qdrant vector DB, Nomic Embed-Text embeddings in `kubernetes/apps/ai/`), media services (Tautulli monitoring, SABnzbd downloads, Maintainerr maintenance in `kubernetes/apps/media/`), VolSync system for PVC replication with Kopia (`kubernetes/apps/volsync-system/`), and default namespace apps (Wiki, Garage).

## Recent Changes
- Deprecated/archived legacy media stack (Plex, Radarr, Sonarr, Prowlarr, older Rook/VolSync configs).
- Expansion of AI capabilities alongside streamlined media tooling.
- Focus on storage replication and backups via VolSync/Kopia.

## Next Steps
- Complete and test AI stack integrations (e.g., Ollama + Qdrant).
- Verify media app deployments and monitoring (Tautulli, etc.).
- Configure VolSync replication sources/destinations for key PVCs.
- Review/merge Renovate dependency update PRs.
- Monitor Flux reconciliations and cluster health via observability stack.