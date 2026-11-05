import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  // Express only honors X-Forwarded-Proto when the application explicitly
  // enables a trusted proxy in index.ts. Never trust this header directly.
  return req.secure || req.protocol === "https";
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  return {
    httpOnly: true,
    path: "/",
    // Same-origin AXE Despacho sessions do not require cross-site cookies.
    // SameSite=None on every HTTPS request unnecessarily widened CSRF exposure.
    // Embedded third-party integrations must be reviewed before this can merge.
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
