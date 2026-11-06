import type { NextFunction, Request, Response } from "express";

type MutationRequest = {
  method: string;
  host: string | undefined;
  protocol: string;
  origin: string | undefined;
  fetchSite: string | undefined;
  hasCookies: boolean;
};

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Defense in depth against browser-based CSRF on the cookie-authenticated
 * tRPC endpoint. Fetch Metadata is browser-controlled and works through the
 * local Vite reverse proxy, where upstream Host differs from browser Origin.
 *
 * Older clients fall back to exact Origin matching. Headerless requests with
 * cookies are rejected rather than silently trusting a cross-origin POST.
 */
export function isTrpcMutationAllowed(request: MutationRequest): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return true;

  // Browsers set Sec-Fetch-Site; JS in another origin cannot forge this header.
  // "same-site" subdomains are NOT trusted for write requests.
  const site = request.fetchSite?.toLowerCase();
  if (site !== undefined) {
    return site === "same-origin";
  }

  if (request.origin !== undefined) {
    if (!request.host || !["http", "https"].includes(request.protocol)) return false;
    try {
      const target = new URL(`${request.protocol}://${request.host}`);
      const source = new URL(request.origin);
      if (target.username || target.password || target.pathname !== "/" ||
          target.search || target.hash || source.username || source.password ||
          source.pathname !== "/" || source.search || source.hash) return false;
      return source.origin === target.origin &&
        ["http:", "https:"].includes(source.protocol);
    } catch {
      return false;
    }
  }

  // No browser security metadata: keep non-browser API clients possible, but
  // never accept a cookie-bearing mutation whose source cannot be verified.
  return !request.hasCookies;
}

export function requireSameOriginTrpcMutation(req: Request, res: Response, next: NextFunction): void {
  const allowed = isTrpcMutationAllowed({
    method: req.method,
    host: req.get("host"),
    protocol: req.protocol,
    origin: req.get("origin"),
    fetchSite: req.get("sec-fetch-site"),
    hasCookies: Boolean(req.get("cookie")),
  });
  if (allowed) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(403).json({ error: "Requisição de origem não autorizada." });
}
