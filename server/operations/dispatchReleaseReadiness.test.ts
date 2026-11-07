import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { evaluateDispatchReadiness, formatDispatchReadinessSummary } from "./dispatchReleaseReadiness";

const source = path.resolve(import.meta.dirname, "../../docs/quality/real-environment-pending-2026-10-23.json");
const original = () => JSON.parse(fs.readFileSync(source, "utf8"));
const now = new Date("2026-10-26T12:00:00Z");
function withEvidence(m: any) {
  m.review_date = "2026-10-25";
  for (const g of m.external_environment_tests) {
    g.status = "PASSED_REAL_ENVIRONMENT";
    g.owner = "homologation-team";
    g.executed_at = "2026-10-25T10:00:00Z";
    g.evidence_url = "https://github.com/jeffaxe81/dispatch/issues/97";
    g.code_sha = "a".repeat(40);
    g.component_versions = { dispatch: "2.19.0-rc.1", worker: "2026.11" };
  }
  return m;
}
describe("Gate passivo de release AXE Dispatch", () => {
  it("mantém NO_GO para o manifesto atual com três pendências", () => {
    expect(evaluateDispatchReadiness(original(), now)).toMatchObject({
      decision: "NO_GO", production_approved: false, ci_not_assessed: true,
      manifest_valid: true, evidenced_gates: 0, real_environment_progress_percent: 0, required_gates: 3,
      pending_gate_ids: ["DISPATCH-REAL-01", "DISPATCH-REAL-02", "DISPATCH-REAL-03"],
    });
  });
  it("falha fechado se manifesto ou política não é confiável", () => {
    expect(evaluateDispatchReadiness(null, now).decision).toBe("NO_GO");
    const m = original();
    m.policy.manual_environment_tests_required_before_production_go = false;
    expect(evaluateDispatchReadiness(m, now)).toMatchObject({decision:"NO_GO", manifest_valid:false, real_environment_progress_percent:0});
  });
  it("rejeita IDs desconhecidos, ausentes ou duplicados", () => {
    const m = original();
    m.external_environment_tests.push({...m.external_environment_tests[0]});
    expect(evaluateDispatchReadiness(m, now).findings).toContain("DUPLICATE_GATE");
    m.external_environment_tests[0].id = "UNKNOWN";
    const result = evaluateDispatchReadiness(m, now);
    expect(result.findings).toContain("UNKNOWN_GATE");
    expect(result.pending_gate_ids).toContain("DISPATCH-REAL-01");
  });
  it("não considera concluído gate sem responsável, data UTC válida e URL HTTPS", () => {
    const m = withEvidence(original());
    m.external_environment_tests[0].owner = "to_be_assigned";
    m.external_environment_tests[1].evidence_url = "http://example.com";
    m.external_environment_tests[2].executed_at = "2027-12-01T00:00:00Z";
    expect(evaluateDispatchReadiness(m, now)).toMatchObject({
      decision:"NO_GO", evidenced_gates:0,
      pending_gate_ids:["DISPATCH-REAL-01","DISPATCH-REAL-02","DISPATCH-REAL-03"],
    });
  });
  it("não concede GO, mesmo com os três gates evidenciados", () => {
    expect(evaluateDispatchReadiness(withEvidence(original()), now)).toMatchObject({
      decision: "MANUAL_GO_REVIEW_REQUIRED", production_approved: false,
      evidenced_gates: 3, real_environment_progress_percent: 100, ci_not_assessed: true,
    });
  });
  it("mede evolução parcial 0/33/66/100% sem aprovar produção", () => {
    const m = withEvidence(original());
    m.external_environment_tests[0].status = "PENDING_REAL_ENVIRONMENT";
    m.external_environment_tests[1].status = "PENDING_REAL_ENVIRONMENT";
    expect(evaluateDispatchReadiness(m, now)).toMatchObject({
      real_environment_progress_percent: 33, evidenced_gates: 1,
      decision: "NO_GO", production_approved: false,
    });
    m.external_environment_tests[0].status = "PASSED_REAL_ENVIRONMENT";
    expect(evaluateDispatchReadiness(m, now).real_environment_progress_percent).toBe(66);
    m.external_environment_tests[1].status = "PASSED_REAL_ENVIRONMENT";
    expect(evaluateDispatchReadiness(m, now).real_environment_progress_percent).toBe(100);
  });
  it("gera sumário seguro e impede GO automático visual", () => {
    const report = evaluateDispatchReadiness(original(), now);
    const summary = formatDispatchReadinessSummary(report);
    expect(summary).toContain("0% (0/3 gates)");
    expect(summary).toContain("NO_GO");
    expect(summary).toContain("NÃO");
    expect(summary).toContain("DISPATCH-REAL-01");
    expect(summary).not.toContain("https://");
    const approved = evaluateDispatchReadiness(withEvidence(original()), now);
    const review = formatDispatchReadinessSummary(approved);
    expect(review).toContain("MANUAL_GO_REVIEW_REQUIRED");
    expect(review).toContain("Autorização de produção: **NÃO**");
    expect(review).not.toContain("homologation-team");
  });

  it("rejeita revisão futura ou calendário inválido sem conferir acesso à rede", () => {
    for(const invalid of ["2026-02-30","2026-10-27","25/10/2026","",null]) {
      const m=original();m.review_date=invalid;
      const result=evaluateDispatchReadiness(m,now);
      expect(result).toMatchObject({decision:"NO_GO",manifest_valid:false,real_environment_progress_percent:0});
    }
  });
  it("falha fechado quando o procedimento ou a descrição de prova são placeholders",()=>{
    for(const placeholder of ["","pending","TBD","n/a","-"]) {
      const m=original();
      m.external_environment_tests[0].procedure=placeholder;
      m.external_environment_tests[1].evidence_required=placeholder;
      const result=evaluateDispatchReadiness(m,now);
      expect(result.decision).toBe("NO_GO");
      expect(result.manifest_valid).toBe(false);
      expect(result.pending_gate_ids).toContain("DISPATCH-REAL-01");
      expect(result.pending_gate_ids).toContain("DISPATCH-REAL-02");
    }
  });
  it("bloqueia URL de prova com tokens em query, fragmentos e userinfo",()=>{
    const m=withEvidence(original());
    m.external_environment_tests[0].evidence_url="https://evidence.example.org/file?token=secret";
    m.external_environment_tests[1].evidence_url="https://evidence.example.org/file#secret";
    m.external_environment_tests[2].evidence_url="https://user:pass@evidence.example.org/file";
    const result=evaluateDispatchReadiness(m,now);
    expect(result).toMatchObject({decision:"NO_GO",evidenced_gates:0});
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("bloqueia prova sem SHA, versões dos componentes ou responsável humano",()=>{
    const m=withEvidence(original());
    delete m.external_environment_tests[0].code_sha;
    m.external_environment_tests[1].component_versions={dispatch:"TBD"};
    m.external_environment_tests[2].owner="unknown";
    const result=evaluateDispatchReadiness(m,now);
    expect(result.evidenced_gates).toBe(0);
    expect(result.pending_gate_ids).toHaveLength(3);
  });
  it("bloqueia data de prova posterior à revisão do manifesto",()=>{
    const m=withEvidence(original());m.review_date="2026-10-24";
    m.external_environment_tests[1].executed_at="2026-10-24T09:00:00Z";
    m.external_environment_tests[2].executed_at="2026-10-24T09:30:00Z";
    const result=evaluateDispatchReadiness(m,now);
    expect(result.evidenced_gates).toBe(2);
    expect(result.pending_gate_ids).toContain("DISPATCH-REAL-01");
  });
  it("exige o mesmo SHA e as mesmas versões em todos os gates reais",()=>{
    const differentSha=withEvidence(original());
    differentSha.external_environment_tests[1].code_sha="b".repeat(40);
    const shaResult=evaluateDispatchReadiness(differentSha,now);
    expect(shaResult).toMatchObject({decision:"NO_GO",evidenced_gates:3});
    expect(shaResult.findings).toContain("INCONSISTENT_EVIDENCE_SET");
    const differentVersion=withEvidence(original());
    differentVersion.external_environment_tests[2].component_versions.worker="2026.10";
    const versionResult=evaluateDispatchReadiness(differentVersion,now);
    expect(versionResult).toMatchObject({decision:"NO_GO",evidenced_gates:3});
    expect(versionResult.findings).toContain("INCONSISTENT_COMPONENT_VERSIONS");
  });
  it("não revela dados externos ou segredos no relatório", () => {
    const m = withEvidence(original());
    m.external_environment_tests[0].token = "SECRET_TOKEN_HIDDEN";
    const json = JSON.stringify(evaluateDispatchReadiness(m, now));
    expect(json).not.toContain("SECRET_TOKEN_HIDDEN");
    expect(json).not.toContain("homologation-team");
    expect(json).not.toContain("github.com");
  });
});
