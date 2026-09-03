import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  resolveSafeNeoRedirect,
  summarizeNeoProbeResponse,
  type NeoProbeResponseSummary,
} from "../server/neoEmbedProbe";

const TARGET_URL = "https://gscprj.saas.digitro.cloud/neo/";
const MAX_HOPS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const OUTPUT_DIR = resolve("artifacts/neo-external-compatibility");
const REPORT_PATH = resolve(OUTPUT_DIR, "report.json");

type ProbeHop = NeoProbeResponseSummary & {
  permissionsPolicy: string | null;
  redirectFollowed: boolean;
  stopReason: string | null;
};

type ProbeReport = {
  status: "completed" | "network-error";
  generatedAt: string;
  target: string;
  authenticated: false;
  cookieJar: false;
  maxHops: number;
  cookieExtraction: "getSetCookie" | "unavailable";
  hops: ProbeHop[];
  finalEmbedding: NeoProbeResponseSummary["embedding"]["embedding"] | null;
  notes: string[];
  error?: {
    name: string;
    code: string | null;
  };
};

function selectedHeaders(headers: Headers): Record<string, string | undefined> {
  return {
    "content-type": headers.get("content-type") ?? undefined,
    "content-security-policy": headers.get("content-security-policy") ?? undefined,
    "x-frame-options": headers.get("x-frame-options") ?? undefined,
    location: headers.get("location") ?? undefined,
  };
}

function getSetCookies(headers: Headers): {
  method: ProbeReport["cookieExtraction"];
  values: string[];
} {
  const candidate = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof candidate.getSetCookie === "function") {
    return { method: "getSetCookie", values: candidate.getSetCookie() };
  }

  return { method: "unavailable", values: [] };
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const direct = Reflect.get(error, "code");
  if (typeof direct === "string") return direct;

  const cause = Reflect.get(error, "cause");
  if (cause && typeof cause === "object") {
    const nested = Reflect.get(cause, "code");
    if (typeof nested === "string") return nested;
  }

  return null;
}

async function request(url: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "user-agent": "AXE-Dispatch-NEO-Compatibility-Probe/1.0",
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, 750));
      }
    }
  }

  throw lastError;
}

async function writeReport(report: ProbeReport) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const hops: ProbeHop[] = [];
let currentUrl = TARGET_URL;
let cookieExtraction: ProbeReport["cookieExtraction"] = "unavailable";

try {
  for (let hopIndex = 0; hopIndex < MAX_HOPS; hopIndex += 1) {
    const response = await request(currentUrl);
    const cookies = getSetCookies(response.headers);
    cookieExtraction = cookies.method;
    const rawLocation = response.headers.get("location");
    const summary = summarizeNeoProbeResponse({
      url: currentUrl,
      status: response.status,
      headers: selectedHeaders(response.headers),
      setCookies: cookies.values,
    });

    const redirectStatus = response.status >= 300 && response.status < 400;
    let redirectFollowed = false;
    let stopReason: string | null = null;
    let nextUrl: string | null = null;

    if (redirectStatus && rawLocation) {
      nextUrl = resolveSafeNeoRedirect(currentUrl, rawLocation);
      if (!nextUrl) {
        stopReason = "unsafe-or-external-redirect";
      } else if (hopIndex + 1 >= MAX_HOPS) {
        stopReason = "redirect-limit-reached";
      } else {
        redirectFollowed = true;
      }
    } else if (redirectStatus) {
      stopReason = "redirect-without-location";
    } else {
      stopReason = "terminal-response";
    }

    hops.push({
      ...summary,
      permissionsPolicy: response.headers.get("permissions-policy"),
      redirectFollowed,
      stopReason,
    });

    await response.body?.cancel().catch(() => undefined);

    if (!redirectFollowed || !nextUrl) break;
    currentUrl = nextUrl;
  }

  const report: ProbeReport = {
    status: "completed",
    generatedAt: new Date().toISOString(),
    target: TARGET_URL,
    authenticated: false,
    cookieJar: false,
    maxHops: MAX_HOPS,
    cookieExtraction,
    hops,
    finalEmbedding: hops.at(-1)?.embedding.embedding ?? null,
    notes: [
      "No credentials or authenticated session were used.",
      "Cookies observed in responses were never persisted or replayed; only cookie names and policy attributes are recorded.",
      "Redirect query strings and fragments are removed from the stored evidence.",
      "A completed probe describes observed HTTP policies; it does not by itself prove authenticated browser behavior inside an iframe.",
    ],
  };

  await writeReport(report);
  console.log(
    `neo_external_probe=completed hops=${hops.length} final_status=${hops.at(-1)?.status ?? "none"} embedding=${report.finalEmbedding ?? "none"} cookies=${hops.reduce((total, hop) => total + hop.cookies.length, 0)}`,
  );
} catch (error) {
  const report: ProbeReport = {
    status: "network-error",
    generatedAt: new Date().toISOString(),
    target: TARGET_URL,
    authenticated: false,
    cookieJar: false,
    maxHops: MAX_HOPS,
    cookieExtraction,
    hops,
    finalEmbedding: hops.at(-1)?.embedding.embedding ?? null,
    notes: [
      "The runner could not complete the unauthenticated HTTP compatibility probe.",
      "No credentials, session cookies or provider settings were changed.",
    ],
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      code: errorCode(error),
    },
  };

  await writeReport(report);
  console.error(
    `neo_external_probe=network-error name=${report.error?.name ?? "UnknownError"} code=${report.error?.code ?? "none"}`,
  );
  process.exitCode = 1;
}
