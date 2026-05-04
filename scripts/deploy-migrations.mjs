import { spawnSync } from "node:child_process"
import { readdir } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { Pool } from "pg"
import "dotenv/config"

const migrationsDir = path.join(process.cwd(), "prisma", "migrations")
const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js")

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  })

  if (result.error) {
    console.error("[deploy-migrations] Failed to start Prisma CLI:", result.error)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function datasourceUrl() {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return null

  try {
    const url = new URL(databaseUrl)
    if (url.hostname.includes("pooler.supabase.com") && url.port === "6543") {
      url.port = "5432"
      url.searchParams.delete("pgbouncer")
      return url.toString()
    }
  } catch {
    return databaseUrl
  }

  return databaseUrl
}

function isLocalDatabaseUrl(url) {
  try {
    const parsed = new URL(url)
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  } catch {
    return false
  }
}

function shouldSkipDeployMigrations(url) {
  if (process.env.SKIP_DEPLOY_MIGRATIONS === "1") return true
  if (process.env.FORCE_DEPLOY_MIGRATIONS === "1") return false

  if (!url) {
    return process.env.CI === "true"
  }

  return process.env.CI === "true" && isLocalDatabaseUrl(url)
}

async function getMigrationHistory(url) {
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL is required for deploy migrations.")
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  try {
    const table = await pool.query("select to_regclass('public._prisma_migrations') as reg")
    if (!table.rows[0]?.reg) return { exists: false, appliedCount: 0 }

    const count = await pool.query(`
      select count(*)::int as count
      from "_prisma_migrations"
      where finished_at is not null and rolled_back_at is null
    `)

    return { exists: true, appliedCount: count.rows[0]?.count ?? 0 }
  } finally {
    await pool.end()
  }
}

async function enableDenyByDefaultRls(url) {
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL is required for RLS baseline.")

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  try {
    await pool.query(`
      DO $$
      DECLARE
        table_record record;
        policy_name text;
      BEGIN
        FOR table_record IN
          SELECT n.nspname AS schema_name, c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND c.relname <> '_prisma_migrations'
        LOOP
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_record.schema_name, table_record.table_name);

          policy_name := 'deny_client_access_' || table_record.table_name;
          IF length(policy_name) > 60 THEN
            policy_name := 'deny_client_access_' || substr(md5(table_record.table_name), 1, 16);
          END IF;

          IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = table_record.schema_name
              AND tablename = table_record.table_name
              AND policyname = policy_name
          ) THEN
            EXECUTE format(
              'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
              policy_name,
              table_record.schema_name,
              table_record.table_name
            );
          END IF;

          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated', table_record.schema_name, table_record.table_name);
        END LOOP;
      END $$;

      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    `)
  } finally {
    await pool.end()
  }
}

async function localMigrations() {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function baselineCurrentSchema(url) {
  console.log("[deploy-migrations] No Prisma migration history found. Running safe baseline.")
  runPrisma(["db", "push"])
  await enableDenyByDefaultRls(url)

  for (const migration of await localMigrations()) {
    runPrisma(["migrate", "resolve", "--applied", migration])
  }

  runPrisma(["migrate", "deploy"])
}

async function main() {
  const url = datasourceUrl()
  if (shouldSkipDeployMigrations(url)) {
    console.log("[deploy-migrations] Skipped: no deploy database is configured for this CI build.")
    return
  }

  const history = await getMigrationHistory(url)
  if (history.exists && history.appliedCount > 0) {
    runPrisma(["migrate", "deploy"])
    return
  }

  await baselineCurrentSchema(url)
}

main().catch((error) => {
  console.error("[deploy-migrations]", error)
  process.exit(1)
})
