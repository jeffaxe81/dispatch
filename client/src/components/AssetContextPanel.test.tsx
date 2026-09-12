// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssetContextPanel from "./AssetContextPanel";

const asset = {
  id: "asset-1",
  code: "PST-001",
  name: "Poste 001",
  assetType: "poste",
  status: "ativo",
  latitude: -27.59,
  longitude: -48.55,
};

describe("M14 AssetContextPanel", () => {
  it("pesquisa, seleciona e contextualiza um ativo sem interromper o fluxo da ocorrência", async () => {
    const searchAssets = vi.fn().mockResolvedValue([asset]);
    const linkAsset = vi.fn().mockResolvedValue(undefined);
    render(<AssetContextPanel incidentReference="OCC-42" searchAssets={searchAssets} linkAsset={linkAsset} inventoryUrl="https://inventory.local" />);

    fireEvent.change(screen.getByPlaceholderText(/buscar ativo/i), { target: { value: "PST-001" } });
    fireEvent.click(screen.getByRole("button", { name: /^buscar$/i }));
    const selectAsset = await screen.findByRole("button", { name: /selecionar PST-001/i });
    fireEvent.click(selectAsset);

    expect(screen.getByText("PST-001")).toBeTruthy();
    expect(screen.getByText("poste · ativo")).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir prontuário/i }).getAttribute("href")).toBe("https://inventory.local/assets/asset-1");
    expect((screen.getByRole("button", { name: /ver no mapa/i }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /vincular à ocorrência/i }));
    await waitFor(() => expect(linkAsset).toHaveBeenCalledWith("asset-1", "OCC-42"));
    expect(screen.getByText("Ocorrência vinculada: OCC-42")).toBeTruthy();
  });

  it("degrada somente o contexto de inventário quando o Motor está indisponível", async () => {
    render(<AssetContextPanel incidentReference="OCC-42" searchAssets={vi.fn().mockRejectedValue(new Error("offline"))} linkAsset={vi.fn()} inventoryUrl="https://inventory.local" />);
    fireEvent.change(screen.getByPlaceholderText(/buscar ativo/i), { target: { value: "poste" } });
    fireEvent.click(screen.getByRole("button", { name: /^buscar$/i }));
    expect(await screen.findByText(/inventário indisponível/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /tentar novamente/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
