import { describe, expect, it } from "vitest";
import { EMBEDDED_APPLICATIONS, NEO_INTERACT_EMBEDDED_APPLICATION } from "@shared/embeddedApplications";
import { resolveAuthorizedIframeApplication } from "./AuthorizedIframeWidget";

describe("D-010C AuthorizedIframeWidget", () => {
  it("resolve somente applicationId presente no catálogo autorizado", () => {
    expect(resolveAuthorizedIframeApplication(EMBEDDED_APPLICATIONS, "neo-interact")).toEqual(NEO_INTERACT_EMBEDDED_APPLICATION);
  });

  it("falha fechado para applicationId desconhecido", () => {
    expect(resolveAuthorizedIframeApplication(EMBEDDED_APPLICATIONS, "evil-app")).toBeNull();
  });

  it("não possui caminho para URL arbitrária vinda de settings", () => {
    const poisonedSettings = { applicationId: "neo-interact", src: "https://evil.example/" } as Record<string, unknown>;
    expect(resolveAuthorizedIframeApplication(EMBEDDED_APPLICATIONS, String(poisonedSettings.applicationId))).toEqual(NEO_INTERACT_EMBEDDED_APPLICATION);
    expect(NEO_INTERACT_EMBEDDED_APPLICATION.src).not.toBe(poisonedSettings.src);
  });
});
