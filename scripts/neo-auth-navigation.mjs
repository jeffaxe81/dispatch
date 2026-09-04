const ALLOWED_NAVIGATION_ERRORS = new Set([
  "net::ERR_ABORTED",
  "net::ERR_BLOCKED_BY_CLIENT",
  "net::ERR_BLOCKED_BY_RESPONSE",
  "net::ERR_CERT_AUTHORITY_INVALID",
  "net::ERR_CERT_COMMON_NAME_INVALID",
  "net::ERR_CERT_DATE_INVALID",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_REFUSED",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_FAILED",
  "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_NAME_NOT_RESOLVED",
  "net::ERR_PROXY_CONNECTION_FAILED",
  "net::ERR_TIMED_OUT",
]);

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

export function summarizeNavigateResult({ errorText, currentUrl }) {
  const parsed = safeUrl(currentUrl);
  return {
    navigationError: errorText
      ? ALLOWED_NAVIGATION_ERRORS.has(errorText)
        ? errorText
        : "<redacted-error>"
      : null,
    finalProtocol: parsed?.protocol ?? "<invalid-protocol>",
  };
}
