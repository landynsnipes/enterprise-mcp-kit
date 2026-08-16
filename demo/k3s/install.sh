#!/usr/bin/env bash
set -euo pipefail
version='v1.36.1+k3s1'
installer='/tmp/enterprise-aiops-install-k3s.sh'
curl --proto '=https' --tlsv1.2 -fsSL https://get.k3s.io -o "$installer"
chmod 700 "$installer"
INSTALL_K3S_VERSION="$version" INSTALL_K3S_EXEC='server --write-kubeconfig-mode 0640 --write-kubeconfig-group veltrax --protect-kernel-defaults=false' "$installer"
rm -f "$installer"
echo "k3s-installed=$version"
