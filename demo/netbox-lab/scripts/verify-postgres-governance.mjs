import { PostgresGovernanceStore } from '../../../dist/src/governance-postgres-storage.js';
import { InMemoryActionGovernance } from '../../../dist/src/governance.js';
const store=PostgresGovernanceStore.fromConnectionString(process.env.GOVERNANCE_DATABASE_URL);let sequence=0;
const actor={subjectId:'postgres-planner',tenantId:'northstar-financial',roles:['planner']};
try{
  await Promise.all(Array.from({length:5},(_,index)=>store.transact(snapshot=>{const governance=new InMemoryActionGovernance(()=>new Date('2026-08-05T20:00:00Z'),()=>`id-${index}-${sequence++}`);governance.restore(snapshot);const plan=governance.createPlan(actor,{actionType:'netbox.customer-site.provision',target:{kind:'netbox-site-manifest',id:`pg-site-${index}`},proposedChange:`PostgreSQL transaction proof ${index}.`,confidence:1,evidence:[{source:'postgres-live-proof',summary:'Concurrent transaction serialization test.'}],ruleVersion:'postgres-governance-v1',promptVersion:null,expiresAt:'2026-08-05T20:10:00Z'});return{snapshot:{...governance.snapshot(),receipts:snapshot.receipts},result:plan.id};})));
  const saved=await store.load();if(saved.plans.length!==5||saved.events.length!==5)throw new Error('PostgreSQL governance serialization proof failed.');
  await store.transact(snapshot=>({snapshot:{...snapshot,events:[]},result:null}));const retained=await store.load();if(retained.events.length!==5)throw new Error('Append-only audit retention proof failed.');
  console.log(JSON.stringify({postgres_governance_store:'passed',serialized_plans:saved.plans.length,append_only_audit_events:retained.events.length,tenant:'northstar-financial'}));
}finally{await store.close();}
