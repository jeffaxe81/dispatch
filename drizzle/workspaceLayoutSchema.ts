import { index, int, json, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { WorkspaceLayout, WorkspaceLayoutV2 } from "../shared/workspaceLayout";

export const workspaceLayouts = mysqlTable(
  "workspace_layouts",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    userId: int("user_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    layoutVersion: int("layout_version").notNull().default(1),
    layoutJson: json("layout_json").$type<WorkspaceLayout | WorkspaceLayoutV2>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("workspace_layouts_tenant_user_name_unique").on(table.tenantId, table.userId, table.name),
    index("workspace_layouts_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);
