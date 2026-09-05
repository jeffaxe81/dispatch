import { buildWorkShiftPendingDedupeKey, type WorkShiftAnomalySeverity, type WorkShiftAnomalyType } from "./workShiftOperationsDomain";

export type WorkShiftOperationalEventType = "started" | "paused" | "resumed" | "ended" | string;
export type WorkShiftOperationalSnapshot = Record<string, string | number | boolean | null | undefined>;

export interface WorkShiftOperationalEvent { tenantId:number; userId:number; teamId:number|null; sessionId:number; eventType:WorkShiftOperationalEventType; occurredAt:Date; snapshot:WorkShiftOperationalSnapshot; }
export interface WorkShiftAnomalyCandidate { tenantId:number; userId:number; teamId:number|null; anomalyType:WorkShiftAnomalyType; severity:WorkShiftAnomalySeverity; referenceId:string; windowKey:string; dedupeKey:string; detectedAt:Date; expected:Record<string,unknown>; observed:Record<string,unknown>; }

export type ExpectedWorkShiftWindow = { userId:number; teamId:number|null; assignmentId:number; plannedStartAt:Date; plannedEndAt:Date; breakPolicyMinutes:number|null };
export type ScannedWorkShiftSession = { id:number; status:"active"|"paused"|"ended"|"cancelled"; pausedAt:Date|null; pausedSeconds:number };
export type WorkShiftAnomalyScanStore = {
  listExpectedWindows(tenantId:number, now:Date):Promise<ExpectedWorkShiftWindow[]>;
  findSessionForWindow(tenantId:number, userId:number, plannedStartAt:Date, plannedEndAt:Date):Promise<ScannedWorkShiftSession|null>;
};

function positiveNumber(value:unknown):number{return typeof value==="number"&&Number.isFinite(value)&&value>0?value:0;}
function anomaly(input:{tenantId:number;userId:number;teamId:number|null;anomalyType:WorkShiftAnomalyType;severity:WorkShiftAnomalySeverity;referenceId:string;windowKey:string;detectedAt:Date;expected:Record<string,unknown>;observed:Record<string,unknown>}):WorkShiftAnomalyCandidate{return{...input,dedupeKey:buildWorkShiftPendingDedupeKey({tenantId:input.tenantId,userId:input.userId,anomalyType:input.anomalyType,referenceId:input.referenceId,windowKey:input.windowKey})};}
function candidate(event:WorkShiftOperationalEvent,anomalyType:WorkShiftAnomalyType,severity:WorkShiftAnomalySeverity,expected:Record<string,unknown>,observed:Record<string,unknown>):WorkShiftAnomalyCandidate{const referenceId=`session:${event.sessionId}`;const windowKey=String(event.snapshot.scheduledStartAt??event.occurredAt.toISOString());return anomaly({tenantId:event.tenantId,userId:event.userId,teamId:event.teamId,anomalyType,severity,referenceId,windowKey,detectedAt:event.occurredAt,expected,observed});}

export function detectEventAnomalies(event:WorkShiftOperationalEvent):WorkShiftAnomalyCandidate[]{const anomalies:WorkShiftAnomalyCandidate[]=[];const snapshot=event.snapshot;const lateStartSeconds=positiveNumber(snapshot.lateStartSeconds);const earlyEndSeconds=positiveNumber(snapshot.earlyEndSeconds);const overtimeSeconds=positiveNumber(snapshot.overtimeSeconds);const pausedSeconds=positiveNumber(snapshot.pausedSeconds);const breakPolicyMinutes=positiveNumber(snapshot.breakPolicyMinutes);if(event.eventType==="started"&&lateStartSeconds>0)anomalies.push(candidate(event,"late_start","warning",{scheduledStartAt:snapshot.scheduledStartAt??null},{lateStartSeconds}));if(event.eventType==="ended"&&earlyEndSeconds>0)anomalies.push(candidate(event,"early_end","warning",{scheduledEndAt:snapshot.scheduledEndAt??null},{earlyEndSeconds}));if(event.eventType==="ended"&&overtimeSeconds>0)anomalies.push(candidate(event,"overtime","warning",{scheduledEndAt:snapshot.scheduledEndAt??null},{overtimeSeconds}));if((event.eventType==="resumed"||event.eventType==="ended")&&breakPolicyMinutes>0&&pausedSeconds>breakPolicyMinutes*60)anomalies.push(candidate(event,"excessive_pause","warning",{breakPolicyMinutes},{pausedSeconds}));return anomalies;}

export async function scanExpectedWorkShiftAnomalies(input:{tenantId:number;now:Date},store:WorkShiftAnomalyScanStore):Promise<WorkShiftAnomalyCandidate[]>{
  const result:WorkShiftAnomalyCandidate[]=[];const windows=await store.listExpectedWindows(input.tenantId,input.now);
  for(const window of windows){
    const session=await store.findSessionForWindow(input.tenantId,window.userId,window.plannedStartAt,window.plannedEndAt);const windowKey=window.plannedStartAt.toISOString();const referenceId=`assignment:${window.assignmentId}`;
    if(input.now>=window.plannedStartAt&&!session){result.push(anomaly({tenantId:input.tenantId,userId:window.userId,teamId:window.teamId,anomalyType:"missing_start",severity:"warning",referenceId,windowKey,detectedAt:input.now,expected:{plannedStartAt:window.plannedStartAt.toISOString(),plannedEndAt:window.plannedEndAt.toISOString()},observed:{session:null}}));continue;}
    if(session&&input.now>=window.plannedEndAt&&(session.status==="active"||session.status==="paused")){result.push(anomaly({tenantId:input.tenantId,userId:window.userId,teamId:window.teamId,anomalyType:"missing_end",severity:"critical",referenceId,windowKey,detectedAt:input.now,expected:{plannedEndAt:window.plannedEndAt.toISOString()},observed:{sessionId:session.id,status:session.status}}));}
    if(session?.status==="paused"&&session.pausedAt&&window.breakPolicyMinutes&&window.breakPolicyMinutes>0){const currentPauseSeconds=Math.max(0,Math.floor((input.now.getTime()-session.pausedAt.getTime())/1000));const totalPauseSeconds=session.pausedSeconds+currentPauseSeconds;if(totalPauseSeconds>window.breakPolicyMinutes*60)result.push(anomaly({tenantId:input.tenantId,userId:window.userId,teamId:window.teamId,anomalyType:"excessive_pause",severity:"warning",referenceId,windowKey,detectedAt:input.now,expected:{breakPolicyMinutes:window.breakPolicyMinutes},observed:{sessionId:session.id,pausedSeconds:totalPauseSeconds}}));}
  }
  return result;
}

export type WorkShiftOperationalEventPublisher=(event:WorkShiftOperationalEvent)=>Promise<void>;let operationalPublisher:WorkShiftOperationalEventPublisher|null=null;
export function configureWorkShiftOperationalEventPublisher(publisher:WorkShiftOperationalEventPublisher|null){operationalPublisher=publisher;}
export async function publishWorkShiftOperationalEvent(event:WorkShiftOperationalEvent):Promise<void>{if(!operationalPublisher)return;await operationalPublisher(event);}
