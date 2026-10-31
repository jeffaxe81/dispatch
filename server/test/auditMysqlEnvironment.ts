import type { ConnectionOptions } from "mysql2";

const database = "dispatch_audit_homologation";
const allowedUser = "audit_test";

/**
 * Dedicated MySQL 8.4 isolated test only. This must NEVER read DATABASE_URL
 * or connect to a production or customer environment.
 */
export function getAuditMysqlTestSettings(
  env: Record<string, string | undefined>,
): ConnectionOptions {
  if (env.NODE_ENV !== "test" || env.AXE_RUNTIME_ENV !== "homologation" ||
      env.AXE_AUDIT_MYSQL_TESTS !== "true") {
    throw new Error("Ensaio de auditoria MySQL exige ambiente de teste descartável e opt-in explícito.");
  }
  try {
    const uri = new URL(env.AXE_AUDIT_MYSQL_TEST_DATABASE_URL ?? "");
    const port = Number(uri.port || 3306);
    if (uri.protocol !== "mysql:" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname) ||
        uri.pathname !== "/" + database ||
        decodeURIComponent(uri.username) !== allowedUser ||
        !decodeURIComponent(uri.password) ||
        uri.search || uri.hash ||
        !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid");
    return {
      host: uri.hostname === "[::1]" ? "::1" : uri.hostname,
      port,
      user: allowedUser,
      password: decodeURIComponent(uri.password),
      database,
      timezone: "Z",
      multipleStatements: false,
      connectTimeout: 10_000,
    };
  } catch {
    throw new Error("Utilize exclusivamente schema local descartável dispatch_audit_homologation e usuário audit_test.");
  }
}

export function assertEmptyAuditMysqlDatabase(name: string, tableCount: number) {
  if (name !== database || tableCount !== 0) {
    throw new Error("Ensaio de auditoria exige schema descartável vazio antes das migrations locais.");
  }
}
