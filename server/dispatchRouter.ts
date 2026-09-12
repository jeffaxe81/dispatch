import type { RouteProvider } from "@shared/gis";
import { z } from "zod";
import type { DispatchTeamEligibility } from "../shared/dispatchEligibility";
import type { TrpcContext } from "./_core/context";
import { protectedProcedure, router } from "./_core/trpc";
import { assertPermission, assertTeamScope } from "./accessControl";
import { rankTeamCandidates, type CandidateTeamPoint } from "./gisService";

const geoPointInput = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

const candidateInput = z.object({
  teamId: z.number().int().positive(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(80),
  position: geoPointInput,
});

const rankEligibleCandidatesInput = z.object({
  incident: geoPointInput,
  candidates: z.array(candidateInput).max(500),
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

export type DispatchRouterDependencies = {
  now(): Date;
  routeProvider: RouteProvider;
  resolveActiveTenant(user: AuthenticatedUser, req: TrpcContext["req"]): Promise<number>;
  assertTeamTenant(tenantId: number, teamId: number): Promise<unknown>;
  evaluateCandidates(
    candidates: CandidateTeamPoint[],
    instant: Date,
  ): Promise<{
    eligibleCandidates: CandidateTeamPoint[];
    ineligibleCandidates: DispatchTeamEligibility<CandidateTeamPoint>[];
    evaluatedAt: Date;
  }>;
};

export function createDispatchRouter(deps: DispatchRouterDependencies) {
  return router({
    rankEligibleCandidates: protectedProcedure
      .input(rankEligibleCandidatesInput)
      .query(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "dispatch.view");
        const tenantId = await deps.resolveActiveTenant(ctx.user, ctx.req);

        for (const candidate of input.candidates) {
          await deps.assertTeamTenant(tenantId, candidate.teamId);
          await assertTeamScope(ctx.user, candidate.teamId, "dispatch.view", tenantId);
        }

        const evaluatedAt = deps.now();
        if (Number.isNaN(evaluatedAt.getTime())) throw new Error("Instante de avaliação inválido.");

        const eligibility = await deps.evaluateCandidates(input.candidates, evaluatedAt);
        const rankedCandidates = await rankTeamCandidates(
          input.incident,
          eligibility.eligibleCandidates,
          deps.routeProvider,
        );

        return {
          rankedCandidates,
          ineligibleCandidates: eligibility.ineligibleCandidates,
          evaluatedAt: eligibility.evaluatedAt,
        };
      }),
  });
}
