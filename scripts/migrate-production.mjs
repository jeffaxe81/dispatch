import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Database migration failed: DATABASE_URL is required.");
  process.exit(1);
}

let connection;

try {
  connection = await mysql.createConnection(databaseUrl);
  const db = drizzle({ client: connection });

  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied successfully.");
} catch (error) {
  console.error("Database migration failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  if (connection) {
    await connection.end();
  }
}
