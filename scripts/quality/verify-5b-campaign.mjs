import {readdirSync,readFileSync,appendFileSync} from "node:fs";
import {join} from "node:path";
const groups=[
  "incident_transitions",
  "operation_auth",
  "dynamic_rbac",
  "team_tenant_scope",
  "gis_coordinates",
  "gis_distance",
  "incident_list_schema",
  "openapi_security",
  "tenant_runtime_routes",
  "readiness_and_scopes"
];
const prefix="backend";
const repository="jeffaxe81/dispatch";
const seedBase=0x2e70b026;
const folder="artifacts/campaign-10b";
const expectedCount=50;
const expectedBudget=100_000_000;
const files=readdirSync(folder).filter(name=>name.endsWith(".json")).sort();
if(files.length!==expectedCount)throw new Error("Expected exactly 50 full receipts, received "+files.length);
const evidence=[];
let total=0;
let errors=0;
for(let index=0;index<groups.length;index++){
  const group=groups[index];
  for(let part=0;part<5;part++){
    const name=prefix+"-"+group+"-"+part+".json";
    if(!files.includes(name))throw new Error("Missing receipt "+name);
    const obj=JSON.parse(readFileSync(join(folder,name),"utf8"));
    const seed=(seedBase ^ Math.imul(index+1,0x9e3779b9) ^ Math.imul(part+1,0x85ebca6b))>>>0;
    if(obj.schema!==1||obj.mode!=="full"||obj.group!==group||
       obj.partition!==part||obj.seed!==seed||obj.repo!==repository||
       obj.evaluations!==expectedBudget||obj.failures!==0||
       obj.evidence_type!=="synthetic_policy_evaluations"||
       obj.unique_cases_guaranteed!==false||
       obj.real_environment_homologation!==false||
       obj.production_approved!==false||
       typeof obj.commit!=="string"||!obj.commit||obj.commit!==process.env.GITHUB_SHA||
       !/^[0-9a-f]{8}$/.test(obj.fingerprint)){
      throw new Error("Invalid receipt or mixed commits: "+name);
    }
    total+=obj.evaluations;
    errors+=obj.failures;
    evidence.push({group,partition:part,seed,fingerprint:obj.fingerprint});
  }
}
if(total!==5_000_000_000||errors!==0)throw new Error("Campaign incomplete: "+total);
const result={
  status:"PASSED_SYNTHETIC_ONLY",
  repository,commit:process.env.GITHUB_SHA,
  evaluations:total,
  shard_receipts:evidence.length,
  errors,
  tested_prod_module_groups:groups.length,
  unique_cases_guaranteed:false,
  real_environment_homologation:false,
  production_approved:false
};
process.stdout.write("CAMPAIGN_5B_AGGREGATE_PASS "+JSON.stringify(result)+"\n");
if(process.env.GITHUB_STEP_SUMMARY){
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
    "## AXE Despacho — campanha massiva sintética (backend)",
    "",
    "**5.000.000.000 / 5.000.000.000 avaliações de políticas sintéticas verificadas** em 50 shards.",
    "",
    "- 10 grupos de funções de produção, cinco partições por grupo.",
    "- SHA de todas as partições: "+process.env.GITHUB_SHA,
    "- Entradas podem repetir; são **50 testes Vitest em lotes**, não cinco bilhões de casos únicos.",
    "- Subconjunto de verificações profundas é amostrado; cargas de banco, UI e dispositivos não são exercitadas.",
    "- Só há evidência da **metade backend**, nunca dos 10 bilhões entre repositórios.",
    "- Homologação operacional real e produção: **NÃO APROVADAS**.",
    ""
  ].join("\n"),"utf8");
}
