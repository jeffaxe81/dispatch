import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePhaseHandoffs, formatPhaseSummary, PHASE_IDS } from "./phase-handoff-audit.mjs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const [project,repo] = ({
  "dispatch-brusque-live":["AXE Despacho Web","jeffaxe81/dispatch"],
  "axe-despacho-mobile":["AXE Despacho Mobile","jeffaxe81/axe-despacho-mobile"],
})[pkg.name];
const original = () => JSON.parse(readFileSync(new URL("../../docs/quality/phase-handoff-evidence.json", import.meta.url),"utf8"));
const evaluate = data => evaluatePhaseHandoffs(data,project,repo);
test("only three development evidence stages are currently recorded",()=>{
  const result=evaluate(original());
  assert.equal(result.manifest_valid,true);
  assert.deepEqual(result.phases.map(s=>s.percent),[100,100,100,0,0,0]);
  assert.equal(result.phase_evidence_percent,50);
  assert.equal(result.recorded_phases,3);
  assert.equal(result.decision,"NO_GO");
  assert.equal(result.production_approved,false);
  assert.deepEqual(result.pending_phase_ids,PHASE_IDS.slice(3));
});
test("rejects invented PASS without phase-specific evidence",()=>{
  const m=original();
  m.phases[3].status="EVIDENCE_RECORDED";
  const r=evaluate(m);
  assert.equal(r.manifest_valid,false);
  assert.equal(r.phase_evidence_percent,0);
  assert.ok(r.errors.includes("UNSUPPORTED_PASSAGE_F04"));
});
test("rejects out-of-sequence and fabricated proof",()=>{
  const m=original();
  m.phases[4].status="EVIDENCE_RECORDED";
  m.phases[4].evidence=[{kind:"real_environment_report",sha:"a".repeat(40),url:"https://github.com/"+repo+"/issues/123"}];
  assert.equal(evaluate(m).manifest_valid,false);
  const forged=original();
  forged.phases[2].evidence[0].url="https://github.com.evil.test/"+repo+"/actions/runs/1";
  assert.equal(evaluate(forged).phase_evidence_percent,0);
});
test("release approval cannot be inferred from a full evidence inventory",()=>{
  const m=original();
  m.production_approved=true;
  assert.equal(evaluate(m).manifest_valid,false);
  assert.equal(evaluate(m).decision,"NO_GO");
});
test("summary is sanitized and never prints URLs or SHAs",()=>{
  const m=original();
  m.phases[0].evidence[0].secret="NEVER_PRINT";
  const text=formatPhaseSummary(evaluate(m));
  assert.match(text,/50%/);
  assert.match(text,/NO-GO/);
  assert.doesNotMatch(text,/github\.com|NEVER_PRINT|80116d|ebfb8/);
});
