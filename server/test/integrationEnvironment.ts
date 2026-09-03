export function validateIntegrationEnvironment(
  environment: Record<string, string | undefined>,
): void {
  const requiredVariables = [
    "DATABASE_URL",
    "JWT_SECRET",
    "LOCAL_AUTH_BOOTSTRAP_USERNAME",
    "LOCAL_AUTH_BOOTSTRAP_PASSWORD",
  ];
  const missingVariables = requiredVariables.filter(
    variable => !environment[variable]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Testes de integração exigem: ${missingVariables.join(", ")}`,
    );
  }
}
