/**
 * Isolated real Express + tRPC HTTP adapter on loopback for CI.
 * This is NOT the full production app, public networking or a deployment.
 */
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { rootRouter } from "../../server/rootRouter";
import { createContext } from "../../server/_core/context";

function assertIsolated(): void {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? ""); }
  catch { throw new Error("Unsafe HTTP smoke DB URL."); }
  if (process.env.SESSION_AUTH_MYSQL_SMOKE !== "1" ||
      process.env.SESSION_AUTH_HTTP_NODE !== "1" ||
      process.env.NODE_ENV !== "test" ||
      url.protocol !== "mysql:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/dispatch_auth_ci" ||
      !process.env.JWT_SECRET ||
      Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
    throw new Error("Refusing HTTP test node outside isolated CI.");
  }
}

assertIsolated();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));
app.use("/api/trpc", createExpressMiddleware({ router: rootRouter, createContext }));
const server = app.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Unexpected test listener.");
  process.stdout.write(JSON.stringify({ ready: true, port: addr.port }) + "\n");
});
function stop() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
