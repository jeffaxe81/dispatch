import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ listHelpFavorites: vi.fn(), addHelpFavorite: vi.fn(), removeHelpFavorite: vi.fn(), listOwnFaqSuggestions: vi.fn(), createFaqSuggestion: vi.fn() }));

vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), listHelpFavorites: mocks.listHelpFavorites, addHelpFavorite: mocks.addHelpFavorite, removeHelpFavorite: mocks.removeHelpFavorite, listOwnFaqSuggestions: mocks.listOwnFaqSuggestions, createFaqSuggestion: mocks.createFaqSuggestion }));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return { user: { id: 73, openId: "help-user", name: "Ajuda", email: "ajuda@example.invalid", loginMethod: "test", role: "user", operationalRole: "operador", teamId: null, active: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("central de Manuais e Ajuda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHelpFavorites.mockResolvedValue([{ id: 1, userId: 73, contentType: "manual", contentId: "ocorrencias" }]);
    mocks.addHelpFavorite.mockResolvedValue({ id: 2 });
    mocks.removeHelpFavorite.mockResolvedValue(undefined);
    mocks.listOwnFaqSuggestions.mockResolvedValue([{ id: 3, userId: 73, question: "Como consultar o histórico?", detail: null, status: "pendente" }]);
    mocks.createFaqSuggestion.mockResolvedValue({ id: 4, status: "pendente" });
  });

  it("mantém favoritos privados por usuário e permite removê-los", async () => {
    const caller = appRouter.createCaller(context());
    const favorites = await caller.help.favorites.list();
    await caller.help.favorites.add({ contentType: "faq", contentId: "agente-localizacao" });
    await caller.help.favorites.remove({ contentType: "faq", contentId: "agente-localizacao" });

    expect(favorites).toHaveLength(1);
    expect(mocks.listHelpFavorites).toHaveBeenCalledWith(73);
    expect(mocks.addHelpFavorite).toHaveBeenCalledWith({ userId: 73, contentType: "faq", contentId: "agente-localizacao" });
    expect(mocks.removeHelpFavorite).toHaveBeenCalledWith({ userId: 73, contentType: "faq", contentId: "agente-localizacao" });
  });

  it("registra uma sugestão de FAQ em nome do usuário autenticado", async () => {
    const caller = appRouter.createCaller(context());
    const mine = await caller.help.suggestions.listMine();
    await caller.help.suggestions.create({ question: "Como consultar o histórico do atendimento?", detail: "Preciso localizar os registros da equipe." });

    expect(mine).toHaveLength(1);
    expect(mocks.listOwnFaqSuggestions).toHaveBeenCalledWith(73);
    expect(mocks.createFaqSuggestion).toHaveBeenCalledWith({ userId: 73, question: "Como consultar o histórico do atendimento?", detail: "Preciso localizar os registros da equipe." });
  });
});
