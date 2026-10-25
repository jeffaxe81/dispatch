import type { IntegrationSystem } from "../shared/integrationContracts";
import {
  buildIntegrationCircuitFailure,
  buildIntegrationCircuitCooldownExpiry,
  buildIntegrationCircuitProbeFailure,
  buildIntegrationCircuitSuccess,
  type IntegrationCircuitSnapshot,
} from "./integrationCircuitState";
import {
  buildIntegrationCircuitProbeLeaseClaim,
  buildIntegrationCircuitProbeLeaseRelease,
  type IntegrationCircuitProbeLeaseSnapshot,
} from "./integrationCircuitProbeLease";
import {
  buildProbeExecutionIntent,
  consumeProbeExecutionIntent as consumeProbeExecutionPlan,
  type IntegrationProbeExecutionSnapshot,
} from "./integrationCircuitProbeExecutionIntent";
import type {
  IntegrationCircuitAuditProjection,
  IntegrationCircuitPersistenceSnapshot,
} from "./integrationCircuitMySqlStorage";

export type IntegrationCircuitCoordinatorStorage = {
  load(input:{organizationId:number;system:IntegrationSystem}):Promise<IntegrationCircuitPersistenceSnapshot|null>;
  commitAudited(input:{
    organizationId:number;system:IntegrationSystem;expectedVersion:number;
    current:IntegrationCircuitPersistenceSnapshot;next:IntegrationCircuitPersistenceSnapshot;
    action:string;audit:IntegrationCircuitAuditProjection;
  }):Promise<boolean>;
};

export class IntegrationCircuitCoordinatorConflictError extends Error {
  constructor(){super("Conflito CAS do circuit breaker.");this.name="IntegrationCircuitCoordinatorConflictError";}
}

function stateView(current:IntegrationCircuitPersistenceSnapshot):IntegrationCircuitSnapshot {
  return {
    organizationId:current.organizationId, system:current.system, state:current.state,
    version:current.version, consecutiveFailures:current.consecutiveFailures,
    openedAtMs:current.openedAtMs, cooldownUntilMs:current.cooldownUntilMs,
  };
}
function leaseView(current:IntegrationCircuitPersistenceSnapshot):IntegrationCircuitProbeLeaseSnapshot {
  return {
    organizationId:current.organizationId, system:current.system, circuitState:current.state,
    circuitVersion:current.version, leaseOwner:current.leaseOwner,
    leaseToken:current.leaseToken, leaseExpiresAtMs:current.leaseExpiresAtMs,
  };
}
function executionView(current:IntegrationCircuitPersistenceSnapshot):IntegrationProbeExecutionSnapshot {
  return {
    organizationId:current.organizationId, system:current.system, circuitState:current.state,
    circuitVersion:current.version, leaseOwner:current.leaseOwner ?? null,
    leaseToken:current.leaseToken ?? null, leaseExpiresAtMs:current.leaseExpiresAtMs ?? null,
    executionToken:current.executionToken ?? null,
    executionExpiresAtMs:current.executionExpiresAtMs ?? null,
    executionConsumedAtMs:current.executionConsumedAtMs ?? null,
  };
}
function audit(current:IntegrationCircuitPersistenceSnapshot,next:IntegrationCircuitPersistenceSnapshot):IntegrationCircuitAuditProjection {
  return {
    before:{state:current.state,version:current.version,consecutiveFailures:current.consecutiveFailures},
    after:{state:next.state,version:next.version,consecutiveFailures:next.consecutiveFailures},
  };
}

export function createIntegrationCircuitCoordinator(
  storage:IntegrationCircuitCoordinatorStorage,
  clock:()=>number=Date.now,
){
  async function current(input:{organizationId:number;system:IntegrationSystem;expectedVersion:number}) {
    const found=await storage.load({organizationId:input.organizationId,system:input.system});
    if(!found) throw new Error("Circuito não encontrado no escopo tenant/sistema.");
    if(found.organizationId!==input.organizationId) throw new Error("Organização fora do escopo.");
    if(found.system!==input.system) throw new Error("Sistema fora do escopo.");
    if(found.version!==input.expectedVersion) throw new Error("Versão CAS divergente.");
    return found;
  }
  async function commit(
    before:IntegrationCircuitPersistenceSnapshot,
    next:IntegrationCircuitPersistenceSnapshot,
    action:string,
  ){
    const ok=await storage.commitAudited({
      organizationId:before.organizationId,system:before.system,expectedVersion:before.version,
      current:before,next,action,audit:audit(before,next),
    });
    if(!ok) throw new IntegrationCircuitCoordinatorConflictError();
    return next;
  }
  return {
    async recordFailure(input:{
      organizationId:number;system:IntegrationSystem;expectedVersion:number;
      failureThreshold:number;cooldownSeconds:number;
    }){
      const before=await current(input);
      if(before.leaseToken!==null) throw new Error("Falha normal não pode alterar circuito com lease de probe ativo.");
      const planned=buildIntegrationCircuitFailure(stateView(before),{
        nowEpochMs:clock(),failureThreshold:input.failureThreshold,cooldownSeconds:input.cooldownSeconds,
      });
      const next:IntegrationCircuitPersistenceSnapshot={...before,...planned};
      return commit(before,next,"integration.circuit.failure.recorded");
    },

    async advanceCooldown(input:{organizationId:number;system:IntegrationSystem;expectedVersion:number}){
      const before=await current(input);
      if(before.leaseToken!==null) throw new Error("Cooldown não avança com lease residual.");
      const planned=buildIntegrationCircuitCooldownExpiry(stateView(before),clock());
      const next:IntegrationCircuitPersistenceSnapshot={
        ...before,state:planned.state,version:planned.version,
        consecutiveFailures:planned.consecutiveFailures,openedAtMs:planned.openedAtMs,
        cooldownUntilMs:planned.cooldownUntilMs,
      };
      return Object.freeze({...await commit(before,next,"integration.circuit.cooldown.expired"),permitsProbe:false as const});
    },

    async claimProbeLease(input:{
      organizationId:number;system:IntegrationSystem;expectedVersion:number;
      leaseOwner:string;leaseToken:string;leaseDurationMs:number;
    }){
      const before=await current(input);
      const planned=buildIntegrationCircuitProbeLeaseClaim(leaseView(before),{
        nowEpochMs:clock(),leaseOwner:input.leaseOwner,leaseToken:input.leaseToken,
        leaseDurationMs:input.leaseDurationMs,
      });
      const next:IntegrationCircuitPersistenceSnapshot={
        ...before,version:planned.circuitVersion,leaseOwner:planned.leaseOwner,
        leaseToken:planned.leaseToken,leaseExpiresAtMs:planned.leaseExpiresAtMs,
        executionToken:null,executionExpiresAtMs:null,executionConsumedAtMs:null,
      };
      return Object.freeze({...await commit(before,next,"integration.circuit.probe_lease.claimed"),permitsProbe:false as const});
    },

    async issueProbeExecutionIntent(input:{
      organizationId:number;system:IntegrationSystem;expectedVersion:number;
      leaseToken:string;executionToken:string;executionDurationMs:number;
    }){
      const before=await current(input);
      const planned=buildProbeExecutionIntent(executionView(before),{
        nowEpochMs:clock(),expectedVersion:input.expectedVersion,leaseToken:input.leaseToken,
        executionToken:input.executionToken,executionDurationMs:input.executionDurationMs,
      });
      const next:IntegrationCircuitPersistenceSnapshot={
        ...before,version:planned.circuitVersion,
        executionToken:planned.executionToken,
        executionExpiresAtMs:planned.executionExpiresAtMs,
        executionConsumedAtMs:planned.executionConsumedAtMs,
      };
      return Object.freeze({
        ...await commit(before,next,"integration.circuit.probe_intent.issued"),
        permitsProbe:false as const,
        permitsExternalCall:false as const,
        permitsAutomaticReplay:false as const,
      });
    },

    async consumeProbeExecutionIntent(input:{
      organizationId:number;system:IntegrationSystem;expectedVersion:number;
      leaseToken:string;executionToken:string;
    }){
      const before=await current(input);
      const planned=consumeProbeExecutionPlan(executionView(before),{
        nowEpochMs:clock(),expectedVersion:input.expectedVersion,
        leaseToken:input.leaseToken,executionToken:input.executionToken,
      });
      const next:IntegrationCircuitPersistenceSnapshot={
        ...before,version:planned.circuitVersion,
        executionToken:planned.executionToken,
        executionExpiresAtMs:planned.executionExpiresAtMs,
        executionConsumedAtMs:planned.executionConsumedAtMs,
      };
      return Object.freeze({
        ...await commit(before,next,"integration.circuit.probe_intent.consumed"),
        permitsProbe:true as const,
        permitsExternalCall:false as const,
        permitsAutomaticReplay:false as const,
      });
    },

    async releaseProbeLease(input:{
      organizationId:number;system:IntegrationSystem;expectedVersion:number;leaseToken:string;
    }){
      const before=await current(input);
      const planned=buildIntegrationCircuitProbeLeaseRelease(leaseView(before),{
        nowEpochMs:clock(),expectedVersion:input.expectedVersion,leaseToken:input.leaseToken,
      });
      const next:IntegrationCircuitPersistenceSnapshot={
        ...before,version:planned.circuitVersion,leaseOwner:null,leaseToken:null,leaseExpiresAtMs:null,
        executionToken:null,executionExpiresAtMs:null,executionConsumedAtMs:null,
      };
      return Object.freeze({...await commit(before,next,"integration.circuit.probe_lease.released"),permitsProbe:false as const});
    },

    async resolveProbe(input:{
      organizationId:number;system:IntegrationSystem;expectedVersion:number;
      leaseToken:string;outcome:"success"|"failure";cooldownSeconds:number;
    }){
      const before=await current(input);
      const now=clock();
      if(before.state!=="half_open") throw new Error("Resolução de probe exige circuito half-open.");
      if(typeof input.leaseToken!=="string"||!input.leaseToken.trim()) throw new Error("Token de fencing inválido.");
      if(before.leaseToken!==input.leaseToken) throw new Error("Token de fencing divergente.");
      if(before.leaseExpiresAtMs===null||now>=before.leaseExpiresAtMs) throw new Error("Lease de probe expirado.");
      if(input.outcome!=="success"&&input.outcome!=="failure") throw new Error("Resultado do probe inválido.");

      const planned=input.outcome==="success"
        ? buildIntegrationCircuitSuccess(stateView(before),now)
        : buildIntegrationCircuitProbeFailure(stateView(before),{
          nowEpochMs:now,cooldownSeconds:input.cooldownSeconds,
        });
      const next:IntegrationCircuitPersistenceSnapshot={
        ...before,
        state:planned.state,
        version:planned.version,
        consecutiveFailures:planned.consecutiveFailures,
        openedAtMs:planned.openedAtMs,
        cooldownUntilMs:planned.cooldownUntilMs,
        leaseOwner:null,
        leaseToken:null,
        leaseExpiresAtMs:null,
        executionToken:null,
        executionExpiresAtMs:null,
        executionConsumedAtMs:null,
      };
      const action=input.outcome==="success"
        ?"integration.circuit.probe.succeeded"
        :"integration.circuit.probe.failed";
      return Object.freeze({
        ...await commit(before,next,action),
        permitsExternalCall:false as const,
        permitsProbe:false as const,
        permitsAutomaticReplay:false as const,
      });
    },
  };
}
