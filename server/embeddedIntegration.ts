const ALLOWED_OPERATIONAL_ROLES = new Set([
  "operador",
  "despachador",
  "agente",
  "supervisor",
  "administrador",
]);

const DISPLAY_MODES = new Set(["embedded", "fullscreen", "split"]);

export function validateEmbeddedIntegrationInput(input: {
  code: string;
  name: string;
  url: string;
  allowedRoles: string[];
  displayMode: string;
}) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) throw new Error("O código da integração é obrigatório.");
  if (!name) throw new Error("O nome da integração é obrigatório.");

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error("A URL da integração é inválida.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("A integração embutida deve utilizar HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("A URL da integração não pode conter credenciais embutidas.");
  }
  if (!DISPLAY_MODES.has(input.displayMode)) {
    throw new Error("Modo de exibição da integração inválido.");
  }
  if (!input.allowedRoles.length || input.allowedRoles.some(role => !ALLOWED_OPERATIONAL_ROLES.has(role))) {
    throw new Error("Foi informado um perfil operacional não suportado.");
  }

  return {
    code,
    name,
    url: parsed.toString(),
    allowedRoles: [...new Set(input.allowedRoles)],
    displayMode: input.displayMode as "embedded" | "fullscreen" | "split",
  };
}
