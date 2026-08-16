#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
runtime=.runtime
mkdir -p "$runtime"
chmod 0700 "$runtime"
umask 077

image=enterprise-aiops-wireguard-las-router
docker compose build las-router >/dev/null
for site in las chi; do
  docker run --rm --entrypoint wg "$image" genkey > "$runtime/$site-private.key"
  docker run --rm -i --entrypoint wg "$image" pubkey < "$runtime/$site-private.key" > "$runtime/$site-public.key"
done
chmod 0640 "$runtime"/*.key

las_fingerprint=$(docker run --rm -v "$PWD/$runtime:/keys:ro" alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412 sh -c 'base64 -d /keys/las-public.key | sha256sum' | cut -d' ' -f1)
chi_fingerprint=$(docker run --rm -v "$PWD/$runtime:/keys:ro" alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412 sh -c 'base64 -d /keys/chi-public.key | sha256sum' | cut -d' ' -f1)
printf '{"result":"generated","lasPublicKeyFingerprint":"sha256:%s","chiPublicKeyFingerprint":"sha256:%s","boundary":"private keys remain in ignored mode-0640 runtime files owned by the local private user group"}\n' "$las_fingerprint" "$chi_fingerprint"
