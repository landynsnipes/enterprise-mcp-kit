# Connect the Kubernetes and Ansible MCP to an existing cluster

Choose this path when Kubernetes is already your runtime and Ansible is already
your approved execution tool. It installs only the MCP integration. It does not
install a cluster, CNI, or a generic kubectl/ansible shell.

## What users can do

| Tool | Input | Use it for |
| --- | --- | --- |
| `get_workload_context` | `{ "namespace": "payments", "name": "api" }` | One Deployment’s replica counts and `resourceVersion` |
| `set_workload_replicas` | `{ "namespace": "payments", "name": "api", "expectedReplicas": 2, "replicas": 3, "expectedResourceVersion": "12345" }` | Scale that Deployment after the live version still matches |
| `run_admitted_playbook` | `{ "playbookId": "restart-api", "mode": "check" }` | Check or apply one playbook you listed in `ANSIBLE_PLAYBOOKS` |

Writes are off until `KUBERNETES_ENABLE_WRITES=true`. There is no generic
`kubectl`, no arbitrary YAML apply, and no playbook path supplied by the model.

The Kubernetes token is the real authorization boundary. Optionally set
`KUBERNETES_ADMITTED_NAMESPACES` so the MCP also rejects namespaces outside that list.

## Requirements

- Node.js 18 or later
- Reachability to the Kubernetes API (`https://kubernetes.default.svc` or your API server)
- A dedicated ServiceAccount token scoped to the Deployments you intend to read or scale
- For Ansible writes: `ansible-playbook` on the MCP host, plus absolute playbook paths you admit

## Install and configure

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run validate
```

```sh
export KUBERNETES_BASE_URL="https://kubernetes.example.com"
export KUBERNETES_TOKEN="<serviceaccount-token>"
export KUBERNETES_ADMITTED_NAMESPACES="payments,platform"
export KUBERNETES_MAX_REPLICAS="20"
export KUBERNETES_ENABLE_WRITES="true"
export ANSIBLE_PLAYBOOKS='{"restart-api":"/etc/ansible/restart-api.yml"}'
export ANSIBLE_INVENTORY="localhost,"
export ANSIBLE_CONNECTION="local"
npm run mcp:kubernetes
```

If `ANSIBLE_PLAYBOOKS` is empty, `run_admitted_playbook` rejects every playbook ID.

## Connect an AI client

```json
{
  "mcpServers": {
    "kubernetes-ansible": {
      "command": "node",
      "args": ["/opt/enterprise-mcp-kit/dist/src/kubernetes-ansible-server.js"],
      "env": {
        "KUBERNETES_BASE_URL": "https://kubernetes.example.com",
        "KUBERNETES_TOKEN": "${KUBE_TOKEN}",
        "KUBERNETES_ADMITTED_NAMESPACES": "payments",
        "KUBERNETES_ENABLE_WRITES": "false"
      }
    }
  }
}
```

## How to use it

- “Show Deployment `api` in namespace `payments`.”
- “Scale `payments/api` from 2 to 3 replicas using resourceVersion `12345`.”
- “Run playbook `restart-api` in check mode.”

## Validate before production use

1. Confirm the token cannot mutate namespaces outside the intended scope.
2. Read one known Deployment and one missing name.
3. If writes are enabled, scale a non-production Deployment and restore it using `expectedReplicas` / `expectedResourceVersion`.
4. Confirm an unknown `playbookId` is rejected and never executed.
5. Record the repository release, Kubernetes version, and admitted playbook checksums.
