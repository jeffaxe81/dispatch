import express, { type Express } from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: dependencyMocks.getDb }));
vi.mock("../storage", () => ({
  storageGetSignedUrl: dependencyMocks.storageGetSignedUrl,
  storagePut: dependencyMocks.storagePut,
}));

import {
  checkDatabaseReady,
  checkStorageReady,
  evaluateReadiness,
  registerOperationalHealthRoutes,
  type OperationalHealthOptions,
} from "./operationalHealth";

type HttpResult = {
  status: number;
  cacheControl: string | null;
  body: unknown;
};

const openServers = new Set<Server>();

async function request(app: Express, path: string): Promise<HttpResult> {
  const server = await new Promise<Server>(resolve => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
  });
  openServers.add(server);

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("O teste não conseguiu obter a porta efêmera.");
  }

  const response = await fetch(
    `http://127.0.0.1:${address.port}${path}`,
  );
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: await response.json(),
  };
}

function createChecks(
  overrides: Partial<OperationalHealthOptions> = {},
): OperationalHealthOptions {
  return {
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    checkStorage: vi.fn().mockResolvedValue(undefined),
    timeoutMs: 2_000,
    ...overrides,
  };
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saúde operacional HTTP", () => {
  it("responde liveness sem consultar dependências externas", async () => {
    const app = express();
    const checks = createChecks();
    registerOperationalHealthRoutes(app, checks);

    await expect(request(app, "/health/live")).resolves.toEqual({
      status: 200,
      cacheControl: "no-store",
      body: { status: "alive" },
    });
    expect(checks.checkDatabase).not.toHaveBeenCalled();
    expect(checks.checkStorage).not.toHaveBeenCalled();
  });

  it("aprova readiness somente quando banco e armazenamento respondem", async () => {
    const app = express();
    const checks = createChecks();
    registerOperationalHealthRoutes(app, checks);

    await expect(request(app, "/health/ready")).resolves.toEqual({
      status: 200,
      cacheControl: "no-store",
      body: {
        status: "ready",
        checks: { database: "ok", storage: "ok" },
      },
    });
    expect(checks.checkDatabase).toHaveBeenCalledTimes(1);
    expect(checks.checkStorage).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "banco",
      databaseError: "mysql://usuario:senha@banco/app stack secreto",
      storageError: undefined,
      expected: { database: "failed", storage: "ok" },
    },
    {
      name: "armazenamento",
      databaseError: undefined,
      storageError: "Bearer segredo https://storage.exemplo/objeto",
      expected: { database: "ok", storage: "failed" },
    },
    {
      name: "ambos",
      databaseError: "erro banco",
      storageError: "erro storage",
      expected: { database: "failed", storage: "failed" },
    },
  ])("reprova readiness quando falha $name sem vazar detalhes", async row => {
    const app = express();
    registerOperationalHealthRoutes(
      app,
      createChecks({
        checkDatabase: row.databaseError
          ? vi.fn().mockRejectedValue(new Error(row.databaseError))
          : vi.fn().mockResolvedValue(undefined),
        checkStorage: row.storageError
          ? vi.fn().mockRejectedValue(new Error(row.storageError))
          : vi.fn().mockResolvedValue(undefined),
      }),
    );

    const result = await request(app, "/health/ready");

    expect(result).toEqual({
      status: 503,
      cacheControl: "no-store",
      body: { status: "not_ready", checks: row.expected },
    });
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toMatch(
      /mysql:\/\/|Bearer|https:\/\/storage|stack|erro banco|erro storage/i,
    );
  });

  it("reprova somente o check que ultrapassa o prazo", async () => {
    const result = await evaluateReadiness(
      createChecks({
        checkDatabase: vi.fn(() => new Promise<void>(() => undefined)),
        timeoutMs: 10,
      }),
    );

    expect(result).toEqual({
      status: "not_ready",
      checks: { database: "failed", storage: "ok" },
    });
  });
});

describe("adaptadores de readiness", () => {
  it("considera o banco pronto após uma consulta mínima bem-sucedida", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    dependencyMocks.getDb.mockResolvedValue({ execute });

    await expect(checkDatabaseReady()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reprova o banco quando nenhuma conexão está configurada", async () => {
    dependencyMocks.getDb.mockResolvedValue(null);

    await expect(checkDatabaseReady()).rejects.toThrow("database_unavailable");
  });

  it.each([200, 206])(
    "considera o armazenamento pronto com resposta HTTP %i",
    async status => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      dependencyMocks.storageGetSignedUrl.mockResolvedValue(
        "https://storage.test/sentinel",
      );
      const fetchMock = vi.fn().mockResolvedValue({
        status,
        body: { cancel },
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        checkStorageReady(" health/ready.txt ", 2_000),
      ).resolves.toBeUndefined();
      expect(dependencyMocks.storageGetSignedUrl).toHaveBeenCalledWith(
        "health/ready.txt",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://storage.test/sentinel",
        expect.objectContaining({
          method: "GET",
          headers: { Range: "bytes=0-0" },
          signal: expect.any(AbortSignal),
        }),
      );
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(dependencyMocks.storagePut).not.toHaveBeenCalled();
    },
  );

  it("reprova o armazenamento quando a chave sentinela está vazia", async () => {
    await expect(checkStorageReady("   ")).rejects.toThrow(
      "storage_healthcheck_key_missing",
    );
    expect(dependencyMocks.storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("reprova o armazenamento quando a assinatura não devolve URL", async () => {
    dependencyMocks.storageGetSignedUrl.mockResolvedValue("");

    await expect(checkStorageReady("health/ready.txt")).rejects.toThrow(
      "storage_signed_url_missing",
    );
  });

  it.each([404, 500])(
    "reprova o armazenamento com resposta HTTP %i",
    async status => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      dependencyMocks.storageGetSignedUrl.mockResolvedValue(
        "https://storage.test/sentinel",
      );
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ status, body: { cancel } }),
      );

      await expect(checkStorageReady("health/ready.txt")).rejects.toThrow(
        "storage_unavailable",
      );
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it("interrompe a leitura da sentinela quando o prazo expira", async () => {
    dependencyMocks.storageGetSignedUrl.mockResolvedValue(
      "https://storage.test/sentinel",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      ),
    );

    await expect(checkStorageReady("health/ready.txt", 10)).rejects.toThrow();
  });
});
