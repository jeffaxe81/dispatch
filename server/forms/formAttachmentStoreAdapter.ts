import{storagePut as applicationStoragePut}from"../storage";import{storeFormAttachment,type FormAttachmentInput,type MalwareScanner}from"./formAttachments";import type{StoredFormAttachment}from"./formService";
export type FormAttachmentStoreDependencies={storagePut?:(key:string,bytes:Buffer,mimeType:string)=>Promise<unknown>;malwareScanner?:MalwareScanner};
export function createFormAttachmentStore(dependencies:FormAttachmentStoreDependencies={}){const storagePut=dependencies.storagePut??applicationStoragePut;return(input:FormAttachmentInput):Promise<StoredFormAttachment>=>storeFormAttachment(input,{storagePut,malwareScanner:dependencies.malwareScanner});}
export const formAttachmentStore=createFormAttachmentStore();
