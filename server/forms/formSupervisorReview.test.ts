import {describe,expect,it,vi} from "vitest";
import {formsTrpcInputSchemas} from "./formsTrpcRouter";
import {createFormsApi} from "./formsRouter";
import {createFormService} from "./formService";

function ctx(role="supervisor",canCorrect=true){
  return {tenantId:7,userId:9,operationalRole:role,hasPermission:vi.fn(async(permission:string)=>canCorrect&&permission==="forms.responses.correct"),
    assertSubmissionScope:vi.fn(async()=>undefined),assertIncidentScope:vi.fn(),assertFieldActivityScope:vi.fn(),
    service:{reviewSubmission:vi.fn(async(input:any)=>input)}};
}
describe("AXED-F029 — autorização e contrato de revisão",()=>{
  it("só aceita decisão conhecida, revisão esperada e justificativa para devolver",()=>{
    const good={submissionId:21,expectedRevision:2,decision:"returned" as const,reason:"Dados inconsistentes"};
    expect(formsTrpcInputSchemas.review.safeParse(good).success).toBe(true);
    expect(formsTrpcInputSchemas.review.safeParse({...good,reason:"  "}).success).toBe(false);
    expect(formsTrpcInputSchemas.review.safeParse({...good,expectedRevision:0}).success).toBe(false);
    expect(formsTrpcInputSchemas.review.safeParse({...good,tenantId:999}).success).toBe(false);
    expect(formsTrpcInputSchemas.review.safeParse({...good,decision:"skip"}).success).toBe(false);
    expect(formsTrpcInputSchemas.review.safeParse({submissionId:21,expectedRevision:1,decision:"approved"}).success).toBe(true);
  });
  it("verifica perfil, permissão dinâmica e escopo antes de chamar persistência",async()=>{
    const deniedRole=ctx("agente");await expect(createFormsApi(deniedRole as any).review({submissionId:21,expectedRevision:1,decision:"approved"})).rejects.toThrow(/supervisor/i);
    expect(deniedRole.service.reviewSubmission).not.toHaveBeenCalled();
    const deniedPermission=ctx("supervisor",false);await expect(createFormsApi(deniedPermission as any).review({submissionId:21,expectedRevision:1,decision:"approved"})).rejects.toThrow(/forms.responses.correct/i);
    expect(deniedPermission.service.reviewSubmission).not.toHaveBeenCalled();
    const deniedScope=ctx();deniedScope.assertSubmissionScope=vi.fn(async()=>{throw new Error("fora do tenant");});
    await expect(createFormsApi(deniedScope as any).review({submissionId:21,expectedRevision:1,decision:"approved"})).rejects.toThrow(/tenant/i);
    expect(deniedScope.service.reviewSubmission).not.toHaveBeenCalled();
  });
  it("descarta tenant controlado pelo cliente e passa ator autenticado",async()=>{
    const c=ctx();const input={tenantId:888,submissionId:21,expectedRevision:1,decision:"approved",reason:""};
    await createFormsApi(c as any).review(input);
    expect(c.assertSubmissionScope).toHaveBeenCalledWith(21);
    expect(c.service.reviewSubmission).toHaveBeenCalledWith(expect.objectContaining({tenantId:7,actorUserId:9,expectedRevision:1,decision:"approved"}));
    expect((await createFormsApi(c as any).capabilities()).canReviewResponses).toBe(true);
    expect((await createFormsApi(ctx("agente") as any).capabilities()).canReviewResponses).toBe(false);
  });
  it("service entrega a revisão intacta ao repository e exige motivo para devolver",async()=>{
    const repository={reviewSubmission:vi.fn(async(input:any)=>({...input,id:11}))};
    const service=createFormService(7,{repository:repository as any,audit:{append:vi.fn()},events:{append:vi.fn()}} as any);
    const date=new Date("2026-11-02T23:00:00Z");
    await expect(service.reviewSubmission({submissionId:21,expectedRevision:1,decision:"returned",reason:" ",actorUserId:9,now:date})).rejects.toThrow(/justificativa/i);
    const result=await service.reviewSubmission({submissionId:21,expectedRevision:1,decision:"approved",reason:" Conferido ",actorUserId:9,now:date});
    expect(repository.reviewSubmission).toHaveBeenCalledWith(expect.objectContaining({submissionId:21,expectedRevision:1,reason:"Conferido",actorUserId:9,now:date}));
    expect(result.id).toBe(11);
  });
});
