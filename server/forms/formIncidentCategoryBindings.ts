type FormBinding = { formId: number; formVersionId: number; contextType: string; contextId: string };

/**
 * AXED-F021: an explicit incident binding overrides the category default
 * for the same form. Inherited bindings are returned in the INCIDENT
 * context so submissions attach to that exact authorized incident.
 * Caller must obtain category from the tenant-scoped incident record.
 */
export function mergeAuthorizedIncidentCategoryBindings<T extends FormBinding>(
  incidentId: string,
  direct: readonly T[],
  category: readonly T[],
): Array<T & { inheritedFromCategory: boolean }> {
  if (!/^\d+$/.test(incidentId) || Number(incidentId) <= 0)
    throw new Error("Identificador da ocorrência inválido.");
  const directForms = new Set(direct.map(row => row.formId));
  const result: Array<T & { inheritedFromCategory: boolean }> = [];
  const seenForms = new Set<number>();
  for (const row of direct) {
    if (row.contextType !== "incident" || row.contextId !== incidentId) continue;
    if (seenForms.has(row.formId)) continue;
    seenForms.add(row.formId);
    result.push({ ...row, inheritedFromCategory: false });
  }
  for (const row of category) {
    if (row.contextType !== "incident_category" || !row.contextId.trim()) continue;
    if (directForms.has(row.formId) || seenForms.has(row.formId)) continue;
    seenForms.add(row.formId);
    result.push({ ...row, contextType: "incident", contextId: incidentId, inheritedFromCategory: true });
  }
  return result;
}
