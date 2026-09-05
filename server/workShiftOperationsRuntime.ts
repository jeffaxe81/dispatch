import { and, desc, eq, sql } from "drizzle-orm";
import { workShiftPendingHistory, workShiftPendingItems, workShiftSlaPolicies } from "../drizzle/workShiftSchema";
import { getDb } from "./db";
import type { WorkShiftOperationsRouterDependencies } from "./workShiftOperationsRouter";
import { transitionWorkShiftPending } from "./workShiftOperationsDomain";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

async function findPending(db: Awaited<ReturnType<typeof requireDb>>, tenantId: number, pendingId: number) {
  return (await db.select().from(workShiftPendingItems).where(and(eq(workShiftPendingItems.id, pendingId), eq(workShiftPendingItems.tenantId, tenantId))).limit(1))[0] ?? null;
}

async function updatePending(input: { tenantId:number; pendingId:number; actorUserId:number; expectedVersion:number; status?:"open"|"in_review"|"waiting_information"|"resolved"|"no_adjustment_required"; justification?:string; responsibleUserId?:number|null }) {
  const db=await requireDb();
  const current=await findPending(db,input.tenantId,input.pendingId);
  if(!current)return null;
  const status=input.status ?? current.status;
  const transition=transitionWorkShiftPending(current.status,status,input.justification);
  const terminal=status==="resolved"||status==="no_adjustment_required";
  await db.update(workShiftPendingItems).set({
    status:transition.status,
    justification:transition.justification ?? current.justification,
    responsibleUserId:input.responsibleUserId===undefined?current.responsibleUserId:input.responsibleUserId,
    resolvedByUserId:terminal?input.actorUserId:current.resolvedByUserId,
    resolvedAt:terminal?new Date():current.resolvedAt,
    version:sql`${workShiftPendingItems.version} + 1`,
  }).where(and(eq(workShiftPendingItems.id,input.pendingId),eq(workShiftPendingItems.tenantId,input.tenantId),eq(workShiftPendingItems.version,input.expectedVersion)));
  const updated=await findPending(db,input.tenantId,input.pendingId);
  if(!updated||updated.version===input.expectedVersion)throw new Error("Pendência alterada concorrentemente. Atualize a tela e tente novamente.");
  await db.insert(workShiftPendingHistory).values({pendingItemId:input.pendingId,tenantId:input.tenantId,actorUserId:input.actorUserId,fromStatus:current.status,toStatus:updated.status,justification:transition.justification ?? input.justification ?? null,beforeData:current,afterData:updated});
  return updated;
}

export const workShiftOperationsRouterDependencies: WorkShiftOperationsRouterDependencies = {
  async list(input){const db=await requireDb();const conditions=[eq(workShiftPendingItems.tenantId,input.tenantId)];if(input.teamId!==undefined)conditions.push(eq(workShiftPendingItems.teamId,input.teamId));if(input.status!==undefined)conditions.push(eq(workShiftPendingItems.status,input.status));return db.select().from(workShiftPendingItems).where(and(...conditions)).orderBy(desc(workShiftPendingItems.detectedAt));},
  async summary(input){const db=await requireDb();const conditions=[eq(workShiftPendingItems.tenantId,input.tenantId)];if(input.teamId!==undefined)conditions.push(eq(workShiftPendingItems.teamId,input.teamId));const rows=await db.select().from(workShiftPendingItems).where(and(...conditions));const now=Date.now();return {total:rows.length,open:rows.filter(r=>r.status==="open").length,inReview:rows.filter(r=>r.status==="in_review").length,critical:rows.filter(r=>r.severity==="critical"&&r.status!=="resolved"&&r.status!=="no_adjustment_required").length,overdue:rows.filter(r=>r.slaDueAt&&r.slaDueAt.getTime()<now&&r.status!=="resolved"&&r.status!=="no_adjustment_required").length,resolved:rows.filter(r=>r.status==="resolved"||r.status==="no_adjustment_required").length};},
  async claim(input){return updatePending({...input,status:"in_review",responsibleUserId:input.actorUserId,justification:"Pendência assumida para análise."});},
  async setStatus(input){return updatePending(input);},
  async resolve(input){return updatePending({...input,status:input.resolution});},
  async listSlaPolicies(input){const db=await requireDb();return db.select().from(workShiftSlaPolicies).where(and(eq(workShiftSlaPolicies.tenantId,input.tenantId),eq(workShiftSlaPolicies.active,true))).orderBy(workShiftSlaPolicies.anomalyType);},
  async upsertSlaPolicy(input){const db=await requireDb();const [createdId]=await db.insert(workShiftSlaPolicies).values({tenantId:input.tenantId,anomalyType:input.anomalyType??null,severity:input.severity??null,warningAfterMinutes:input.warningAfterMinutes??null,criticalAfterMinutes:input.criticalAfterMinutes,escalationAfterMinutes:input.escalationAfterMinutes??null,active:true}).$returningId();if(!createdId)throw new Error("Falha ao persistir política SLA.");return (await db.select().from(workShiftSlaPolicies).where(eq(workShiftSlaPolicies.id,createdId.id)).limit(1))[0];},
};
