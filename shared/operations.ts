export const OPERATIONAL_ROLES = [
  "operador",
  "despachador",
  "agente",
  "supervisor",
  "administrador",
] as const;

export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

export const INCIDENT_STATUSES = [
  "triagem",
  "aguardando_despacho",
  "despachada",
  "aceita",
  "em_atendimento",
  "pausada",
  "concluida",
  "cancelada",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_PRIORITIES = ["baixa", "media", "alta", "critica"] as const;
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

export const SHIFT_TEMPLATE_KINDS = ["fixed", "12x36", "custom"] as const;
export type ShiftTemplateKind = (typeof SHIFT_TEMPLATE_KINDS)[number];

export const WORK_SESSION_STATUSES = ["open", "paused", "closed", "adjusted"] as const;
export type WorkSessionStatus = (typeof WORK_SESSION_STATUSES)[number];

export const OPERATIONAL_PRESENCE_STATUSES = [
  "available",
  "busy",
  "paused",
  "offline",
  "out_of_shift",
] as const;
export type OperationalPresenceStatus = (typeof OPERATIONAL_PRESENCE_STATUSES)[number];

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  triagem: ["aguardando_despacho", "cancelada"],
  aguardando_despacho: ["despachada", "cancelada"],
  despachada: ["aceita", "aguardando_despacho", "cancelada"],
  aceita: ["em_atendimento", "aguardando_despacho", "cancelada"],
  em_atendimento: ["pausada", "concluida", "cancelada"],
  pausada: ["em_atendimento", "cancelada"],
  concluida: [],
  cancelada: [],
};

export const ROLE_LABELS: Record<OperationalRole, string> = {
  operador: "Operador",
  despachador: "Despachador",
  agente: "Agente de campo",
  supervisor: "Supervisor",
  administrador: "Administrador",
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  triagem: "Em triagem",
  aguardando_despacho: "Aguardando despacho",
  despachada: "Despachada",
  aceita: "Aceita pela equipe",
  em_atendimento: "Em atendimento",
  pausada: "Atendimento pausado",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
