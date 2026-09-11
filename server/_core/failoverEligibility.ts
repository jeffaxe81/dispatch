import {
  validateFailoverTopologyInput,
  type FailoverTopologyInput,
  type FailoverTopologyReasonCode,
} from "./failoverTopology";

export type FailoverEligibilityInput = FailoverTopologyInput;

export type FailoverEligibilityReasonCode =
  | "FAILOVER_ELIGIBLE"
  | Exclude<FailoverTopologyReasonCode, "TOPOLOGY_VALID">
  | "SOURCE_NOT_FAILOVER_ELIGIBLE"
  | "NO_SAFE_CANDIDATE";

export type SafeFailoverCandidate = Readonly<{
  nodeId: string;
  evidenceId: string;
}>;

export type FailoverEligibilityResult =
  | Readonly<{
      eligible: true;
      reasonCode: "FAILOVER_ELIGIBLE";
      sourceNodeId: string;
      sourceEvidenceId: string;
      candidates: readonly SafeFailoverCandidate[];
    }>
  | Readonly<{
      eligible: false;
      reasonCode: Exclude<FailoverEligibilityReasonCode, "FAILOVER_ELIGIBLE">;
    }>;

const reject = (
  reasonCode: Exclude<FailoverEligibilityReasonCode, "FAILOVER_ELIGIBLE">,
): FailoverEligibilityResult => ({ eligible: false, reasonCode });

export function evaluateFailoverEligibility(
  input: FailoverEligibilityInput,
  now = new Date(),
): FailoverEligibilityResult {
  const validation = validateFailoverTopologyInput(input, now);
  if (!validation.valid) {
    return reject(validation.reasonCode);
  }

  const { topology, healthEvidence } = input;
  const sourceNodeId = validation.sourceNodeId;
  const sourceEvidence = healthEvidence.find(
    evidence => evidence.tenantId === topology.tenantId
      && evidence.componentId === topology.componentId
      && evidence.nodeId === sourceNodeId,
  );

  if (!sourceEvidence) {
    return reject("HEALTH_EVIDENCE_MISSING");
  }

  if (sourceEvidence.state !== "degraded" && sourceEvidence.state !== "unhealthy") {
    return reject("SOURCE_NOT_FAILOVER_ELIGIBLE");
  }

  const nowMs = now.getTime();
  const candidates = topology.nodes
    .filter(
      node => node.enabled
        && node.role === "standby"
        && node.nodeId !== sourceNodeId,
    )
    .flatMap(node => {
      const evidence = healthEvidence.find(
        candidateEvidence => candidateEvidence.tenantId === topology.tenantId
          && candidateEvidence.componentId === topology.componentId
          && candidateEvidence.nodeId === node.nodeId,
      );
      if (!evidence) return [];

      const validUntilMs = Date.parse(evidence.validUntil);
      if (!Number.isFinite(validUntilMs) || validUntilMs <= nowMs) return [];
      if (evidence.state !== "healthy") return [];

      return [{ nodeId: node.nodeId, evidenceId: evidence.evidenceId }];
    })
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  if (candidates.length === 0) {
    return reject("NO_SAFE_CANDIDATE");
  }

  return {
    eligible: true,
    reasonCode: "FAILOVER_ELIGIBLE",
    sourceNodeId,
    sourceEvidenceId: sourceEvidence.evidenceId,
    candidates,
  };
}
