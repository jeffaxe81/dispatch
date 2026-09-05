import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const url = new URL(process.env.DATABASE_URL ?? "");
if (process.env.CP016_DISPOSABLE_DB !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/dispatch_cp016_ci") {
  throw new Error("This runner only applies committed migrations to the disposable CP-016 CI database.");
}
const connection = await mysql.createConnection(url.toString());
try {
  await migrate(drizzle(connection), { migrationsFolder: "./drizzle" });
  console.log("Committed migrations applied to disposable CP-016 database.");
} catch (error) {
  // Preserve the database error hidden by the CLI spinner. Never log connection settings.
  for (let cause = error; cause; cause = cause.cause) {
    console.error({ name: cause.name, code: cause.code, errno: cause.errno, sqlMessage: cause.sqlMessage, query: cause.query });
  }
  process.exitCode = 1;
} finally {
  await connection.end();
}
