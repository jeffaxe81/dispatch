import type { RecoveryActionRequest } from "./recoveryAction";

export type ActiveRecoveryEnvironment =
  | "development-controlled"
  | "homologation-controlled"
  | "production";

export type ActiveRecoveryAuthorizationReason =
  | "AUTHORIZED"
  | "ACTIVE_RECOVERY_DISABLED"
  | "ENVIRONMENT_NOT_AUTHORIZED"
  | "COMPONENT_NOT_AUTHORIZED"
  | "ACTION_NOT_AUTHORIZED"
  | "AUTHORIZATION_CONFIG_INVALID";

export type ActiveRecoveryConfig = Readonly<{
  enabled: boolean;
  environment: ActiveRecoveryEnvironment;
  authorizedEnvironment: "homologation-controlled";
  authorizedComponent: "database";
  authorizedAction: "restart_component";
  leaseNamespace: "d011b3-v1";
}>;

export type ActiveRecoveryAuthorizationDecision = Readonly<{
  authorized: boolean;
  reasonCode: ActiveRecoveryAuthorizationReason;
  componentId: string;
  actionId: string;
  environment: ActiveRecoveryEnvironment;
  leaseNamespace: "d011b3-v1";
  authorizationRef?: string;
}>;

const SAFE_ENVIRONMENT: ActiveRecoveryEnvironment = "homologation-controlled";
const SAFE_LEASE_NAMESPACE = "d011b3-v1" as const;

function isActiveRecoveryEnvironment(value: unknown): value is ActiveRecoveryEnvironment {
  return value === "development-controlled"
    || value === "homologation-controlled"
    || value === "production";
}

function isValidConfig(value: unknown): value is ActiveRecoveryConfig {
  if (typeof value !== "object" || value === null) return false;

  const config = value as Record<string, unknown>;
  return typeof config.enabled === "boolean"
    && isActiveRecoveryEnvironment(config.environment)
    && config.authorizedEnvironment === "homologation-controlled"
    && config.authorizedComponent === "database"
    && config.authorizedAction === "restart_component"
    && config.leaseNamespace === SAFE_LEASE_NAMESPACE;
}

export function buildActiveRecoveryAuthorizationRef(
  request: RecoveryActionRequest,
  decision: Pick<ActiveRecoveryAuthorizationDecision, "environment" | "leaseNamespace">,
): string {
  return [
    "authz-v1",
    decision.environment,
    decision.leaseNamespace,
    request.componentId,
    request.action,
    request.actionId,
    request.transitionId,
    request.correlationId,
    request.requestedAt,
  ].map(part => encodeURIComponent(part)).join(":");
}

function deny(
  request: RecoveryActionRequest,
  reasonCode: Exclude<ActiveRecoveryAuthorizationReason, "AUTHORIZED">,
  config?: ActiveRecoveryConfig,
): ActiveRecoveryAuthorizationDecision {
  return {
    authorized: false,
    reasonCode,
    componentId: request.componentId,
    actionId: request.actionId,
    environment: config?.environment ?? SAFE_ENVIRONMENT,
    leaseNamespace: config?.leaseNamespace ?? SAFE_LEASE_NAMESPACE,
  };
}

export function authorizeRecoveryAction(input: {
  request: RecoveryActionRequest;
  config?: ActiveRecoveryConfig | null;
}): ActiveRecoveryAuthorizationDecision {
  const { request } = input;

  if (!isValidConfig(input.config)) {
    return deny(request, "AUTHORIZATION_CONFIG_INVALID");
  }

  const config = input.config;
  if (!config.enabled) {
    return deny(request, "ACTIVE_RECOVERY_DISABLED", config);
  }

  if (config.environment === "production" || config.environment !== config.authorizedEnvironment) {
    return deny(request, "ENVIRONMENT_NOT_AUTHORIZED", config);
  }

  if (request.componentId !== config.authorizedComponent) {
    return deny(request, "COMPONENT_NOT_AUTHORIZED", config);
  }

  if (request.action !== config.authorizedAction) {
    return deny(request, "ACTION_NOT_AUTHORIZED", config);
  }

  const decision = {
    authorized: true,
    reasonCode: "AUTHORIZED" as const,
    componentId: request.componentId,
    actionId: request.actionId,
    environment: config.environment,
    leaseNamespace: config.leaseNamespace,
  };

  return {
    ...decision,
    authorizationRef: buildActiveRecoveryAuthorizationRef(request, decision),
  };
}
