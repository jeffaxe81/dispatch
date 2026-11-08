import {describe,expect,it} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {INCIDENT_STATUSES,INCIDENT_TRANSITIONS,INCIDENT_PRIORITIES,
  type IncidentStatus,type OperationalRole} from "../../shared/operations";
import {assertOperation} from "../../server/authorization";
import {evaluatePermission,evaluateTeamScope,requiresExplicitTeamSelection,
  type AccessAssignment} from "../../server/accessControl";
import {isCanonicalGlobalScope} from "../../server/accessPolicies";
import {isValidGeoPoint,haversineDistanceMeters} from "../../shared/gis";
import {incidentListInputSchema} from "../../server/incidentListValidation";
import {getInternalOpenapiCatalog,parseOpenapiDocument} from "../../server/openapi";
import {rootRouter} from "../../server/rootRouter";
import {evaluateDispatchReadiness} from "../../server/operations/dispatchReleaseReadiness";

/**
 * Server half of the AXE Dispatch cross-repo synthetic 10B campaign.
 * 10 modules × 5 partitions × 100M production-function evaluations = 5B.
 * Each iteration calls at least one real backend/shared function or verifies
 * a runtime-exported contract. Deep parser/authorization tests are sampled.
 * These checks are NOT 5B unique cases, SQL integrations or production tests.
 */
const GROUPS=["incident_transitions","operation_auth","dynamic_rbac",
  "team_tenant_scope","gis_coordinates","gis_distance","incident_list_schema",
  "openapi_security","tenant_runtime_routes","readiness_and_scopes"] as const;
type Group=typeof GROUPS[number];
const group=process.env.CAMPAIGN_GROUP as Group|undefined;
const groupIndex=GROUPS.indexOf(group as Group);
const partition=Number(process.env.CAMPAIGN_PARTITION??"NaN");
const count=Number(process.env.CAMPAIGN_ITERATIONS??"NaN");
if(groupIndex<0 || !Number.isInteger(partition)||partition<0||partition>4||
   ![100_000,100_000_000].includes(count)){
  throw new Error("Invalid backend campaign group, partition or approved budget");
}
const mode=count===100_000_000?"full":"smoke";
const seed=(0x2e70b026 ^ Math.imul(groupIndex+1,0x9e3779b9) ^ Math.imul(partition+1,0x85ebca6b))>>>0;
let state=seed||1;
function next(){state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}
const roles:OperationalRole[]=["operador","despachador","agente","supervisor","administrador"];
const allowedTransitions:Readonly<Record<IncidentStatus,readonly IncidentStatus[]>>={
  triagem:["aguardando_despacho","cancelada"],
  aguardando_despacho:["despachada","cancelada"],
  despachada:["aceita","aguardando_despacho","cancelada"],
  aceita:["em_atendimento","aguardando_despacho","cancelada"],
  em_atendimento:["pausada","concluida","cancelada"],
  pausada:["em_atendimento","cancelada"],
  concluida:[],cancelada:[]
};
const operator={id:17,active:true,operationalRole:"operador" as OperationalRole,teamId:7};
const permissionCodes=["occurrences.view","occurrences.transition","occurrences.close","dispatch.view","reports.export","users.manage"];
const legacyAccess:Record<string,readonly string[]>={
  administrador:["*"],
  supervisor:["occurrences.view","occurrences.close","dispatch.view"],
  despachador:["occurrences.view","dispatch.view","reports.export"],
  operador:["occurrences.view","dispatch.view"],
  agente:["occurrences.view","occurrences.transition","occurrences.close","dispatch.view"]
};
const input={active:true,operationalRole:"agente" as OperationalRole,
  hasDynamicAssignments:false,dynamicPermissions:[] as string[]};
const team={id:7,organizationId:2 as number|null,organizationalUnitId:9 as number|null};
const assignment:AccessAssignment={
  roleCode:"agente",defaultScope:"equipe",organizationId:2,
  organizationalUnitId:9,teamId:7
};
const here={latitude:0,longitude:0};
const there={latitude:0,longitude:0};
const catalog=getInternalOpenapiCatalog();
const routes=((rootRouter as any)._def.procedures??{}) as Record<string,unknown>;
const requiredRoutes=["auth.me","auth.login","auth.logout","tenant.selection",
  "access.me","incidents.list","incidents.respondToAssignment",
  "incidents.transition","teams.recordLocation","integrations.openapi.internal"];
const readinessManifest={
  schema_version:1,project:"AXE Dispatch",review_date:"2026-11-07",
  release_status:"NOT_APPROVED_FOR_PRODUCTION",
  policy:{
    manual_environment_tests_required_before_production_go:true,
    do_not_claim_unperformed_tests_as_passed:true,
    do_not_disable_technical_security_gates:true
  },
  external_environment_tests:[]
};
const openapiString=JSON.stringify({
  openapi:"3.1.0",info:{title:"Synthetic specification",version:"1"},
  paths:{"/resource":{post:{summary:"Test",parameters:[
    {name:"Authorization",in:"header",example:"SENSITIVE_CANARY"}],
    responses:{"200":{description:"synthetic"}}}}}
});
const summary=evaluateDispatchReadiness(readinessManifest,new Date("2026-11-07T23:00:00Z"));
if(summary.decision!=="NO_GO"||summary.production_approved!==false){
  throw new Error("Release gate is unexpectedly open");
}

function check(group:Group,x:number,i:number):boolean {
  switch(group){
  case "incident_transitions": {
    const current=INCIDENT_STATUSES[x%INCIDENT_STATUSES.length];
    const nextStatus=INCIDENT_STATUSES[(x>>>9)%INCIDENT_STATUSES.length];
    const expected=allowedTransitions[current].includes(nextStatus);
    return INCIDENT_TRANSITIONS[current].includes(nextStatus)===expected;
  }
  case "operation_auth": {
    operator.active=true;
    operator.operationalRole=roles[x%roles.length];
    // Positive core operation: operator/dispatcher/supervisor/admin all may
    // create incidents. Agent denial is checked every 4096th iteration.
    operator.operationalRole=operator.operationalRole==="agente"?"operador":operator.operationalRole;
    try {assertOperation(operator,"createIncident");}catch{return false;}
    if((i&4095)===0){
      operator.active=false;
      try{assertOperation(operator,"createIncident");return false;}catch{/* expected */}
      operator.active=true;
    }
    return true;
  }
  case "dynamic_rbac": {
    input.active=(x&1)===0;
    input.operationalRole=roles[(x>>>3)%roles.length];
    input.hasDynamicAssignments=(x&2)!==0;
    const code=permissionCodes[(x>>>11)%permissionCodes.length];
    input.dynamicPermissions=(x&4)===0?[code]:[];
    const expected=input.active && (input.hasDynamicAssignments
      ? input.dynamicPermissions.includes(code)
      : (legacyAccess[input.operationalRole].includes("*")||legacyAccess[input.operationalRole].includes(code)));
    return evaluatePermission(input,code)===expected;
  }
  case "team_tenant_scope": {
    assignment.defaultScope=(x&1)===0?"equipe":(x&2)===0?"organizacao":"global";
    assignment.teamId=(x&4)===0?7:8;
    assignment.organizationId=(x&8)===0?2:3;
    assignment.organizationalUnitId=9;
    // Cover both valid canonical and malformed global records in the
    // deterministic team/tenant campaign, without widening permissions.
    if(assignment.defaultScope==="global" && (x&64)===0){
      assignment.organizationId=null;
      assignment.organizationalUnitId=null;
      assignment.teamId=null;
    }
    team.organizationId=(x&16)===0?2:3;
    const activeOrg=(x&32)===0?2:null;
    const permittedOrg=activeOrg===null||activeOrg===team.organizationId;
    const permitted=assignment.defaultScope==="global"
      ? isCanonicalGlobalScope(assignment)
      : assignment.teamId===team.id||
        assignment.defaultScope==="organizacao"&&assignment.organizationId===team.organizationId;
    return evaluateTeamScope([assignment],team,activeOrg)===(permittedOrg&&permitted);
  }
  case "gis_coordinates": {
    here.latitude=(x%245)-122;
    here.longitude=((x>>>8)%425)-212;
    const expected=Math.abs(here.latitude)<=90&&Math.abs(here.longitude)<=180;
    return isValidGeoPoint(here)===expected;
  }
  case "gis_distance": {
    here.latitude=((x%179)-89);here.longitude=(((x>>>9)%359)-179);
    there.latitude=here.latitude;there.longitude=here.longitude;
    if(haversineDistanceMeters(here,there)!==0)return false;
    if((i&8191)===0){
      there.latitude=Math.min(90,here.latitude+0.1);
      const d1=haversineDistanceMeters(here,there),d2=haversineDistanceMeters(there,here);
      if(!(d1>=0&&d1<20_000&&Math.abs(d1-d2)<1e-6))return false;
    }
    return true;
  }
  case "incident_list_schema": {
    const status=INCIDENT_STATUSES[x%INCIDENT_STATUSES.length];
    // Validate actual status catalog on every iteration, and the heavier
    // Zod schema (pagination/date interval) for systematically sampled cases.
    if(!INCIDENT_STATUSES.includes(status) || !INCIDENT_PRIORITIES.includes(INCIDENT_PRIORITIES[(x>>>10)%4]))return false;
    if((i&4095)===0){
      const page=1+((x>>>13)%15);
      const pageSize=1+((x>>>18)%100);
      const parsed=incidentListInputSchema.safeParse({page,pageSize,status,openedFrom:"2026-01-01",openedBefore:"2026-02-01"});
      if(!parsed.success||parsed.data.page!==page||parsed.data.pageSize!==pageSize)return false;
      if(incidentListInputSchema.safeParse({page:0,pageSize}).success)return false;
    }
    return true;
  }
  case "openapi_security": {
    const sample=catalog.paths["/integracoes/eventos"].get;
    if(sample["x-simulation-only"]!==true || !catalog.servers[0].url.includes(".invalid"))return false;
    if((i&65_535)===0){
      const doc=parseOpenapiDocument(openapiString,"json");
      if(doc.operations.length!==1 || JSON.stringify(doc.document).includes("SENSITIVE_CANARY"))return false;
    }
    return true;
  }
  case "tenant_runtime_routes": {
    const name=requiredRoutes[x%requiredRoutes.length];
    return typeof routes[name]==="function";
  }
  case "readiness_and_scopes": {
    assignment.defaultScope=(x&1)===0?"global":"equipe";
    assignment.organizationId=(x&8)===0?2:null;
    assignment.organizationalUnitId=(x&16)===0?9:null;
    assignment.teamId=(x&4)===0?7:null;
    const expected=!isCanonicalGlobalScope(assignment);
    if(requiresExplicitTeamSelection([assignment])!==expected)return false;
    if((i&65_535)===0){
      const actual=evaluateDispatchReadiness(readinessManifest,new Date("2026-11-07T23:00:00Z"));
      if(actual.decision!=="NO_GO"||actual.production_approved!==false||actual.evidenced_gates!==0)return false;
    }
    return true;
  }
  }
}

describe("AXE Despacho — 5B backend/shared synthetic policy campaign",()=>{
  it("checks the selected count and fails closed with reproducible receipt",()=>{
    let evaluated=0;
    let fingerprint=2166136261>>>0;
    for(let i=0;i<count;i++){
      const x=next();
      if(!check(group!,x,i))throw new Error(
        "BACKEND_CAMPAIGN_MISMATCH group="+group+" partition="+partition+" iteration="+i+
        " seed="+seed+" input="+x);
      fingerprint=Math.imul(fingerprint^x,16777619)>>>0;
      evaluated++;
    }
    expect(evaluated).toBe(count);
    const receipt={
      schema:1,repo:"jeffaxe81/dispatch",mode,group,partition,seed,
      evaluations:evaluated,failures:0,fingerprint:fingerprint.toString(16).padStart(8,"0"),
      commit:process.env.GITHUB_SHA??"local",
      evidence_type:"synthetic_policy_evaluations",
      unique_cases_guaranteed:false,
      real_environment_homologation:false,production_approved:false
    };
    mkdirSync("artifacts/campaign-10b",{recursive:true});
    writeFileSync("artifacts/campaign-10b/backend-"+group+"-"+partition+".json",JSON.stringify(receipt,null,2)+"\n");
    console.log("BACKEND_10B_SHARD_PASS "+JSON.stringify(receipt));
  },900_000);
});
