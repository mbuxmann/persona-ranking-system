import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import csv from "csv-parser";
import { drizzle } from "drizzle-orm/node-postgres";
import { companies, leads, evaluationLeads, promptVersions } from "../schema";

dotenv.config({ path: path.join(process.cwd(), "../../apps/web/.env") });

const db = drizzle(process.env.DATABASE_URL!, {
  schema: { companies, leads, evaluationLeads, promptVersions },
});

interface CSVRow {
  account_name: string;
  lead_first_name: string;
  lead_last_name: string;
  lead_job_title: string;
  account_domain: string;
  account_employee_range: string;
  account_industry: string;
}

interface EvalCSVRow {
  "Full Name": string;
  Title: string;
  Company: string;
  LI: string;
  "Employee Range": string;
  Rank: string;
}

async function seed() {
  console.log("Starting seed process...");

  const csvPath = path.join(process.cwd(), "../../sources/leads.csv");
  console.log(`Reading CSV from: ${csvPath}`);

  const rows: CSVRow[] = await new Promise((resolve, reject) => {
    const results: CSVRow[] = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });

  console.log(`Parsed ${rows.length} leads from CSV`);

  const uniqueCompanies = new Map<
    string,
    {
      name: string;
      domain: string;
      employeeRange: string;
      industry: string;
    }
  >();

  for (const row of rows) {
    if (row.account_domain && !uniqueCompanies.has(row.account_domain)) {
      uniqueCompanies.set(row.account_domain, {
        name: row.account_name,
        domain: row.account_domain,
        employeeRange: row.account_employee_range,
        industry: row.account_industry || "",
      });
    }
  }

  console.log(`Found ${uniqueCompanies.size} unique companies`);
  console.log("Inserting companies...");

  const companyMap = new Map<string, string>();

  for (const [domain, company] of uniqueCompanies) {
    try {
      const [inserted] = await db
        .insert(companies)
        .values(company)
        .onConflictDoUpdate({
          target: companies.domain,
          set: {
            name: company.name,
            employeeRange: company.employeeRange,
            industry: company.industry,
          },
        })
        .returning({ id: companies.id, domain: companies.domain });

      companyMap.set(inserted?.domain || "", inserted?.id || "");
    } catch (error) {
      console.error(`Error inserting company ${domain}:`, error);
    }
  }

  console.log(`Inserted/updated ${companyMap.size} companies`);
  console.log("Inserting leads...");

  let insertedLeads = 0;
  let skippedLeads = 0;

  for (const row of rows) {
    const companyId = companyMap.get(row.account_domain);
    if (!companyId) {
      console.warn(
        `Skipping lead ${row.lead_first_name} ${row.lead_last_name} - company not found`
      );
      skippedLeads++;
      continue;
    }

    try {
      await db.insert(leads).values({
        companyId,
        firstName: row.lead_first_name,
        lastName: row.lead_last_name,
        jobTitle: row.lead_job_title,
      });
      insertedLeads++;
    } catch (error) {
      console.error(
        `Error inserting lead ${row.lead_first_name} ${row.lead_last_name}:`,
        error
      );
      skippedLeads++;
    }
  }

  console.log(`Inserted ${insertedLeads} leads`);
  if (skippedLeads > 0) {
    console.log(`Skipped ${skippedLeads} leads`);
  }

  console.log("\nStarting evaluation dataset import...");
  const evalStats = await importEvalSet();

  console.log("\nCreating baseline prompt version...");
  const baselinePrompt = await createBaselinePrompt();

  console.log("\nSeed completed successfully!");
  console.log("Summary:");
  console.log(`  Companies: ${companyMap.size}`);
  console.log(`  Leads: ${insertedLeads}`);
  console.log(`  Evaluation Leads: ${evalStats.imported}`);
  console.log(
    `  Baseline Prompt: ${baselinePrompt.id} (iteration ${baselinePrompt.version})`
  );

  process.exit(0);
}

async function importEvalSet() {
  const csvPath = path.join(process.cwd(), "../../sources/eval_set.csv");
  console.log(`Reading evaluation CSV from: ${csvPath}`);

  const rows: EvalCSVRow[] = await new Promise((resolve, reject) => {
    const results: EvalCSVRow[] = [];
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });

  console.log(`Parsed ${rows.length} total rows from evaluation CSV`);

  const viableLeads = rows.filter((row) => {
    const rank = parseInt(row.Rank, 10);
    return row.Rank !== "-" && !isNaN(rank) && rank >= 1 && rank <= 10;
  });

  console.log(
    `Found ${viableLeads.length} viable evaluation leads (filtered out ${rows.length - viableLeads.length} non-viable)`
  );

  const transformedData = viableLeads.map((row) => {
    const nameParts = row["Full Name"].split(" ");
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    return {
      firstName,
      lastName,
      jobTitle: row.Title,
      companyName: row.Company,
      companyDomain: null,
      employeeRange: row["Employee Range"],
      industry: null,
      groundTruthRank: parseInt(row.Rank, 10),
      groundTruthReasoning: null,
    };
  });

  console.log("Inserting evaluation leads...");
  const batchSize = 10;
  const allInserted = [];

  for (let i = 0; i < transformedData.length; i += batchSize) {
    const batch = transformedData.slice(i, i + batchSize);
    console.log(
      `  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transformedData.length / batchSize)} (${batch.length} leads)...`
    );
    const inserted = await db
      .insert(evaluationLeads)
      .values(batch)
      .returning();
    allInserted.push(...inserted);
  }

  console.log(`Successfully imported ${allInserted.length} evaluation leads`);

  return {
    totalRows: rows.length,
    viableLeads: viableLeads.length,
    imported: allInserted.length,
  };
}

async function createBaselinePrompt() {
  const promptPath = path.join(
    process.cwd(),
    "../../sources/ranking_prompt.md"
  );
  console.log(`Reading ranking prompt template from: ${promptPath}`);

  const promptText = fs.readFileSync(promptPath, "utf-8");
  console.log(`Prompt template length: ${promptText.length} characters`);

  const [inserted] = await db
    .insert(promptVersions)
    .values({
      iterationNumber: 0,
      promptText: promptText,
      isBaseline: true,
      isActive: true,
      mae: null,
      rmse: null,
      spearmanCorrelation: null,
      kendallTau: null,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create baseline prompt");
  }

  console.log("Successfully created baseline prompt version");
  console.log(`  ID: ${inserted.id}`);
  console.log(`  Iteration: ${inserted.iterationNumber}`);
  console.log(`  Is Baseline: ${inserted.isBaseline}`);
  console.log(`  Is Active: ${inserted.isActive}`);

  return { id: inserted.id, version: inserted.iterationNumber };
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
