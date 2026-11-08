import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { isTrpcMutationAllowed, requireSameOriginTrpcMutation } from "./trpcCsrf";

const request = (overrides: Partial<Parameters<typeof isTrpcMutationAllowed>[0]> = {}) => ({
  method: "POST", host: "dispatch.example", protocol: "https",
  origin: "https://dispatch.example", fetchSite: undefined,
  hasCookies: true, ...overrides,
});

describe("tRPC anti-CSRF Fetch Metadata / Origin policy", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("does not block %s read/preflight requests", method => {
    expect(isTrpcMutationAllowed(request({
      method, fetchSite: "cross-site", origin: "https://malicious.example",
    }))).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "accepts same-origin browser writes on %s (including proxy Host differences)", method => {
      expect(isTrpcMutationAllowed(request({
        method, fetchSite: "same-origin", origin: "http://localhost:5175",
        host: "localhost:3000", protocol: "http",
      }))).toBe(true);
    },
  );

  it.each(["same-site", "cross-site", "none", "SAME-SITE", "garbage", ""])(
    "rejects untrusted Fetch Metadata value %s", fetchSite => {
      expect(isTrpcMutationAllowed(request({ fetchSite }))).toBe(false);
    },
  );

  it("rejects cross-origin writes even when cookies are absent (login CSRF)", () => {
    expect(isTrpcMutationAllowed(request({
      fetchSite: "cross-site", hasCookies: false,
    }))).toBe(false);
  });

  it.each([
    ["https://dispatch.example", "dispatch.example", "https", true],
    ["http://localhost:3000", "localhost:3000", "http", true],
    ["https://other.example", "dispatch.example", "https", false],
    ["http://dispatch.example", "dispatch.example", "https", false],
    ["https://dispatch.example:8443", "dispatch.example", "https", false],
    ["null", "dispatch.example", "https", false],
    ["not-a-url", "dispatch.example", "https", false],
    ["https://user:secret@dispatch.example", "dispatch.example", "https", false],
    ["https://dispatch.example/x", "dispatch.example", "https", false],
    ["https://dispatch.example", "dispatch.example/path", "https", false],
  ] as const)(
    "requires exact Origin equality when Fetch Metadata is absent: %s",
    (origin, host, protocol, allowed) => {
      expect(isTrpcMutationAllowed(request({
        fetchSite: undefined, origin, host, protocol,
      }))).toBe(allowed);
    },
  );

  it("fails closed on a cookie mutation with no browser-origin evidence", () => {
    expect(isTrpcMutationAllowed(request({
      fetchSite: undefined, origin: undefined,
    }))).toBe(false);
    expect(isTrpcMutationAllowed(request({
      fetchSite: undefined, origin: undefined, hasCookies: false,
    }))).toBe(true);
  });

  it("returns 403 without dispatching unsafe cross-site tRPC mutations", () => {
    const next = vi.fn();
    const req = {
      method: "POST", protocol: "https",
      get: (header: string) => ({
        host: "dispatch.example",
        cookie: "session=present",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      } as Record<string, string>)[header],
    } as unknown as Request;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const setHeader = vi.fn();
    requireSameOriginTrpcMutation(req, { status, json, setHeader } as unknown as Response, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Requisição de origem não autorizada." });
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("passes a legitimate same-origin mutation to the tRPC handler", () => {
    const next = vi.fn();
    const req = {
      method: "POST", protocol: "https",
      get: (header: string) => ({
        host: "dispatch.example",
        cookie: "session=present",
        origin: "https://dispatch.example",
        "sec-fetch-site": "same-origin",
      } as Record<string, string>)[header],
    } as unknown as Request;
    requireSameOriginTrpcMutation(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});
