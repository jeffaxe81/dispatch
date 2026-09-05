import { describe, expect, it } from "vitest";
import {
  canManageEmbeddedApplications,
  canViewEmbeddedApplications,
} from "./embeddedAppAccess";

describe("RBAC de aplicações incorporadas na interface", () => {
  it("permite abrir NEO somente com embedded_apps.view ou wildcard administrativo", () => {
    expect(canViewEmbeddedApplications(["embedded_apps.view"])).toBe(true);
    expect(canViewEmbeddedApplications(["integrations.view"])).toBe(false);
    expect(canViewEmbeddedApplications(["*"])).toBe(true);
  });

  it("separa administração de visualização", () => {
    expect(canManageEmbeddedApplications(["embedded_apps.manage"])).toBe(true);
    expect(canManageEmbeddedApplications(["embedded_apps.view"])).toBe(false);
    expect(canManageEmbeddedApplications(["integrations.manage"])).toBe(false);
    expect(canManageEmbeddedApplications(["*"])).toBe(true);
  });
});
