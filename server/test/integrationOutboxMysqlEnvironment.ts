import type { ConnectionOptions } from "mysql2";

const DATABASE = "dispatch_integration_homologation";

/**
 * Integration-outbox DB testing is opt-in and isolated from production and
 * the existing SLA MySQL suite. Credentials/URL never appear in errors.
 */
export function getIntegrationOutboxMysqlSettings(
  env: Record<string, string | undefined>,
): ConnectionOptions {
  if (env.NODE_ENV !== "test" || env.AXE_RUNTIME_ENV !== "homologation"
    || env.AXE_INTEGRATION_MYSQL_TESTS !== "true") {
    throw new Error("Ensaio de integração MySQL exige modo test/homologation e opt-in.");
  }
  try {
    const uri = new URL(env.AXE_INTEGRATION_MYSQL_TEST_DATABASE_URL ?? "");
    const port = Number(uri.port || 3306);
    const user = decodeURIComponent(uri.username);
    const password = decodeURIComponent(uri.password);
    if (uri.protocol !== "mysql:"
      || !["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname)
      || uri.pathname !== "/" + DATABASE
      || uri.search !== "" || uri.hash !== ""
      || user !== "integration_test" || !password
      || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("invalid");
    }
    return {
      host: uri.hostname === "[::1]" ? "::1" : uri.hostname,
      port, user, password, database: DATABASE,
      timezone: "Z", multipleStatements: false, connectTimeout: 10_000,
    };
  } catch {
    throw new Error("Ensaio MySQL exige banco descartável local e usuário integration_test exclusivo.");
  }
}

export function assertEmptyIntegrationOutboxMysqlDatabase(
  name: string,
  tableCount: number,
): void {
  if (name !== DATABASE || tableCount !== 0) {
    throw new Error("Homologação da outbox requer schema exclusivo e vazio; migração bloqueada.");
  }
}
