import { describe, expect, it } from "vitest";
import { prepareEmbeddedIntegrationRecord } from "./embeddedIntegrationPersistence";

describe("CP-016 embedded integration persistence", () => {
  it("normalizes the NEO integration record without credentials", () => {
    const record = prepareEmbeddedIntegrationRecord({
      code: "neo-interact",
      name: "NEO Interact",
      url: "https://gscprj.saas.digitro.cloud/neo/",
      enabled: true,
      displayMode: "split",
      allowedRoles: ["despachador", "supervisor", "administrador"],
      actorUserId: 7,
      integrationConnectionId: null,
    });

    expect(record).toMatchObject({
      code: "neo-interact",
      name: "NEO Interact",
      url: "https://gscprj.saas.digitro.cloud/neo/",
      enabled: true,
      displayMode: "split",
      createdByUserId: 7,
      updatedByUserId: 7,
    });
    expect(JSON.stringify(record)).not.toContain("password");
  });

  it("rejects duplicated allowed roles only by normalizing them", () => {
    const record = prepareEmbeddedIntegrationRecord({
      code: "neo-interact",
      name: "NEO Interact",
      url: "https://gscprj.saas.digitro.cloud/neo/",
      enabled: false,
      displayMode: "embedded",
      allowedRoles: ["despachador", "despachador"],
      actorUserId: 7,
      integrationConnectionId: null,
    });

    expect(record.allowedRoles).toEqual(["despachador"]);
  });
});
