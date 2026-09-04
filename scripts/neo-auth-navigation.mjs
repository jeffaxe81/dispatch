function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function classifyNeoAuthNavigation({
  url,
  hasPassword,
  hasUsername,
  neoOrigin,
}) {
  const parsed = safeUrl(url);
  if (!parsed) return "network-error";

  if (parsed.protocol === "chrome-error:" || parsed.protocol === "chrome:") {
    return "network-error";
  }

  const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (!isHttp) return "network-error";

  const hasLoginFields = Boolean(hasPassword && hasUsername);
  const isNeo = parsed.origin === neoOrigin;

  if (!isNeo && !hasLoginFields) return "redirect-or-sso";

  if (isNeo && !hasLoginFields) {
    if (!/login|auth|signin/i.test(parsed.pathname + parsed.search)) {
      return "authenticated";
    }
    return "login-form-not-found";
  }

  return "login-form-found";
}
