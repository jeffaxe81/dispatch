import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertShiftHandoffRequest, assertShiftHandoffConfirmation, HANDOFF_WINDOW_MS } from "./shiftHandoff";

const req = {
  actorUserId: 10,
  teamId: 4,
  recipient: { id: 11, teamId: 4, active: true },
  session: { status: "active", teamId: 4 },
  note: "  Repassar ocorrências prioritárias.  ",
};
const confirmation = {
  actorUserId: 11, teamId: 4,
  request: { recipientUserId: 11, teamId: 4, occurredAt: new Date("2026-10-31T18:00:00Z") },
  now: new Date("2026-10-31T19:00:00Z"), alreadyConfirmed: false,
};

describe("AXED-F037 — passagem de plantão com confirmação auditada", () => {
  it("registra solicitação com responsável da mesma equipe e motivo normalizado", () => {
    expect(assertShiftHandoffRequest(req)).toBe("Repassar ocorrências prioritárias.");
  });
  it("rejeita entrega para a própria pessoa, equipe externa e usuário inativo", () => {
    expect(() => assertShiftHandoffRequest({...req,recipient:{...req.recipient,id:10}})).toThrow();
    expect(() => assertShiftHandoffRequest({...req,recipient:{...req.recipient,teamId:7}})).toThrow();
    expect(() => assertShiftHandoffRequest({...req,recipient:{...req.recipient,active:false}})).toThrow();
  });
  it("exige jornada aberta e equipe correta antes de gerar evento", () => {
    expect(() => assertShiftHandoffRequest({...req,session:null})).toThrow();
    expect(() => assertShiftHandoffRequest({...req,session:{status:"ended",teamId:4}})).toThrow();
    expect(() => assertShiftHandoffRequest({...req,session:{status:"active",teamId:6}})).toThrow();
  });
  it("valida tamanho do motivo sem deixar mensagem vazia", () => {
    expect(() => assertShiftHandoffRequest({...req,note:"   "})).toThrow();
    expect(() => assertShiftHandoffRequest({...req,note:"a".repeat(1001)})).toThrow();
  });
  it("aceita confirmação somente do destinatário correto durante janela válida", () => {
    expect(() => assertShiftHandoffConfirmation(confirmation)).not.toThrow();
    expect(() => assertShiftHandoffConfirmation({...confirmation,actorUserId:20})).toThrow();
    expect(() => assertShiftHandoffConfirmation({...confirmation,teamId:7})).toThrow();
  });
  it("expira solicitações e bloqueia confirmação repetida", () => {
    expect(() => assertShiftHandoffConfirmation({...confirmation,alreadyConfirmed:true})).toThrow();
    expect(() => assertShiftHandoffConfirmation({...confirmation,now:new Date(confirmation.request.occurredAt.getTime()+HANDOFF_WINDOW_MS+1)})).toThrow();
  });
  it("backend e rotas amarram sessão, tenant e confirmação sem mudar jornada", () => {
    const db=fs.readFileSync(path.resolve(import.meta.dirname,"dbLegacy.ts"),"utf8");
    const router=fs.readFileSync(path.resolve(import.meta.dirname,"routers.ts"),"utf8");
    const ui=fs.readFileSync(path.resolve(import.meta.dirname,"../client/src/components/ShiftHandoffPanel.tsx"),"utf8");
    const scope=db.slice(db.indexOf("export async function requestOwnShiftHandoff"),db.indexOf("export type TeamShiftAction"));
    expect(scope).toContain('eventType: "handoff_requested"');
    expect(scope).toContain('eventType: "handoff_confirmed"');
    expect(scope).toContain('.for("update")');
    expect(scope).toContain("assertShiftHandoffConfirmation");
    expect(scope).not.toContain("tx.update(workShiftSessions)");
    expect(router).toContain("await requireActiveTenant(ctx.user, ctx.req)");
    expect(router).toContain('assertPermission(ctx.user, "work_shifts.control")');
    expect(ui).toContain("Passagens aguardando sua confirmação");
    expect(ui).toContain("Confirmar");
  });
});
