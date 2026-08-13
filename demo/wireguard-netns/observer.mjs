import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run=promisify(execFile),trace='dtr_wireguard_netns_v1',port=9108;
const namespaces=['aiops-las-router','aiops-chi-router','aiops-las-workload','aiops-chi-workload','aiops-chi-denied'];

async function command(args){return(await run('/usr/sbin/ip',args,{timeout:3000,maxBuffer:64*1024})).stdout.trim();}
async function succeeds(args){try{await command(args);return true;}catch{return false;}}
async function router(site,namespace){
  const handshakeOutput=await command(['netns','exec',namespace,'wg','show','wg0','latest-handshakes']);
  const transferOutput=await command(['netns','exec',namespace,'wg','show','wg0','transfer']);
  const handshake=Number(handshakeOutput.split(/\s+/)[1]??0),transfer=transferOutput.split(/\s+/);
  return{site,interfaceUp:await succeeds(['-n',namespace,'link','show','wg0','up']),latestHandshakeSeconds:handshake,handshakeAgeSeconds:handshake?Math.max(0,Math.floor(Date.now()/1000)-handshake):-1,receivedBytes:Number(transfer[1]??0),sentBytes:Number(transfer[2]??0)};
}
async function collect(){
  const listed=new Set((await command(['netns','list'])).split('\n').map(line=>line.split(' ')[0]));
  const namespaceUp=Object.fromEntries(namespaces.map(name=>[name,listed.has(name)]));
  const [las,chi]=await Promise.all([router('las-vegas-lab','aiops-las-router'),router('chicago-lab','aiops-chi-router')]);
  const allowedPathUp=await succeeds(['netns','exec','aiops-las-workload','ping','-c','1','-W','1','10.20.0.20']);
  const deniedPathBlocked=!(await succeeds(['netns','exec','aiops-las-workload','ping','-c','1','-W','1','10.20.0.30']));
  const healthy=Object.values(namespaceUp).every(Boolean)&&las.interfaceUp&&chi.interfaceUp&&las.handshakeAgeSeconds>=0&&las.handshakeAgeSeconds<180&&chi.handshakeAgeSeconds>=0&&chi.handshakeAgeSeconds<180&&allowedPathUp&&deniedPathBlocked;
  return{observedAt:new Date().toISOString(),decisionTraceId:trace,healthy,namespaceUp,routers:[las,chi],allowedPathUp,deniedPathBlocked,boundary:'Runtime evidence from native WSL namespaces; NetBox remains intended state only. Not Proxmox or physical HA.'};
}
function metrics(status){
  const lines=['# HELP aiops_wireguard_observer_up Whether the bounded two-site observer considers the lab healthy.','# TYPE aiops_wireguard_observer_up gauge',`aiops_wireguard_observer_up ${status.healthy?1:0}`];
  for(const[name,up]of Object.entries(status.namespaceUp))lines.push(`aiops_wireguard_namespace_up{namespace="${name}"} ${up?1:0}`);
  for(const router of status.routers){const label=`site="${router.site}"`;lines.push(`aiops_wireguard_interface_up{${label}} ${router.interfaceUp?1:0}`,`aiops_wireguard_latest_handshake_seconds{${label}} ${router.latestHandshakeSeconds}`,`aiops_wireguard_handshake_age_seconds{${label}} ${router.handshakeAgeSeconds}`,`aiops_wireguard_received_bytes{${label}} ${router.receivedBytes}`,`aiops_wireguard_sent_bytes{${label}} ${router.sentBytes}`);}
  lines.push(`aiops_wireguard_allowed_path_up ${status.allowedPathUp?1:0}`,`aiops_wireguard_denied_path_blocked ${status.deniedPathBlocked?1:0}`,`aiops_wireguard_decision_trace_info{decision_trace_id="${trace}"} 1`);return`${lines.join('\n')}\n`;
}
function html(status){const cards=status.routers.map(router=>`<article><h2>${router.site}</h2><p class="state ${router.interfaceUp?'ok':'bad'}">${router.interfaceUp?'Interface up':'Interface down'}</p><dl><dt>Handshake age</dt><dd>${router.handshakeAgeSeconds}s</dd><dt>Received</dt><dd>${router.receivedBytes.toLocaleString()} bytes</dd><dt>Sent</dt><dd>${router.sentBytes.toLocaleString()} bytes</dd></dl></article>`).join('');return`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><meta name="viewport" content="width=device-width"><title>Open Enterprise AIOps | WireGuard</title><style>body{font:16px system-ui;background:#09111f;color:#e8eef8;margin:0;padding:40px}main{max-width:980px;margin:auto}header{display:flex;justify-content:space-between;gap:20px;align-items:center}.badge,.state{font-weight:700}.ok{color:#62e6a7}.bad{color:#ff718c}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin:28px 0}article,section{background:#121d2f;border:1px solid #263753;border-radius:14px;padding:22px}dl{display:grid;grid-template-columns:1fr auto;gap:10px}dt,dd{margin:0}small{color:#9eb0c9}code{color:#8bc8ff}</style></head><body><main><header><div><small>OPEN ENTERPRISE AIOPS</small><h1>LAS ↔ CHI WireGuard</h1></div><div class="badge ${status.healthy?'ok':'bad'}">${status.healthy?'HEALTHY':'DEGRADED'}</div></header><div class="grid">${cards}</div><section><h2>Policy verification</h2><p class="${status.allowedPathUp?'ok':'bad'}">Approved workload path: ${status.allowedPathUp?'reachable':'failed'}</p><p class="${status.deniedPathBlocked?'ok':'bad'}">Denied CHI workload: ${status.deniedPathBlocked?'blocked':'unexpectedly reachable'}</p><p><small>Decision trace</small><br><code>${trace}</code></p><p><small>${status.boundary}</small></p></section><p><small>Observed ${status.observedAt}. Refreshes every 5 seconds. <a href="/metrics" style="color:#8bc8ff">Prometheus metrics</a> · <a href="/health" style="color:#8bc8ff">Zabbix health JSON</a></small></p></main></body></html>`;}

const server=http.createServer(async(req,res)=>{try{const status=await collect();res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(req.url==='/metrics'){res.setHeader('Content-Type','text/plain; version=0.0.4');res.end(metrics(status));return;}if(req.url==='/health'||req.url==='/api/status'){res.statusCode=req.url==='/health'&&!status.healthy?503:200;res.setHeader('Content-Type','application/json');res.end(`${JSON.stringify(status)}\n`);return;}if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(status));return;}res.statusCode=404;res.end('Not found\n');}catch(error){console.error(JSON.stringify({level:'error',event:'observer_collection_failed',decision_trace_id:trace,message:error instanceof Error?error.message:'unknown'}));res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(`${JSON.stringify({healthy:false,decisionTraceId:trace,error:'runtime evidence unavailable'})}\n`);}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({level:'info',event:'observer_listening',address:'127.0.0.1',port,decision_trace_id:trace})));
