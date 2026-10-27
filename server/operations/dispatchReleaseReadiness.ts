export const REQUIRED_REAL_GATES = ["DISPATCH-REAL-01", "DISPATCH-REAL-02", "DISPATCH-REAL-03"] as const;

type GateId = (typeof REQUIRED_REAL_GATES)[number];
export type ReadinessResult = {
  decision: "NO_GO" | "MANUAL_GO_REVIEW_REQUIRED";
  production_approved: false;
  ci_not_assessed: true;
  manifest_valid: boolean;
  required_gates: 3;
  evidenced_gates: number;
  pending_gate_ids: string[];
  findings: string[];
};
const allowed = new Set(["PENDING_REAL_ENVIRONMENT", "PASSED_REAL_ENVIRONMENT", "FAILED_REAL_ENVIRONMENT"]);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isValidReviewDate(v: unknown, now: Date): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00.000Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v <= now.toISOString().slice(0, 10);
}
function isUtcTimestamp(v: unknown, now: Date): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)) return false;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime()) || d.getTime() > now.getTime()) return false;
  return d.toISOString() === (v.includes(".") ? v : v.replace("Z", ".000Z"));
}
function isReviewedEvidenceTimestamp(v: unknown, reviewDate: unknown, now: Date): boolean {
  return isUtcTimestamp(v, now) &&
    typeof v === "string" &&
    typeof reviewDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(reviewDate) &&
    v.slice(0, 10) <= reviewDate;
}
function isSafeEvidenceUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}
function isMeaningfulGateText(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const text = v.trim().toLowerCase();
  if (!text) return false;
  return !new Set(["tbd", "unknown", "pending", "n/a", "-"]).has(text);
}
function isNamedEvidenceOwner(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const owner = v.trim().toLowerCase();
  if (!owner) return false;
  return !new Set(["to_be_assigned", "tbd", "unknown", "unassigned", "none", "n/a", "pending", "-"]).has(owner);
}
function isFullGitSha(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{40}$/i.test(v);
}
function hasComponentVersions(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const entries = Object.entries(v);
  return entries.length > 0 && entries.every(([component, version]) =>
    isMeaningfulGateText(component) && isMeaningfulGateText(version)
  );
}

/**
 * Evaluates already recorded evidence only. Never changes runtime state,
 * reads secrets, contacts other services, or approves production.
 */
export function evaluateDispatchReadiness(manifest: unknown, now = new Date()): ReadinessResult {
  const findings: string[] = [];
  const pending: string[] = [];
  const evidencedCodeShas = new Set<string>();
  const evidencedComponentVersions = new Set<string>();
  let evidenced = 0;

  if (!isRecord(manifest) || manifest.schema_version !== 1 ||
      manifest.project !== "AXE Dispatch" ||
      !isValidReviewDate(manifest.review_date, now) ||
      manifest.release_status !== "NOT_APPROVED_FOR_PRODUCTION") {
    findings.push("INVALID_RELEASE_MANIFEST");
  }
  const policy = isRecord(manifest) && isRecord(manifest.policy) ? manifest.policy : {};
  if (policy.manual_environment_tests_required_before_production_go !== true ||
      policy.do_not_claim_unperformed_tests_as_passed !== true ||
      policy.do_not_disable_technical_security_gates !== true) {
    findings.push("POLICY_UNSAFE");
  }

  const list = isRecord(manifest) ? manifest.external_environment_tests : undefined;
  if (!Array.isArray(list)) findings.push("REQUIRED_GATES_UNAVAILABLE");
  const gates = new Map<GateId, Record<string, unknown>>();
  for (const row of Array.isArray(list) ? list : []) {
    if (!isRecord(row) || !REQUIRED_REAL_GATES.includes(row.id as GateId)) {
      findings.push("UNKNOWN_GATE");
      continue;
    }
    const id = row.id as GateId;
    if (gates.has(id)) findings.push("DUPLICATE_GATE");
    else gates.set(id, row);
  }
  for (const id of REQUIRED_REAL_GATES) {
    const gate = gates.get(id);
    if (!gate) {
      pending.push(id);
      findings.push("MISSING_GATE");
      continue;
    }
    if (gate.gate !== "PRODUCTION_GO" ||
        !allowed.has(gate.status as string) ||
        !isMeaningfulGateText(gate.procedure) ||
        !isMeaningfulGateText(gate.evidence_required)) {
      pending.push(id);
      findings.push("INVALID_GATE");
      continue;
    }
    if (gate.status !== "PASSED_REAL_ENVIRONMENT") {
      pending.push(id);
      if (gate.status === "FAILED_REAL_ENVIRONMENT") findings.push("FAILED_REAL_TEST");
      continue;
    }
    if (!isNamedEvidenceOwner(gate.owner) ||
        !isFullGitSha(gate.code_sha) ||
        !hasComponentVersions(gate.component_versions) ||
        !isReviewedEvidenceTimestamp(gate.executed_at, isRecord(manifest) ? manifest.review_date : undefined, now) || !isSafeEvidenceUrl(gate.evidence_url)) {
      pending.push(id);
      findings.push("INCOMPLETE_EVIDENCE");
      continue;
    }
    evidenced++;
    evidencedCodeShas.add(gate.code_sha as string);
    evidencedComponentVersions.add(JSON.stringify(Object.entries(gate.component_versions as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b))));
  }
  const evidenceSetConsistent = evidencedCodeShas.size <= 1;
  const componentVersionsConsistent = evidencedComponentVersions.size <= 1;
  if (!evidenceSetConsistent) findings.push("INCONSISTENT_EVIDENCE_SET");
  if (!componentVersionsConsistent) findings.push("INCONSISTENT_COMPONENT_VERSIONS");
  const structureErrors = ["INVALID_RELEASE_MANIFEST", "POLICY_UNSAFE", "REQUIRED_GATES_UNAVAILABLE", "UNKNOWN_GATE", "DUPLICATE_GATE", "MISSING_GATE", "INVALID_GATE"];
  const manifestValid = !findings.some(f => structureErrors.includes(f));
  return {
    decision: manifestValid && pending.length === 0 && evidenceSetConsistent && componentVersionsConsistent ? "MANUAL_GO_REVIEW_REQUIRED" : "NO_GO",
    production_approved: false,
    ci_not_assessed: true,
    manifest_valid: manifestValid,
    required_gates: 3,
    evidenced_gates: evidenced,
    pending_gate_ids: pending,
    findings: [...new Set(findings)],
  };
}


/** Markdown sanitizado para GitHub Actions; só usa contadores e IDs fixos. */
export function formatDispatchReadinessSummary(result: ReadinessResult): string {
  const pending = new Set(result.pending_gate_ids);
  const statuses = REQUIRED_REAL_GATES.map(id =>
    "| " + id + " | " + (pending.has(id) ? "Pendente" : "Evidência registrada para revisão") + " |"
  );
  return [
    "### AXE Dispatch — liberação operacional",
    "",
    "**Status operacional: " + result.decision + "**",
    "",
    "- Evidências mínimas registradas: **" + result.evidenced_gates + "/3**",
    "- Autorização de produção: **NÃO**",
    "- CI técnica: **verificada em etapa independente**",
    "",
    "| Gate | Evidência documental |",
    "| --- | --- |",
    ...statuses,
    "",
    "Aprovação técnica da CI não substitui homologação real e decisão humana de GO/NO-GO.",
    "",
  ].join("\n");
}
