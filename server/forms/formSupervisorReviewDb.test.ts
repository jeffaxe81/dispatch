import {describe,expect,it,vi} from "vitest";
import {createFormRepositoryDbAdapter} from "./formRepositoryDbAdapter";

describe("AXED-F029 — transação de revisão",()=>{
  function fakeDb(status:"submitted"|"in_progress"|"corrected"="submitted",reviewed=false,latestRevision=2){
    const locks:any[]=[];
    // A dedicated Drizzle-like chained fake keeps the FOR UPDATE stateful.
    let stage=0;
    const txSelect=vi.fn(()=>({
      from:()=>({where:()=>({
        limit:(_n:number)=>{const data=stage===0?[{id:21,tenantId:7,status}]:stage===2?(reviewed?[{id:9}]:[]):[];stage++;return {for:vi.fn(async()=>{locks.push("submission");return data}),then:(r:any)=>Promise.resolve(data).then(r)}},
        orderBy:()=>({limit:async()=>{stage++;return [{revision:latestRevision}]}})
      })})
    }));
    const values=vi.fn(()=>({$returningId:vi.fn(async()=>[{id:41}])}));
    const insert=vi.fn(()=>({values}));
    const transaction=vi.fn(async(cb:any)=>cb({select:txSelect,insert}));
    return {adapter:createFormRepositoryDbAdapter({getDb:async()=>({transaction})}as any),transaction,insert,values,locks};
  }
  it("decide e escreve trilha auditável na mesma transação com lock",async()=>{
    const d=fakeDb();const now=new Date("2026-11-02T12:00:00Z");
    const result=await d.adapter.reviewSubmission({tenantId:7,submissionId:21,expectedRevision:2,decision:"approved",reason:"Conferido",actorUserId:9,now});
    expect(d.transaction).toHaveBeenCalledOnce();
    expect(d.locks).toContain("submission");
    expect(d.insert).toHaveBeenCalledTimes(2);
    expect(d.values).toHaveBeenCalledWith(expect.objectContaining({tenantId:7,submissionId:21,revision:2,decision:"approved",reviewerUserId:9}));
    expect(d.values).toHaveBeenCalledWith(expect.objectContaining({resourceType:"form_submission",action:"review_approved",actorUserId:9,afterData:expect.objectContaining({tenantId:7,revision:2})}));
    expect(result).toEqual(expect.objectContaining({submissionId:21,revision:2,decision:"approved"}));
  });
  it("rejeita revisão desatualizada e estado ainda em andamento",async()=>{
    const stale=fakeDb("submitted");await expect(stale.adapter.reviewSubmission({tenantId:7,submissionId:21,expectedRevision:1,decision:"approved",reason:"",actorUserId:9,now:new Date()})).rejects.toThrow(/desatualizada/i);
    expect(stale.insert).not.toHaveBeenCalled();
    const draft=fakeDb("in_progress");await expect(draft.adapter.reviewSubmission({tenantId:7,submissionId:21,expectedRevision:2,decision:"approved",reason:"",actorUserId:9,now:new Date()})).rejects.toThrow(/enviadas/i);
    expect(draft.insert).not.toHaveBeenCalled();
  });
  it("impede decisão duplicada para a mesma revisão",async()=>{
    const d=fakeDb("corrected",true);
    await expect(d.adapter.reviewSubmission({tenantId:7,submissionId:21,expectedRevision:2,decision:"returned",reason:"Ajustar documento",actorUserId:9,now:new Date()})).rejects.toThrow(/já foi avaliada/i);
    expect(d.insert).not.toHaveBeenCalled();
  });
});
