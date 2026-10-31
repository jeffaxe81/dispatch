import type { FormAnswers, FormSchemaDefinition } from "@shared/forms";

export type AuthorizedIncidentPrefillSource = {
  code: string;
  category: string;
  priority: string;
};

/**
 * F028: only a small non-PII allowlist from a server-authorized incident.
 * Never copy requester's identity/contact, address, description, attachments,
 * location, or nested incident payloads. Explicit user action is required.
 */
export function proposeAuthorizedIncidentFormPrefill(
  definition: FormSchemaDefinition,
  currentAnswers: FormAnswers,
  authorizedIncident: AuthorizedIncidentPrefillSource | null,
): FormAnswers {
  if (!authorizedIncident) return { ...currentAnswers };
  const proposals: Record<string, string> = {
    incidentCode: authorizedIncident.code,
    incidentCategory: authorizedIncident.category,
    incidentPriority: authorizedIncident.priority,
  };
  const next = { ...currentAnswers };
  for (const field of definition.fields) {
    if (!("key" in field) || !Object.prototype.hasOwnProperty.call(proposals, field.key)) continue;
    if (Object.prototype.hasOwnProperty.call(currentAnswers, field.key) &&
        currentAnswers[field.key] !== "" &&
        currentAnswers[field.key] !== null &&
        currentAnswers[field.key] !== undefined) continue;
    const value = proposals[field.key];
    if (!value || value.length > 160) continue;
    if (field.type === "short_text" && (field.minLength === undefined || value.length >= field.minLength) &&
        (field.maxLength === undefined || value.length <= field.maxLength)) {
      next[field.key] = value;
    } else if (field.type === "single_choice" && field.options.some(option => option.value === value)) {
      next[field.key] = value;
    }
  }
  return next;
}
