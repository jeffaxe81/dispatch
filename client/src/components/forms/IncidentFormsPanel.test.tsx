// @vitest-environment jsdom
import{fireEvent,render,screen}from"@testing-library/react";import React from"react";import{describe,expect,it,vi}from"vitest";import{deriveIncidentFormItems,deriveIncidentFormReadiness,IncidentFormsPanel}from"./IncidentFormsPanel";const bindings=[{id:1,formId:3,formVersionId:5,name:"Vistoria",contextId:"88"},{id:2,formId:4,formVersionId:6,name:"Checklist",contextId:"88"}];describe("D-008 incident forms",()=>{it("deriva Não iniciado quando há vínculo sem submissão",()=>{expect(deriveIncidentFormItems(bindings,[])[0].state).toBe("not_started")});it("prioriza o estado mais recente da submissão por formulário",()=>{const items=deriveIncidentFormItems(bindings,[{id:20,formId:3,formVersionId:5,status:"in_progress",revision:1},{id:21,formId:3,formVersionId:5,status:"corrected",revision:2}]);expect(items[0].state).toBe("corrected");expect(items[0].submissionId).toBe(21)});it("renderiza os quatro estados operacionais aprovados",()=>{render(<IncidentFormsPanel bindings={[...bindings,{id:3,formId:5,formVersionId:7,name:"Fotos",contextId:"88"},{id:4,formId:6,formVersionId:8,name:"Encerramento",contextId:"88"}]} submissions={[{id:11,formId:4,formVersionId:6,status:"in_progress",revision:1},{id:12,formId:5,formVersionId:7,status:"submitted",revision:1},{id:13,formId:6,formVersionId:8,status:"corrected",revision:2}]} onOpen={()=>{}}/>);expect(screen.getByText("Não iniciado")).toBeTruthy();expect(screen.getByText("Em preenchimento")).toBeTruthy();expect(screen.getByText("Enviado")).toBeTruthy();expect(screen.getByText("Corrigido")).toBeTruthy()});it("abre o formulário sem solicitar mudança do status da ocorrência",()=>{const onOpen=vi.fn();render(<IncidentFormsPanel bindings={bindings} submissions={[]} onOpen={onOpen}/>);fireEvent.click(screen.getAllByRole("button",{name:/abrir formulário/i})[0]);expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({formId:3,state:"not_started"}))});});

describe("AXED-F030 — conferência informativa pré-encerramento", () => {
  it("ausência de vínculos não é aprovação de encerramento", () => {
    expect(deriveIncidentFormReadiness(deriveIncidentFormItems([], []))).toMatchObject({total:0,completed:0,allSubmitted:false});
  });
  it("exige versão vinculada e reconhece revisão mais recente", () => {
    const items=deriveIncidentFormItems(bindings,[
      {id:101,formId:3,formVersionId:99,status:"submitted",revision:5},
      {id:102,formId:3,formVersionId:5,status:"corrected",revision:2},
      {id:103,formId:4,formVersionId:6,status:"in_progress",revision:1},
    ]);
    expect(deriveIncidentFormReadiness(items)).toMatchObject({total:2,completed:1,allSubmitted:false});
  });
  it("mostra as pendências sem confundir com liberação no servidor", () => {
    render(<IncidentFormsPanel bindings={bindings}
      submissions={[{id:12,formId:3,formVersionId:5,status:"submitted",revision:1}]} onOpen={()=>{}}/>);
    expect(screen.getByText(/1 de 2 formulário/)).toBeTruthy();
    expect(screen.getByText(/1 formulário\(s\) ainda não finalizado/)).toBeTruthy();
    expect(screen.getByText(/Não equivale à revisão de um supervisor/i)).toBeTruthy();
  });
  it("considera enviado/corrigido como preenchido, sem mudar a situação da ocorrência", () => {
    render(<IncidentFormsPanel bindings={bindings} submissions={[
      {id:12,formId:3,formVersionId:5,status:"submitted",revision:1},
      {id:13,formId:4,formVersionId:6,status:"corrected",revision:2},
    ]} onOpen={()=>{}}/>);
    expect(screen.getByText(/2 de 2 formulário/)).toBeTruthy();
    expect(screen.getByText(/Todos os formulários vinculados/)).toBeTruthy();
  });
});

describe("AXED-F029 — sinalização de revisão",()=>{
  it("informa devolução e considera a resposta devolvida pendente na conferência",()=>{
    const reviewed={id:20,formId:3,formVersionId:5,status:"submitted" as const,revision:1,review:{revision:1,decision:"returned" as const,reason:"Inconsistência"}};
    const items=deriveIncidentFormItems(bindings,[reviewed]);
    expect(deriveIncidentFormReadiness(items)).toMatchObject({total:2,completed:0,allSubmitted:false});
    render(<IncidentFormsPanel bindings={bindings} submissions={[reviewed]} onOpen={()=>{}}/>);
    expect(screen.getByText("Devolvido para correção")).toBeTruthy();
  });
});
