import { TRPCError } from "@trpc/server";
import { getAccessSnapshot } from "./accessControl";
import {
  isHomologationRouteAllowed, isReservedHomologationCode,
} from "../shared/homologationProfiles";

/**
 * Only activated for the explicitly isolated QA runtime. Legacy operational
 * guards are not sufficient for QA accounts: a read-only QA user may still
 * have an underlying "operador"/"agente" value in users.operationalRole.
 */
export async function assertHomologationRouteAccess(userId: number, path: string) {
  const snapshot = await getAccessSnapshot(userId);
  if (!snapshot.hasHistoricQaRole) return;
  const qaRoles = snapshot.assignments.filter(x => isReservedHomologationCode(x.roleCode));
  if (qaRoles.length === 0) {
    // A valid replacement normal dynamic role may restore regular operations.
    if (snapshot.assignments.length > 0) return;
    throw new TRPCError({ code:"FORBIDDEN", message:"O perfil de homologação não está vigente." });
  }
  if (qaRoles.length !== 1 || snapshot.assignments.length !== 1 ||
      !isHomologationRouteAllowed(qaRoles[0].roleCode, path, snapshot.permissions)) {
    throw new TRPCError({ code:"FORBIDDEN", message:"Rota não autorizada para homologação." });
  }
  if (!qaRoles[0].organizationId ||
      (qaRoles[0].defaultScope === "equipe" && !qaRoles[0].teamId)) {
    throw new TRPCError({ code:"FORBIDDEN", message:"Escopo de homologação incompleto." });
  }
}
