export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oAuthPortalUrl: process.env.VITE_OAUTH_PORTAL_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  alrtIngressMode: process.env.ALRT_INGRESS_MODE ?? "desativado",
  alrtIngressApiKey: process.env.ALRT_INGRESS_API_KEY ?? "",
  alrtIngressHmacSecret: process.env.ALRT_INGRESS_HMAC_SECRET ?? "",
  alrtIngressTimestampToleranceSeconds:
    process.env.ALRT_TIMESTAMP_TOLERANCE_SECONDS ?? "300",
  alrtIngressRateLimit: process.env.ALRT_RATE_LIMIT ?? "60",
  trustProxy: process.env.TRUST_PROXY === "true",
};

type RuntimeEnv = typeof ENV;

const insecureSecretValues = new Set([
  "altere-esta-chave-antes-de-expor-o-ambiente",
  "troque-por-um-segredo-longo-e-aleatorio",
]);

function hasSufficientSessionSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") >= 32) return true;
  if (Buffer.byteLength(secret, "utf8") < 20) return false;
  const characterClasses = [/[a-z]/.test(secret), /[A-Z]/.test(secret), /\d/.test(secret), /[^A-Za-z0-9]/.test(secret)].filter(Boolean).length;
  return characterClasses >= 3;
}

export function validateRuntimeEnv(env: RuntimeEnv = ENV) {
  const errors: string[] = [];

  if (
    !hasSufficientSessionSecret(env.cookieSecret) ||
    insecureSecretValues.has(env.cookieSecret)
  ) {
    errors.push(
      "JWT_SECRET deve conter ao menos 32 bytes aleatórios ou 20 caracteres com três classes distintas, e não pode usar o valor de exemplo.",
    );
  }

  if (env.isProduction) {
    if (!env.databaseUrl) errors.push("DATABASE_URL é obrigatória em produção.");
    if (!env.appId) errors.push("VITE_APP_ID é obrigatório em produção.");
    if (!env.oAuthServerUrl) errors.push("OAUTH_SERVER_URL é obrigatória em produção.");
    if (!env.oAuthPortalUrl) {
      errors.push("VITE_OAUTH_PORTAL_URL é obrigatória em produção.");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuração insegura:\n- ${errors.join("\n- ")}`);
  }
}
