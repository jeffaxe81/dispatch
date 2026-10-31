/**
 * Despacho: 100 cenários operacionais tRPC (5 grupos de 20).
 * Banco e permissões externas simulados; fluxo de autorização de domínio é real.
 * Não realiza despacho em campo, envio de mensagens ou escrita em produção.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { Incident, User } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  assertTeamScope: vi.fn(),
  createIncident: vi.fn(),
  getIncidentById: vi.fn(),
  assignTeamToIncident: vi.fn(),
  respondToAssignment: vi.fn(),
  transitionIncident: vi.fn(),
  addIncidentEvidence: vi.fn(),
  getIncidentAudit: vi.fn(),
  getIncidentTimeline: vi.fn(),
}));

vi.mock("./accessControl", async importOriginal => ({
  ...(await importOriginal<typeof import("./accessControl")>()),
  assertPermission: mocks.assertPermission,
  assertTeamScope: mocks.assertTeamScope,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  createIncident: mocks.createIncident,
  getIncidentById: mocks.getIncidentById,
  assignTeamToIncident: mocks.assignTeamToIncident,
  respondToAssignment: mocks.respondToAssignment,
  transitionIncident: mocks.transitionIncident,
  addIncidentEvidence: mocks.addIncidentEvidence,
  getIncidentAudit: mocks.getIncidentAudit,
  getIncidentTimeline: mocks.getIncidentTimeline,
}));

import { appRouter } from "./routers";

const cases = (base: number) =>
  Array.from({ length: 20 }, (_, i) => ({ i, key: "DSP-FLOW-" + (base + i) }));

function actor(
  operationalRole: "administrador" | "agente" | "despachador",
  teamId: number | null,
  id: number,
  active = true,
): TrpcContext {
  const user = {
    id,
    openId: "dispatch-flow-" + id,
    name: "Usuario de homologacao",
    email: "homologacao-" + id + "@example.test",
    loginMethod: "test",
    role: operationalRole === "administrador" ? "admin" : "user",
    operationalRole,
    teamId,
    active,
    createdAt: new Date("2026-10-31T10:00:00Z"),
    updatedAt: new Date("2026-10-31T10:00:00Z"),
    lastSignedIn: new Date("2026-10-31T10:00:00Z"),
  } as User;
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function baseIncident(id: number, teamId: number): Incident {
  const now = new Date("2026-10-31T12:00:00Z");
  return {
    id,
    code: "DSP-HOMO-" + id,
    status: "triagem",
    priority: "alta",
    category: "Teste operacional",
    origin: "central",
    requesterName: null,
    requesterContact: null,
    description: "Ocorrencia sintetica - sem dados reais",
    address: "Endereco ficticio de homologacao",
    latitude: "-27.1000000",
    longitude: "-48.9000000",
    assignedTeamId: null,
    assignedVehicleId: null,
    createdByUserId: 1,
    closedByUserId: null,
    dispatchedAt: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    closeSummary: null,
    createdAt: now,
    updatedAt: now,
  };
}

let current: Incident;
let log: Array<{ operation: string; actor: number; status: string }>;

function initialize(id: number) {
  const teamId = id + 1000;
  current = baseIncident(id, teamId);
  log = [];
  mocks.getIncidentById.mockImplementation(async (requestedId: number) =>
    requestedId === current.id ? { incident: { ...current } } : null,
  );
  mocks.createIncident.mockImplementation(async ({ actorUserId }: { actorUserId: number }) => {
    log.push({ operation: "create", actor: actorUserId, status: current.status });
    return { ...current };
  });
  mocks.assignTeamToIncident.mockImplementation(async ({
    actorUserId,
    teamId: assignedTeamId,
  }: { actorUserId: number; teamId: number }) => {
    current = { ...current, status: "despachada", assignedTeamId };
    log.push({ operation: "assign", actor: actorUserId, status: current.status });
    return { ...current };
  });
  mocks.respondToAssignment.mockImplementation(async ({
    actorUserId,
    accepted,
  }: { actorUserId: number; accepted: boolean }) => {
    current = { ...current, status: accepted ? "aceita" : "aguardando_despacho" };
    log.push({ operation: "response", actor: actorUserId, status: current.status });
    return { ...current };
  });
  mocks.transitionIncident.mockImplementation(async ({
    actorUserId,
    nextStatus,
  }: { actorUserId: number; nextStatus: Incident["status"] }) => {
    current = { ...current, status: nextStatus };
    log.push({ operation: "transition", actor: actorUserId, status: nextStatus });
    return { ...current };
  });
  mocks.getIncidentAudit.mockImplementation(async () => [...log]);
  mocks.getIncidentTimeline.mockImplementation(async () => [...log]);
  mocks.addIncidentEvidence.mockImplementation(async ({
    actorUserId,
  }: { actorUserId: number }) => ({
    id: current.id + 500,
    actorUserId,
  }));
  mocks.assertPermission.mockImplementation(async (user: User) => {
    if (!user.active) throw new TRPCError({ code: "FORBIDDEN" });
  });
  mocks.assertTeamScope.mockImplementation(async (
    user: User,
    requestedTeamId: number,
  ) => {
    if (user.operationalRole === "agente" && user.teamId !== requestedTeamId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Equipe fora do escopo." });
    }
  });
  return teamId;
}

describe("Homologacao isolada do ciclo operacional de Despacho", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(cases(12001))("$key - criação, despacho, aceite, atendimento, encerramento e auditoria", async ({ i }) => {
    const incidentId = 12000 + i;
    const teamId = initialize(incidentId);
    const admin = appRouter.createCaller(actor("administrador", null, 1));
    const agent = appRouter.createCaller(actor("agente", teamId, 500 + i));
    const newIncident = await admin.incidents.create({
      category: "Incidente operacional " + i,
      priority: i % 2 ? "critica" : "alta",
      origin: "central",
      description: "Registro isolado da homologacao " + i,
      address: "Local simulado " + i,
      latitude: -27.1,
      longitude: -48.9,
    });
    expect(newIncident.id).toBe(incidentId);
    const dispatched = await admin.incidents.assign({
      incidentId,
      teamId,
      estimatedArrivalMinutes: 1 + i,
    });
    expect(dispatched.status).toBe("despachada");
    expect(dispatched.assignedTeamId).toBe(teamId);
    const accepted = await agent.incidents.respondToAssignment({
      incidentId, accepted: true, note: "Aceite de homologacao",
    });
    expect(accepted.status).toBe("aceita");
    const inProgress = await agent.incidents.transition({
      incidentId, nextStatus: "em_atendimento", note: "Chegada simulada ao local",
    });
    expect(inProgress.status).toBe("em_atendimento");
    const completed = await agent.incidents.transition({
      incidentId, nextStatus: "concluida", note: "Atendimento simulado concluido",
    });
    expect(completed.status).toBe("concluida");
    const audit = await admin.incidents.audit({ incidentId });
    const timeline = await admin.incidents.timeline({ incidentId });
    expect(audit).toHaveLength(5);
    expect(timeline).toEqual(audit);
    expect(log.map(item => item.operation)).toEqual([
      "create", "assign", "response", "transition", "transition",
    ]);
    expect(log.map(item => item.actor)).toEqual([
      1, 1, 500 + i, 500 + i, 500 + i,
    ]);
    expect(mocks.assertTeamScope).toHaveBeenCalledWith(
      expect.objectContaining({ teamId }), teamId, "occurrences.close",
    );
  });

  it.each(cases(12021))("$key - despacho duplicado ou após encerramento não alcança persistência", async ({ i }) => {
    const incidentId = 13000 + i;
    const teamId = initialize(incidentId);
    current.status = i % 2 ? "concluida" : "despachada";
    current.assignedTeamId = teamId;
    const admin = appRouter.createCaller(actor("administrador", null, 1));
    await expect(admin.incidents.assign({
      incidentId, teamId: teamId + 1, estimatedArrivalMinutes: 15,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.assignTeamToIncident).not.toHaveBeenCalled();
    expect(current.status).toBe(i % 2 ? "concluida" : "despachada");
    expect(current.assignedTeamId).toBe(teamId);
  });

  it.each(cases(12041))("$key - agente externo não pode aceitar ocorrência de outra equipe", async ({ i }) => {
    const incidentId = 14000 + i;
    const teamId = initialize(incidentId);
    current = { ...current, status: "despachada", assignedTeamId: teamId };
    const outsider = appRouter.createCaller(actor("agente", teamId + 1, 700 + i));
    await expect(outsider.incidents.respondToAssignment({
      incidentId, accepted: i % 2 === 0, note: "Tentativa externa simulada",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.respondToAssignment).not.toHaveBeenCalled();
    expect(current.status).toBe("despachada");
  });

  it.each(cases(12061))("$key - transições em status terminal são rejeitadas", async ({ i }) => {
    const incidentId = 15000 + i;
    const teamId = initialize(incidentId);
    current = {
      ...current,
      status: i % 2 ? "cancelada" : "concluida",
      assignedTeamId: teamId,
    };
    const admin = appRouter.createCaller(actor("administrador", null, 1));
    const target = i % 3 === 0 ? "em_atendimento" : i % 3 === 1 ? "despachada" : "aceita";
    await expect(admin.incidents.transition({
      incidentId, nextStatus: target, note: "Tentativa indevida de reabertura",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.transitionIncident).not.toHaveBeenCalled();
    expect(current.status).toBe(i % 2 ? "cancelada" : "concluida");
  });

  it.each(cases(12081))("$key - evidência permitida apenas na fase e equipe apropriadas", async ({ i }) => {
    const incidentId = 16000 + i;
    const teamId = initialize(incidentId);
    const phase = i % 4;
    current = {
      ...current,
      status: phase === 0 ? "aceita" : phase === 1 ? "em_atendimento" : phase === 2 ? "pausada" : "concluida",
      assignedTeamId: teamId,
    };
    const validAgent = appRouter.createCaller(actor("agente", teamId, 900 + i));
    const request = {
      incidentId, fileName: "evidencia-" + i + ".png",
      contentType: "image/png" as const,
      dataBase64: "AAAA",
    };
    if (phase === 3) {
      await expect(validAgent.incidents.evidence.upload(request)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(mocks.addIncidentEvidence).not.toHaveBeenCalled();
    } else {
      await expect(validAgent.incidents.evidence.upload(request)).resolves.toMatchObject({
        actorUserId: 900 + i,
      });
      expect(mocks.addIncidentEvidence).toHaveBeenCalledWith(expect.objectContaining({
        incidentId, teamId, actorUserId: 900 + i,
      }));
    }
  });
});
