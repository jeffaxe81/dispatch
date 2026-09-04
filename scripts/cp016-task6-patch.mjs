import fs from "node:fs";

const path = "server/db.ts";
let source = fs.readFileSync(path, "utf8");

if (source.includes("export async function upsertOperationalPresence")) {
  console.log("CP-016 Task 6 patch already applied.");
  process.exit(0);
}

const schemaImport = `import { workSessions, workSessionEvents } from "../drizzle/cp016Schema";`;
if (!source.includes(schemaImport)) throw new Error("CP-016 schema import anchor not found");
source = source.replace(
  schemaImport,
  `import { operationalPresence, workSessions, workSessionEvents } from "../drizzle/cp016Schema";`,
);

const policyImport = `import { canUpdateRoleDefinition, isRoleScopeAssignmentValid } from "./accessPolicies";`;
if (!source.includes(policyImport)) throw new Error("Policy import anchor not found");
source = source.replace(
  policyImport,
  `${policyImport}\nimport { resolveOperationalPresenceState } from "./operationalPresence";`,
);

const statusAnchor = `export async function updateTeamStatus(input: { teamId: number; status: typeof teams.$inferInsert.status; actorUserId: number }) {`;
if (!source.includes(statusAnchor)) throw new Error("updateTeamStatus anchor not found");
const presenceHelpers = `type OperationalPresenceSyncInput = {\n  teamId: number;\n  userId: number | null;\n  workSessionId: number | null;\n  teamStatus: typeof teams.$inferSelect.status;\n  inShift: boolean;\n  shiftPaused: boolean;\n  changedAt: Date;\n};\n\nasync function syncOperationalPresenceTx(tx: any, input: OperationalPresenceSyncInput) {\n  const state = resolveOperationalPresenceState({\n    inShift: input.inShift,\n    shiftPaused: input.shiftPaused,\n    teamStatus: input.teamStatus,\n  });\n  const existing = (await tx\n    .select({ id: operationalPresence.id })\n    .from(operationalPresence)\n    .where(eq(operationalPresence.teamId, input.teamId))\n    .orderBy(desc(operationalPresence.lastChangedAt))\n    .limit(1))[0];\n  const values = {\n    userId: input.userId,\n    teamId: input.teamId,\n    workSessionId: input.workSessionId,\n    status: state.status,\n    availableForDispatch: state.availableForDispatch,\n    lastChangedAt: input.changedAt,\n  };\n  if (existing) {\n    await tx.update(operationalPresence).set(values).where(eq(operationalPresence.id, existing.id));\n  } else {\n    await tx.insert(operationalPresence).values(values);\n  }\n  return state;\n}\n\nexport async function upsertOperationalPresence(input: OperationalPresenceSyncInput) {\n  const db = await requireDb();\n  return db.transaction(async tx => syncOperationalPresenceTx(tx, input));\n}\n\nexport async function getEligibleTeamCandidates() {\n  const db = await requireDb();\n  return db\n    .select({ team: teams, presence: operationalPresence })\n    .from(operationalPresence)\n    .innerJoin(teams, eq(operationalPresence.teamId, teams.id))\n    .where(and(\n      eq(teams.active, true),\n      eq(operationalPresence.status, "available"),\n      eq(operationalPresence.availableForDispatch, true),\n    ))\n    .orderBy(teams.code);\n}\n\n`;
source = source.replace(statusAnchor, presenceHelpers + statusAnchor);

const oldStatus = `export async function updateTeamStatus(input: { teamId: number; status: typeof teams.$inferInsert.status; actorUserId: number }) {\n  const db = await requireDb();\n  await db.transaction(async tx => {\n    const before = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];\n    if (!before) throw new Error("Equipe não encontrada.");\n    await tx.update(teams).set({ status: input.status }).where(eq(teams.id, input.teamId));\n    await tx.insert(auditLogs).values({ resourceType: "team", resourceId: input.teamId, action: "status_updated", actorUserId: input.actorUserId, beforeData: { status: before.status }, afterData: { status: input.status } });\n  });\n}`;
if (!source.includes(oldStatus)) throw new Error("updateTeamStatus block not found");
const newStatus = `export async function updateTeamStatus(input: { teamId: number; status: typeof teams.$inferInsert.status; actorUserId: number }) {\n  const db = await requireDb();\n  await db.transaction(async tx => {\n    const before = (await tx.select().from(teams).where(eq(teams.id, input.teamId)).limit(1))[0];\n    if (!before) throw new Error("Equipe não encontrada.");\n    await tx.update(teams).set({ status: input.status }).where(eq(teams.id, input.teamId));\n    const session = (await tx.select().from(workSessions).where(and(eq(workSessions.teamId, input.teamId), inArray(workSessions.status, ["open", "paused"]))).orderBy(desc(workSessions.startedAt)).limit(1))[0];\n    await syncOperationalPresenceTx(tx, {\n      teamId: input.teamId,\n      userId: session?.userId ?? null,\n      workSessionId: session?.id ?? null,\n      teamStatus: input.status,\n      inShift: Boolean(before.shiftStartedAt && !before.shiftEndsAt),\n      shiftPaused: Boolean(before.shiftPausedAt),\n      changedAt: new Date(),\n    });\n    await tx.insert(auditLogs).values({ resourceType: "team", resourceId: input.teamId, action: "status_updated", actorUserId: input.actorUserId, beforeData: { status: before.status }, afterData: { status: input.status } });\n  });\n}`;
source = source.replace(oldStatus, newStatus);

const eventAnchor = `    await tx.insert(workSessionEvents).values({\n      workSessionId: session.id,\n      eventType: persistence.eventType,\n      occurredAt: now,\n      actorUserId: input.actorUserId,\n      reason: null,\n      metadata: { teamId: input.teamId, legacySnapshotPreserved: true },\n    });\n\n    await tx.insert(auditLogs).values({`;
if (!source.includes(eventAnchor)) throw new Error("work-session event anchor not found");
source = source.replace(
  eventAnchor,
  `    await tx.insert(workSessionEvents).values({\n      workSessionId: session.id,\n      eventType: persistence.eventType,\n      occurredAt: now,\n      actorUserId: input.actorUserId,\n      reason: null,\n      metadata: { teamId: input.teamId, legacySnapshotPreserved: true },\n    });\n    await syncOperationalPresenceTx(tx, {\n      teamId: input.teamId,\n      userId: session.userId,\n      workSessionId: session.id,\n      teamStatus: before.status,\n      inShift: input.action !== "end",\n      shiftPaused: input.action === "pause",\n      changedAt: now,\n    });\n\n    await tx.insert(auditLogs).values({`,
);

fs.writeFileSync(path, source);
console.log("CP-016 Task 6 patch applied.");
