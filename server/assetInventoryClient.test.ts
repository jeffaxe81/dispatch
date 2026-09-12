import { describe, expect, it, vi } from "vitest";
import { createAssetInventoryClient } from "./assetInventoryClient";

const identity={tenantId:"tenant-a",userId:"user-dispatch",correlationId:"corr-dispatch-assets-0001"};

describe("M13 AssetInventoryClient",()=>{
  it("propagates tenant and correlation on search",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({items:[{id:"asset-1",code:"P-1",name:"Poste",assetType:"poste",status:"ativo"}],page:1,pageSize:25,total:1,totalPages:1}),{status:200,headers:{"content-type":"application/json"}}));
    const client=createAssetInventoryClient({baseUrl:"http://motor:3000",fetcher,timeoutMs:1000});
    const result=await client.search(identity,{query:"P-1"});
    expect(result.total).toBe(1);
    const[,init]=fetcher.mock.calls[0]!;
    expect(new Headers(init?.headers).get("x-tenant-id")).toBe("tenant-a");
    expect(new Headers(init?.headers).get("x-correlation-id")).toBe(identity.correlationId);
  });

  it("fails in a controlled way on timeout",async()=>{
    const fetcher=vi.fn((_url: string | URL | Request,_init?:RequestInit)=>new Promise<Response>(()=>{}));
    const client=createAssetInventoryClient({baseUrl:"http://motor:3000",fetcher,timeoutMs:10});
    await expect(client.getById(identity,"asset-1")).rejects.toMatchObject({code:"asset_inventory.unavailable",retryable:true});
  });

  it("links a dispatch reference through the Motor REST contract",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:"ref-1",assetId:"asset-1",referenceType:"occurrence",referenceId:"occ-42",source:"dispatch",idempotencyKey:"tenant-a:occ-42"}),{status:201,headers:{"content-type":"application/json"}}));
    const client=createAssetInventoryClient({baseUrl:"http://motor:3000",fetcher,timeoutMs:1000});
    const linked=await client.linkDispatchReference(identity,"asset-1",{referenceType:"occurrence",referenceId:"occ-42",idempotencyKey:"tenant-a:occ-42"});
    expect(linked.id).toBe("ref-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
