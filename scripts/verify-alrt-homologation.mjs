import { createHmac, randomUUID } from "node:crypto";

const endpoint = process.env.ALRT_INGRESS_TEST_URL ?? "https://dispatchapp-dmbshjft.manus.space/api/integrations/alrt/events";
const apiKey = process.env.ALRT_INGRESS_API_KEY;
const hmacSecret = process.env.ALRT_INGRESS_HMAC_SECRET;

if (!apiKey || apiKey.length < 32) throw new Error("API key de homologação indisponível ou curta.");
if (!hmacSecret || hmacSecret.length < 32) throw new Error("Segredo HMAC de homologação indisponível ou curto.");

const timestamp = new Date().toISOString();
const eventId = `evt_hml_${randomUUID()}`;
const correlationId = `axe-hml-${randomUUID()}`;
const payload = {
  schemaVersion: "1.0",
  eventId,
  eventType: "alert.received",
  occurredAt: timestamp,
  source: { system: "despacho-alrt", environment: "homologacao" },
  correlationId,
  idempotencyKey: `alrt:hml:${randomUUID()}`,
  data: {
    alert: {
      externalId: `hml-${Date.now()}`,
      category: "Teste de homologação",
      priority: "baixa",
      description: "Evento técnico controlado para validar o receptor ALRT → AXE. Não deve criar ocorrência operacional.",
      address: "Ambiente de homologação AXE",
      latitude: -27.0976,
      longitude: -48.9104,
      reportedAt: timestamp,
      sourceStatus: "test",
    },
  },
};
const body = JSON.stringify(payload);
const signature = `sha256=${createHmac("sha256", hmacSecret).update(`${timestamp}.${body}`).digest("hex")}`;
const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-ALRT-API-Key": apiKey, "X-Timestamp": timestamp, "X-Signature": signature, "X-Correlation-Id": correlationId }, body });
const result = await response.json();
if (response.status !== 202 || result.success !== true || result.status !== "RECEIVED") throw new Error(`Homologação recusada: HTTP ${response.status}; ${JSON.stringify(result)}`);

console.log(JSON.stringify({ status: response.status, eventId, correlationId, receiptStatus: result.status }, null, 2));
