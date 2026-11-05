import type { ConnectionOptions } from "mysql2";

const database="dispatch_closure_gate_homologation";
export function getClosureGateMysqlTestSettings(env: Record<string, string | undefined>): ConnectionOptions {
  if(env.NODE_ENV!=="test"||env.AXE_RUNTIME_ENV!=="homologation"||env.AXE_CLOSURE_GATE_MYSQL_TESTS!=="true")
    throw new Error("Ensaio do gate de encerramento exige homologação MySQL isolada.");
  try {
    const uri=new URL(env.AXE_CLOSURE_GATE_MYSQL_TEST_DATABASE_URL??"");
    const port=Number(uri.port||3306);
    if(uri.protocol!=="mysql:"||!["127.0.0.1","localhost"].includes(uri.hostname)||
      uri.pathname!=="/"+database||decodeURIComponent(uri.username)!=="closure_gate_test"||
      !decodeURIComponent(uri.password)||uri.search||uri.hash||
      !Number.isInteger(port)||port<1||port>65535) throw new Error("invalid");
    return {host:uri.hostname,port,user:"closure_gate_test",password:decodeURIComponent(uri.password),database,
      timezone:"Z",multipleStatements:false,connectTimeout:10000};
  } catch {throw new Error("O ensaio só aceita schema descartável e conta closure_gate_test em localhost.");}
}
export function assertEmptyClosureGateSchema(name:string,count:number) {
  if(name!==database||count!==0) throw new Error("Schema descartável do gate de encerramento deve estar vazio.");
}
