#!/usr/bin/env node
import { BoundedClientError, BoundedValidationError } from '../dist/src/bounded-http.js';
import { HttpGrafanaClient } from '../dist/src/grafana-client.js';
import { HttpNetBoxClient } from '../dist/src/netbox-client.js';
import { HttpOpnSenseClient } from '../dist/src/opnsense-client.js';
import { HttpWireGuardClient } from '../dist/src/wireguard-client.js';
import { HttpZabbixClient } from '../dist/src/zabbix-client.js';
import { HttpKubernetesClient } from '../dist/src/kubernetes-client.js';

const required = {
  netbox: ['NETBOX_BASE_URL', 'NETBOX_TOKEN', 'NETBOX_VERIFY_DEVICE'],
  grafana: ['GRAFANA_BASE_URL', 'GRAFANA_TOKEN', 'GRAFANA_VERIFY_DASHBOARD_UID'],
  zabbix: ['ZABBIX_BASE_URL', 'ZABBIX_TOKEN', 'ZABBIX_VERIFY_HOST'],
  wireguard: ['WIREGUARD_BASE_URL', 'WIREGUARD_VERIFY_INTERFACE'],
  kubernetes: ['KUBERNETES_BASE_URL', 'KUBERNETES_TOKEN', 'KUBERNETES_VERIFY_NAMESPACE', 'KUBERNETES_VERIFY_NAME'],
  opnsense: ['OPNSENSE_BASE_URL', 'OPNSENSE_KEY', 'OPNSENSE_SECRET', 'OPNSENSE_VERIFY_INTERFACE'],
};

const connector = process.env.CONNECTOR;
if (!connector || !(connector in required)) {
  console.error(`Set CONNECTOR to one of: ${Object.keys(required).join(', ')}`);
  process.exit(2);
}

const missing = required[connector].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(', ')}. This script does not invent a pass.`);
  process.exit(2);
}

try {
  const result = await readOne(connector);
  console.log(JSON.stringify({ result: 'passed', connector, source: result.source ?? connector, identity: result.identity ?? result.name ?? result.host ?? result.uid ?? result.interface ?? result.namespace }, null, 2));
} catch (error) {
  const message = error instanceof BoundedValidationError || error instanceof BoundedClientError || error instanceof Error
    ? error.message
    : 'Bounded connector verify failed.';
  console.error(message);
  process.exit(1);
}

async function readOne(name) {
  if (name === 'netbox') return new HttpNetBoxClient({ baseUrl: process.env.NETBOX_BASE_URL, token: process.env.NETBOX_TOKEN }).getDeviceContext({ name: process.env.NETBOX_VERIFY_DEVICE });
  if (name === 'grafana') return new HttpGrafanaClient({ baseUrl: process.env.GRAFANA_BASE_URL, token: process.env.GRAFANA_TOKEN }).getDashboardContext({ uid: process.env.GRAFANA_VERIFY_DASHBOARD_UID });
  if (name === 'zabbix') return new HttpZabbixClient({ baseUrl: process.env.ZABBIX_BASE_URL, token: process.env.ZABBIX_TOKEN }).getHostContext({ host: process.env.ZABBIX_VERIFY_HOST });
  if (name === 'wireguard') {
    const admitted = process.env.WIREGUARD_ADMITTED_INTERFACES?.split(',').map((item) => item.trim()).filter(Boolean) ?? [process.env.WIREGUARD_VERIFY_INTERFACE];
    return new HttpWireGuardClient({ baseUrl: process.env.WIREGUARD_BASE_URL, admittedInterfaces: admitted }).getInterfaceStatus({ interface: process.env.WIREGUARD_VERIFY_INTERFACE });
  }
  if (name === 'kubernetes') {
    return new HttpKubernetesClient({
      baseUrl: process.env.KUBERNETES_BASE_URL,
      token: process.env.KUBERNETES_TOKEN,
      admittedNamespaces: process.env.KUBERNETES_ADMITTED_NAMESPACES?.split(',').map((item) => item.trim()).filter(Boolean) ?? [process.env.KUBERNETES_VERIFY_NAMESPACE],
    }).getWorkloadContext({ namespace: process.env.KUBERNETES_VERIFY_NAMESPACE, name: process.env.KUBERNETES_VERIFY_NAME });
  }
  return new HttpOpnSenseClient({
    baseUrl: process.env.OPNSENSE_BASE_URL,
    key: process.env.OPNSENSE_KEY,
    secret: process.env.OPNSENSE_SECRET,
  }).getInterfaceContext({ identity: process.env.OPNSENSE_VERIFY_INTERFACE });
}
