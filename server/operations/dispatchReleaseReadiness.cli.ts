import fs from "node:fs";
import path from "node:path";
import { evaluateDispatchReadiness } from "./dispatchReleaseReadiness";

const file = path.resolve(import.meta.dirname, "../../docs/quality/real-environment-pending-2026-10-23.json");
try {
  const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = evaluateDispatchReadiness(data);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  // Report-only: never changes the environment or authorizes production.
  if (!result.manifest_valid) process.exitCode = 2;
} catch {
  process.stderr.write("DISPATCH_READINESS_MANIFEST_UNREADABLE\n");
  process.exitCode = 2;
}
