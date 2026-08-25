import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), mutate: vi.fn(), refetch: vi.fn() }));

vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/QueryState", () => ({ QueryState: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ integrations: { externalReviews: { list: { invalidate: mocks.invalidate } }, logs: { invalidate: mocks.invalidate } } }),
    integrations: {
      externalReviews: {
        list: { useQuery: () => ({ data: [{ review: { id: 9, correlationId: "alrt-review-9", status: "pendente", category: "Iluminação pública", priority: "alta", description: "Luminária intermitente.", address: "Avenida das Palmeiras, 13", latitude: "-15.7938890", longitude: "-47.8827780", createdIncidentId: null, createdAt: new Date("2026-08-22T16:00:00.000Z") }, workflowName: "Triagem ALRT" }], isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }) },
        confirm: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      },
    },
  },
}));

import ExternalIncidentReviewsPage from "./ExternalIncidentReviewsPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ExternalIncidentReviewsPage", () => {
  it("mostra uma prévia e exige confirmação explícita antes de criar a ocorrência", () => {
    render(<ExternalIncidentReviewsPage />);
    expect(screen.getByText("Revisões de eventos externos")).toBeTruthy();
    expect(screen.getByText("Luminária intermitente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /revisar e criar/i }));
    expect(screen.getByText("Confirmar criação da ocorrência")).toBeTruthy();
    expect(screen.getByText(/nenhuma equipe, viatura ou despacho/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /confirmar e criar ocorrência/i }));
    expect(mocks.mutate).toHaveBeenCalledWith({ reviewId: 9 });
  });
});
