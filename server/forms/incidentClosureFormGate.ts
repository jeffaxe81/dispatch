import {and, desc, eq, inArray, or} from "drizzle-orm";
import {formSchemaDefinitionSchema, validateFormAnswers, type FormSchemaDefinition} from "../../shared/forms";
import {formBindings, formSubmissionReviews, formSubmissionRevisions, formSubmissions, formTemplates, formVersions} from "../../drizzle/formsSchema";
import {incidentTenantScopes} from "../../drizzle/tenantScopeSchema";

type Submitted = {status:string; answers:unknown};

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
export function assertClosureFormReadiness(definition:FormSchemaDefinition,submission:Submitted|null,reviewDecision?:string|null) {
  if(!requiresClosureForm(definition))return;
  if(!submission || (submission.status!=="submitted" && submission.status!=="corrected")) {
    throw new Error("Encerramento bloqueado: formulário obrigatório não enviado ou ainda em preenchimento.");
  }
  if(reviewDecision==="returned")throw new Error("Encerramento bloqueado: formulário devolvido pelo supervisor exige correção.");
  const check=validateFormAnswers(definition,submission.answers,{incidentStatus:"concluida"});
  if(!check.success)throw new Error("Encerramento bloqueado: respostas obrigatórias para a fase concluída estão incompletas ou inválidas.");
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
    throw new Error("Encerramento bloqueado: ocorrência sem organização autorizada para validar formulários.");
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
    if(!parsed.success)throw new Error("Encerramento bloqueado: definição vinculada inválida.");
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
    const current=submissions.filter((s:any)=>s.formId===item.formId&&s.formVersionId===item.formVersionId)
      .sort((a:any,b:any)=>b.id-a.id)[0]??null;
    if(!current) {assertClosureFormReadiness(item.definition,null);continue;}
    if(current.status!=="submitted"&&current.status!=="corrected") {
      assertClosureFormReadiness(item.definition,current);
      continue;
    }
    const revisions=await tx.select({revision:formSubmissionRevisions.revision}).from(formSubmissionRevisions)
      .where(and(eq(formSubmissionRevisions.tenantId,tenantId),eq(formSubmissionRevisions.submissionId,current.id)))
      .orderBy(desc(formSubmissionRevisions.revision)).limit(1);
    const revision=Number(revisions[0]?.revision??1);
    const review=await tx.select({decision:formSubmissionReviews.decision}).from(formSubmissionReviews)
      .where(and(eq(formSubmissionReviews.tenantId,tenantId),eq(formSubmissionReviews.submissionId,current.id),eq(formSubmissionReviews.revision,revision))).limit(1);
    assertClosureFormReadiness(item.definition,current,review[0]?.decision);
  }
}
