import { describe, expect, it } from "vitest";
import { buildOpenStreetMapEmbedUrl } from "./OpenStreetMapFallback";

describe("fallback OpenStreetMap", () => {
  it("gera uma URL de incorporação com a camada padrão e o centro operacional", () => {
    const url = buildOpenStreetMapEmbedUrl({ lat: -27.1, lng: -48.91 }, 13, []);
    expect(url).toContain("openstreetmap.org/export/embed.html");
    expect(url).toContain("layer=mapnik");
    expect(decodeURIComponent(url)).toContain("marker=-27.1,-48.91");
  });

  it("expande a área de contingência para conter pontos operacionais válidos", () => {
    const url = decodeURIComponent(buildOpenStreetMapEmbedUrl({ lat: -27.1, lng: -48.91 }, 13, [{ latitude: "-27.2", longitude: "-49.0" }]));
    const bbox = new URL(url).searchParams.get("bbox")!.split(",").map(Number);
    expect(bbox[0]).toBeLessThanOrEqual(-49);
    expect(bbox[1]).toBeLessThanOrEqual(-27.2);
    expect(bbox[2]).toBeGreaterThanOrEqual(-48.91);
    expect(bbox[3]).toBeGreaterThanOrEqual(-27.1);
  });
});
