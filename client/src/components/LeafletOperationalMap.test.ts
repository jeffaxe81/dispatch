import { describe, expect, it } from "vitest";
import { geoJsonLineStringToLeafletPositions } from "./leafletGeometry";

describe("LeafletOperationalMap GIS adapter", () => {
  it("converte GeoJSON [longitude, latitude] para posições Leaflet [latitude, longitude]", () => {
    expect(geoJsonLineStringToLeafletPositions({
      type: "LineString",
      coordinates: [
        [-48.91, -27.10],
        [-48.92, -27.11],
      ],
    })).toEqual([
      [-27.10, -48.91],
      [-27.11, -48.92],
    ]);
  });

  it("descarta coordenadas inválidas da geometria recebida", () => {
    expect(geoJsonLineStringToLeafletPositions({
      type: "LineString",
      coordinates: [
        [-48.91, -27.10],
        [999, 999],
        [-48.92, -27.11],
      ],
    })).toEqual([
      [-27.10, -48.91],
      [-27.11, -48.92],
    ]);
  });
});
