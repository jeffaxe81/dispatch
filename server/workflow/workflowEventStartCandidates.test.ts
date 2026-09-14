import { describe, expect, it } from "vitest";
import { workflowVersions, workflows } from "../../drizzle/schema";
import { workflowPublicationPointers } from "./workflowPublicationSchema";
import { workflowTenantScopes } from "./workflowTenantScopeSchema";

const persistenceModulePath = "./workflowEventTriggerPersistence";
const loadPersistence = () => import(persistenceModulePath);

function conditionContainsNumber(value: unknown, expected: number, visited = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (visited.has(value as object)) return false;
  visited.add(value as object);
  if ((value as { value?: unknown }).value === expected) return true;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(nested) && nested.some(item => conditionContainsNumber(item, expected, visited))) return true;
    if (nested && typeof nested === "object" && conditionContainsNumber(nested, expected, visited)) return true;
  }
  return false;
}

const incidentTriggerDefinition = {
  nodes: [
    {
      id: "incident-created",
      type: "trigger.external_data",
      configuration: { eventType: "incident.created.v1" },
    },
    {
      id: "notify",
      type: "notification.simulate",
      configuration: {},
    },
  ],
  edges: [{ id: "incident-next", source: "incident-created", target: "notify" }],
};

const formTriggerDefinition = {
  nodes: [
    {
      id: "form-submitted",
      type: "trigger.external_data",
      configuration: { eventType: "form.submission.submitted.v1" },
    },
  ],
  edges: [],
};

const noMatchingTriggerDefinition = {
  nodes: [
    {
      id: "manual",
      type: "trigger.manual",
      configuration: {},
    },
  ],
  edges: [],
};

function createMatchingHarness() {
  const publishedVersion = 71;
  const draftVersion = 72;
  const workflowRows = [
    { id: 1, active: true, simulationOnly: true, currentVersion: draftVersion },
    { id: 2, active: false, simulationOnly: true, currentVersion: publishedVersion },
    { id: 3, active: true, simulationOnly: true, currentVersion: publishedVersion },
    { id: 4, active: true, simulationOnly: true, currentVersion: draftVersion },
    { id: 5, active: true, simulationOnly: true, currentVersion: publishedVersion },
  ];
  const scopes = [
    { workflowId: 1, organizationId: 42 },
    { workflowId: 2, organizationId: 42 },
    { workflowId: 4, organizationId: 42 },
    { workflowId: 5, organizationId: 42 },
    { workflowId: 3, organizationId: 99 },
  ];
  const pointers = [1, 2, 3, 4, 5].map(id => ({ id, publishedVersion }));
  const versions = [
    { id: 101, workflowId: 1, version: publishedVersion, definition: incidentTriggerDefinition },
    { id: 102, workflowId: 1, version: draftVersion, definition: formTriggerDefinition },
    { id: 201, workflowId: 2, version: publishedVersion, definition: incidentTriggerDefinition },
    { id: 301, workflowId: 3, version: publishedVersion, definition: incidentTriggerDefinition },
    { id: 401, workflowId: 4, version: publishedVersion, definition: noMatchingTriggerDefinition },
    { id: 402, workflowId: 4, version: draftVersion, definition: incidentTriggerDefinition },
    { id: 501, workflowId: 5, version: publishedVersion, definition: formTriggerDefinition },
  ];

  let workflowReadQueue: number[] = [];
  let currentWorkflowId: number | null = null;

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async () => {
            if (table === workflowTenantScopes) {
              const organizationId = conditionContainsNumber(condition, 42)
                ? 42
                : conditionContainsNumber(condition, 99)
                  ? 99
                  : null;
              if (organizationId === null) return [];
              const rows = scopes.filter(scope => scope.organizationId === organizationId);
              workflowReadQueue = rows.map(scope => scope.workflowId);
              return rows;
            }
            if (table === workflows) {
              currentWorkflowId = workflowReadQueue.shift() ?? null;
              const row = workflowRows.find(candidate => candidate.id === currentWorkflowId);
              return row ? [row] : [];
            }
            if (table === workflowPublicationPointers) {
              const row = pointers.find(candidate => candidate.id === currentWorkflowId);
              return row ? [row] : [];
            }
            if (table === workflowVersions) {
              if (currentWorkflowId === null || !conditionContainsNumber(condition, publishedVersion)) return [];
              const row = versions.find(candidate =>
                candidate.workflowId === currentWorkflowId && candidate.version === publishedVersion,
              );
              return row ? [row] : [];
            }
            return [];
          },
        }),
      }),
    }),
  };

  return { tx };
}

describe("D-012F persisted event start candidates", () => {
  it("casa somente trigger inicial da versão publicada de workflow ativo do mesmo tenant", async () => {
    const { findWorkflowEventStartCandidatesInTransaction } = await loadPersistence();
    const { tx } = createMatchingHarness();

    await expect(
      findWorkflowEventStartCandidatesInTransaction(tx, 42, "incident.created.v1"),
    ).resolves.toEqual([
      {
        workflowId: 1,
        workflowVersionId: 101,
        tenantId: "42",
        triggerNodeId: "incident-created",
      },
    ]);
  });

  it("não usa currentVersion/rascunho e mantém o matching isolado por tenant", async () => {
    const { findWorkflowEventStartCandidatesInTransaction } = await loadPersistence();
    const formHarness = createMatchingHarness();

    await expect(
      findWorkflowEventStartCandidatesInTransaction(formHarness.tx, 42, "form.submission.submitted.v1"),
    ).resolves.toEqual([
      {
        workflowId: 5,
        workflowVersionId: 501,
        tenantId: "42",
        triggerNodeId: "form-submitted",
      },
    ]);

    const tenantHarness = createMatchingHarness();
    await expect(
      findWorkflowEventStartCandidatesInTransaction(tenantHarness.tx, 99, "incident.created.v1"),
    ).resolves.toEqual([
      {
        workflowId: 3,
        workflowVersionId: 301,
        tenantId: "99",
        triggerNodeId: "incident-created",
      },
    ]);
  });

  it("retorna vazio quando nenhuma versão publicada elegível possui o evento", async () => {
    const { findWorkflowEventStartCandidatesInTransaction } = await loadPersistence();
    const { tx } = createMatchingHarness();

    await expect(
      findWorkflowEventStartCandidatesInTransaction(tx, 42, "inventory.asset.updated.v1"),
    ).resolves.toEqual([]);
  });
});
