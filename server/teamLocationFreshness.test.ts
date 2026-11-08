import {describe,expect,it} from "vitest";
import {assertRecentTeamLocation,MAX_LOCATION_SAMPLE_AGE_MS,MAX_LOCATION_FUTURE_SKEW_MS} from "./teamLocationFreshness";

const now=1_710_000_000_000;

describe("GPS backend — recent position only, before database writes",()=>{
  it.each([
    ["current",now],
    ["119 seconds old",now-119_000],
    ["oldest allowed",now-MAX_LOCATION_SAMPLE_AGE_MS],
    ["future tolerated clock drift",now+MAX_LOCATION_FUTURE_SKEW_MS],
  ])("accepts %s",(_name,time)=>{
    expect(()=>assertRecentTeamLocation(new Date(time),now)).not.toThrow();
  });
  it.each([
    ["stale",now-MAX_LOCATION_SAMPLE_AGE_MS-1],
    ["future",now+MAX_LOCATION_FUTURE_SKEW_MS+1],
    ["before epoch",-1],
  ])("refuses %s",(_name,time)=>{
    expect(()=>assertRecentTeamLocation(new Date(time),now)).toThrow(/janela temporal/);
  });
  it.each([NaN,Infinity,-Infinity])("rejects invalid server clock: %s",clock=>{
    expect(()=>assertRecentTeamLocation(new Date(now),clock)).toThrow(/janela temporal/);
  });
  it("refuses invalid date and non-date inputs at runtime",()=>{
    expect(()=>assertRecentTeamLocation(new Date("nope"),now)).toThrow(/janela temporal/);
    expect(()=>assertRecentTeamLocation("2026-11-07" as unknown as Date,now)).toThrow(/janela temporal/);
  });
  it("never accepts stale samples merely because they were redelivered",()=>{
    const old=new Date(now-600_000);
    for(let iteration=0;iteration<100;iteration++)
      expect(()=>assertRecentTeamLocation(old,now+iteration)).toThrow(/janela temporal/);
  });
});
