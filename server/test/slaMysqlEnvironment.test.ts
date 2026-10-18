import { describe, expect, it } from "vitest";
import {
  assertEmptySlaMysqlDatabase,
  getSlaMysqlTestSettings,
} from "./slaMysqlEnvironment";

const valid = {
  NODE_ENV: "test",
  AXE_RUNTIME_ENV: "homologation",
  AXE_SLA_MYSQL_TESTS: "true",
  AXE_SLA_MYSQL_TEST_DATABASE_URL:
    "mysql://sla_test:disposable-only@127.0.0.1:3306/dispatch_sla_homologation",
};

describe("I5E — isolamento do MySQL descartável", () => {
  it("aceita somente o banco dedicado no loopback com opt-in explícito", () => {
    expect(getSlaMysqlTestSettings(valid)).toMatchObject({
      host: "127.0.0.1",
      port: 3306,
      user: "sla_test",
      database: "dispatch_sla_homologation",
      timezone: "Z",
      multipleStatements: false,
    });
  });
  it.each([
    { NODE_ENV: "production" },
    { AXE_RUNTIME_ENV: "production" },
    { AXE_SLA_MYSQL_TESTS: "false" },
    { AXE_SLA_MYSQL_TEST_DATABASE_URL: "" },
    {
      AXE_SLA_MYSQL_TEST_DATABASE_URL:
        "mysql://sla_test:secret@db.example.com/dispatch_sla_homologation",
    },
    {
      AXE_SLA_MYSQL_TEST_DATABASE_URL:
        "mysql://sla_test:secret@127.0.0.1/dispatch",
    },
    {
      AXE_SLA_MYSQL_TEST_DATABASE_URL:
        "mysql://root:secret@127.0.0.1/dispatch_sla_homologation",
    },
    {
      AXE_SLA_MYSQL_TEST_DATABASE_URL:
        "mysql://sla_test:secret@127.0.0.1/dispatch_sla_homologation?socketPath=/tmp/mysql.sock",
    },
    {
      AXE_SLA_MYSQL_TEST_DATABASE_URL:
        "mysql://sla_test:secret@127.0.0.1/dispatch_sla_homologation#fragment",
    },
    {
      AXE_SLA_MYSQL_TEST_DATABASE_URL:
        "https://sla_test:secret@127.0.0.1/dispatch_sla_homologation",
    },
  ])("configuração insegura é recusada sem revelar a URL %j", patch => {
    let message = "";
    try {
      getSlaMysqlTestSettings({ ...valid, ...patch });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("disposable-only");
  });
  it("não usa DATABASE_URL como fallback", () => {
    expect(() =>
      getSlaMysqlTestSettings({
        ...valid,
        AXE_SLA_MYSQL_TEST_DATABASE_URL: "",
        DATABASE_URL: valid.AXE_SLA_MYSQL_TEST_DATABASE_URL,
      })
    ).toThrow();
  });
  it.each([
    ["dispatch", 0],
    ["dispatch_sla_homologation", 1],
    ["dispatch_sla_homologation", -1],
    ["dispatch_sla_homologation", Number.NaN],
  ])("preparo recusa schema %s com %s tabelas", (name, count) => {
    expect(() =>
      assertEmptySlaMysqlDatabase(name as string, count as number)
    ).toThrow();
  });
  it("autoriza aplicar migrations somente no schema dedicado vazio", () => {
    expect(() =>
      assertEmptySlaMysqlDatabase("dispatch_sla_homologation", 0)
    ).not.toThrow();
  });
});
