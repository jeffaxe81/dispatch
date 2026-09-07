import { describe, expect, it } from "vitest";
import { EMBEDDED_APPLICATIONS, NEO_INTERACT_EMBEDDED_APPLICATION } from "@shared/embeddedApplications";
import { resolveNeoCommunicationApplication } from "./NeoCommunicationWidget";

describe("D-010C NeoCommunicationWidget", () => {
  it("resolve exclusivamente o neo-interact já autorizado", () => {
    expect(resolveNeoCommunicationApplication(EMBEDDED_APPLICATIONS)).toEqual(NEO_INTERACT_EMBEDDED_APPLICATION);
  });

  it("não inventa fallback quando o NEO não está no catálogo autorizado", () => {
    expect(resolveNeoCommunicationApplication([])).toBeNull();
  });
});
