export function definitionRequiresHumanTask(definition: Record<string, unknown>): boolean {
  if (!Array.isArray(definition.nodes)) return false;

  return definition.nodes.some(rawNode => {
    if (!rawNode || typeof rawNode !== "object") return false;
    const node = rawNode as Record<string, unknown>;
    if (!node.configuration || typeof node.configuration !== "object") return false;
    const configuration = node.configuration as Record<string, unknown>;
    return configuration.requiresHumanTask === true;
  });
}

export function assertLegacyExecutorSupportsDefinition(definition: Record<string, unknown>) {
  if (definitionRequiresHumanTask(definition)) {
    throw new Error("Workflow com tarefa humana deve ser executado pela engine stateful; o executor legado de simulação não suporta requiresHumanTask.");
  }
}
