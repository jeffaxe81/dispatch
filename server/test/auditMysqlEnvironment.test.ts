import { describe, expect, it } from "vitest";
import { assertEmptyAuditMysqlDatabase, getAuditMysqlTestSettings } from "./auditMysqlEnvironment";

const base = {
  NODE_ENV: "test",
  AXE_RUNTIME_ENV: "homologation",
  AXE_AUDIT_MYSQL_TESTS: "true",
  AXE_AUDIT_MYSQL_TEST_DATABASE_URL: "mysql://audit_test:throwaway@127.0.0.1:3306/dispatch_audit_homologation",
};
describe("AXED-F091 — fronteira do banco descartável de auditoria", () => {
  it("permite apenas homologação com opt-in explícito e credenciais exclusivas", () => {
    expect(getAuditMysqlTestSettings(base)).toMatchObject({
      host: "127.0.0.1", database: "dispatch_audit_homologation", user: "audit_test",
    });
  });
  it("rejeita conexão real, outros bancos, usuários e destinos remotos", () => {
    for (const url of [
      "mysql://audit_test:throwaway@db.example.invalid:3306/dispatch_audit_homologation",
      "mysql://root:throwaway@127.0.0.1/dispatch_audit_homologation",
      "mysql://audit_test:throwaway@127.0.0.1/dispatch",
      "mysql://audit_test:throwaway@127.0.0.1/dispatch_audit_homologation?ssl=true",
    ]) expect(() => getAuditMysqlTestSettings({ ...base, AXE_AUDIT_MYSQL_TEST_DATABASE_URL: url })).toThrow();
  });
  it("rejeita execução fora de teste ou sem opt-in", () => {
    for (const variant of [
      { NODE_ENV: "production" }, { AXE_RUNTIME_ENV: "production" }, { AXE_AUDIT_MYSQL_TESTS: "false" },
    ]) expect(() => getAuditMysqlTestSettings({ ...base, ...variant })).toThrow();
  });
  it("exige schema descartável completamente vazio antes das migrations", () => {
    expect(() => assertEmptyAuditMysqlDatabase("dispatch_audit_homologation", 0)).not.toThrow();
    expect(() => assertEmptyAuditMysqlDatabase("dispatch_audit_homologation", 1)).toThrow();
    expect(() => assertEmptyAuditMysqlDatabase("dispatch", 0)).toThrow();
  });
});
