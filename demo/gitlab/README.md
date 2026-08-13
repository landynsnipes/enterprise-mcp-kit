# Local GitLab delivery evidence

This evaluation-only Compose project runs GitLab Community Edition and a
separate GitLab Runner on WSL Docker Engine. GitLab is bound to localhost and
uses persistent named volumes. It is not a public or production GitLab service.

The runner image contains pinned Node, OpenTofu, and kubectl tooling and uses the
shell executor inside its isolated container. It has no Docker socket or host
filesystem mount. Kubernetes access is an explicit optional setup step and uses
the `gitlab-deployer` service account, which is restricted to the LAS and CHI
showcase namespaces. It cannot read Secrets, delete namespaces, create RBAC, or
perform cluster administration.

```bash
npm run gitlab:env
npm run gitlab:up
npm run gitlab:status
```

After the runner is registered, configure the bounded K3s credential from the
WSL host:

```bash
sudo bash demo/gitlab/scripts/configure-k3s-access.sh
```

The script applies the reviewed namespace-scoped RBAC, verifies positive and
negative permissions, and copies a mode-`0600` kubeconfig into the runner's
persistent configuration volume. The service-account token is never committed
or printed. Re-run the script to rotate it after deleting and recreating
`gitlab-deployer-token`.

The delivery pipeline is intentionally staged:

1. validation, tests, and OpenTofu plan run without cluster mutation;
2. `deploy-local-k3s` is a manual LAS deployment;
3. `promote-local-k3s-chi` is a second manual gate and cannot run before LAS;
4. site-specific rollback jobs use Kubernetes' recorded prior Deployment
   revision and emit checksum-bearing evidence artifacts.

LAS and CHI are separate logical namespaces on the same single-node K3s/WSL
host. This demonstrates controlled promotion and rollback, not independent-site
HA or disaster recovery.

Review GitLab at <http://localhost:8929/>. The username is `root`; retrieve the
local password without printing it into CI logs by reading
`demo/gitlab/.env` interactively. Back up all three GitLab data volumes before
an upgrade and test restoration before claiming recovery capability.
