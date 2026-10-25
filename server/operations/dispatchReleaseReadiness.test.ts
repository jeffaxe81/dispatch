import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { evaluateDispatchReadiness, formatDispatchReadinessSummary } from "./dispatchReleaseReadiness";

const source = path.resolve(import.meta.dirname, "../../docs/quality/real-environment-pending-2026-10-23.json");
const original = () => JSON.parse(fs.readFileSync(source, "utf8"));
const now = new Date("2026-10-26T12:00:00Z");
function withEvidence(m: any) {
  for (const g of m.external_environment_tests) {
    g.status = "PASSED_REAL_ENVIRONMENT";
    g.owner = "homologation-team";
    g.executed_at = "2026-10-25T10:00:00Z";
    g.evidence_url = "https://github.com/jeffaxe81/dispatch/issues/97";
  }
  return m;
}
describe("Gate passivo de release AXE Dispatch", () => {
  it("mantém NO_GO para o manifesto atual com três pendências", () => {
    expect(evaluateDispatchReadiness(original(), now)).toMatchObject({
      decision: "NO_GO", production_approved: false, ci_not_assessed: true,
      manifest_valid: true, evidenced_gates: 0, required_gates: 3,
      pending_gate_ids: ["DISPATCH-REAL-01", "DISPATCH-REAL-02", "DISPATCH-REAL-03"],
    });
  });
  it("falha fechado se manifesto ou política não é confiável", () => {
    expect(evaluateDispatchReadiness(null, now).decision).toBe("NO_GO");
    const m = original();
    m.policy.manual_environment_tests_required_before_production_go = false;
    expect(evaluateDispatchReadiness(m, now)).toMatchObject({decision:"NO_GO", manifest_valid:false});
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
  it("rejeita URL de evidência com query, fragmento ou credenciais embutidas", () => {
    const m = withEvidence(original());
    m.external_environment_tests[0].evidence_url = "https://evidence.example.org/report?token=secret";
    m.external_environment_tests[1].evidence_url = "https://evidence.example.org/report#internal";
    m.external_environment_tests[2].evidence_url = "https://user:pass@evidence.example.org/report";
    expect(evaluateDispatchReadiness(m, now)).toMatchObject({
      decision:"NO_GO", evidenced_gates:0,
      pending_gate_ids:["DISPATCH-REAL-01","DISPATCH-REAL-02","DISPATCH-REAL-03"],
    });
  });
  it("rejeita responsáveis genéricos ou placeholders de homologação", () => {
    const m = withEvidence(original());
    m.external_environment_tests[0].owner = "TBD";
    m.external_environment_tests[1].owner = "unknown";
    m.external_environment_tests[2].owner = "to_be_assigned";
    expect(evaluateDispatchReadiness(m, now)).toMatchObject({
      decision:"NO_GO", evidenced_gates:0,
      pending_gate_ids:["DISPATCH-REAL-01","DISPATCH-REAL-02","DISPATCH-REAL-03"],
    });
  });
  it("rejeita placeholders adicionais de responsável que não identificam equipe ou pessoa", () => {
    for (const placeholder of ["none", "n/a", "pending", "-"]) {
      const m = withEvidence(original());
      m.external_environment_tests[0].owner = placeholder;
      const result = evaluateDispatchReadiness(m, now);
      expect(result.decision).toBe("NO_GO");
      expect(result.evidenced_gates).toBe(2);
      expect(result.pending_gate_ids).toContain("DISPATCH-REAL-01");
      expect(result.findings).toContain("INCOMPLETE_EVIDENCE");
    }
  });
  it("não concede GO, mesmo com os três gates evidenciados", () => {
    expect(evaluateDispatchReadiness(withEvidence(original()), now)).toMatchObject({
      decision: "MANUAL_GO_REVIEW_REQUIRED", production_approved: false,
      evidenced_gates: 3, ci_not_assessed: true,
    });
  });
  it("gera sumário seguro e impede GO automático visual", () => {
    const report = evaluateDispatchReadiness(original(), now);
    const summary = formatDispatchReadinessSummary(report);
    expect(summary).toContain("0/3");
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
  it("não revela dados externos ou segredos no relatório", () => {
    const m = withEvidence(original());
    m.external_environment_tests[0].token = "SECRET_TOKEN_HIDDEN";
    const json = JSON.stringify(evaluateDispatchReadiness(m, now));
    expect(json).not.toContain("SECRET_TOKEN_HIDDEN");
    expect(json).not.toContain("homologation-team");
    expect(json).not.toContain("github.com");
  });
});
