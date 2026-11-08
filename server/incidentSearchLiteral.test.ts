import {describe,expect,it} from "vitest";
import {sql} from "drizzle-orm";
import {MySqlDialect} from "drizzle-orm/mysql-core";
import {incidents} from "../drizzle/schema";
import {incidentLiteralSearchPattern} from "./incidentSearchLiteral";

describe("AXE Dispatch — search text is literal and tenant-safe",()=>{
  it.each([
    ["Ocorrência","%Ocorrência%"],
    ["  OCO-27  ","%OCO-27%"],
    ["100%","%100!%%"],
    ["Equipe_A","%Equipe!_A%"],
    ["Foo!Bar","%Foo!!Bar%"],
    ["%_!","%!%!_!!%"],
    ["back\\slash","%back\\slash%"],
    ["","%%"]
  ])("escapes LIKE metacharacters rather than widening search: %s",(input,expected)=>{
    expect(incidentLiteralSearchPattern(input)).toBe(expected);
  });

  it("binds the search value as an SQL parameter and defines explicit ESCAPE",()=>{
    const pattern=incidentLiteralSearchPattern("100%_!");
    const fragment=sql`${incidents.code} LIKE ${pattern} ESCAPE '!'`;
    const compiled=new MySqlDialect().sqlToQuery(fragment);
    expect(compiled.sql).toContain("LIKE ? ESCAPE '!'");
    expect(compiled.params).toEqual(["%100!%!_!!%"]);
    expect(compiled.sql).not.toContain("100%_!");
  });
