export type HealthState = "healthy" | "degraded" | "unhealthy" | "unknown";
export type HealthCriticality = "critical" | "operational" | "optional";

export type HealthComponentDefinition = {
  id: string;
  name: string;
  criticality: HealthCriticality;
  blocksReadiness: boolean;
  timeoutMs: number;
  evidenceTtlMs: number;
  probe: () => Promise<"healthy" | "degraded">;
};

export type HealthComponentSnapshot = {
  id: string;
  name: string;
  state: HealthState;
  criticality: HealthCriticality;
  blocksReadiness: boolean;
  checkedAt: string | null;
  durationMs: number | null;
};

export type HealthSnapshot = {
  status: "ready" | "degraded" | "not_ready";
  checkedAt: string;
  components: HealthComponentSnapshot[];
};

export type HealthRegistry = {
  readonly definitions: readonly HealthComponentDefinition[];
  probeAll(now?: Date): Promise<HealthSnapshot>;
};

function assertDefinition(definition: HealthComponentDefinition): void {
  if (!definition.id.trim()) throw new Error("Health component id must not be blank.");
  if (!definition.name.trim()) throw new Error("Health component name must not be blank.");
  if (!Number.isFinite(definition.timeoutMs) || definition.timeoutMs <= 0) {
    throw new Error("Health component timeoutMs must be positive.");
  }
  if (!Number.isFinite(definition.evidenceTtlMs) || definition.evidenceTtlMs <= 0) {
    throw new Error("Health component evidence TTL must be positive.");
  }
}

function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("health_probe_timeout")), timeoutMs);
    operation().then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function aggregateStatus(components: readonly HealthComponentSnapshot[]): HealthSnapshot["status"] {
  if (components.some(component => component.blocksReadiness && (component.state === "unhealthy" || component.state === "unknown"))) {
    return "not_ready";
  }
  if (components.some(component => component.state !== "healthy")) return "degraded";
  return "ready";
}

export function evaluateHealthSnapshot(
  definitions: readonly HealthComponentDefinition[],
  components: readonly HealthComponentSnapshot[],
  now = new Date(),
): HealthSnapshot {
  const definitionById = new Map(definitions.map(definition => [definition.id, definition]));
  const evaluated = components.map(component => {
    const definition = definitionById.get(component.id);
    if (!definition || component.checkedAt === null) return { ...component, state: "unknown" as const };
    const checkedAtMs = Date.parse(component.checkedAt);
    const stale = !Number.isFinite(checkedAtMs) || now.getTime() - checkedAtMs > definition.evidenceTtlMs;
    return stale ? { ...component, state: "unknown" as const } : { ...component };
  });

  return {
    status: aggregateStatus(evaluated),
    checkedAt: now.toISOString(),
    components: evaluated,
  };
}

export function createHealthRegistry(definitions: readonly HealthComponentDefinition[]): HealthRegistry {
  const normalized = definitions.map(definition => ({ ...definition, id: definition.id.trim(), name: definition.name.trim() }));
  normalized.forEach(assertDefinition);
  const ids = new Set<string>();
  for (const definition of normalized) {
    if (ids.has(definition.id)) throw new Error(`Duplicate health component id: ${definition.id}`);
    ids.add(definition.id);
  }
  const frozenDefinitions = Object.freeze(normalized.map(definition => Object.freeze(definition)));

  return {
    definitions: frozenDefinitions,
    async probeAll(now = new Date()) {
      const components = await Promise.all(frozenDefinitions.map(async definition => {
        const startedAt = Date.now();
        let state: HealthState = "unhealthy";
        try {
          const result = await withTimeout(definition.probe, definition.timeoutMs);
          state = result === "degraded" ? "degraded" : "healthy";
        } catch {
          state = "unhealthy";
        }
        return {
          id: definition.id,
          name: definition.name,
          state,
          criticality: definition.criticality,
          blocksReadiness: definition.blocksReadiness,
          checkedAt: now.toISOString(),
          durationMs: Math.max(0, Date.now() - startedAt),
        } satisfies HealthComponentSnapshot;
      }));

      return evaluateHealthSnapshot(frozenDefinitions, components, now);
    },
  };
}
