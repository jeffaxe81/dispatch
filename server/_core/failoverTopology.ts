export type FailoverNode = Readonly<{
  nodeId: string;
  componentId: string;
  role: "active" | "standby";
  generation: number;
  enabled: boolean;
}>;

export type FailoverTopology = Readonly<{
  topologyId: string;
  topologyVersion: "d011c1-v1";
  tenantId: string;
  componentId: string;
  generation: number;
  observedAt: string;
  nodes: readonly FailoverNode[];
}>;

export type FailoverHealthEvidence = Readonly<{
  evidenceId: string;
  tenantId: string;
  nodeId: string;
  componentId: string;
  state: "healthy" | "degraded" | "unhealthy" | "unknown";
  checkedAt: string;
  validUntil: string;
}>;

export type FailoverCoordinationContext = Readonly<{
  tenantId: string;
  componentId: string;
  ownerId: string;
  fencingToken: number;
  topologyGeneration: number;
  issuedAt: string;
  expiresAt: string;
}>;

export type FailoverTopologyInput = Readonly<{
  topology: FailoverTopology;
  healthEvidence: readonly FailoverHealthEvidence[];
  coordination: FailoverCoordinationContext;
}>;

export type FailoverTopologyReasonCode =
  | "TOPOLOGY_VALID"
  | "TOPOLOGY_INVALID"
  | "MULTIPLE_ACTIVE_NODES"
  | "ACTIVE_NODE_MISSING"
  | "HEALTH_EVIDENCE_MISSING"
  | "HEALTH_EVIDENCE_STALE"
  | "TENANT_MISMATCH"
  | "COMPONENT_MISMATCH"
  | "TOPOLOGY_GENERATION_MISMATCH"
  | "FENCING_INVALID"
  | "COORDINATION_EXPIRED";

export type FailoverTopologyValidationResult =
  | Readonly<{
      valid: true;
      reasonCode: "TOPOLOGY_VALID";
      sourceNodeId: string;
    }>
  | Readonly<{
      valid: false;
      reasonCode: Exclude<FailoverTopologyReasonCode, "TOPOLOGY_VALID">;
    }>;

const HEALTH_STATES = new Set(["healthy", "degraded", "unhealthy", "unknown"] as const);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

const parseFiniteTimestamp = (value: unknown): number | null => {
  if (!isNonEmptyString(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const invalid = (
  reasonCode: Exclude<FailoverTopologyReasonCode, "TOPOLOGY_VALID">,
): FailoverTopologyValidationResult => ({ valid: false, reasonCode });

export function validateFailoverTopologyInput(
  input: FailoverTopologyInput,
  now = new Date(),
): FailoverTopologyValidationResult {
  if (typeof input !== "object" || input === null) return invalid("TOPOLOGY_INVALID");

  const { topology, healthEvidence, coordination } = input;
  if (
    typeof topology !== "object"
    || topology === null
    || topology.topologyVersion !== "d011c1-v1"
    || !isNonEmptyString(topology.topologyId)
    || !isNonEmptyString(topology.tenantId)
    || !isNonEmptyString(topology.componentId)
    || !isPositiveInteger(topology.generation)
    || parseFiniteTimestamp(topology.observedAt) === null
    || !Array.isArray(topology.nodes)
    || topology.nodes.length === 0
    || !Array.isArray(healthEvidence)
    || typeof coordination !== "object"
    || coordination === null
  ) {
    return invalid("TOPOLOGY_INVALID");
  }

  const nodeIds = new Set<string>();
  for (const node of topology.nodes) {
    if (
      typeof node !== "object"
      || node === null
      || !isNonEmptyString(node.nodeId)
      || !isNonEmptyString(node.componentId)
      || (node.role !== "active" && node.role !== "standby")
      || !isPositiveInteger(node.generation)
      || typeof node.enabled !== "boolean"
      || nodeIds.has(node.nodeId)
    ) {
      return invalid("TOPOLOGY_INVALID");
    }
    nodeIds.add(node.nodeId);
  }

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return invalid("TOPOLOGY_INVALID");

  const evidenceIds = new Set<string>();
  const evidenceNodeIds = new Set<string>();
  for (const evidence of healthEvidence) {
    if (
      typeof evidence !== "object"
      || evidence === null
      || !isNonEmptyString(evidence.evidenceId)
      || !isNonEmptyString(evidence.tenantId)
      || !isNonEmptyString(evidence.nodeId)
      || !isNonEmptyString(evidence.componentId)
      || !HEALTH_STATES.has(evidence.state)
      || evidenceIds.has(evidence.evidenceId)
      || evidenceNodeIds.has(evidence.nodeId)
    ) {
      return invalid("TOPOLOGY_INVALID");
    }
    evidenceIds.add(evidence.evidenceId);
    evidenceNodeIds.add(evidence.nodeId);

    const checkedAtMs = parseFiniteTimestamp(evidence.checkedAt);
    const validUntilMs = parseFiniteTimestamp(evidence.validUntil);
    if (
      checkedAtMs === null
      || validUntilMs === null
      || validUntilMs <= checkedAtMs
      || checkedAtMs > nowMs
    ) {
      return invalid("TOPOLOGY_INVALID");
    }
  }

  const issuedAtMs = parseFiniteTimestamp(coordination.issuedAt);
  const expiresAtMs = parseFiniteTimestamp(coordination.expiresAt);
  if (
    !isNonEmptyString(coordination.tenantId)
    || !isNonEmptyString(coordination.componentId)
    || !isNonEmptyString(coordination.ownerId)
    || !isPositiveInteger(coordination.topologyGeneration)
    || issuedAtMs === null
    || expiresAtMs === null
    || expiresAtMs <= issuedAtMs
    || issuedAtMs > nowMs
  ) {
    return invalid("TOPOLOGY_INVALID");
  }

  if (
    coordination.tenantId !== topology.tenantId
    || healthEvidence.some(evidence => evidence.tenantId !== topology.tenantId)
  ) {
    return invalid("TENANT_MISMATCH");
  }

  if (
    coordination.componentId !== topology.componentId
    || topology.nodes.some(node => node.componentId !== topology.componentId)
    || healthEvidence.some(evidence => evidence.componentId !== topology.componentId)
  ) {
    return invalid("COMPONENT_MISMATCH");
  }

  if (
    coordination.topologyGeneration !== topology.generation
    || topology.nodes.some(node => node.generation !== topology.generation)
  ) {
    return invalid("TOPOLOGY_GENERATION_MISMATCH");
  }

  if (!isPositiveInteger(coordination.fencingToken)) {
    return invalid("FENCING_INVALID");
  }

  if (expiresAtMs <= nowMs) {
    return invalid("COORDINATION_EXPIRED");
  }

  const staleEvidence = healthEvidence.some(evidence => {
    const validUntilMs = Date.parse(evidence.validUntil);
    return validUntilMs <= nowMs;
  });
  if (staleEvidence) return invalid("HEALTH_EVIDENCE_STALE");

  const enabledActiveNodes = topology.nodes.filter(
    node => node.enabled && node.role === "active",
  );
  if (enabledActiveNodes.length === 0) return invalid("ACTIVE_NODE_MISSING");
  if (enabledActiveNodes.length > 1) return invalid("MULTIPLE_ACTIVE_NODES");

  const sourceNodeId = enabledActiveNodes[0].nodeId;
  const sourceEvidence = healthEvidence.find(
    evidence => evidence.nodeId === sourceNodeId,
  );
  if (!sourceEvidence) return invalid("HEALTH_EVIDENCE_MISSING");

  return {
    valid: true,
    reasonCode: "TOPOLOGY_VALID",
    sourceNodeId,
  };
}
