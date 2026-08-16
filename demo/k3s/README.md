# Pinned local K3s

`install.sh` installs K3s `v1.36.1+k3s1` as a WSL systemd service through the
official installer. K3s validates its downloaded binary against the release
checksum. This is a single physical-node evaluation cluster; the LAS and CHI
labels are logical placement and recovery evidence, not independent-site HA.

After installation:

```bash
npm run k3s:deploy:cloud-reference
npm run k3s:verify:cloud-reference
curl http://127.0.0.1:8082/
```

The workload uses a digest-pinned non-root image, read-only root filesystem,
disabled service-account token, resource bounds, health probes, and
default-deny network policy.

`enterprise-aiops-cloud-reference.service` provides a localhost-only review
port without weakening the ClusterIP service or ingress policy. Install it in
`/etc/systemd/system`, reload systemd, and enable it only after the workload is
ready.
