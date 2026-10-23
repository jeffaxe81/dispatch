import { and, eq, isNull } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";
import { integrationCircuitState } from "../drizzle/integrationCircuitSchema";
import type { IntegrationSystem } from "../shared/integrationContracts";
import type { getDb } from "./dbLegacy";
import { assertIntegrationCircuitSnapshot } from "./integrationCircuitState";
import { assertIntegrationCircuitProbeLeaseSnapshot } from "./integrationCircuitProbeLease";

type IntegrationDb = Omit<NonNullable<Awaited<ReturnType<typeof getDb>>>, "$client">;
type CircuitRow = typeof integrationCircuitState.$inferSelect;

export type IntegrationCircuitPersistenceSnapshot = Readonly<{
  id?: number;
  organizationId: number;
  system: IntegrationSystem;
  state: "closed" | "open" | "half_open";
  version: number;
  consecutiveFailures: number;
  openedAtMs: number | null;
  cooldownUntilMs: number | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
}>;

export type IntegrationCircuitAuditProjection = Readonly<{
  before: Readonly<{ state: string; version: number; consecutiveFailures?: number }>;
  after: Readonly<{ state: string; version: number; consecutiveFailures?: number }>;
}>;

function positive(value:number,label:string):void {
  if(!Number.isSafeInteger(value)||value<=0) throw new Error(label+" inválido.");
}
function safeAction(value:string):void {
  if(typeof value!=="string"||!/^integration\.circuit\.[a-z0-9_.-]+$/.test(value)||value.length>120) {
    throw new Error("Ação de auditoria inválida.");
  }
}
function assertAudit(audit:IntegrationCircuitAuditProjection):void {
  const raw=JSON.stringify(audit);
  if(/token|authorization|payload|leaseowner/i.test(raw)) {
    throw new Error("Auditoria do circuito contém dado proibido.");
  }
}

export function hydrateIntegrationCircuitPersistence(
  row: CircuitRow | Record<string, unknown>,
): IntegrationCircuitPersistenceSnapshot {
  const r=row as CircuitRow;
  const snapshot:IntegrationCircuitPersistenceSnapshot={
    id:r.id,
    organizationId:r.organizationId,
    system:r.system,
    state:r.state,
    version:r.circuitVersion,
    consecutiveFailures:r.consecutiveFailures,
    openedAtMs:r.openedAtMs,
    cooldownUntilMs:r.cooldownUntilMs,
    leaseOwner:r.probeLeaseOwner,
    leaseToken:r.probeLeaseToken,
    leaseExpiresAtMs:r.probeLeaseExpiresAtMs,
  };
  assertIntegrationCircuitSnapshot({
    organizationId:snapshot.organizationId, system:snapshot.system, state:snapshot.state,
    version:snapshot.version, consecutiveFailures:snapshot.consecutiveFailures,
    openedAtMs:snapshot.openedAtMs, cooldownUntilMs:snapshot.cooldownUntilMs,
  });
  assertIntegrationCircuitProbeLeaseSnapshot({
    organizationId:snapshot.organizationId, system:snapshot.system, circuitState:snapshot.state,
    circuitVersion:snapshot.version, leaseOwner:snapshot.leaseOwner,
    leaseToken:snapshot.leaseToken, leaseExpiresAtMs:snapshot.leaseExpiresAtMs,
  });
  if(snapshot.state!=="half_open" && snapshot.leaseToken!==null) {
    throw new Error("Lease de probe só pode existir em half-open.");
  }
  return Object.freeze(snapshot);
}

export function createIntegrationCircuitMySqlStorage(db:IntegrationDb) {
  async function selectLocked(tx:any,input:{organizationId:number;system:IntegrationSystem}) {
    return (await tx.select().from(integrationCircuitState).where(and(
      eq(integrationCircuitState.organizationId,input.organizationId),
      eq(integrationCircuitState.system,input.system),
    )).limit(1).for("update"))[0] ?? null;
  }
  return {
    async load(input:{organizationId:number;system:IntegrationSystem}):Promise<IntegrationCircuitPersistenceSnapshot|null> {
      positive(input.organizationId,"Organização");
      return db.transaction(async tx=>{
        const row=await selectLocked(tx,input);
        return row?hydrateIntegrationCircuitPersistence(row):null;
      });
    },

    async commitAudited(input:{
      organizationId:number;
      system:IntegrationSystem;
      expectedVersion:number;
      current:IntegrationCircuitPersistenceSnapshot;
      next:IntegrationCircuitPersistenceSnapshot;
      action:string;
      audit:IntegrationCircuitAuditProjection;
    }):Promise<boolean> {
      positive(input.organizationId,"Organização");
      if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0) throw new Error("Versão CAS inválida.");
      safeAction(input.action);
      assertAudit(input.audit);
      if(input.current.organizationId!==input.organizationId||input.next.organizationId!==input.organizationId
        ||input.current.system!==input.system||input.next.system!==input.system) {
        throw new Error("Escopo tenant/sistema divergente.");
      }
      if(input.current.version!==input.expectedVersion||input.next.version!==input.expectedVersion+1) {
        throw new Error("Sequência de versão CAS inválida.");
      }
      return db.transaction(async tx=>{
        const locked=await selectLocked(tx,input);
        if(!locked) return false;
        const live=hydrateIntegrationCircuitPersistence(locked);
        if(live.version!==input.expectedVersion||live.state!==input.current.state
          ||live.leaseToken!==input.current.leaseToken) return false;

        const leaseCondition=live.leaseToken===null
          ? isNull(integrationCircuitState.probeLeaseToken)
          : eq(integrationCircuitState.probeLeaseToken,live.leaseToken);
        const [result]=await tx.update(integrationCircuitState).set({
          state:input.next.state,
          circuitVersion:input.next.version,
          consecutiveFailures:input.next.consecutiveFailures,
          openedAtMs:input.next.openedAtMs,
          cooldownUntilMs:input.next.cooldownUntilMs,
          probeLeaseOwner:input.next.leaseOwner,
          probeLeaseToken:input.next.leaseToken,
          probeLeaseExpiresAtMs:input.next.leaseExpiresAtMs,
        }).where(and(
          eq(integrationCircuitState.organizationId,input.organizationId),
          eq(integrationCircuitState.system,input.system),
          eq(integrationCircuitState.circuitVersion,input.expectedVersion),
          eq(integrationCircuitState.state,input.current.state),
          leaseCondition,
        ));
        if(result.affectedRows===0) return false;
        if(result.affectedRows!==1) throw new Error("Invariante CAS do circuito violada.");

        await tx.insert(auditLogs).values({
          resourceType:"integration_circuit_state",
          resourceId:live.id ?? 0,
          action:input.action,
          actorUserId:null,
          beforeData:{organizationId:input.organizationId,system:input.system,...input.audit.before},
          afterData:{organizationId:input.organizationId,system:input.system,...input.audit.after},
        });
        return true;
      });
    },
  };
}
