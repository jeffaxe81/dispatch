import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { embeddedIntegrations } from "../drizzle/cp016Schema";
import { integrationConnections } from "../drizzle/schema";

it("emits a MySQL-compatible integration foreign key without changing its relationship", () => {
  const keys = getTableConfig(embeddedIntegrations).foreignKeys;
  expect(keys).toHaveLength(1);
  const key = keys[0];
  expect(key.getName().length).toBeLessThanOrEqual(64);
  expect(key.reference().columns).toEqual([embeddedIntegrations.integrationConnectionId]);
  expect(key.reference().foreignColumns).toEqual([integrationConnections.id]);
  expect(key.onDelete).toBe("set null");
});
