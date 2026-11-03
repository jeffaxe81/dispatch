// @vitest-environment jsdom
import React from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {AgentOfflinePanel} from "./AgentOfflinePanel";
import {saveLastAuthorizedAssignments} from "@/lib/agentOffline";

const scope={userId:8,organizationId:2,teamId:4};
const old=[{id:11,code:"OCO-11",category:"Incidente",status:"despachada"}];
const fresh=[{id:11,code:"OCO-11",category:"Incidente",status:"aceita"}];
afterEach(()=>{cleanup();window.sessionStorage.clear()});
describe("F046 — comparação assistida após reconexão",()=>{
  it("consulta o servidor novamente e mostra diferença sem realizar qualquer mutation",async()=>{
    saveLastAuthorizedAssignments(window.sessionStorage,scope,old);
    const onLoadFreshAssignments=vi.fn(async()=>fresh);
    render(<AgentOfflinePanel scope={scope} assignments={fresh} canSave canReconcile onLoadFreshAssignments={onLoadFreshAssignments}
      note="Observação de campo" activeIncidentId={11} onRestoreNote={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Comparar resumo com servidor"}));
    await waitFor(()=>expect(onLoadFreshAssignments).toHaveBeenCalledOnce());
    expect(await screen.findByText(/1 status alterado/)).toBeTruthy();
    expect(screen.getByText(/despachada → aceita/)).toBeTruthy();
    expect(screen.getByText(/Nenhuma operação pendente será enviada/)).toBeTruthy();
  });
  it("nega comparação quando rede não está validada",()=>{
    const fetch=vi.fn(async()=>fresh);
    render(<AgentOfflinePanel scope={scope} assignments={fresh} canSave={false} canReconcile={false} onLoadFreshAssignments={fetch}
      note="Observação" onRestoreNote={vi.fn()}/>);
    expect(screen.getByRole("button",{name:"Comparar resumo com servidor"}).hasAttribute("disabled")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("não compara cache expirado nem apresenta autorização automática",async()=>{
    const fetch=vi.fn(async()=>fresh);
    render(<AgentOfflinePanel scope={scope} assignments={fresh} canSave canReconcile onLoadFreshAssignments={fetch}
      note="Observação" onRestoreNote={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:"Comparar resumo com servidor"}));
    await waitFor(()=>expect(screen.getByText(/Não há resumo offline válido/)).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Diferenças do resumo offline")).toBeNull();
  });
});
