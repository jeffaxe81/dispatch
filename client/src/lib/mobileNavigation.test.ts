import { describe, expect, it } from "vitest";
import { isMobileTabActive, selectMobileTabs } from "./mobileNavigation";

describe("mobile navigation respects existing permissions", () => {
  it("never adds unauthorized links", () => {
    const items = [{ path: "/agente" }, { path: "/equipes" }, { path: "/administracao" }];
    expect(selectMobileTabs(items).map(item => item.path)).toEqual(["/equipes", "/agente"]);
  });
  it("keeps operational tab order regardless of menu order", () => {
    const items = [{ path: "/equipes" }, { path: "/" }, { path: "/ocorrencias" }];
    expect(selectMobileTabs(items).map(item => item.path)).toEqual(["/", "/ocorrencias", "/equipes"]);
  });
  it("marks nested occurrence pages active without matching root for everything", () => {
    expect(isMobileTabActive("/ocorrencias/21", "/ocorrencias")).toBe(true);
    expect(isMobileTabActive("/agente", "/")).toBe(false);
    expect(isMobileTabActive("/ocorrencias-extra", "/ocorrencias")).toBe(false);
  });
});
