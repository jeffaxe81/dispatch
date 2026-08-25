import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { consumeAlrtDistributedRateLimit, createExternalIncidentReviewFromEvent, isAlrtIngressAdministrativelyApproved, recordAlrtIncomingEvent, recordAlrtIngressTestAttempt } from "./db";
import { ENV } from "./_core/env";

export const ALRT_INGRESS_PATH = "/api/integrations/alrt/events";
export const ALRT_INGRESS_HEALTH_PATH = "/api/integrations/alrt/health";
export const ALRT_API_KEY_HEADER = "X-ALRT-API-Key";
export const ALRT_COMPAT_API_KEY_HEADER = "X-API-Key";
export const ALRT_TIMESTAMP_HEADER = "X-Timestamp";
export const ALRT_LEGACY_TIMESTAMP_HEADER = "X-Request-Timestamp";
export const ALRT_SIGNATURE_HEADER = "X-Signature";
export const ALRT_CORRELATION_HEADER = "X-Correlation-Id";
export const MAX_ALRT_PAYLOAD_BYTES = 256 * 1024;
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_RATE_LIMIT = 60;

const prioritySchema = z.enum(["baixa", "media", "alta", "critica"]);
export const alrtAlertEnvelopeSchema = z.object({
  schemaVersion: z.literal("1.0"), eventId: z.string().trim().min(8).max(120), eventType: z.literal("alert.received"), occurredAt: z.string().datetime({ offset: true }),
  source: z.object({ system: z.literal("despacho-alrt"), environment: z.literal("homologacao") }).strict(), correlationId: z.string().trim().min(1).max(160).optional(), idempotencyKey: z.string().trim().min(8).max(180),
  data: z.object({ alert: z.object({ externalId: z.string().trim().min(1).max(160), category: z.string().trim().min(2).max(160), priority: prioritySchema, description: z.string().trim().min(3).max(5000), address: z.string().trim().min(3).max(500), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), reportedAt: z.string().datetime({ offset: true }), sourceStatus: z.string().trim().min(1).max(80).optional() }).strict() }).strict(),
}).strict();

type AlrtAlertEnvelope = z.infer<typeof alrtAlertEnvelopeSchema>;
type RequestWithRawBody = Request & { rawBody?: Buffer };
export type AlrtRateLimiter = (key: string, limit: number, now?: number) => Promise<{ allowed: boolean; retryAfterSeconds: number }> | { allowed: boolean; retryAfterSeconds: number };
export type AlrtIngressConfig = { mode: string; apiKey: string; hmacSecret?: string; timestampToleranceSeconds?: number; rateLimit?: number; isAdministrativelyApproved?: () => Promise<boolean>; rateLimiter?: AlrtRateLimiter };
type RateLimitWindow = { count: number; resetAt: number };
const rateLimitWindows = new Map<string, RateLimitWindow>();

export function isAlrtIngressEnabled(config: AlrtIngressConfig = { mode: ENV.alrtIngressMode, apiKey: ENV.alrtIngressApiKey, hmacSecret: ENV.alrtIngressHmacSecret }) {
  return config.mode === "homologacao" && config.apiKey.length >= 32 && (config.hmacSecret?.length ?? 0) >= 32;
}
export function isAlrtTimestampAccepted(value: string, now = Date.now(), toleranceMs = MAX_TIMESTAMP_SKEW_MS) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) && Math.abs(now - timestamp) <= toleranceMs; }
export function verifyAlrtApiKey(suppliedApiKey: string | undefined, expectedApiKey: string) { if (!suppliedApiKey || !expectedApiKey || suppliedApiKey.length !== expectedApiKey.length) return false; return timingSafeEqual(Buffer.from(suppliedApiKey), Buffer.from(expectedApiKey)); }
export function createAlrtHmacSignature(timestamp: string, rawBody: Buffer | string, secret: string) { const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody; return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`; }
export function verifyAlrtHmacSignature(suppliedSignature: string | undefined, timestamp: string, rawBody: Buffer, secret: string | undefined) { if (!suppliedSignature || !secret || secret.length < 32) return false; const expected = createAlrtHmacSignature(timestamp, rawBody, secret); return suppliedSignature.length === expected.length && timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expected)); }
export function consumeAlrtRateLimit(key: string, limit: number, now = Date.now()) { const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_RATE_LIMIT; if (rateLimitWindows.size >= 1024) for (const [candidate, window] of rateLimitWindows) if (window.resetAt <= now) rateLimitWindows.delete(candidate); const existing = rateLimitWindows.get(key); if (!existing || existing.resetAt <= now) { rateLimitWindows.set(key, { count: 1, resetAt: now + 60_000 }); return { allowed: true, retryAfterSeconds: 0 }; } if (existing.count >= safeLimit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }; existing.count += 1; return { allowed: true, retryAfterSeconds: 0 }; }

function bodyFor(request: RequestWithRawBody) { return request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})); }
function errorResponse(response: Response, status: number, correlationId: string, code: string, message: string, extra: Record<string, unknown> = {}) { return response.status(status).json({ success: false, correlationId, error: { code, message }, ...extra }); }
function receipt(eventId: string, correlationId: string, status: "accepted" | "duplicate") { return { success: true, receiptId: `rcpt_${createHash("sha256").update(`${eventId}:${Date.now()}`).digest("hex").slice(0, 24)}`, correlationId, eventId, status: status === "accepted" ? "RECEIVED" : "DUPLICATE", receivedAt: new Date().toISOString() }; }

export function alrtIngressJsonErrorHandler(error: unknown, request: Request, response: Response, next: NextFunction) {
  const isAlrtPath = request.path === ALRT_INGRESS_PATH || request.originalUrl?.split("?")[0] === ALRT_INGRESS_PATH;
  if (isAlrtPath && typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    const correlationId = request.header(ALRT_CORRELATION_HEADER) ?? randomUUID();
    void Promise.resolve(recordAlrtIngressTestAttempt({ correlationId, httpStatus: 413, result: "rejected", errorCode: "PAYLOAD_TOO_LARGE" })).catch(() => undefined);
    return errorResponse(response, 413, correlationId, "PAYLOAD_TOO_LARGE", "Payload excede o limite de 256 KiB.");
  }
  if (isAlrtPath && error instanceof SyntaxError && "body" in error) {
    const correlationId = request.header(ALRT_CORRELATION_HEADER) ?? randomUUID();
    void Promise.resolve(recordAlrtIngressTestAttempt({ correlationId, httpStatus: 400, result: "rejected", errorCode: "INVALID_JSON" })).catch(() => undefined);
    return errorResponse(response, 400, correlationId, "INVALID_JSON", "JSON inválido.");
  }
  return next(error);
}

export function registerAlrtIngressRoutes(app: Express, config: AlrtIngressConfig = { mode: ENV.alrtIngressMode, apiKey: ENV.alrtIngressApiKey, hmacSecret: ENV.alrtIngressHmacSecret, timestampToleranceSeconds: Number(ENV.alrtIngressTimestampToleranceSeconds), rateLimit: Number(ENV.alrtIngressRateLimit) }) {
  const isAdministrativelyApproved = config.isAdministrativelyApproved ?? isAlrtIngressAdministrativelyApproved;
  const rateLimiter = config.rateLimiter ?? consumeAlrtDistributedRateLimit;
  const reject = async (response: Response, correlationId: string, status: number, code: string, message: string, extra: Record<string, unknown> = {}) => {
    await Promise.resolve(recordAlrtIngressTestAttempt({ correlationId, httpStatus: status, result: "rejected", errorCode: code })).catch(() => undefined);
    return errorResponse(response, status, correlationId, code, message, extra);
  };
  app.get(ALRT_INGRESS_HEALTH_PATH, (request, response) => {
    if (!isAlrtIngressEnabled(config)) return response.status(503).json({ success: false, error: { code: "ALRT_INGRESS_DISABLED", message: "Receptor ALRT desativado." } });
    if (!verifyAlrtApiKey(request.header(ALRT_API_KEY_HEADER) ?? request.header(ALRT_COMPAT_API_KEY_HEADER), config.apiKey)) return response.status(401).json({ success: false, error: { code: "INVALID_API_KEY", message: "Chave de API inválida." } });
    return void isAdministrativelyApproved().then(approved => approved ? response.status(200).json({ status: "ready", mode: "homologacao", hmac: "sha256" }) : response.status(503).json({ success: false, error: { code: "ALRT_APPROVAL_PENDING", message: "Aprovação administrativa pendente." } })).catch(() => response.status(503).json({ success: false, error: { code: "INGRESS_UNAVAILABLE", message: "Não foi possível verificar a aprovação administrativa." } }));
  });
  app.post(ALRT_INGRESS_PATH, express.json({ limit: MAX_ALRT_PAYLOAD_BYTES, verify: (request, _response, buffer) => { (request as RequestWithRawBody).rawBody = Buffer.from(buffer); } }), async (request, response) => {
    const rawBody = bodyFor(request as RequestWithRawBody);
    const headerCorrelationId = request.header(ALRT_CORRELATION_HEADER);
    const correlationId = headerCorrelationId ?? randomUUID();
    if (!isAlrtIngressEnabled(config)) return reject(response, correlationId, 503, "ALRT_INGRESS_DISABLED", "Receptor ALRT desativado. Aguardando homologação e credencial autorizada.");
    if (rawBody.length > MAX_ALRT_PAYLOAD_BYTES) return reject(response, correlationId, 413, "PAYLOAD_TOO_LARGE", "Payload excede o limite de homologação.");
    const timestamp = request.header(ALRT_TIMESTAMP_HEADER) ?? request.header(ALRT_LEGACY_TIMESTAMP_HEADER);
    const toleranceSeconds = config.timestampToleranceSeconds ?? (Number(ENV.alrtIngressTimestampToleranceSeconds) || 300);
    const toleranceMs = Math.max(1, Math.min(3600, toleranceSeconds)) * 1000;
    if (!timestamp || !isAlrtTimestampAccepted(timestamp, Date.now(), toleranceMs)) return reject(response, correlationId, 401, "INVALID_TIMESTAMP", "Timestamp ausente, inválido ou fora da janela permitida.");
    if (!verifyAlrtApiKey(request.header(ALRT_API_KEY_HEADER) ?? request.header(ALRT_COMPAT_API_KEY_HEADER), config.apiKey)) return reject(response, correlationId, 401, "INVALID_API_KEY", "Chave de API inválida.");
    if (!verifyAlrtHmacSignature(request.header(ALRT_SIGNATURE_HEADER), timestamp, rawBody, config.hmacSecret)) return reject(response, correlationId, 401, "INVALID_SIGNATURE", "Assinatura inválida.");
    try {
      if (!(await isAdministrativelyApproved())) return reject(response, correlationId, 503, "ALRT_APPROVAL_PENDING", "Aprovação administrativa pendente.");
    } catch {
      return reject(response, correlationId, 503, "INGRESS_UNAVAILABLE", "Não foi possível verificar a aprovação administrativa.");
    }
    const configuredRateLimit = config.rateLimit ?? (Number(ENV.alrtIngressRateLimit) || DEFAULT_RATE_LIMIT);
    let rateLimit: { allowed: boolean; retryAfterSeconds: number };
    try {
      const key = createHash("sha256").update(`${config.apiKey}:${request.ip || "unknown"}`).digest("hex");
      rateLimit = await rateLimiter(key, configuredRateLimit);
    } catch {
      return reject(response, correlationId, 503, "RATE_LIMIT_UNAVAILABLE", "Não foi possível verificar o limite de recepção.");
    }
    if (!rateLimit.allowed) { response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds)); return reject(response, correlationId, 429, "RATE_LIMITED", "Limite temporário de recepção atingido."); }
    const parsed = alrtAlertEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) return reject(response, correlationId, 400, "INVALID_PAYLOAD", "Envelope de alerta inválido.", { issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), code: issue.code })) });
    try {
      if (headerCorrelationId && parsed.data.correlationId && headerCorrelationId !== parsed.data.correlationId) return reject(response, correlationId, 400, "CORRELATION_MISMATCH", "O cabeçalho e o envelope possuem identificadores de correlação diferentes.");
      const envelope = { ...parsed.data, correlationId: headerCorrelationId ?? parsed.data.correlationId ?? correlationId };
      const stored = await recordAlrtIncomingEvent({ envelope, payloadDigest: createHash("sha256").update(rawBody).digest("hex") });
      await createExternalIncidentReviewFromEvent(stored.event).catch(error => console.error("[ALRT ingress] Falha ao preparar revisão externa", error instanceof Error ? error.message : "erro desconhecido"));
      await Promise.resolve(recordAlrtIngressTestAttempt({ correlationId: envelope.correlationId, httpStatus: stored.duplicate ? 200 : 202, result: stored.duplicate ? "duplicate" : "received", eventId: envelope.eventId, eventType: envelope.eventType, sourceEnvironment: envelope.source.environment })).catch(() => undefined);
      return response.status(stored.duplicate ? 200 : 202).json(receipt(envelope.eventId, envelope.correlationId, stored.duplicate ? "duplicate" : "accepted"));
    } catch (error) { console.error("[ALRT ingress] Falha ao registrar alerta", error instanceof Error ? error.message : "erro desconhecido"); return reject(response, correlationId, 503, "INGRESS_UNAVAILABLE", "Receptor temporariamente indisponível."); }
  });
}

export type { AlrtAlertEnvelope };
