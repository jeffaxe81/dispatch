import { validateEmbeddedIntegrationInput } from "./embeddedIntegration";

export function prepareEmbeddedIntegrationRecord(input: {
  code: string;
  name: string;
  url: string;
  enabled: boolean;
  displayMode: "embedded" | "fullscreen" | "split";
  allowedRoles: string[];
  actorUserId: number;
  integrationConnectionId: number | null;
}) {
  const validated = validateEmbeddedIntegrationInput(input);
  return {
    code: validated.code,
    name: validated.name,
    url: validated.url,
    enabled: input.enabled,
    displayMode: validated.displayMode,
    allowedRoles: validated.allowedRoles,
    integrationConnectionId: input.integrationConnectionId,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
  };
}
