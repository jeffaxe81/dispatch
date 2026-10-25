import type { ConnectionOptions } from "mysql2";

const database = "dispatch_sla_homologation";

/** Dedicated opt-in only. Never fall back to application DATABASE_URL. */
export function getSlaMysqlTestSettings(
  environment: Record<string, string | undefined>
): ConnectionOptions {
  if (
    environment.NODE_ENV !== "test" ||
    environment.AXE_RUNTIME_ENV !== "homologation" ||
    environment.AXE_SLA_MYSQL_TESTS !== "true"
  ) {
    throw new Error(
      "Ensaio MySQL exige teste/homologação e opt-in I5E explícito."
    );
  }
  try {
    const uri = new URL(environment.AXE_SLA_MYSQL_TEST_DATABASE_URL ?? "");
    const port = Number(uri.port || 3306);
    const user = decodeURIComponent(uri.username);
    const password = decodeURIComponent(uri.password);
    if (
      uri.protocol !== "mysql:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname) ||
      uri.pathname !== `/${database}` ||
      uri.search ||
      uri.hash ||
      user !== "sla_test" ||
      !password ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error("invalid");
    }
    return {
      host: uri.hostname === "[::1]" ? "::1" : uri.hostname,
      port,
      user,
      password,
      database,
      timezone: "Z",
      multipleStatements: false,
      connectTimeout: 10_000,
    };
  } catch {
    // No URL/credentials in errors or their causes.
    throw new Error(
      "Use a URL dedicada de sla_test no loopback e schema dispatch_sla_homologation, sem opções adicionais."
    );
  }
}

export function assertEmptySlaMysqlDatabase(
  name: string,
  tableCount: number
): void {
  if (name !== database || tableCount !== 0) {
    throw new Error(
      "O ensaio MySQL exige schema dedicado vazio; nenhuma migration foi autorizada."
    );
  }
}
