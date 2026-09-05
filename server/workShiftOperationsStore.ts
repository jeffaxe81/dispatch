import type { WorkShiftAnomalyCandidate } from "./workShiftAnomalyService";
import type { WorkShiftAnomalySeverity, WorkShiftAnomalyType, WorkShiftPendingStatus } from "./workShiftOperationsDomain";

export type PendingRecord = WorkShiftAnomalyCandidate & { id:number; status:WorkShiftPendingStatus; version:number; slaDueAt?:Date|null };
export type SlaPolicy = { id:number; tenantId:number; anomalyType:WorkShiftAnomalyType|null; severity:WorkShiftAnomalySeverity|null; warningAfterMinutes:number|null; criticalAfterMinutes:number; escalationAfterMinutes:number|null; active:boolean };
export type EffectiveSlaPolicy = SlaPolicy & { source:"configured"|"default" };
export type RetentionPolicy = { id:number; tenantId:number; pendingRetentionDays:number|null; historyRetentionDays:number|null; auditProtected:boolean; active:boolean };
export type EffectiveRetentionPolicy = RetentionPolicy & { source:"configured"|"default" };

export type WorkShiftOperationsPersistence = {
  findPendingByDedupeKey(key:string):Promise<PendingRecord|null>;
  insertPending(input:WorkShiftAnomalyCandidate & { slaDueAt:Date|null }):Promise<PendingRecord>;
  listSlaPolicies(tenantId:number):Promise<SlaPolicy[]>;
  listRetentionPolicies(tenantId:number):Promise<RetentionPolicy[]>;
  listPendings(tenantId:number, filters?:{teamId?:number;status?:WorkShiftPendingStatus}):Promise<PendingRecord[]>;
};

const DEFAULT_SLA: Omit<EffectiveSlaPolicy,"tenantId"> = { id:0, anomalyType:null, severity:null, warningAfterMinutes:30, criticalAfterMinutes:60, escalationAfterMinutes:120, active:true, source:"default" };
const DEFAULT_RETENTION: Omit<EffectiveRetentionPolicy,"tenantId"> = { id:0, pendingRetentionDays:null, historyRetentionDays:null, auditProtected:true, active:true, source:"default" };

function specificity(policy:SlaPolicy, anomalyType:WorkShiftAnomalyType, severity:WorkShiftAnomalySeverity){
  if(policy.anomalyType && policy.anomalyType!==anomalyType)return -1;
  if(policy.severity && policy.severity!==severity)return -1;
  return (policy.anomalyType?2:0)+(policy.severity?1:0);
}

export function createWorkShiftOperationsStore(persistence:WorkShiftOperationsPersistence){
  async function getEffectiveSlaPolicy(tenantId:number, anomalyType:WorkShiftAnomalyType, severity:WorkShiftAnomalySeverity):Promise<EffectiveSlaPolicy>{
    const policies=(await persistence.listSlaPolicies(tenantId)).filter(p=>p.active).map(p=>({p,score:specificity(p,anomalyType,severity)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
    return policies[0]?{...policies[0].p,source:"configured"}:{...DEFAULT_SLA,tenantId};
  }
  return {
    async upsertPendingFromAnomaly(anomaly:WorkShiftAnomalyCandidate):Promise<PendingRecord>{
      const existing=await persistence.findPendingByDedupeKey(anomaly.dedupeKey);if(existing)return existing;
      const sla=await getEffectiveSlaPolicy(anomaly.tenantId,anomaly.anomalyType,anomaly.severity);
      const slaDueAt=sla.criticalAfterMinutes>0?new Date(anomaly.detectedAt.getTime()+sla.criticalAfterMinutes*60_000):null;
      try{return await persistence.insertPending({...anomaly,slaDueAt});}catch(error){const concurrent=await persistence.findPendingByDedupeKey(anomaly.dedupeKey);if(concurrent)return concurrent;throw error;}
    },
    getEffectiveSlaPolicy,
    async getEffectiveRetentionPolicy(tenantId:number):Promise<EffectiveRetentionPolicy>{
      const policy=(await persistence.listRetentionPolicies(tenantId)).find(p=>p.active);
      return policy?{...policy,source:"configured"}:{...DEFAULT_RETENTION,tenantId};
    },
    async listOperationalPendings(tenantId:number,filters?:{teamId?:number;status?:WorkShiftPendingStatus}){return persistence.listPendings(tenantId,filters);},
  };
}
