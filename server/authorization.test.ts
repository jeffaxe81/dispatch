import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { Incident, User } from "../drizzle/schema";
import { INCIDENT_TRANSITIONS } from "../shared/operations";
import {
  assertCanAddIncidentEvidence,
  assertCanEditIncident,
  assertCanReadIncident,
  assertCanTransitionIncident,
  assertOperation,
  assertOwnTeam,
} from "./authorization";

function user(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    openId: "user-7",
    name: "Pessoa de teste",
    email: "teste@example.com",
    loginMethod: "manus",
    role: "user",
    operationalRole: "operador",
    teamId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 99,
    code: "OCR-2026-TESTE",
    status: "triagem",
    priority: "media",
    category: "Apoio operacional",
    origin: "central",
    requesterName: null,
    requesterContact: null,
    description: "Ocorrência criada exclusivamente para validação das regras.",
    address: "Rua de Teste, 100",
    latitude: "-27.1000000",
    longitude: "-48.9000000",
    assignedTeamId: 3,
    assignedVehicleId: null,
    createdByUserId: 7,
    closedByUserId: null,
    dispatchedAt: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    closeSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("regras de autorização operacional", () => {
  it("permite que operador edite somente ocorrência própria antes do despacho", () => {
    expect(() => assertCanEditIncident(user(), incident())).not.toThrow();
    expect(() => assertCanEditIncident(user(), incident({ createdByUserId: 8 }))).toThrow(TRPCError);
    expect(() => assertCanEditIncident(user(), incident({ status: "despachada" }))).toThrow(TRPCError);
  });

  it("restringe o agente às ocorrências da própria equipe", () => {
    const agent = user({ operationalRole: "agente", teamId: 3 });
    expect(() => assertCanReadIncident(agent, incident({ assignedTeamId: 3 }))).not.toThrow();
    expect(() => assertCanReadIncident(agent, incident({ assignedTeamId: 4 }))).toThrow(TRPCError);
    expect(() => assertOwnTeam(agent, 3)).not.toThrow();
    expect(() => assertOwnTeam(agent, 4)).toThrow(TRPCError);
  });

  it("permite apenas transições de campo para agente", () => {
    const agent = user({ operationalRole: "agente", teamId: 3 });
    expect(() => assertCanTransitionIncident(agent, incident({ status: "despachada" }), "aceita")).not.toThrow();
    expect(() => assertCanTransitionIncident(agent, incident({ status: "despachada" }), "cancelada")).toThrow(TRPCError);
  });

  it("permite evidência somente para agente da equipe em atendimento ativo", () => {
    const agent = user({ operationalRole: "agente", teamId: 3 });
    expect(() => assertCanAddIncidentEvidence(agent, incident({ status: "em_atendimento", assignedTeamId: 3 }))).not.toThrow();
    expect(() => assertCanAddIncidentEvidence(agent, incident({ status: "em_atendimento", assignedTeamId: 4 }))).toThrow(TRPCError);
    expect(() => assertCanAddIncidentEvidence(agent, incident({ status: "concluida", assignedTeamId: 3 }))).toThrow(TRPCError);
  });

  it("restringe exportação e administração aos perfis autorizados", () => {
    expect(() => assertOperation(user({ operationalRole: "operador" }), "export")).toThrow(TRPCError);
    expect(() => assertOperation(user({ operationalRole: "despachador" }), "export")).not.toThrow();
    expect(() => assertOperation(user({ operationalRole: "supervisor" }), "administer")).toThrow(TRPCError);
    expect(() => assertOperation(user({ operationalRole: "administrador" }), "administer")).not.toThrow();
  });
});

describe("ciclo de vida das ocorrências", () => {
  it("não permite retorno implícito depois de concluída ou cancelada", () => {
    expect(INCIDENT_TRANSITIONS.concluida).toEqual([]);
    expect(INCIDENT_TRANSITIONS.cancelada).toEqual([]);
  });

  it("permite as transições operacionais esperadas", () => {
    expect(INCIDENT_TRANSITIONS.triagem).toContain("aguardando_despacho");
    expect(INCIDENT_TRANSITIONS.aguardando_despacho).toContain("despachada");
    expect(INCIDENT_TRANSITIONS.despachada).toContain("aceita");
    expect(INCIDENT_TRANSITIONS.em_atendimento).toContain("concluida");
  });
});
