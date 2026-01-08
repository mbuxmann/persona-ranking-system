import path from "path";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

dotenv.config({ path: path.join(process.cwd(), "../../apps/web/.env") });

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function reset() {
  console.log("Resetting database...");

  await db.execute(sql`
    TRUNCATE TABLE
      evaluation_results,
      optimization_runs,
      prompt_versions,
      leads,
      uploads,
      companies,
      evaluation_leads
    CASCADE
  `);

  console.log("Database reset complete!");
  await client.end();
  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
