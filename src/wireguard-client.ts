import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BoundedClientError, BoundedConfigurationError, BoundedValidationError, asRecord, bool, exactText, integer, jsonRequest, parseServiceUrl, parseTimeout, type FetchLike } from './bounded-http.js';

const run = promisify(execFile);

export interface WireGuardPeerEvidence {
  publicKeyFingerprint: string;
  endpoint: string | null;
  allowedIps: string[];
  latestHandshakeSeconds: number | null;
  transferRx: number | null;
  transferTx: number | null;
}
export interface WireGuardInterfaceStatus {
  interface: string;
  listenPort: number | null;
  peerCount: number;
  peers: WireGuardPeerEvidence[];
  source: string;
}
export interface WireGuardTunnelHealth {
  healthy: boolean;
  allowedPathUp: boolean | null;
  deniedPathBlocked: boolean | null;
  decisionTraceId: string | null;
  routers: { site: string; interfaceUp: boolean; handshakeAgeSeconds: number | null; receivedBytes: number | null; sentBytes: number | null }[];
  source: string;
}
export interface WireGuardRestartResult { interface: string; changed: boolean; source: string; }
export interface WireGuardClient {
  getInterfaceStatus(input: unknown): Promise<WireGuardInterfaceStatus>;
  getTunnelHealth?(input?: unknown): Promise<WireGuardTunnelHealth>;
  restartInterface(input: unknown): Promise<WireGuardRestartResult>;
}

export interface HttpWireGuardClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: FetchLike;
  admittedInterfaces?: readonly string[];
  executor?: { restart(iface: string): Promise<{ changed: boolean }>; };
}

export class HttpWireGuardClient implements WireGuardClient {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetch: FetchLike;
  private readonly admittedInterfaces: readonly string[];
  private readonly executor: HttpWireGuardClientOptions['executor'];

  constructor(options: HttpWireGuardClientOptions) {
    if (!options || typeof options !== 'object') throw new BoundedConfigurationError('WireGuard client options must be an object.');
    this.baseUrl = parseServiceUrl(options.baseUrl, 'WireGuard base URL');
    this.timeoutMs = parseTimeout(options.timeoutMs, 'WireGuard timeout');
    if (options.fetch !== undefined && typeof options.fetch !== 'function') throw new BoundedConfigurationError('WireGuard fetch must be a function when supplied.');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.admittedInterfaces = options.admittedInterfaces ?? [];
    this.executor = options.executor;
  }

  async getInterfaceStatus(input: unknown): Promise<WireGuardInterfaceStatus> {
    const iface = interfaceName(input, this.admittedInterfaces);
    const payload = asRecord(await jsonRequest({
      baseUrl: this.baseUrl, path: `api/interfaces/${encodeURIComponent(iface)}`, method: 'GET', headers: {},
      timeoutMs: this.timeoutMs, fetch: this.fetch, system: 'WireGuard', notFoundMessage: 'WireGuard interface was not found.',
    }), 'WireGuard');
    return mapInterface(iface, payload, `api/interfaces/${iface}`);
  }

  async getTunnelHealth(input: unknown = {}): Promise<WireGuardTunnelHealth> {
    if (input !== undefined && input !== null && (typeof input !== 'object' || Array.isArray(input) || Object.keys(input as object).length > 0)) {
      throw new BoundedValidationError('Tunnel health accepts no lookup fields.');
    }
    const status = asRecord(await jsonRequest({
      baseUrl: this.baseUrl, path: 'api/status', method: 'GET', headers: {}, timeoutMs: this.timeoutMs, fetch: this.fetch, system: 'WireGuard',
    }), 'WireGuard');
    const routers = Array.isArray(status.routers) ? status.routers.slice(0, 8).map((item) => {
      const router = asRecord(item, 'WireGuard');
      return {
        site: exactText(router.site, 'site'),
        interfaceUp: bool(router.interfaceUp) ?? false,
        handshakeAgeSeconds: integer(router.handshakeAgeSeconds),
        receivedBytes: integer(router.receivedBytes),
        sentBytes: integer(router.sentBytes),
      };
    }) : [];
    return {
      healthy: bool(status.healthy) ?? false,
      allowedPathUp: bool(status.allowedPathUp),
      deniedPathBlocked: bool(status.deniedPathBlocked),
      decisionTraceId: typeof status.decisionTraceId === 'string' ? status.decisionTraceId : null,
      routers,
      source: 'api/status',
    };
  }

  async restartInterface(input: unknown): Promise<WireGuardRestartResult> {
    const iface = interfaceName(input, this.admittedInterfaces);
    await this.getInterfaceStatus({ interface: iface });
    if (this.executor) {
      const execution = await this.executor.restart(iface);
      return { interface: iface, changed: execution.changed, source: `wg-quick@${iface}` };
    }
    await jsonRequest({
      baseUrl: this.baseUrl, path: `api/interfaces/${encodeURIComponent(iface)}/restart`, method: 'POST', headers: {},
      body: {}, timeoutMs: this.timeoutMs, fetch: this.fetch, system: 'WireGuard', notFoundMessage: 'WireGuard interface was not found.',
    });
    return { interface: iface, changed: true, source: `api/interfaces/${iface}/restart` };
  }
}

export interface LocalWireGuardClientOptions {
  admittedInterfaces: readonly string[];
  wgBinary?: string;
  systemctlBinary?: string;
}

export class LocalWireGuardClient implements WireGuardClient {
  constructor(private readonly options: LocalWireGuardClientOptions) {
    if (!options.admittedInterfaces.length) throw new BoundedConfigurationError('WIREGUARD_ADMITTED_INTERFACES is required for the local WireGuard backend.');
  }

  async getInterfaceStatus(input: unknown): Promise<WireGuardInterfaceStatus> {
    const iface = interfaceName(input, this.options.admittedInterfaces);
    try {
      const { stdout } = await run(this.options.wgBinary ?? '/usr/bin/wg', ['show', iface, 'dump'], { timeout: 5_000, maxBuffer: 64 * 1024 });
      return parseDump(iface, stdout);
    } catch (error) {
      if (error instanceof BoundedClientError) throw error;
      throw new BoundedClientError('WireGuard interface was not found.');
    }
  }

  async restartInterface(input: unknown): Promise<WireGuardRestartResult> {
    const iface = interfaceName(input, this.options.admittedInterfaces);
    await this.getInterfaceStatus({ interface: iface });
    try {
      await run(this.options.systemctlBinary ?? '/usr/bin/systemctl', ['restart', `wg-quick@${iface}`], { timeout: 30_000, maxBuffer: 64 * 1024 });
      return { interface: iface, changed: true, source: `wg-quick@${iface}` };
    } catch {
      throw new BoundedClientError('WireGuard interface restart failed.');
    }
  }
}

function interfaceName(input: unknown, admitted: readonly string[]): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BoundedValidationError('Interface lookup must be an object.');
  const record = input as Record<string, unknown>;
  if (Object.keys(record).join() !== 'interface') throw new BoundedValidationError('Provide exactly one interface.');
  const iface = exactText(record.interface, 'interface');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/.test(iface)) throw new BoundedValidationError('interface name is invalid.');
  if (admitted.length > 0 && !admitted.includes(iface)) throw new BoundedValidationError('interface is outside the admitted WireGuard set.');
  return iface;
}

function mapInterface(iface: string, payload: Record<string, unknown>, source: string): WireGuardInterfaceStatus {
  const peers = Array.isArray(payload.peers) ? payload.peers.slice(0, 64).map((item) => {
    const peer = asRecord(item, 'WireGuard');
    return {
      publicKeyFingerprint: exactText(peer.publicKeyFingerprint, 'publicKeyFingerprint'),
      endpoint: typeof peer.endpoint === 'string' ? peer.endpoint : null,
      allowedIps: Array.isArray(peer.allowedIps) ? peer.allowedIps.filter((value): value is string => typeof value === 'string').slice(0, 32) : [],
      latestHandshakeSeconds: integer(peer.latestHandshakeSeconds),
      transferRx: integer(peer.transferRx),
      transferTx: integer(peer.transferTx),
    };
  }) : [];
  return { interface: iface, listenPort: integer(payload.listenPort), peerCount: peers.length, peers, source };
}

function parseDump(iface: string, stdout: string): WireGuardInterfaceStatus {
  const lines = stdout.trim().split('\n').filter(Boolean);
  if (!lines[0]) throw new BoundedClientError('WireGuard interface was not found.');
  const header = lines[0].split('\t');
  const peers = lines.slice(1).map((line) => {
    const [publicKey, _psk, endpoint, allowed, handshake, rx, tx] = line.split('\t');
    return {
      publicKeyFingerprint: `sha256:${createHash('sha256').update(publicKey ?? '').digest('hex')}`,
      endpoint: endpoint && endpoint !== '(none)' ? endpoint : null,
      allowedIps: allowed ? allowed.split(',').slice(0, 32) : [],
      latestHandshakeSeconds: handshake && handshake !== '0' ? Number(handshake) : null,
      transferRx: rx ? Number(rx) : null,
      transferTx: tx ? Number(tx) : null,
    };
  });
  return { interface: iface, listenPort: header[2] ? Number(header[2]) : null, peerCount: peers.length, peers, source: `wg show ${iface} dump` };
}
