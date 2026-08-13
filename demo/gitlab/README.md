# Local GitLab delivery evidence

This evaluation-only Compose project runs GitLab Community Edition and a
separate GitLab Runner on WSL Docker Engine. GitLab is bound to localhost and
uses persistent named volumes. It is not a public or production GitLab service.

The runner image contains pinned Node and OpenTofu tooling and uses the shell
executor inside its isolated container. It has no Docker socket, host filesystem
mount, Kubernetes credential, or generic infrastructure API. The deployment job
remains a manual operator handoff rather than a direct cluster mutation.

```bash
npm run gitlab:env
npm run gitlab:up
npm run gitlab:status
```

Review GitLab at <http://localhost:8929/>. The username is `root`; retrieve the
local password without printing it into CI logs by reading
`demo/gitlab/.env` interactively. Back up all three GitLab data volumes before
an upgrade and test restoration before claiming recovery capability.
