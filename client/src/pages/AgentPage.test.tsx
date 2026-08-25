import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), invalidate: vi.fn(), refetch: vi.fn(), uploadError: null as Error | null, currentUser: { id: 8, teamId: 4 as number | null, operationalRole: "agente", active: true }, permissions: ["occurrences.view", "occurrences.transition"] }));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("@/components/RefreshControls", () => ({ RefreshControls: () => <button>Atualizar</button> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.currentUser }) }));
vi.mock("@/hooks/useAgentLocation", () => ({ useAgentLocation: () => ({ state: "idle", message: "" }) }));
vi.mock("@/hooks/useRefreshSettings", () => ({ useRefreshSettings: () => ({ interval: false, setInterval: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ incidents: { list: { invalidate: mocks.invalidate }, timeline: { invalidate: mocks.invalidate }, evidence: { list: { invalidate: mocks.invalidate } } }, dashboard: { summary: { invalidate: mocks.invalidate } } }),
    access: { me: { useQuery: () => ({ data: { permissions: mocks.permissions }, isLoading: false }) } },
    incidents: {
      list: { useQuery: () => ({ data: { rows: [{ incident: { id: 12, code: "OCO-12", category: "Atendimento", priority: "alta", status: "em_atendimento", address: "Rua Central, 10", description: "Verificar situação." } }] }, isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
      respondToAssignment: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      transition: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      evidence: {
        list: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
        upload: { useMutation: () => ({ mutateAsync: mocks.upload, isPending: false, error: mocks.uploadError }) },
      },
    },
  },
}));

import AgentPage from "./AgentPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.uploadError = null; mocks.currentUser = { id: 8, teamId: 4, operationalRole: "agente", active: true }; mocks.permissions = ["occurrences.view", "occurrences.transition"]; });

describe("AgentPage evidências", () => {
  it("aceita múltiplos anexos e prepara um envio individual para cada arquivo do lote", async () => {
    const user = userEvent.setup();
    render(<AgentPage />);

    expect(screen.getByText("Evidências e anexos")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /selecionar arquivos/i }));
    const file = new File(["%PDF-1.7\nconteudo"], "registro.pdf", { type: "application/pdf" });
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/selecionar fotos ou documentos/i), { target: { files: [file, image] } });
    expect(screen.getByText("registro.pdf")).toBeTruthy();
    expect(screen.getByText("foto.jpg")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /enviar 2 arquivo/i }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({ incidentId: 12, fileName: "registro.pdf", contentType: "application/pdf" });
    expect(mocks.upload.mock.calls[1][0]).toMatchObject({ incidentId: 12, fileName: "foto.jpg", contentType: "image/jpeg" });
    expect(screen.getByText(/registro\.pdf — Enviado e auditado/i)).toBeTruthy();
    expect(screen.getByText(/foto\.jpg — Enviado e auditado/i)).toBeTruthy();
  });

  it("bloqueia na interface um arquivo fora dos formatos permitidos", async () => {
    const user = userEvent.setup();
    render(<AgentPage />);

    await user.click(screen.getByRole("button", { name: /selecionar arquivos/i }));
    const file = new File(["conteúdo"], "anotacao.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/selecionar fotos ou documentos/i), { target: { files: [file] } });
    expect(screen.getByRole("alert").textContent).toMatch(/anotacao\.txt: formato não permitido/i);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("exibe a falha devolvida pelo servidor no envio de evidência", () => {
    mocks.uploadError = new Error("O armazenamento de evidências está indisponível.");
    render(<AgentPage />);
    expect(screen.getByRole("alert").textContent).toMatch(/armazenamento de evidências está indisponível/i);
  });

  it("explica que o Agente de Campo precisa de uma equipe vinculada", () => {
    mocks.currentUser = { id: 8, teamId: null, operationalRole: "agente", active: true };
    render(<AgentPage />);
    expect(screen.getByText("Agente de Campo sem equipe")).toBeTruthy();
    expect(screen.getByText(/nenhuma equipe foi vinculada/i)).toBeTruthy();
  });

  it("explica quando o perfil operacional ainda não é Agente de Campo", () => {
    mocks.currentUser = { id: 8, teamId: 4, operationalRole: "administrador", active: true };
    render(<AgentPage />);
    expect(screen.getByText("Perfil de campo não selecionado")).toBeTruthy();
    expect(screen.getByText(/exige o perfil/i)).toBeTruthy();
  });

  it("explica quando o vínculo não contém as permissões de campo", () => {
    mocks.permissions = ["occurrences.view"];
    render(<AgentPage />);
    expect(screen.getByText("Permissões de campo incompletas")).toBeTruthy();
    expect(screen.getByText(/occurrences\.transition/i)).toBeTruthy();
  });
});
