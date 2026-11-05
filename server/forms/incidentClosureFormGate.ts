import {and, desc, eq, inArray, or} from "drizzle-orm";
import {formSchemaDefinitionSchema, validateFormAnswers, type FormSchemaDefinition} from "../../shared/forms";
import {formBindings, formSubmissionReviews, formSubmissionRevisions, formSubmissions, formTemplates, formVersions} from "../../drizzle/formsSchema";
import {auditLogs} from "../../drizzle/schema";
import {incidentTenantScopes} from "../../drizzle/tenantScopeSchema";

type Submitted = {status:string; answers:unknown};
type FormRef = {formId:number; formVersionId:number};

export type IncidentClosureBlockReason =
  | "tenant_unresolved"
  | "invalid_definition"
  | "form_not_submitted"
  | "form_returned"
  | "answers_incomplete";

/** AXED-F030: carries only a reason code and form identifiers, never submitted answers. */
export class IncidentClosureBlockedError extends Error {
  constructor(readonly reason:IncidentClosureBlockReason, message:string, readonly form?:FormRef) {
    super(message);
    this.name="IncidentClosureBlockedError";
  }
}

/**
 * AXED-F030: explicit "requiredOnStatuses: ['concluida']" opts a bound form
 * into the transactional incident closure gate. Other bindings remain optional.
 * It never treats UI readiness as authorization, and never invents missing answers.
 */
export function requiresClosureForm(definition:unknown): boolean {
  const parsed=formSchemaDefinitionSchema.safeParse(definition);
  if(!parsed.success)throw new Error("Definição vinculada do formulário inválida. Revisão obrigatória antes do encerramento.");
  return parsed.data.fields.some(field=>"requiredOnStatuses" in field && field.requiredOnStatuses?.includes("concluida"));
}
export function assertClosureFormReadiness(definition:FormSchemaDefinition,submission:Submitted|null,reviewDecision?:string|null,form?:FormRef) {
  if(!requiresClosureForm(definition))return;
  if(!submission || (submission.status!=="submitted" && submission.status!=="corrected")) {
    throw new IncidentClosureBlockedError("form_not_submitted","Encerramento bloqueado: formulário obrigatório não enviado ou ainda em preenchimento.",form);
  }
  if(reviewDecision==="returned")throw new IncidentClosureBlockedError("form_returned","Encerramento bloqueado: formulário devolvido pelo supervisor exige correção.",form);
  const check=validateFormAnswers(definition,submission.answers,{incidentStatus:"concluida"});
  if(!check.success)throw new IncidentClosureBlockedError("answers_incomplete","Encerramento bloqueado: respostas obrigatórias para a fase concluída estão incompletas ou inválidas.",form);
}

/**
 * Receives the existing Drizzle transaction AFTER the incident row is locked.
 * All reads are scoped by the tenant derived from the incident itself.
 * The submission row is locked too, serializing with supervisor review/correction.
 */
export async function assertRequiredIncidentClosureForms(tx:any, incidentId:number, category:string):Promise<void> {
  const scopes=await tx.select({tenantId:incidentTenantScopes.organizationId}).from(incidentTenantScopes)
    .where(eq(incidentTenantScopes.incidentId,incidentId)).limit(1);
  const tenantId=Number(scopes[0]?.tenantId);
  if(!Number.isSafeInteger(tenantId)||tenantId<=0)
    throw new IncidentClosureBlockedError("tenant_unresolved","Encerramento bloqueado: ocorrência sem organização autorizada para validar formulários.");
  const bindings=await tx.select({
    formId:formBindings.formId,
    formVersionId:formBindings.formVersionId,
    definition:formVersions.definition,
    templateStatus:formTemplates.status,
  }).from(formBindings)
    .innerJoin(formVersions,and(eq(formVersions.id,formBindings.formVersionId),eq(formVersions.formId,formBindings.formId),eq(formVersions.tenantId,tenantId)))
    .innerJoin(formTemplates,and(eq(formTemplates.id,formBindings.formId),eq(formTemplates.tenantId,tenantId)))
    .where(and(eq(formBindings.tenantId,tenantId),or(
      and(eq(formBindings.contextType,"incident"),eq(formBindings.contextId,String(incidentId))),
      and(eq(formBindings.contextType,"incident_category"),eq(formBindings.contextId,category)),
    )));
  const required=new Map<string,{formId:number;formVersionId:number;definition:FormSchemaDefinition}>();
  for(const binding of bindings) {
    if(binding.templateStatus!=="active")continue;
    const parsed=formSchemaDefinitionSchema.safeParse(binding.definition);
    if(!parsed.success)throw new IncidentClosureBlockedError("invalid_definition","Encerramento bloqueado: definição vinculada inválida.",{formId:binding.formId,formVersionId:binding.formVersionId});
    if(!requiresClosureForm(parsed.data))continue;
    required.set(binding.formId+":"+binding.formVersionId,{
      formId:binding.formId,formVersionId:binding.formVersionId,definition:parsed.data,
    });
  }
  if(!required.size)return;
  const all=[...required.values()];
  const submissions=await tx.select().from(formSubmissions).where(and(
    eq(formSubmissions.tenantId,tenantId),
    eq(formSubmissions.contextType,"incident"),
    eq(formSubmissions.contextId,String(incidentId)),
    inArray(formSubmissions.formId,all.map(x=>x.formId)),
    inArray(formSubmissions.formVersionId,all.map(x=>x.formVersionId)),
  )).for("update");
  for(const item of all) {
    const form={formId:item.formId,formVersionId:item.formVersionId};
    const current=submissions.filter((s:any)=>s.formId===item.formId&&s.formVersionId===item.formVersionId)
      .sort((a:any,b:any)=>b.id-a.id)[0]??null;
    if(!current) {assertClosureFormReadiness(item.definition,null,null,form);continue;}
    if(current.status!=="submitted"&&current.status!=="corrected") {
      assertClosureFormReadiness(item.definition,current,null,form);
      continue;
    }
    const revisions=await tx.select({revision:formSubmissionRevisions.revision}).from(formSubmissionRevisions)
      .where(and(eq(formSubmissionRevisions.tenantId,tenantId),eq(formSubmissionRevisions.submissionId,current.id)))
      .orderBy(desc(formSubmissionRevisions.revision)).limit(1);
    const revision=Number(revisions[0]?.revision??1);
    const review=await tx.select({decision:formSubmissionReviews.decision}).from(formSubmissionReviews)
      .where(and(eq(formSubmissionReviews.tenantId,tenantId),eq(formSubmissionReviews.submissionId,current.id),eq(formSubmissionReviews.revision,revision))).limit(1);
    assertClosureFormReadiness(item.definition,current,review[0]?.decision,form);
  }
}

/**
 * Runs AFTER the blocked transaction rolled back, otherwise the evidence would roll back with it.
 * Stores no answers. A failure here never unblocks the closure nor replaces the original error.
 */
export async function recordIncidentClosureBlocked(
  db:{insert:(table:typeof auditLogs)=>{values:(row:typeof auditLogs.$inferInsert)=>PromiseLike<unknown>}},
  input:{incidentId:number;actorUserId:number;error:IncidentClosureBlockedError},
):Promise<void> {
  try {
    await db.insert(auditLogs).values({
      resourceType:"incident",
      resourceId:input.incidentId,
      action:"closure_blocked_by_form",
      actorUserId:input.actorUserId,
      beforeData:null,
      afterData:{
        reason:input.error.reason,
        formId:input.error.form?.formId??null,
        formVersionId:input.error.form?.formVersionId??null,
      },
    });
  } catch {
    // The closure stays blocked even when the audit store is unavailable.
  }
}
