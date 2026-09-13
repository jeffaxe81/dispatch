import { index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

/**
 * Projeção mínima D-012C sobre a tabela legada de execuções de workflow.
 *
 * A tabela física continua sendo `workflow_executions`; esta projeção mantém a
 * evolução da engine isolada enquanto o schema legado é compatibilizado, no
 * mesmo padrão adotado pela D-012B para `published_version`.
 */
export const workflowInstanceExecutions = mysqlTable(
  "workflow_executions",
  {
    id: int("id").primaryKey(),
    workflowId: int("workflow_id").notNull(),
    workflowVersionId: int("workflow_version_id"),
    currentNodeId: varchar("current_node_id", { length: 120 }),
    correlationId: varchar("correlation_id", { length: 160 }),
  },
  table => [index("workflow_executions_correlation_idx").on(table.correlationId)],
);
