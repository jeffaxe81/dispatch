import type { IntegrationSystem } from "../shared/integrationContracts";
import {
  buildIntegrationCircuitFailure,
  buildIntegrationCircuitCooldownExpiry,
  type IntegrationCircuitSnapshot,
} from "./integrationCircuitState";
import {
  buildIntegrationCircuitProbeLeaseClaim,
  buildIntegrationCircuitProbeLeaseRelease,
  type IntegrationCircuitProbeLeaseSnapshot,
} from "./integrationCircuitProbeLease";
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
      };
      return Object.freeze({...await commit(before,next,"integration.circuit.probe_lease.claimed"),permitsProbe:false as const});
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
      };
      return Object.freeze({...await commit(before,next,"integration.circuit.probe_lease.released"),permitsProbe:false as const});
    },
  };
}
