import type { ConnectionOptions } from "mysql2";

const database="dispatch_handoff_homologation";
export function getHandoffMysqlTestSettings(env: Record<string, string | undefined>): ConnectionOptions {
  if(env.NODE_ENV!=="test"||env.AXE_RUNTIME_ENV!=="homologation"||env.AXE_HANDOFF_MYSQL_TESTS!=="true")
    throw new Error("Ensaio de handoff exige homologação MySQL isolada.");
  try {
    const uri=new URL(env.AXE_HANDOFF_MYSQL_TEST_DATABASE_URL??"");
    const port=Number(uri.port||3306);
    if(uri.protocol!=="mysql:"||!["127.0.0.1","localhost"].includes(uri.hostname)||
      uri.pathname!=="/"+database||decodeURIComponent(uri.username)!=="handoff_test"||
      !decodeURIComponent(uri.password)||uri.search||uri.hash||
      !Number.isInteger(port)||port<1||port>65535) throw new Error("invalid");
    return {host:uri.hostname,port,user:"handoff_test",password:decodeURIComponent(uri.password),database,
      timezone:"Z",multipleStatements:false,connectTimeout:10000};
  } catch {throw new Error("O ensaio só aceita schema descartável e conta handoff_test em localhost.");}
}
export function assertEmptyHandoffSchema(name:string,count:number) {
  if(name!==database||count!==0) throw new Error("Schema descartável de handoff deve estar vazio.");
}
