import { int, mysqlTable } from "drizzle-orm/mysql-core";

/**
 * Mapeamento mínimo da coluna D-012B sobre a tabela legada de workflows.
 *
 * O restante do modelo continua em drizzle/schema.ts. Esta projeção existe para
 * manter a mudança de publicação isolada durante a compatibilização do legado.
 */
export const workflowPublicationPointers = mysqlTable("workflows", {
  id: int("id").primaryKey(),
  publishedVersion: int("published_version"),
});
