import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createConnection,type Connection} from "mysql2/promise";
import {createPool,type Pool} from "mysql2";
import type {ResultSetHeader,RowDataPacket} from "mysql2";
import {and,eq} from "drizzle-orm";
import {drizzle} from "drizzle-orm/mysql2";
import {migrate} from "drizzle-orm/mysql2/migrator";
import {formBindings,formSubmissionReviews,formSubmissions,formTemplates,formVersions} from "../../drizzle/formsSchema";
import {auditLogs,incidents} from "../../drizzle/schema";
import {incidentTenantScopes} from "../../drizzle/tenantScopeSchema";
import {setDbForTesting,transitionIncident} from "../db";
import {assertEmptyClosureGateSchema,getClosureGateMysqlTestSettings} from "../test/closureGateMysqlEnvironment";

const settings=getClosureGateMysqlTestSettings(process.env);
const definition={schemaVersion:1 as const,title:"Fechamento",fields:[{id:"x",key:"x",label:"Relatório",type:"short_text" as const,required:false,requiredOnStatuses:["concluida" as const]}]};
const complete={x:"Relatório completo"};
let conn:Connection;
let pool:Pool;
let db:ReturnType<typeof drizzle>;
let orgA=0,orgB=0,actor=0,formA=0,versionA=0,sequence=0;

async function insert(sql:string,args:Array<string|number|null>) {
  const [result]=await conn.execute<ResultSetHeader>(sql,args);
  expect(result.insertId).toBeGreaterThan(0);
  return result.insertId;
}

async function createForm(tenantId:number,code:string) {
  const [template]=await db.insert(formTemplates).values({tenantId,code,name:code,status:"active",createdByUserId:actor}).$returningId();
  const [version]=await db.insert(formVersions).values({tenantId,formId:template!.id,version:1,definition,definitionHash:"a".repeat(64),status:"published",createdByUserId:actor}).$returningId();
  return {formId:template!.id,formVersionId:version!.id};
}

async function createIncident(category:string,tenantId=orgA) {
  sequence+=1;
  const [row]=await db.insert(incidents).values({
    code:"GATE-"+sequence,status:"em_atendimento",category,description:"Ocorrência de ensaio",address:"Endereço de ensaio",
    latitude:"-27.0000000",longitude:"-48.0000000",createdByUserId:actor,
  }).$returningId();
  await db.insert(incidentTenantScopes).values({incidentId:row!.id,organizationId:tenantId});
  return row!.id;
}

async function submit(incidentId:number,status:"in_progress"|"submitted",answers:Record<string,string>,tenantId=orgA) {
  const [row]=await db.insert(formSubmissions).values({
    tenantId,formId:formA,formVersionId:versionA,contextType:"incident",contextId:String(incidentId),status,answers,createdByUserId:actor,
  }).$returningId();
  return row!.id;
}

const close=(incidentId:number)=>transitionIncident({incidentId,actorUserId:actor,nextStatus:"concluida",note:"Encerramento de ensaio"});

async function auditOf(incidentId:number,action:string) {
  return db.select().from(auditLogs).where(and(eq(auditLogs.resourceType,"incident"),eq(auditLogs.resourceId,incidentId),eq(auditLogs.action,action)));
}

async function expectBlocked(incidentId:number,message:RegExp,reason:string) {
  await expect(close(incidentId)).rejects.toThrow(message);
  const [row]=await db.select().from(incidents).where(eq(incidents.id,incidentId));
  expect(row).toMatchObject({status:"em_atendimento",statusRevision:1,completedAt:null});
  expect(await auditOf(incidentId,"status_transition")).toHaveLength(0);
  const blocked=await auditOf(incidentId,"closure_blocked_by_form");
  expect(blocked).toHaveLength(1);
  expect(blocked[0]).toMatchObject({actorUserId:actor,afterData:{reason,formId:formA,formVersionId:versionA}});
  expect(JSON.stringify(blocked[0])).not.toContain("Relatório");
}

beforeAll(async()=>{
  conn=await createConnection(settings);
  await conn.query("SET SESSION time_zone = '+00:00'");
  const [tables]=await conn.query<RowDataPacket[]>("SELECT count(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()");
  assertEmptyClosureGateSchema(String(settings.database),Number(tables[0]?.total??-1));
  await migrate(drizzle({client:conn}),{migrationsFolder:"drizzle"});
  pool=createPool({...settings,connectionLimit:5});
  db=drizzle({client:pool});
  setDbForTesting(db);
  orgA=await insert("INSERT INTO organizations (code, name) VALUES (?, ?)",["gate_a","Gate A"]);
  orgB=await insert("INSERT INTO organizations (code, name) VALUES (?, ?)",["gate_b","Gate B"]);
  actor=await insert("INSERT INTO users (openId, name, active) VALUES (?, ?, true)",["gate-actor","Usuário do ensaio"]);
  const form=await createForm(orgA,"fechamento-a");
  formA=form.formId;
  versionA=form.formVersionId;
  await db.insert(formBindings).values({tenantId:orgA,...form,contextType:"incident_category",contextId:"exige-formulario",createdByUserId:actor});
  const external=await createForm(orgB,"fechamento-b");
  await db.insert(formBindings).values({tenantId:orgB,...external,contextType:"incident_category",contextId:"exigida-so-em-b",createdByUserId:actor});
},120_000);

afterAll(async()=>{
  setDbForTesting(null);
  if(pool)await new Promise<void>((done,fail)=>pool.end(error=>error?fail(error):done()));
  if(conn)await conn.end();
});

describe("AXED-F030 — gate de encerramento em MySQL 8.4",()=>{
  it("bloqueia e audita encerramento sem envio",async()=>{
    await expectBlocked(await createIncident("exige-formulario"),/não enviado/,"form_not_submitted");
  });

  it("bloqueia e audita formulário ainda em preenchimento",async()=>{
    const incidentId=await createIncident("exige-formulario");
    await submit(incidentId,"in_progress",complete);
    await expectBlocked(incidentId,/não enviado/,"form_not_submitted");
  });

  it("bloqueia e audita resposta obrigatória ausente",async()=>{
    const incidentId=await createIncident("exige-formulario");
    await submit(incidentId,"submitted",{});
    await expectBlocked(incidentId,/incompletas/,"answers_incomplete");
  });

  it("bloqueia e audita formulário devolvido pelo supervisor",async()=>{
    const incidentId=await createIncident("exige-formulario");
    const submissionId=await submit(incidentId,"submitted",complete);
    await db.insert(formSubmissionReviews).values({tenantId:orgA,submissionId,revision:1,decision:"returned",reason:"Corrigir o relatório",reviewerUserId:actor,reviewedAt:new Date()});
    await expectBlocked(incidentId,/devolvido/,"form_returned");
  });

  it("não aceita envio registrado em outro tenant",async()=>{
    const incidentId=await createIncident("exige-formulario");
    await submit(incidentId,"submitted",complete,orgB);
    await expectBlocked(incidentId,/não enviado/,"form_not_submitted");
  });

  it("não aplica exigência vinculada somente em outro tenant",async()=>{
    const incidentId=await createIncident("exigida-so-em-b");
    await expect(close(incidentId)).resolves.toMatchObject({status:"concluida"});
    expect(await auditOf(incidentId,"closure_blocked_by_form")).toHaveLength(0);
  });

  it("conclui com envio válido, sem registro de bloqueio",async()=>{
    const incidentId=await createIncident("exige-formulario");
    await submit(incidentId,"submitted",complete);
    await expect(close(incidentId)).resolves.toMatchObject({status:"concluida",statusRevision:2});
    expect(await auditOf(incidentId,"status_transition")).toHaveLength(1);
    expect(await auditOf(incidentId,"closure_blocked_by_form")).toHaveLength(0);
  });
});
