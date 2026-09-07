import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { EMBEDDED_APPLICATIONS } from "@shared/embeddedApplications";
import { createEmbeddedApplicationCspMiddleware } from "../embeddedAppCsp";
import { ensureLocalAdministrator } from "../localAuth";
import { registerStorageProxy } from "./storageProxy";
import { rootRouter } from "../rootRouter";
import { alrtIngressJsonErrorHandler, registerAlrtIngressRoutes } from "../alrtIngress";
import { createContext } from "./context";
import { ENV, validateRuntimeEnv } from "./env";
import { createOperationalHealthRegistry } from "./operationalHealth";
import { installOperationalHealthRuntime } from "./operationalHealthRuntime";
import { parseServerPort, selectServerPort } from "./serverPort";
import { serveStatic, setupVite } from "./vite";

const HEALTH_WATCHDOG_INTERVAL_MS = 5_000;
const HEALTH_WATCHDOG_POLICY = {
  failuresToUnhealthy: 3,
  successesToRecover: 2,
  cooldownMs: 30_000,
} as const;

async function startServer() {
  if (ENV.isProduction) validateRuntimeEnv();
  await ensureLocalAdministrator();
  const app = express();
  const healthRegistry = createOperationalHealthRegistry();
  installOperationalHealthRuntime(app, {
    registry: healthRegistry,
    watchdogIntervalMs: HEALTH_WATCHDOG_INTERVAL_MS,
    watchdogPolicy: HEALTH_WATCHDOG_POLICY,
    logTransition: transition => {
      console.warn("Operational health transition", transition);
    },
  });
  // Trust exactly one forwarding hop only when deployment explicitly opts in.
  // This makes req.secure/request.ip reliable without trusting spoofed headers.
  app.set("trust proxy", ENV.trustProxy ? 1 : false);
  app.use(createEmbeddedApplicationCspMiddleware(EMBEDDED_APPLICATIONS));
  const server = createServer(app);
  // ALRT owns a strict 256 KiB parser and must be registered before the
  // authenticated application parser to avoid buffering oversized bodies.
  registerAlrtIngressRoutes(app);
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerStorageProxy(app);
  app.use(alrtIngressJsonErrorHandler);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: rootRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const configuredPort = parseServerPort(process.env.PORT);
  const port = await selectServerPort({
    configuredPort,
    isProduction: ENV.isProduction,
  });

  if (port !== configuredPort) {
    console.log(`Port ${configuredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});