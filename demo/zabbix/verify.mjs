const endpoint='http://127.0.0.1:8080/api_jsonrpc.php';
const password=process.env.ZABBIX_ADMIN_PASSWORD;
if(!password)throw new Error('ZABBIX_ADMIN_PASSWORD is required');
let id=0;
async function rpc(method,params,token){const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json-rpc',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({jsonrpc:'2.0',method,params,id:++id})});const body=await response.json();if(body.error)throw new Error(`${method}: ${body.error.data??body.error.message}`);return body.result;}
const token=await rpc('user.login',{username:'Admin',password});
const [host]=await rpc('host.get',{output:['hostid','host','name'],filter:{host:['wireguard-two-site-availability']}},token);
if(!host)throw new Error('Bounded WireGuard availability host is missing');
const items=await rpc('item.get',{output:['itemid','name','key_','lastvalue','lastclock','state','error'],hostids:[host.hostid],filter:{key_:['aiops.wireguard.status.raw','aiops.wireguard.healthy']}},token);
const problems=await rpc('problem.get',{output:['eventid','name','severity','clock'],hostids:[host.hostid],tags:[{tag:'decision_trace_id',value:'dtr_wireguard_netns_v1',operator:1}]},token);
console.log(JSON.stringify({result:'verified',host,items,problems,decisionTraceId:'dtr_wireguard_netns_v1'}));
