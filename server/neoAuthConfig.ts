import { sanitizeBrowserDiagnosticUrl } from "./neoBrowserDiagnostics";

export type NeoAuthStatus =
  | "authenticated"
  | "interactive-auth-required"
  | "login-form-not-found"
  | "login-rejected"
  | "network-error";

export function getNeoAuthConfig(
  env: Record<string, string | undefined>,
): { username: string; password: string } | null {
  const username = env.NEO_AUTH_USERNAME?.trim();
  const password = env.NEO_AUTH_PASSWORD;

  if (!username || !password) return null;
  return { username, password };
}

export function summarizeNeoAuthOutcome(input: {
  status: NeoAuthStatus;
  currentUrl: string;
  username?: string;
  password?: string;
}) {
  return {
    status: input.status,
    currentUrl: sanitizeBrowserDiagnosticUrl(input.currentUrl),
  };
}
