import { TRPCError } from "@trpc/server";
import type { Incident, User } from "../drizzle/schema";
import type { IncidentStatus, OperationalRole } from "../shared/operations";

type CurrentUser = Pick<User, "id" | "operationalRole" | "teamId" | "active">;

const roleSet = (...roles: OperationalRole[]) => new Set<OperationalRole>(roles);
const OPERATIONS = {
  createIncident: roleSet("operador", "despachador", "supervisor", "administrador"),
  updateQueue: roleSet("despachador", "supervisor", "administrador"),
  supervise: roleSet("supervisor", "administrador"),
  administer: roleSet("administrador"),
  export: roleSet("despachador", "supervisor", "administrador"),
};

export function assertActiveOperationalUser(user: CurrentUser) {
  if (!user.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
}

export function assertOperation(user: CurrentUser, operation: keyof typeof OPERATIONS) {
  assertActiveOperationalUser(user);
  if (!OPERATIONS[operation].has(user.operationalRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Perfil sem permissão para esta operação." });
  }
}

export function assertCanReadIncident(user: CurrentUser, incident: Incident) {
  assertActiveOperationalUser(user);
  if (user.operationalRole === "agente" && (!user.teamId || incident.assignedTeamId !== user.teamId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "O agente só pode acessar ocorrências da própria equipe." });
  }
}

export function assertCanEditIncident(user: CurrentUser, incident: Incident) {
  assertCanReadIncident(user, incident);
  if (user.operationalRole === "operador") {
    const editable = incident.status === "triagem" || incident.status === "aguardando_despacho";
    if (!editable || incident.createdByUserId !== user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "O operador só edita ocorrências próprias antes do despacho." });
    }
  } else if (user.operationalRole === "agente") {
    throw new TRPCError({ code: "FORBIDDEN", message: "O agente não altera dados cadastrais da ocorrência." });
  }
}

export function assertCanTransitionIncident(user: CurrentUser, incident: Incident, nextStatus: IncidentStatus) {
  assertCanReadIncident(user, incident);
  if (user.operationalRole === "agente") {
    const allowed = new Set<IncidentStatus>(["aceita", "em_atendimento", "pausada", "concluida"]);
    if (!allowed.has(nextStatus)) throw new TRPCError({ code: "FORBIDDEN", message: "O agente só atualiza o atendimento da própria equipe." });
  }
  if (user.operationalRole === "operador" && nextStatus !== "aguardando_despacho" && nextStatus !== "cancelada") {
    throw new TRPCError({ code: "FORBIDDEN", message: "O operador só encaminha ou cancela ocorrências em triagem." });
  }
  if (user.operationalRole === "despachador" && nextStatus === "concluida") {
    throw new TRPCError({ code: "FORBIDDEN", message: "O encerramento exige agente responsável, supervisor ou administrador." });
  }
}

export function assertCanAddIncidentEvidence(user: CurrentUser, incident: Incident) {
  assertCanReadIncident(user, incident);
  if (user.operationalRole !== "agente" || !user.teamId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente agentes vinculados a uma equipe podem registrar evidências." });
  }
  assertOwnTeam(user, user.teamId);
  if (incident.status !== "aceita" && incident.status !== "em_atendimento" && incident.status !== "pausada") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Evidências só podem ser adicionadas após o aceite e antes da conclusão do atendimento." });
  }
}

export function assertOwnTeam(user: CurrentUser, teamId: number) {
  assertActiveOperationalUser(user);
  if (user.operationalRole !== "agente" || user.teamId !== teamId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Ação permitida apenas para a equipe vinculada ao agente." });
  }
}
