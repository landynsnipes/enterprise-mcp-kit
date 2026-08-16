#!/usr/bin/env node
const connectors = {
  netbox: '../dist/src/server.js',
  grafana: '../dist/src/grafana-server.js',
  zabbix: '../dist/src/zabbix-server.js',
  wireguard: '../dist/src/wireguard-server.js',
  kubernetes: '../dist/src/kubernetes-ansible-server.js',
  opnsense: '../dist/src/opnsense-server.js',
};

const name = process.env.MCP_CONNECTOR ?? 'netbox';
const entry = connectors[name];
if (!entry) {
  console.error(`Unknown MCP_CONNECTOR=${name}. Use: ${Object.keys(connectors).join(', ')}`);
  process.exit(2);
}

await import(new URL(entry, import.meta.url).href);
