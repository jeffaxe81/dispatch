import { describe,expect,it } from "vitest";
import { formsTrpcInputSchemas } from "./formsTrpcRouter";
describe("D-008 tRPC router contract",()=>{
it("não aceita tenantId controlado pelo cliente",()=>{expect(formsTrpcInputSchemas.submit.safeParse({tenantId:999,formId:3,formVersionId:5,answers:{}}).success).toBe(false);});
it("exige versão explícita para binding e início",()=>{expect(formsTrpcInputSchemas.bind.safeParse({formId:3,contextType:"incident",contextId:"88"}).success).toBe(false);expect(formsTrpcInputSchemas.startSubmission.safeParse({formId:3}).success).toBe(false);});
it("limita contextType aos vínculos aprovados",()=>{expect(formsTrpcInputSchemas.bind.safeParse({formId:3,formVersionId:5,contextType:"incident",contextId:"88"}).success).toBe(true);expect(formsTrpcInputSchemas.bind.safeParse({formId:3,formVersionId:5,contextType:"workflow",contextId:"88"}).success).toBe(false);});
it("correção exige justificativa não vazia",()=>{expect(formsTrpcInputSchemas.correct.safeParse({submissionId:21,answers:{},reason:""}).success).toBe(false);});
it("anexo exige metadados tipados e conteúdo base64",()=>{expect(formsTrpcInputSchemas.uploadAttachment.safeParse({submissionId:21,fieldKey:"foto",kind:"image",fileName:"foto.png",mimeType:"image/png",base64:"cG5n"}).success).toBe(true);expect(formsTrpcInputSchemas.uploadAttachment.safeParse({submissionId:21,fieldKey:"foto",kind:"exe",fileName:"x",mimeType:"x",base64:"x"}).success).toBe(false);});
});
