import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.NODE_ENV = "test";
process.env.VITE_APP_TITLE = "AXE Dispatch";
process.env.JWT_SECRET = "unit-test-only-session-secret-2026";
process.env.BUILT_IN_FORGE_API_URL = "https://forge.test";
process.env.BUILT_IN_FORGE_API_KEY = "unit-test-only-forge-key";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
