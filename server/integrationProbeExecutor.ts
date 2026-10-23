import type { IntegrationSystem } from "../shared/integrationContracts";
import type { createIntegrationCircuitCoordinator } from "./integrationCircuitCoordinator";

type Circuit = Pick<
  ReturnType<typeof createIntegrationCircuitCoordinator>,
  "consumeProbeExecutionIntent" | "resolveProbe"
>;

export type IntegrationProbeOutcome = "success" | "failure";

export type IntegrationProbeAdapter = (
  input: Readonly<{ organizationId: number; system: IntegrationSystem }>,
) => Promise<IntegrationProbeOutcome>;

function assertHomologationGate(): void {
  const allowed =
    process.env.NODE_ENV === "test" &&
    process.env.AXE_RUNTIME_ENV === "homologation" &&
    process.env.AXE_INTEGRATION_PROBE_J32_ENABLED === "true";
  if (!allowed) {
    throw new Error("Executor de probe J32 desabilitado fora do opt-in estrito de homologação.");
  }
}

function assertOutcome(value: unknown): asserts value is IntegrationProbeOutcome {
  if (value !== "success" && value !== "failure") {
    throw new Error("Resultado de probe inválido ou incerto; resolução automática bloqueada.");
  }
}

export function createIntegrationProbeExecutor(dependencies: {
  circuit: Circuit;
  probe: IntegrationProbeAdapter;
}) {
  if (!dependencies || typeof dependencies.probe !== "function") {
    throw new Error("Adapter de probe interno obrigatório.");
  }

  return Object.freeze({
    async execute(input: {
      organizationId: number;
      system: IntegrationSystem;
      expectedVersion: number;
      leaseToken: string;
      executionToken: string;
      cooldownSeconds: number;
    }) {
      assertHomologationGate();

      const grant = await dependencies.circuit.consumeProbeExecutionIntent({
        organizationId: input.organizationId,
        system: input.system,
        expectedVersion: input.expectedVersion,
        leaseToken: input.leaseToken,
        executionToken: input.executionToken,
      });

      if (grant.permitsProbe !== true) {
        throw new Error("Grant one-shot não autorizou execução de probe.");
      }
      if (grant.permitsExternalCall !== false || grant.permitsAutomaticReplay !== false) {
        throw new Error("Grant de probe contém permissão externa incompatível.");
      }

      const outcome = await dependencies.probe(Object.freeze({
        organizationId: input.organizationId,
        system: input.system,
      }));
      assertOutcome(outcome);

      return dependencies.circuit.resolveProbe({
        organizationId: input.organizationId,
        system: input.system,
        expectedVersion: grant.version,
        leaseToken: input.leaseToken,
        outcome,
        cooldownSeconds: input.cooldownSeconds,
      });
    },
  });
}
