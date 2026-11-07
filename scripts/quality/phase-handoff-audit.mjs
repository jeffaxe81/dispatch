import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/**
 * Developer-stage evidence inventory only. Does not contact GitHub, certify
 * evidence authenticity, alter operational readiness or approve production.
 */
export const PHASE_IDS = ["F01","F02","F03","F04","F05","F06"];
export const PHASE_NAMES = [
  "Escopo e arquitetura",
  "Implementação versionada",
  "Qualidade automatizada e build",
  "Revisão independente de segurança",
  "Homologação real e aceite operacional",
  "Aprovação de release e distribuição",
];
const EVIDENCE_KINDS = {
  F01: new Set(["documentation"]),
  F02: new Set(["merged_pull_request"]),
  F03: new Set(["github_actions_run"]),
  F04: new Set(["security_review"]),
  F05: new Set(["real_environment_report"]),
  F06: new Set(["release_approval"]),
};
const isObject = x => x !== null && typeof x === "object" && !Array.isArray(x);
const SHA_RE = /^[a-f0-9]{40}$/;

function validEvidence(item, repository, phaseId) {
  if (!isObject(item) || !EVIDENCE_KINDS[phaseId]?.has(item.kind) ||
      !SHA_RE.test(item.sha || "")) return false;
  try {
    const u = new URL(item.url);
    if (u.protocol !== "https:" || u.hostname !== "github.com" ||
        u.username || u.password || u.search || u.hash ||
        !u.pathname.startsWith("/" + repository + "/")) return false;
    const tail = u.pathname.slice(repository.length + 2);
    if (item.kind === "documentation") return /^blob\/[a-f0-9]{40}\/[a-zA-Z0-9/_.-]+\.md$/.test(tail);
    if (item.kind === "merged_pull_request") return /^pull\/[1-9]\d*$/.test(tail);
    if (item.kind === "github_actions_run") return /^actions\/runs\/[1-9]\d*$/.test(tail);
    if (item.kind === "security_review") return /^pull\/[1-9]\d*$/.test(tail);
    if (item.kind === "real_environment_report") return /^issues\/[1-9]\d*$/.test(tail);
    if (item.kind === "release_approval") return /^releases\/tag\/[a-zA-Z0-9_.-]+$/.test(tail);
    return false;
  } catch { return false; }
}

export function evaluatePhaseHandoffs(manifest, expectedProject, expectedRepo) {
  const errors = [], missing = [], stages = [];
  const rows = Array.isArray(manifest?.phases) ? manifest.phases : [];
  if (!isObject(manifest) || manifest.schema_version !== 1 ||
      manifest.project !== expectedProject || manifest.repository !== expectedRepo ||
      manifest.production_approved !== false ||
      manifest.manual_release_required !== true ||
      manifest.evidence_urls_are_not_automatically_verified !== true ||
      rows.length !== PHASE_IDS.length) errors.push("INVALID_PHASE_MANIFEST");

  let recorded = 0, pendingSeen = false;
  for (let i = 0; i < PHASE_IDS.length; i++) {
    const row = rows[i], id = PHASE_IDS[i], title = PHASE_NAMES[i];
    if (!isObject(row) || row.id !== id ||
        !["EVIDENCE_RECORDED", "PENDING"].includes(row.status)) {
      errors.push("INVALID_PHASE_" + id);
      pendingSeen = true;
      stages.push({id,title,status:"PENDING",percent:0});
      missing.push(id);
      continue;
    }
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    if (!evidence.every(item => validEvidence(item, expectedRepo, id))) {
      errors.push("INVALID_EVIDENCE_" + id);
    }
    if (row.status === "EVIDENCE_RECORDED") {
      if (!evidence.length || pendingSeen) errors.push("UNSUPPORTED_PASSAGE_" + id);
      recorded++;
    } else {
      pendingSeen = true;
      missing.push(id);
    }
    stages.push({id,title,status:row.status,percent:row.status==="EVIDENCE_RECORDED"?100:0});
  }

  const valid = errors.length === 0;
  // On tampered/invalid manifests, fail closed instead of advertising progress.
  return {
    manifest_valid: valid,
    phase_evidence_percent: valid ? Math.floor(recorded * 100 / PHASE_IDS.length) : 0,
    recorded_phases: valid ? recorded : 0,
    required_phases: PHASE_IDS.length,
    phases: stages,
    pending_phase_ids: missing,
    errors: [...new Set(errors)],
    decision: "NO_GO",
    production_approved: false,
    evidence_verification: "METADATA_ONLY",
  };
}

export function formatPhaseSummary(result) {
  return [
    "### Passagem de fases — evidências técnicas",
    "",
    "**Cobertura documental: " + result.phase_evidence_percent + "% (" +
       result.recorded_phases + "/" + result.required_phases + " fases)**",
    "",
    "| Fase | Evidência registrada |",
    "| --- | --- |",
    ...result.phases.map(s => "| " + s.id + " — " + s.title + " | " +
      (s.status === "EVIDENCE_RECORDED" ? "100% — registro técnico" : "0% — pendente") + " |"),
    "",
    "**Produção: NÃO APROVADA · NO-GO**",
    "",
    "O relatório valida a estrutura e o endereço das referências, não a autenticidade remota.",
    "A passagem formal requer revisão independente; homologação real usa um manifesto separado.",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const cfg = {
      "dispatch-brusque-live": ["AXE Despacho Web", "jeffaxe81/dispatch"],
      "axe-despacho-mobile": ["AXE Despacho Mobile", "jeffaxe81/axe-despacho-mobile"],
    }[pkg.name];
    if (!cfg) throw Error("Project not approved");
    const manifest = JSON.parse(readFileSync(new URL("../../docs/quality/phase-handoff-evidence.json", import.meta.url), "utf8"));
    const result = evaluatePhaseHandoffs(manifest, ...cfg);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatPhaseSummary(result) + "\n", "utf8");
    }
    if (!result.manifest_valid) process.exitCode = 2;
  } catch {
    process.stderr.write("PHASE_HANDOFF_MANIFEST_UNREADABLE\n");
    process.exitCode = 2;
  }
}
