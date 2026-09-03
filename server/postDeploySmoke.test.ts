import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
  new URL("../scripts/post-deploy-smoke.mjs", import.meta.url),
);
const openServers = new Set<ReturnType<typeof createServer>>();

type SmokeResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

async function runSmoke(env: Record<string, string>): Promise<SmokeResult> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

async function startControlledServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void =
    (request, response) => {
      if (request.url === "/health/live") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "alive" }));
        return;
      }
      if (request.url === "/health/ready") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            status: "ready",
            checks: { database: "ok", storage: "ok" },
          }),
        );
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Dispatch</title>");
    },
): Promise<string> {
  const server = createServer(handler);
  openServers.add(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Não foi possível obter a porta do servidor controlado.");
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    [...openServers].map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        }),
    ),
  );
  openServers.clear();
});

describe("smoke test pós-publicação", () => {
  it("aprova liveness, readiness e página HTML", async () => {
    const baseUrl = await startControlledServer();

    const result = await runSmoke({ SMOKE_BASE_URL: baseUrl });

    expect(result).toEqual({
      code: 0,
      stdout: [
        "[smoke] PASS liveness",
        "[smoke] PASS readiness",
        "[smoke] PASS homepage",
        "[smoke] PASS all checks",
        "",
      ].join("\n"),
      stderr: "",
    });
  });

  it.each([
    {
      name: "liveness",
      route: "/health/live",
      expected: "[smoke] FAIL liveness: expected HTTP 200",
    },
    {
      name: "readiness",
      route: "/health/ready",
      expected: "[smoke] FAIL readiness: expected HTTP 200",
    },
    {
      name: "homepage",
      route: "/",
      expected: "[smoke] FAIL homepage: expected HTTP 200",
    },
  ])("identifica falha HTTP em $name", async row => {
    const baseUrl = await startControlledServer((request, response) => {
      if (request.url === row.route) {
        response.writeHead(503, { "Content-Type": "text/plain" });
        response.end("detalhe interno que não deve ser impresso");
        return;
      }
      if (request.url === "/health/live") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "alive" }));
        return;
      }
      if (request.url === "/health/ready") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            status: "ready",
            checks: { database: "ok", storage: "ok" },
          }),
        );
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html>");
    });

    const result = await runSmoke({ SMOKE_BASE_URL: baseUrl });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(row.expected);
    expect(result.stderr).not.toContain("detalhe interno");
  });

  it.each([
    { value: "", expected: "SMOKE_BASE_URL" },
    { value: "ftp://dispatch.test", expected: "http or https" },
  ])("rejeita URL inválida antes de acessar a rede", async row => {
    const result = await runSmoke({ SMOKE_BASE_URL: row.value });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("[smoke] FAIL configuration:");
    expect(result.stderr).toContain(row.expected);
  });

  it.each(["99", "30001", "1.5", "não-numérico"])(
    "rejeita timeout fora do limite: %s",
    async timeout => {
      const result = await runSmoke({
        SMOKE_BASE_URL: "https://dispatch.test",
        SMOKE_TIMEOUT_MS: timeout,
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("SMOKE_TIMEOUT_MS must be 100..30000");
    },
  );

  it("reprova página inicial que não devolve HTML", async () => {
    const baseUrl = await startControlledServer((request, response) => {
      if (request.url === "/health/live") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "alive" }));
        return;
      }
      if (request.url === "/health/ready") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            status: "ready",
            checks: { database: "ok", storage: "ok" },
          }),
        );
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });

    const result = await runSmoke({ SMOKE_BASE_URL: baseUrl });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "[smoke] FAIL homepage: expected text/html",
    );
  });
});
