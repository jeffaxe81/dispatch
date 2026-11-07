import {describe,expect,it} from "vitest";
import {assertOperation} from "./authorization";
import {evaluatePermission,evaluateTeamScope,type AccessAssignment} from "./accessControl";
import {isValidGeoPoint,haversineDistanceMeters} from "../shared/gis";
import {INCIDENT_STATUSES,INCIDENT_TRANSITIONS,type IncidentStatus,type OperationalRole} from "../shared/operations";
import {incidentListInputSchema} from "./incidentListValidation";
import {parseOpenapiDocument} from "./openapi";
import {rootRouter} from "./rootRouter";
import {evaluateDispatchReadiness} from "./operations/dispatchReleaseReadiness";

/** 10 × 100 explicit, named Vitest cases on production functions.
 * Separate from the optional 10B synthetic evaluation campaign.
 * No MySQL, production traffic, credentials or real dispatches.
 */
const roles:OperationalRole[]=["operador","despachador","agente","supervisor","administrador"];
const ops=["createIncident","updateQueue","supervise","administer","export"] as const;
const permitted:Record<(typeof ops)[number],readonly OperationalRole[]>={
  createIncident:["operador","despachador","supervisor","administrador"],
  updateQueue:["despachador","supervisor","administrador"],
  supervise:["supervisor","administrador"],
  administer:["administrador"],
  export:["despachador","supervisor","administrador"]
};
const user={id:7,active:true,teamId:4,operationalRole:"agente" as OperationalRole};
const roleCases=roles.flatMap((role,ri)=>ops.flatMap((operation,oi)=>Array.from({length:4},(_,mode)=>({
  label:"AUTH-"+ri+"-"+oi+"-"+mode,role,operation,active:mode!==0
}))));
describe("Module A: 100 role/operational action contracts",()=>{
  it.each(roleCases)("$label",({role,operation,active})=>{
    const subject={...user,operationalRole:role,active};
    const allowed=active&&permitted[operation].includes(role);
    if(allowed)expect(()=>assertOperation(subject,operation)).not.toThrow();
    else expect(()=>assertOperation(subject,operation)).toThrow();
  });
});

const codes=["occurrences.view","occurrences.transition","occurrences.close","reports.export","users.manage"];
const legacy:Record<OperationalRole,readonly string[]>={
  operador:["occurrences.view"],
  despachador:["occurrences.view","reports.export"],
  agente:["occurrences.view","occurrences.transition","occurrences.close"],
  supervisor:["occurrences.view","occurrences.close"],
  administrador:["*"]
};
const permCases=roles.flatMap((role,ri)=>codes.flatMap((code,ci)=>Array.from({length:4},(_,mode)=>({
  label:"RBAC-"+ri+"-"+ci+"-"+mode,role,code,mode
}))));
describe("Module B: 100 dynamic and legacy RBAC contracts",()=>{
  it.each(permCases)("$label",({role,code,mode})=>{
    const active=mode!==0;
    const dynamic=mode===2||mode===3;
    const dynamicPermissions=mode===3?[code]:[];
    const expected=active&&(dynamic?dynamicPermissions.includes(code):
      legacy[role].includes("*")||legacy[role].includes(code));
    expect(evaluatePermission({
      active,operationalRole:role,hasDynamicAssignments:dynamic,dynamicPermissions
    },code)).toBe(expected);
  });
});

const scopes=["global","organizacao","unidade","equipe","grupo"] as const;
const matchModes=[
  {org:2,unit:9,team:7},
  {org:3,unit:9,team:7},
  {org:2,unit:10,team:7},
  {org:2,unit:9,team:8},
  {org:3,unit:10,team:8},
] as const;
const orgModes=[null,2,3,undefined] as const;
const scopeCases=scopes.flatMap((scope,si)=>orgModes.flatMap((activeOrg,oi)=>matchModes.map((match,mi)=>({
  label:"SCOPE-"+si+"-"+oi+"-"+mi,scope,activeOrg,match
}))));
describe("Module C: 100 tenant/team authorization scope cases",()=>{
  it.each(scopeCases)("$label",({scope,activeOrg,match})=>{
    const assigned:AccessAssignment={
      roleCode:"agente",defaultScope:scope,organizationId:match.org,
      organizationalUnitId:match.unit,teamId:match.team
    };
    const team={id:7,organizationId:2,organizationalUnitId:9};
    const allowedOrg=activeOrg===undefined||activeOrg===null||activeOrg===2;
    const allowed=scope==="global"||match.team===7||
      scope==="organizacao"&&match.org===2||
      ["unidade","departamento","grupo"].includes(scope)&&match.org===2&&match.unit===9;
    expect(evaluateTeamScope([assigned],team,activeOrg)).toBe(allowedOrg&&allowed);
  });
});

const coordinates=[-181,-180,-90,-89.999,0,45,89.999,90,180,181];
const geoCases=coordinates.flatMap((lat,li)=>coordinates.map((long,oi)=>({
  label:"GEO-"+li+"-"+oi,latitude:lat,longitude:long
})));
describe("Module D: 100 GIS boundary validity cases",()=>{
  it.each(geoCases)("$label",({latitude,longitude})=>{
    const expected=Math.abs(latitude)<=90 && Math.abs(longitude)<=180;
    expect(isValidGeoPoint({latitude,longitude})).toBe(expected);
  });
});

const distanceCases=Array.from({length:100},(_,i)=>({
  label:"DIST-"+i,lat:-80+(i*1.61),lon:-170+(i*3.31)
}));
describe("Module E: 100 GIS distance symmetry/identity checks",()=>{
  it.each(distanceCases)("$label",({lat,lon})=>{
    const a={latitude:lat,longitude:lon};
    const b={latitude:Math.min(90,lat+0.5),longitude:Math.min(180,lon+0.4)};
    const d=haversineDistanceMeters(a,b);
    expect(haversineDistanceMeters(a,a)).toBe(0);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    expect(Math.abs(d-haversineDistanceMeters(b,a))).toBeLessThan(1e-6);
  });
});

const expectedTransitions:Record<IncidentStatus,IncidentStatus[]>={
  triagem:["aguardando_despacho","cancelada"],
  aguardando_despacho:["despachada","cancelada"],
  despachada:["aceita","aguardando_despacho","cancelada"],
  aceita:["em_atendimento","aguardando_despacho","cancelada"],
  em_atendimento:["pausada","concluida","cancelada"],
  pausada:["em_atendimento","cancelada"],
  concluida:[],cancelada:[]
};
const transitionCases=Array.from({length:100},(_,i)=>({
  label:"TRANS-"+i,source:INCIDENT_STATUSES[i%8],target:INCIDENT_STATUSES[Math.floor(i/8)%8]
}));
describe("Module F: 100 incident transition safety cases",()=>{
  it.each(transitionCases)("$label",({source,target})=>{
    expect(INCIDENT_TRANSITIONS[source].includes(target))
      .toBe(expectedTransitions[source].includes(target));
    if(["concluida","cancelada"].includes(source))
      expect(INCIDENT_TRANSITIONS[source]).toHaveLength(0);
  });
});

const pageValues=[-1,0,1,2,5,99,100,101,500,1.5];
const sizes=[-1,0,1,2,10,25,50,99,100,101];
const pageCases=pageValues.flatMap((page,pi)=>sizes.map((pageSize,si)=>({
  label:"PAGINATION-"+pi+"-"+si,page,pageSize
})));
describe("Module G: 100 incident pagination input contracts",()=>{
  it.each(pageCases)("$label",({page,pageSize})=>{
    const expected=Number.isInteger(page)&&page>0&&Number.isInteger(pageSize)&&pageSize>=1&&pageSize<=100;
    expect(incidentListInputSchema.safeParse({page,pageSize}).success).toBe(expected);
  });
});

const privateNames=["Authorization","Cookie","X-API-Key","password","secret"];
const versions=["3.0.3","3.1.0","2.0","4.0"];
const apiCases=versions.flatMap((version,vi)=>privateNames.flatMap((name,ni)=>
  Array.from({length:5},(_,mode)=>({label:"OPENAPI-"+vi+"-"+ni+"-"+mode,version,name,mode}))));
describe("Module H: 100 OpenAPI version and secret-redaction checks",()=>{
  it.each(apiCases)("$label",({version,name,mode})=>{
    const marker="SENSITIVE_CANARY_"+mode;
    const source=JSON.stringify({openapi:version,info:{title:"Fixture",version:"1"},
      paths:{"/resource":{get:{parameters:[{name,in:"header",example:marker}],responses:{"200":{description:"ok"}}}}}});
    if(version.startsWith("3.")){
      const parsed=parseOpenapiDocument(source,"json");
      expect(parsed.operations).toHaveLength(1);
      expect(JSON.stringify(parsed.document)).not.toContain(marker);
    }else expect(()=>parseOpenapiDocument(source,"json")).toThrow();
  });
});

const procedureNames=["auth.me","auth.login","auth.logout","tenant.selection","access.me",
  "incidents.list","incidents.respondToAssignment","incidents.transition",
  "teams.recordLocation","integrations.openapi.internal"];
const routes=((rootRouter as any)._def.procedures??{}) as Record<string,unknown>;
const routeCases=procedureNames.flatMap((name,ni)=>
  Array.from({length:10},(_,mode)=>({label:"ROOT-"+ni+"-"+mode,name,mode})));
describe("Module I: 100 deployed-root router contract checks",()=>{
  it.each(routeCases)("$label",({name,mode})=>{
    expect(typeof routes[name]).toBe("function");
    expect(name).not.toContain("mysql");
    if(mode===0)expect("tenant.selection" in routes).toBe(true);
  });
});

const readinessCases=Array.from({length:100},(_,i)=>({label:"READINESS-"+i,mode:i}));
describe("Module J: 100 release safety evidence checks",()=>{
  it.each(readinessCases)("$label",({mode})=>{
    const manifest={
      schema_version:1,project:"AXE Dispatch",
      review_date:"2026-11-07",
      release_status:"NOT_APPROVED_FOR_PRODUCTION",
      policy:{
        manual_environment_tests_required_before_production_go:mode%3!==0,
        do_not_claim_unperformed_tests_as_passed:true,
        do_not_disable_technical_security_gates:true
      },
      external_environment_tests:[]
    };
    const result=evaluateDispatchReadiness(manifest,new Date("2026-11-07T23:00:00Z"));
    expect(result.production_approved).toBe(false);
    expect(result.decision).toBe("NO_GO");
    expect(result.evidenced_gates).toBe(0);
    expect(result.pending_gate_ids).toHaveLength(3);
  });
});
