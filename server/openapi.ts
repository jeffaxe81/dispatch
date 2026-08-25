import { parse as parseYaml } from "yaml";

type JsonRecord = Record<string, unknown>;
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
const SENSITIVE = /(authorization|cookie|credential|password|secret|token|api.?key|private.?key)/i;

export type OpenapiOperationDraft = {
  operationKey: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  tags: string[] | null;
  parameters: JsonRecord[] | null;
  requestBody: JsonRecord | null;
  responses: JsonRecord | null;
  security: JsonRecord[] | null;
};

export type ParsedOpenapiDocument = {
  name: string;
  apiVersion: string;
  openapiVersion: string;
  description: string | null;
  importFormat: "json" | "yaml";
  document: JsonRecord;
  operations: OpenapiOperationDraft[];
};

function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function toText(value: unknown, maxLength: number) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }

function maskValue(value: unknown, key = "", masked = false): unknown {
  const shouldMask = masked || SENSITIVE.test(key) || (isRecord(value) && SENSITIVE.test(String(value.name ?? "")));
  if (Array.isArray(value)) return value.map(item => maskValue(item, key, shouldMask));
  if (!isRecord(value)) return shouldMask ? "••••••••" : value;
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, maskValue(entryValue, entryKey, shouldMask)]));
}

function operationKey(path: string, method: string, declared: unknown, occupied: Set<string>) {
  const base = toText(declared, 180).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || `${method}-${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "root"}`;
  let candidate = base.toLowerCase().slice(0, 170) || "operation";
  let counter = 2;
  while (occupied.has(candidate)) candidate = `${base.slice(0, 160)}-${counter++}`;
  occupied.add(candidate);
  return candidate;
}

function extractOperations(paths: JsonRecord): OpenapiOperationDraft[] {
  const results: OpenapiOperationDraft[] = [];
  const occupied = new Set<string>();
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!path.startsWith("/") || path.length > 1024 || !isRecord(pathItem)) continue;
    const inheritedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters.filter(isRecord) : [];
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!isRecord(operation)) continue;
      const ownParameters = Array.isArray(operation.parameters) ? operation.parameters.filter(isRecord) : [];
      const responses = isRecord(operation.responses) ? operation.responses : {};
      results.push({
        operationKey: operationKey(path, method, operation.operationId, occupied),
        method: method.toUpperCase(),
        path,
        summary: toText(operation.summary, 500) || null,
        description: toText(operation.description, 20_000) || null,
        tags: Array.isArray(operation.tags) ? operation.tags.filter(tag => typeof tag === "string").map(tag => tag.trim()).filter(Boolean).slice(0, 30) : null,
        parameters: [...inheritedParameters, ...ownParameters].map(parameter => maskValue(parameter) as JsonRecord).slice(0, 100) || null,
        requestBody: isRecord(operation.requestBody) ? maskValue(operation.requestBody) as JsonRecord : null,
        responses: maskValue(responses) as JsonRecord,
        security: Array.isArray(operation.security) ? operation.security.filter(isRecord).map(item => maskValue(item) as JsonRecord) : null,
      });
    }
  }
  if (results.length > 300) throw new Error("A especificação excede o limite de 300 operações por importação.");
  return results;
}

export function parseOpenapiDocument(raw: string, selectedFormat: "auto" | "json" | "yaml" = "auto"): ParsedOpenapiDocument {
  if (!raw.trim()) throw new Error("Informe o conteúdo JSON ou YAML da especificação OpenAPI.");
  if (raw.length > 1_000_000) throw new Error("A especificação ultrapassa o limite de 1 MB para importação local.");
  const format = selectedFormat === "auto" ? (raw.trimStart().startsWith("{") ? "json" : "yaml") : selectedFormat;
  let parsed: unknown;
  try { parsed = format === "json" ? JSON.parse(raw) : parseYaml(raw); } catch { throw new Error(`Não foi possível interpretar o documento ${format.toUpperCase()}.`); }
  if (!isRecord(parsed)) throw new Error("A especificação OpenAPI deve ser um objeto JSON ou YAML.");
  const openapiVersion = toText(parsed.openapi, 32);
  if (!/^3\.[01](\.\d+)?$/.test(openapiVersion)) throw new Error("São aceitas somente especificações OpenAPI 3.0 ou 3.1.");
  if (!isRecord(parsed.info)) throw new Error("A especificação precisa conter o objeto info.");
  const name = toText(parsed.info.title, 180);
  const apiVersion = toText(parsed.info.version, 80);
  if (!name || !apiVersion) throw new Error("O objeto info precisa informar title e version.");
  if (!isRecord(parsed.paths)) throw new Error("A especificação OpenAPI precisa conter o objeto paths.");
  const operations = extractOperations(parsed.paths);
  if (!operations.length) throw new Error("Nenhuma operação HTTP suportada foi encontrada em paths.");
  return { name, apiVersion, openapiVersion, description: toText(parsed.info.description, 20_000) || null, importFormat: format, document: maskValue(parsed) as JsonRecord, operations };
}

export function getInternalOpenapiCatalog() {
  return {
    openapi: "3.1.0",
    info: { title: "AXE Dispatch — Catálogo interno", version: "v1", description: "Contratos de referência do módulo Integrações & Workflows. Os endpoints ALRT são destinados exclusivamente à homologação segura." },
    servers: [{ url: "https://simulation.invalid/axe-dispatch", description: "Ambiente de simulação; nenhuma requisição é enviada." }],
    tags: [{ name: "Integrations" }, { name: "Workflows" }, { name: "Webhooks" }, { name: "ALRT Homologation" }],
    paths: {
      "/integracoes/eventos": { get: { tags: ["Integrations"], summary: "Listar eventos internos documentados", responses: { "200": { description: "Catálogo de eventos simulados" } }, "x-simulation-only": true } },
      "/integracoes/workflows/{workflowId}/executar": { post: { tags: ["Workflows"], summary: "Executar workflow em simulação", parameters: [{ name: "workflowId", in: "path", required: true, schema: { type: "integer" } }], responses: { "202": { description: "Execução simulada aceita" } }, "x-simulation-only": true } },
      "/integracoes/webhooks": { get: { tags: ["Webhooks"], summary: "Consultar contratos de webhooks simulados", responses: { "200": { description: "Webhooks não publicados" } }, "x-simulation-only": true } },
      "/api/integrations/alrt/events": { post: { tags: ["ALRT Homologation"], summary: "Receber alerta ALRT com API key, HMAC e idempotência", parameters: [{ name: "X-ALRT-API-Key", in: "header", required: true, schema: { type: "string", format: "password" } }, { name: "X-Timestamp", in: "header", required: true, schema: { type: "string", format: "date-time" } }, { name: "X-Signature", in: "header", required: true, schema: { type: "string", example: "sha256=<hmac>" } }, { name: "X-Correlation-Id", in: "header", required: false, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AlrtAlertEnvelope" } } } }, responses: { "200": { description: "Evento duplicado reconhecido" }, "202": { description: "Evento recebido para homologação" }, "400": { description: "JSON, envelope ou correlação inválidos" }, "401": { description: "API key, timestamp ou assinatura inválidos" }, "429": { description: "Limite temporário com Retry-After" }, "503": { description: "Receptor bloqueado ou indisponível" } }, "x-homologation-only": true } },
    },
    components: {
      schemas: {
        ApiError: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, timestamp: { type: "string", format: "date-time" } } } } },
        AlrtAlertEnvelope: { type: "object", required: ["schemaVersion", "eventId", "eventType", "occurredAt", "source", "idempotencyKey", "data"], properties: { schemaVersion: { type: "string", example: "1.0" }, eventId: { type: "string" }, eventType: { type: "string", example: "alert.received" }, occurredAt: { type: "string", format: "date-time" }, correlationId: { type: "string" }, idempotencyKey: { type: "string" }, source: { type: "object" }, data: { type: "object" } } },
      },
    },
  } as const;
}
