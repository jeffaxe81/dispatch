import fs from "node:fs";
import { describe, expect, it } from "vitest";

const file = new URL("../docs/quality/REFINEMENT_100_2026-11-07.md", import.meta.url);
const text = fs.readFileSync(file,"utf8");
const rows = text.split("\n").filter(line => /^\| \*\*R\d{3}\*\* \|/.test(line));

describe("100 refinements: unique, traceable and not falsely marked complete",()=>{
  it("keeps exactly 100 individually identified improvements",()=>{
    expect(rows).toHaveLength(100);
    const ids=rows.map(line=>line.match(/R\d{3}/)![0]);
    expect(new Set(ids).size).toBe(100);
    expect(ids).toEqual(Array.from({length:100},(_,i)=>`R${String(i+1).padStart(3,"0")}`));
  });
  it("requires actionable acceptance criteria, priority and honest states",()=>{
    for (const row of rows) {
      const cells=row.split("|").slice(1,-1).map(x=>x.trim());
      expect(cells).toHaveLength(5);
      expect(["P0","P1","P2"]).toContain(cells[1]);
      expect(cells[2].length).toBeGreaterThan(12);
      expect(cells[3].length).toBeGreaterThan(30);
      expect(["PENDENTE","CODIFICADO / CI PENDENTE","INTEGRADO / CI VALIDADA"]).toContain(cells[4]);
    }
    expect(rows.filter(x=>x.includes("CODIFICADO / CI PENDENTE"))).toHaveLength(2);
    expect(rows.filter(x=>x.includes("INTEGRADO / CI VALIDADA"))).toHaveLength(6);
    expect(rows.filter(x=>x.includes("| PENDENTE |"))).toHaveLength(92);
  });
  it("explicitly does not claim real field homologation",()=>{
    expect(text).toContain("Não houve acesso ao ambiente real");
    expect(text).toContain("NO-GO");
    expect(text).toContain("0/3");
    expect(text).toContain("não 100 funcionalidades concluídas");
  });
});
