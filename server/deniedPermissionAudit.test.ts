import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeDeniedPermissionCode } from "./deniedPermissionAudit";

describe("AXED-F097 — evidência mínima de acesso negado", () => {
  it("aceita somente identificadores curtos e não registra parâmetros livres", () => {
    expect(normalizeDeniedPermissionCode("occurrences.edit")).toBe("occurrences.edit");
    expect(normalizeDeniedPermissionCode("work_shifts.control")).toBe("work_shifts.control");
    expect(normalizeDeniedPermissionCode("audit.view")).toBe("audit.view");
  });
  it("substitui códigos contendo conteúdo sensível ou arbitrário", () => {
    expect(normalizeDeniedPermissionCode("token=secret")).toBe("unknown");
    expect(normalizeDeniedPermissionCode("x".repeat(81))).toBe("unknown");
    expect(normalizeDeniedPermissionCode({ token: "secret" })).toBe("unknown");
    expect(normalizeDeniedPermissionCode("")).toBe("unknown");
  });
  it("permite log de negativa, mas proíbe conceder permissão quando log falha", () => {
    const source=fs.readFileSync(path.resolve(import.meta.dirname,"accessControl.ts"),"utf8");
    const start=source.indexOf("export async function assertPermission");
    const end=source.indexOf("export async function assertTeamScope",start);
    const method=source.slice(start,end);
    expect(method).toContain('await recordDeniedPermission(user.id, permission)');
    expect(method).toContain('code: "FORBIDDEN"');
    expect(method.indexOf('recordDeniedPermission(user.id, permission)'))
      .toBeLessThan(method.lastIndexOf('code: "FORBIDDEN"'));
  });
  it("armazena somente identificador e código; sem request body ou token", () => {
    const source=fs.readFileSync(path.resolve(import.meta.dirname,"deniedPermissionAudit.ts"),"utf8");
    expect(source).toContain('resourceType: "access_denied"');
    expect(source).toContain("afterData: { permission: normalizeDeniedPermissionCode(code) }");
    expect(source).not.toContain("requestBody");
    expect(source).not.toContain("authorizationHeader");
  });
  it("consulta apenas eventos da própria identidade autenticada, sem tenant alheio", () => {
    const source=fs.readFileSync(path.resolve(import.meta.dirname,"deniedPermissionAudit.ts"),"utf8");
    expect(source).toContain("eq(auditLogs.actorUserId, userId)");
    expect(source).toContain("eq(auditLogs.resourceId, userId)");
    expect(source).toContain("eq(auditLogs.resourceType, \"access_denied\")");
  });
  it("endpoint não recebe userId informado pelo cliente", () => {
    const router=fs.readFileSync(path.resolve(import.meta.dirname,"routers.ts"),"utf8");
    expect(router).toContain("listOwnDeniedPermissions(ctx.user.id, input.limit)");
    expect(router).toContain("limit: z.number().int().min(1).max(100).default(20)");
  });
});
