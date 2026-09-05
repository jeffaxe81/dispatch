import type { WorkShiftAction, WorkShiftEventType, WorkShiftSource } from "../shared/workShifts";
import { resolveWorkShiftTransition, type OpenWorkShiftSnapshot, type WorkShiftLegacyPatch, type WorkShiftSessionPatch } from "./workShiftDomain";
import type { ResolvedUserWorkShiftPlan } from "./workShiftScheduleService";
import { publishWorkShiftOperationalEvent } from "./workShiftAnomalyService";

export type WorkShiftCreateSession = { userId:number; teamId:number|null; source:WorkShiftSource; startedAt:Date; pausedAt:null; endedAt:null; status:"active"; pausedSeconds:number; workedSeconds:number; scheduleAssignmentId:number|null; scheduledStartAt:Date|null; scheduledEndAt:Date|null; lateStartSeconds:number; earlyEndSeconds:number; overtimeSeconds:number };
export type WorkShiftPlanningResolver = { resolveForUser(userId:number, instant:Date):Promise<ResolvedUserWorkShiftPlan|null> };
export type WorkShiftEventSnapshot = Record<string, string|number|boolean|null>;
export type WorkShiftStore = {
  getOpenSession(userId:number):Promise<OpenWorkShiftSnapshot|null>;
  createSession(input:WorkShiftCreateSession):Promise<{id:number}>;
  updateSession(sessionId:number, patch:WorkShiftSessionPatch):Promise<void>;
  appendEvent(input:{sessionId:number;eventType:WorkShiftEventType;actorUserId:number;occurredAt:Date;beforeData:WorkShiftEventSnapshot|null;afterData:WorkShiftEventSnapshot|null}):Promise<void>;
  mirrorTeam(teamId:number, patch:WorkShiftLegacyPatch):Promise<void>;
};

function elapsedSeconds(from:Date,to:Date){return Math.max(0,Math.floor((to.getTime()-from.getTime())/1000));}
async function resolvePlanningForStart(resolver:WorkShiftPlanningResolver|undefined,userId:number,now:Date){if(resolver)return resolver.resolveForUser(userId,now);const {resolveRuntimeWorkShiftPlan}=await import("./workShiftPlanningRuntime");return resolveRuntimeWorkShiftPlan(userId,now);}
async function hydratePlanningSnapshot(current:OpenWorkShiftSnapshot){const selected=current.scheduleAssignmentId!==undefined||current.scheduledStartAt!==undefined||current.scheduledEndAt!==undefined;if(selected)return current;const {loadRuntimeWorkShiftPlanningSnapshot}=await import("./workShiftPlanningRuntime");const persisted=await loadRuntimeWorkShiftPlanningSnapshot(current.id);return persisted?{...current,...persisted}:current;}
function resolveStartPlanningSnapshot(plan:ResolvedUserWorkShiftPlan|null,now:Date){const scheduledStartAt=plan?.plannedStartAt??null;const scheduledEndAt=plan?.plannedEndAt??null;return{scheduleAssignmentId:plan?.assignmentId??null,scheduledStartAt,scheduledEndAt,lateStartSeconds:scheduledStartAt?elapsedSeconds(scheduledStartAt,now):0,earlyEndSeconds:0,overtimeSeconds:0};}
function enrichEndPatch(current:OpenWorkShiftSnapshot,patch:WorkShiftSessionPatch,now:Date):WorkShiftSessionPatch{if(patch.status!=="ended")return patch;const scheduledStartAt=current.scheduledStartAt??null;const scheduledEndAt=current.scheduledEndAt??null;const workedSeconds=patch.workedSeconds??0;const plannedWorkSeconds=scheduledStartAt&&scheduledEndAt?elapsedSeconds(scheduledStartAt,scheduledEndAt):0;return{...patch,earlyEndSeconds:scheduledEndAt?elapsedSeconds(now,scheduledEndAt):0,overtimeSeconds:plannedWorkSeconds>0?Math.max(0,workedSeconds-plannedWorkSeconds):0};}
export function snapshotOpenSession(value:OpenWorkShiftSnapshot|null):WorkShiftEventSnapshot|null{if(!value)return null;return{id:value.id,startedAt:value.startedAt.toISOString(),pausedAt:value.pausedAt?.toISOString()??null,endedAt:value.endedAt?.toISOString()??null,status:value.status,pausedSeconds:value.pausedSeconds,scheduleAssignmentId:value.scheduleAssignmentId??null,scheduledStartAt:value.scheduledStartAt?.toISOString()??null,scheduledEndAt:value.scheduledEndAt?.toISOString()??null,lateStartSeconds:value.lateStartSeconds??0,earlyEndSeconds:value.earlyEndSeconds??0,overtimeSeconds:value.overtimeSeconds??0};}
function snapshotCreatedSession(sessionId:number,input:WorkShiftCreateSession):WorkShiftEventSnapshot{return{id:sessionId,userId:input.userId,teamId:input.teamId,source:input.source,startedAt:input.startedAt.toISOString(),pausedAt:null,endedAt:null,status:input.status,pausedSeconds:input.pausedSeconds,workedSeconds:input.workedSeconds,scheduleAssignmentId:input.scheduleAssignmentId,scheduledStartAt:input.scheduledStartAt?.toISOString()??null,scheduledEndAt:input.scheduledEndAt?.toISOString()??null,lateStartSeconds:input.lateStartSeconds,earlyEndSeconds:input.earlyEndSeconds,overtimeSeconds:input.overtimeSeconds};}
function snapshotUpdatedSession(current:OpenWorkShiftSnapshot,patch:WorkShiftSessionPatch):WorkShiftEventSnapshot{return{id:current.id,startedAt:current.startedAt.toISOString(),pausedAt:patch.pausedAt===undefined?current.pausedAt?.toISOString()??null:patch.pausedAt?.toISOString()??null,endedAt:patch.endedAt?.toISOString()??current.endedAt?.toISOString()??null,status:patch.status,pausedSeconds:patch.pausedSeconds??current.pausedSeconds,scheduleAssignmentId:current.scheduleAssignmentId??null,scheduledStartAt:current.scheduledStartAt?.toISOString()??null,scheduledEndAt:current.scheduledEndAt?.toISOString()??null,lateStartSeconds:current.lateStartSeconds??0,earlyEndSeconds:patch.earlyEndSeconds??current.earlyEndSeconds??0,overtimeSeconds:patch.overtimeSeconds??current.overtimeSeconds??0,...(patch.workedSeconds===undefined?{}:{workedSeconds:patch.workedSeconds})};}
async function publishPersistedOperationalEvent(input:{tenantId?:number;userId:number;teamId:number|null;sessionId:number;eventType:WorkShiftEventType;occurredAt:Date;snapshot:WorkShiftEventSnapshot}){if(input.tenantId===undefined)return;await publishWorkShiftOperationalEvent({tenantId:input.tenantId,userId:input.userId,teamId:input.teamId,sessionId:input.sessionId,eventType:input.eventType,occurredAt:input.occurredAt,snapshot:input.snapshot});}

export async function executeOwnWorkShiftAction(store:WorkShiftStore,input:{tenantId?:number;userId:number;teamId:number|null;action:WorkShiftAction;source?:WorkShiftSource;now?:Date},planningResolver?:WorkShiftPlanningResolver){
  const now=input.now??new Date();const source=input.source??"self";const current=await store.getOpenSession(input.userId);const transition=resolveWorkShiftTransition(current,input.action,now);
  if(transition.mode==="create"){
    const plan=await resolvePlanningForStart(planningResolver,input.userId,now);const createInput:WorkShiftCreateSession={userId:input.userId,teamId:input.teamId,source,...transition.session,...resolveStartPlanningSnapshot(plan,now)};const created=await store.createSession(createInput);const afterData=snapshotCreatedSession(created.id,createInput);
    await store.appendEvent({sessionId:created.id,eventType:transition.eventType,actorUserId:input.userId,occurredAt:now,beforeData:null,afterData});
    await publishPersistedOperationalEvent({tenantId:input.tenantId,userId:input.userId,teamId:input.teamId,sessionId:created.id,eventType:transition.eventType,occurredAt:now,snapshot:afterData});
    if(input.teamId!==null)await store.mirrorTeam(input.teamId,transition.legacyPatch);
    return{sessionId:created.id,eventType:transition.eventType};
  }
  if(!current)throw new Error("Sessão de jornada ausente durante atualização.");
  const effectiveCurrent=transition.sessionPatch.status==="ended"?await hydratePlanningSnapshot(current):current;const sessionPatch=enrichEndPatch(effectiveCurrent,transition.sessionPatch,now);await store.updateSession(effectiveCurrent.id,sessionPatch);const afterData=snapshotUpdatedSession(effectiveCurrent,sessionPatch);
  await store.appendEvent({sessionId:effectiveCurrent.id,eventType:transition.eventType,actorUserId:input.userId,occurredAt:now,beforeData:snapshotOpenSession(effectiveCurrent),afterData});
  await publishPersistedOperationalEvent({tenantId:input.tenantId,userId:input.userId,teamId:input.teamId,sessionId:effectiveCurrent.id,eventType:transition.eventType,occurredAt:now,snapshot:afterData});
  if(input.teamId!==null)await store.mirrorTeam(input.teamId,transition.legacyPatch);
  return{sessionId:effectiveCurrent.id,eventType:transition.eventType};
}
