import fs from 'node:fs';

const endpoint='http://127.0.0.1:8080/api_jsonrpc.php';
const desiredPassword=process.env.ZABBIX_ADMIN_PASSWORD;
if(!desiredPassword||desiredPassword.length<20)throw new Error('ZABBIX_ADMIN_PASSWORD must contain at least 20 characters');
let requestId=0;
async function rpc(method,params,token){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json-rpc',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({jsonrpc:'2.0',method,params,id:++requestId})});
  const body=await response.json();
  if(body.error)throw new Error(`${method}: ${body.error.data??body.error.message}`);
  return body.result;
}
async function login(password){try{return await rpc('user.login',{username:'Admin',password});}catch{return null;}}
let currentPassword=desiredPassword;
let token=await login(desiredPassword);
if(!token){currentPassword='zabbix';token=await login(currentPassword);}
if(!token)throw new Error('Unable to authenticate with the desired or one-time bootstrap credential');

let [group]=await rpc('hostgroup.get',{output:['groupid'],filter:{name:['Open Enterprise AIOps']}},token);
if(!group){const created=await rpc('hostgroup.create',{name:'Open Enterprise AIOps'},token);group={groupid:created.groupids[0]};}
let [host]=await rpc('host.get',{output:['hostid'],filter:{host:['wireguard-two-site-availability']}},token);
if(!host){const created=await rpc('host.create',{host:'wireguard-two-site-availability',name:'LAS ↔ CHI WireGuard availability',groups:[{groupid:group.groupid}],interfaces:[],tags:[{tag:'platform',value:'open-enterprise-aiops'},{tag:'site_scope',value:'las-chi'},{tag:'decision_trace_id',value:'dtr_wireguard_netns_v1'}]},token);host={hostid:created.hostids[0]};}
let [master]=await rpc('item.get',{output:['itemid'],hostids:[host.hostid],filter:{key_:['aiops.wireguard.status.raw']}},token);
if(!master){const created=await rpc('item.create',{hostid:host.hostid,name:'Bounded WireGuard availability evidence',key_:'aiops.wireguard.status.raw',type:19,value_type:4,delay:'10s',history:'1d',trends:'0',url:'http://127.0.0.1:9108/api/status',status_codes:'200',retrieve_mode:0,output_format:0,headers:[{name:'Accept',value:'application/json'}],description:'Read-only bounded runtime evidence. NetBox remains intended state; this item does not expose a control surface.'},token);master={itemid:created.itemids[0]};}
let [health]=await rpc('item.get',{output:['itemid'],hostids:[host.hostid],filter:{key_:['aiops.wireguard.healthy']}},token);
if(!health){const created=await rpc('item.create',{hostid:host.hostid,name:'WireGuard two-site service available',key_:'aiops.wireguard.healthy',type:18,value_type:3,delay:'0',history:'7d',trends:'30d',master_itemid:master.itemid,preprocessing:[{type:12,params:'$.healthy',error_handler:0,error_handler_params:''},{type:6,params:'',error_handler:0,error_handler_params:''}],description:'Availability signal only. Prometheus owns metric and policy alerts.'},token);health={itemid:created.itemids[0]};}
const description='LAS ↔ CHI WireGuard service unavailable';
const existing=await rpc('trigger.get',{output:['triggerid'],hostids:[host.hostid],filter:{description:[description]}},token);
const trigger={description,expression:'last(/wireguard-two-site-availability/aiops.wireguard.healthy)=0',priority:4,comments:'SEV-2 availability signal. Gather evidence and obtain human approval before any execution. Decision trace: dtr_wireguard_netns_v1',tags:[{tag:'owner',value:'platform-operations'},{tag:'site_scope',value:'las-chi'},{tag:'decision_trace_id',value:'dtr_wireguard_netns_v1'}]};
if(existing.length===0)await rpc('trigger.create',trigger,token);else await rpc('trigger.update',{triggerid:existing[0].triggerid,...trigger},token);
const [admin]=await rpc('user.get',{output:['userid'],filter:{username:['Admin']}},token);
if(currentPassword!==desiredPassword)await rpc('user.update',{userid:admin.userid,current_passwd:currentPassword,passwd:desiredPassword},token);
console.log(JSON.stringify({result:'configured',hostid:host.hostid,masterItemId:master.itemid,healthItemId:health.itemid,decisionTraceId:'dtr_wireguard_netns_v1'}));
