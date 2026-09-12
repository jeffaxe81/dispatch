import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertPermission, getEffectiveAccess } from "./accessControl";
import { createAssetInventoryClient, type AssetInventoryClientError, type AssetInventoryIdentity } from "./assetInventoryClient";
import { ENV } from "./_core/env";
import { protectedProcedure, router } from "./_core/trpc";

const assetProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function client() {
  if (!ENV.assetInventoryBaseUrl) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Motor de Ativos não configurado." });
  }
  return createAssetInventoryClient({
    baseUrl: ENV.assetInventoryBaseUrl,
    timeoutMs: Number(ENV.assetInventoryTimeoutMs || 3000),
  });
}

async function tenantIdFor(user: Parameters<typeof getEffectiveAccess>[0]): Promise<string> {
  const access = await getEffectiveAccess(user);
  const organizationIds = Array.from(new Set(access.assignments.map(assignment => assignment.organizationId).filter((value): value is number => value !== null)));
  if (organizationIds.length === 1) return String(organizationIds[0]);
  if (organizationIds.length > 1) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Selecione um único contexto organizacional antes de acessar o Inventário." });
  }
  if (ENV.assetInventoryTenantId) return ENV.assetInventoryTenantId;
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant do Motor de Ativos não configurado para este contexto." });
}

function correlationIdFrom(header: string | string[] | undefined): string {
  if (typeof header === "string" && header.trim()) return header.trim();
  return randomUUID();
}

async function identityFor(ctx: { user: NonNullable<Parameters<typeof tenantIdFor>[0]>; req: { headers: Record<string, string | string[] | undefined> } }): Promise<AssetInventoryIdentity> {
  return {
    tenantId: await tenantIdFor(ctx.user),
    userId: String(ctx.user.id),
    correlationId: correlationIdFrom(ctx.req.headers["x-correlation-id"]),
  };
}

function translateClientError(error: unknown): never {
  const candidate = error as Partial<AssetInventoryClientError>;
  if (candidate.code === "asset_inventory.unavailable") {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Inventário indisponível no momento." });
  }
  if (candidate.code === "asset_inventory.request_failed" && candidate.status === 404) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Ativo não encontrado." });
  }
  if (candidate.code === "asset_inventory.request_failed") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação ao Inventário não aceita." });
  }
  throw error;
}

export const assetInventoryRouter = router({
  config: assetProcedure.query(async ({ ctx }) => {
    await assertPermission(ctx.user, "occurrences.view");
    return { enabled: Boolean(ENV.assetInventoryBaseUrl), webUrl: ENV.assetInventoryWebUrl };
  }),
  search: assetProcedure.input(z.object({ query: z.string().trim().min(1).max(200) })).mutation(async ({ ctx, input }) => {
    await assertPermission(ctx.user, "occurrences.view");
    try {
      return await client().search(await identityFor(ctx), { query: input.query, page: 1, pageSize: 10 });
    } catch (error) {
      translateClientError(error);
    }
  }),
  detail: assetProcedure.input(z.object({ assetId: z.string().trim().min(1).max(128) })).mutation(async ({ ctx, input }) => {
    await assertPermission(ctx.user, "occurrences.view");
    try {
      const identity = await identityFor(ctx);
      const api = client();
      const asset = await api.getById(identity, input.assetId);
      let location: { latitude: number; longitude: number } | null = null;
      try {
        const found = await api.getLocation(identity, input.assetId);
        location = { latitude: found.latitude, longitude: found.longitude };
      } catch (error) {
        const candidate = error as Partial<AssetInventoryClientError>;
        if (!(candidate.code === "asset_inventory.request_failed" && candidate.status === 404)) throw error;
      }
      return { ...asset, ...(location ?? {}) };
    } catch (error) {
      translateClientError(error);
    }
  }),
  linkOccurrence: assetProcedure.input(z.object({ assetId: z.string().trim().min(1).max(128), incidentReference: z.string().trim().min(1).max(100) })).mutation(async ({ ctx, input }) => {
    await assertPermission(ctx.user, "occurrences.view");
    if (ctx.user.operationalRole === "agente") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Perfil sem permissão para vincular ativos à ocorrência." });
    }
    try {
      const identity = await identityFor(ctx);
      return await client().linkDispatchReference(identity, input.assetId, {
        referenceType: "occurrence",
        referenceId: input.incidentReference,
        idempotencyKey: `${identity.tenantId}:occurrence:${input.incidentReference}`,
      });
    } catch (error) {
      translateClientError(error);
    }
  }),
});
