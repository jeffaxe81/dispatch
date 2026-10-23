import type { IntegrationSystem } from "../shared/integrationContracts";

/**
 * D-012J J33: diagnostic only. This projection never includes tokens, endpoints,
 * credentials or raw adapter outcomes. It cannot authorize another probe.
 */
export type CircuitProbeAuditState = Readonly<{
  id: number;
  organizationId: number;
  system: IntegrationSystem;
  state: "closed" | "open" | "half_open";
  version: number;
  consecutiveFailures: number;
  executionConsumedAtMs: number | null;
}>;

export type CircuitProbeAuditEntry = Readonly<{
  resourceId: number;
  action: string;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
}>;

export type ProbeAuditInput = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  expectedConsumedVersion: number;
}>;

export type ProbeAuditStatus =
  | "not_found"
  | "manual_review_required"
  | "circuit_closed_verified"
  | "circuit_opened_verified"
  | "evidence_missing"
  | "inconsistent"
  | "history_advanced";

export type ProbeAuditResult = Readonly<ProbeAuditInput & {
  status: ProbeAuditStatus;
  permitsReplay: false;
  permitsProbe: false;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

export type ProbeAuditReader = Readonly<{
  load(input: Pick<ProbeAuditInput, "organizationId" | "system">):
    Promise<CircuitProbeAuditState | null>;
  readAudit(input: { resourceId: number }): Promise<readonly CircuitProbeAuditEntry[]>;
}>;

const ACTION_CONSUMED = "integration.circuit.probe_intent.consumed";
const ACTION_SUCCESS = "integration.circuit.probe.succeeded";
const ACTION_FAILURE = "integration.circuit.probe.failed";
const ALLOWED_SYSTEMS = new Set(["neo", "inventory", "crm"]);
const AUDIT_KEYS = ["organizationId", "system", "state", "version", "consecutiveFailures"];
export const J33_MAX_AUDIT_ROWS = 200;

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function validCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function validScope(input: ProbeAuditInput): boolean {
  return !!input && validId(input.organizationId)
    && ALLOWED_SYSTEMS.has(input.system)
    && validId(input.expectedConsumedVersion)
    && input.expectedConsumedVersion < Number.MAX_SAFE_INTEGER;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return keys.length === AUDIT_KEYS.length && keys.every(key => AUDIT_KEYS.includes(key));
}
function validPayload(data: Record<string, unknown>, input: ProbeAuditInput): boolean {
  return isObject(data) && exactKeys(data)
    && data.organizationId === input.organizationId
    && data.system === input.system
    && ["closed", "open", "half_open"].includes(data.state as string)
    && validCounter(data.version)
    && validCounter(data.consecutiveFailures);
}
function auditMatch(entry: CircuitProbeAuditEntry, input: ProbeAuditInput,
  resourceId: number, action: string, beforeVersion: number,
  afterVersion: number, beforeState: string, afterState: string): boolean {
  return entry.resourceId === resourceId && entry.action === action
    && validPayload(entry.beforeData, input)
    && validPayload(entry.afterData, input)
    && entry.beforeData.version === beforeVersion
    && entry.afterData.version === afterVersion
    && entry.beforeData.state === beforeState
    && entry.afterData.state === afterState;
}
function result(input: ProbeAuditInput, status: ProbeAuditStatus): ProbeAuditResult {
  return Object.freeze({
    organizationId: input.organizationId,
    system: input.system,
    expectedConsumedVersion: input.expectedConsumedVersion,
    status, permitsReplay: false, permitsProbe: false,
    permitsExternalCall: false, permitsAutomaticReplay: false,
  });
}
function validState(state: CircuitProbeAuditState, input: ProbeAuditInput): boolean {
  return validId(state.id) && state.organizationId === input.organizationId
    && state.system === input.system
    && ["closed", "open", "half_open"].includes(state.state)
    && validCounter(state.version) && validCounter(state.consecutiveFailures)
    && (state.executionConsumedAtMs === null || validCounter(state.executionConsumedAtMs));
}

/**
 * Classifies evidence of a *circuit transition*, never the provider's remote
 * acceptance and never permission to replay. Matching requires two consecutive
 * CAS versions and exactly one sanitized audit record per transition.
 */
export function classifyIntegrationProbeAudit(
  input: ProbeAuditInput,
  state: CircuitProbeAuditState | null,
  entries: readonly CircuitProbeAuditEntry[],
): ProbeAuditResult {
  if (!validScope(input)) throw new Error("Escopo/versão J33 inválidos.");
  if (state === null) return result(input, "not_found");
  if (!validState(state, input) || !Array.isArray(entries)
    || entries.length >= J33_MAX_AUDIT_ROWS
    || state.version < input.expectedConsumedVersion) {
    return result(input, "inconsistent");
  }

  const v = input.expectedConsumedVersion;
  const consumes = entries.filter(entry =>
    entry.action === ACTION_CONSUMED && isObject(entry.afterData)
      && entry.afterData.version === v);
  const resolves = entries.filter(entry =>
    (entry.action === ACTION_SUCCESS || entry.action === ACTION_FAILURE)
      && isObject(entry.beforeData) && entry.beforeData.version === v);

  if (!consumes.length) return result(input, "evidence_missing");
  if (consumes.length !== 1 || !auditMatch(
    consumes[0], input, state.id, ACTION_CONSUMED, v - 1, v, "half_open", "half_open",
  ) || consumes[0].beforeData.consecutiveFailures !== consumes[0].afterData.consecutiveFailures) {
    return result(input, "inconsistent");
  }

  if (state.version > v + 1) return result(input, "history_advanced");
  if (state.version === v) {
    return result(input, state.state === "half_open"
      && state.executionConsumedAtMs !== null
      && state.consecutiveFailures === consumes[0].afterData.consecutiveFailures
      && resolves.length === 0
      ? "manual_review_required" : "inconsistent");
  }
  if (state.version !== v + 1 || state.executionConsumedAtMs !== null) {
    return result(input, "inconsistent");
  }
  if (!resolves.length) return result(input, "evidence_missing");
  if (resolves.length !== 1) return result(input, "inconsistent");

  const resolution = resolves[0];
  const success = resolution.action === ACTION_SUCCESS;
  const expectedState = success ? "closed" : "open";
  if (!auditMatch(resolution, input, state.id, resolution.action,
    v, v + 1, "half_open", expectedState)
    || resolution.beforeData.consecutiveFailures !== consumes[0].afterData.consecutiveFailures
    || resolution.afterData.consecutiveFailures !== state.consecutiveFailures
    || state.state !== expectedState) {
    return result(input, "inconsistent");
  }
  return result(input, success ? "circuit_closed_verified" : "circuit_opened_verified");
}

function assertHomologationGate(): void {
  if (process.env.NODE_ENV !== "test"
    || process.env.AXE_RUNTIME_ENV !== "homologation"
    || process.env.AXE_INTEGRATION_PROBE_J33_ENABLED !== "true") {
    throw new Error("Diagnóstico J33 desabilitado fora da homologação opt-in.");
  }
}

/**
 * Internal read-only service. No routes, jobs, mutations or real integrations.
 * The organization must be chosen by trusted server-side code, never a browser.
 */
export function createIntegrationProbeAuditReconciler(reader: ProbeAuditReader) {
  if (!reader || typeof reader.load !== "function"
    || typeof reader.readAudit !== "function") {
    throw new Error("Reader interno de auditoria J33 inválido.");
  }
  return Object.freeze({
    async reconcile(input: ProbeAuditInput): Promise<ProbeAuditResult> {
      assertHomologationGate();
      if (!validScope(input)) throw new Error("Escopo/versão J33 inválidos.");
      try {
        const state = await reader.load({
          organizationId: input.organizationId, system: input.system,
        });
        if (state === null) return result(input, "not_found");
        if (!validState(state, input)) {
          throw new Error("Snapshot fora do escopo de auditoria.");
        }
        const entries = await reader.readAudit({ resourceId: state.id });
        return classifyIntegrationProbeAudit(input, state, entries);
      } catch {
        // Never leak SQL errors, raw log fields, tokens or infrastructure data.
        throw new Error("Evidência J33 indisponível ou inconsistente.");
      }
    },
  });
}
