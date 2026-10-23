import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SlaHeartbeatComponent } from "./workflowSlaSignedHeartbeat";

export type SlaFailoverApproval = {
  version: "j6g-v1";
  organizationId: number;
  component: SlaHeartbeatComponent;
  operatorUserId: number;
  approverUserId: number;
  approvalId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

const MAX_APPROVAL_MS = 300_000;
const refused = () => new Error("Aprovação independente de failover SLA inválida.");

function utc(value: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw refused();
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || ms < 0 || new Date(ms).toISOString() !== value) throw refused();
  return ms;
}

function valid(approval: SlaFailoverApproval): { issued: number; expires: number } {
  if (!approval || approval.version !== "j6g-v1" ||
    !Number.isSafeInteger(approval.organizationId) || approval.organizationId < 1 ||
    !["scheduler", "adapter"].includes(approval.component) ||
    !Number.isSafeInteger(approval.operatorUserId) || approval.operatorUserId < 1 ||
    !Number.isSafeInteger(approval.approverUserId) || approval.approverUserId < 1 ||
    approval.operatorUserId === approval.approverUserId ||
    typeof approval.approvalId !== "string" ||
    !/^[a-f0-9]{32}$/.test(approval.approvalId)) throw refused();
  const issued = utc(approval.issuedAt);
  const expires = utc(approval.expiresAt);
  if (expires <= issued || expires - issued > MAX_APPROVAL_MS) throw refused();
  return { issued, expires };
}

function canonical(approval: SlaFailoverApproval) {
  return JSON.stringify([
    "axe-dispatch-sla-failover-approval-v1",
    approval.organizationId, approval.component, approval.operatorUserId,
    approval.approverUserId, approval.approvalId,
    approval.issuedAt, approval.expiresAt,
  ]);
}

function mac(approval: SlaFailoverApproval, secret: string | Buffer): Buffer {
  if (Buffer.byteLength(secret) < 32) throw refused();
  return createHmac("sha256", secret).update(canonical(approval), "utf8").digest();
}

/** Offline approval signer. Only a separately authorized administrator may issue it. */
export function signSlaFailoverApproval(
  payload: Omit<SlaFailoverApproval, "signature">,
  secret: string | Buffer,
): SlaFailoverApproval {
  const approval: SlaFailoverApproval = { ...payload, signature: "" };
  valid(approval);
  return { ...approval, signature: mac(approval, secret).toString("hex") };
}

/** Returns a SHA-256 reference, never the signed token or the signing secret. */
export function verifySlaFailoverApproval(input: {
  approval: SlaFailoverApproval;
  operatorUserId: number;
  organizationId: number;
  component: SlaHeartbeatComponent;
  now: string;
  secret: string | Buffer;
}): { approvalRef: string; approverUserId: number } {
  const { approval } = input;
  const times = valid(approval);
  const at = utc(input.now);
  if (approval.operatorUserId !== input.operatorUserId ||
    approval.organizationId !== input.organizationId ||
    approval.component !== input.component ||
    at < times.issued || at > times.expires ||
    typeof approval.signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(approval.signature)) throw refused();
  if (!timingSafeEqual(
    Buffer.from(approval.signature, "hex"),
    mac(approval, input.secret),
  )) throw refused();
  return {
    approvalRef: createHash("sha256").update(canonical(approval)).digest("hex"),
    approverUserId: approval.approverUserId,
  };
}
