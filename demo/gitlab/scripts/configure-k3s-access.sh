#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
runner='enterprise-aiops-gitlab-runner-1'
command -v k3s >/dev/null
docker inspect "$runner" >/dev/null

k3s kubectl apply -f "$repo/k8s/delivery/bootstrap/rbac.yaml"
for verb_resource in \
  'get deployments.apps' 'patch deployments.apps' 'create configmaps' \
  'update services' 'create networkpolicies.networking.k8s.io'; do
  verb="${verb_resource%% *}"; resource="${verb_resource#* }"
  for namespace in cloud-reference cloud-reference-chi; do
    k3s kubectl auth can-i "$verb" "$resource" --as=system:serviceaccount:aiops-delivery-system:gitlab-deployer -n "$namespace" | grep -qx yes
  done
done
[[ "$(k3s kubectl auth can-i delete namespaces --as=system:serviceaccount:aiops-delivery-system:gitlab-deployer 2>/dev/null || true)" == no ]]
[[ "$(k3s kubectl auth can-i get secrets --as=system:serviceaccount:aiops-delivery-system:gitlab-deployer -n cloud-reference || true)" == no ]]

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
token="$(k3s kubectl -n aiops-delivery-system get secret gitlab-deployer-token -o jsonpath='{.data.token}' | base64 -d)"
ca="$(k3s kubectl -n aiops-delivery-system get secret gitlab-deployer-token -o jsonpath='{.data.ca\.crt}')"
server_ip="$(hostname -I | awk '{print $1}')"
[[ "$server_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
umask 077
cat >"$workdir/kubeconfig" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: local-k3s
    cluster:
      certificate-authority-data: $ca
      server: https://$server_ip:6443
users:
  - name: gitlab-deployer
    user:
      token: $token
contexts:
  - name: gitlab-local-delivery
    context:
      cluster: local-k3s
      user: gitlab-deployer
      namespace: cloud-reference
current-context: gitlab-local-delivery
EOF
unset token ca
docker cp "$workdir/kubeconfig" "$runner:/etc/gitlab-runner/kubeconfig"
docker exec --user root "$runner" chown 0:65533 /etc/gitlab-runner
docker exec --user root "$runner" chmod 0750 /etc/gitlab-runner
docker exec --user root "$runner" chown 100:65533 /etc/gitlab-runner/kubeconfig
docker exec --user root "$runner" chmod 0600 /etc/gitlab-runner/kubeconfig
docker exec --user 100:65533 -e KUBECONFIG=/etc/gitlab-runner/kubeconfig "$runner" kubectl auth can-i patch deployments.apps -n cloud-reference | grep -qx yes
[[ "$(docker exec --user 100:65533 -e KUBECONFIG=/etc/gitlab-runner/kubeconfig "$runner" kubectl auth can-i get secrets -n cloud-reference || true)" == no ]]
echo 'gitlab-k3s-scoped-access=passed namespaces=cloud-reference,cloud-reference-chi secrets=denied cluster-admin=denied'
