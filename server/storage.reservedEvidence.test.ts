import { describe, expect, it } from "vitest";
import { isReservedIncidentEvidenceKey, storagePutReservedIncidentEvidence } from "./storage";

const uuid = "12345678-1234-4abc-8def-1234567890ab";
const valid = `incident-evidence/42/17/${uuid}-foto-local.png`;

describe("immutable reserved incident evidence storage keys", () => {
  it("accepts server-created UUIDv4 paths with canonical media extension", () => {
    for (const ext of ["jpg", "png", "webp", "pdf"]) {
      expect(isReservedIncidentEvidenceKey(`incident-evidence/42/17/${uuid}-evidence.${ext}`)).toBe(true);
    }
  });

  it.each([
    "../incident-evidence/42/17/" + uuid + "-foo.png",
    "/incident-evidence/42/17/" + uuid + "-foo.png",
    "incident-evidence/42/17/../other.png",
    "incident-evidence/42/17/not-uuid-foo.png",
    "incident-evidence/42/17/12345678-1234-1abc-8def-1234567890ab-a.pdf",
    "incident-evidence/42/17/" + uuid + "-x.png/another",
    "incident-evidence/42/17/" + uuid + "-photo.exe",
    "incident-evidence/42/17/" + uuid + "-evil%2Fname.png",
    "incident-evidence/42/17/" + uuid + "-spaces name.png",
    "incident-evidence/42/17/" + uuid + "-" + "x".repeat(101) + ".png",
    "incident-evidence/abc/17/" + uuid + "-x.png",
    "profile-photo/42/" + uuid + "-x.png",
  ])("rejects invalid or unsafe reserved storage key %s", async key => {
    expect(isReservedIncidentEvidenceKey(key)).toBe(false);
    await expect(storagePutReservedIncidentEvidence(key, Buffer.from("file"), "image/png"))
      .rejects.toThrow(/Invalid reserved/);
  });

  it("rejects mismatched MIME types before contacting any provider", async () => {
    await expect(storagePutReservedIncidentEvidence(valid, Buffer.from("file"), "application/pdf"))
      .rejects.toThrow(/extension does not match/);
    await expect(storagePutReservedIncidentEvidence(valid, Buffer.from("file"), "application/octet-stream"))
      .rejects.toThrow(/extension does not match/);
  });

  it("never accepts a key with an arbitrary extra extension", () => {
    expect(isReservedIncidentEvidenceKey(valid + ".php")).toBe(false);
    expect(isReservedIncidentEvidenceKey(valid)).toBe(true);
  });
});
