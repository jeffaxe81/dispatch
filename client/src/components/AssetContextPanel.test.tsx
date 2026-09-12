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
    await screen.findByText("Poste 001");
    fireEvent.click(screen.getByRole("button", { name: /selecionar PST-001/i }));

    expect(screen.getByText("PST-001")).toBeInTheDocument();
    expect(screen.getByText("poste · ativo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir prontuário/i })).toHaveAttribute("href", "https://inventory.local/assets/asset-1");
    expect(screen.getByRole("button", { name: /ver no mapa/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /vincular à ocorrência/i }));
    await waitFor(() => expect(linkAsset).toHaveBeenCalledWith("asset-1", "OCC-42"));
    expect(screen.getByText("Ocorrência vinculada: OCC-42")).toBeInTheDocument();
  });

  it("degrada somente o contexto de inventário quando o Motor está indisponível", async () => {
    render(<AssetContextPanel incidentReference="OCC-42" searchAssets={vi.fn().mockRejectedValue(new Error("offline"))} linkAsset={vi.fn()} inventoryUrl="https://inventory.local" />);
    fireEvent.change(screen.getByPlaceholderText(/buscar ativo/i), { target: { value: "poste" } });
    fireEvent.click(screen.getByRole("button", { name: /^buscar$/i }));
    expect(await screen.findByText(/inventário indisponível/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeEnabled();
  });
});
