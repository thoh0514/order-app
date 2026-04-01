/**
 * Creates PRD §6.2 tables if missing. Safe to run multiple times.
 * Run: node scripts/apply-schema.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

async function main() {
  const sqlPath = path.join(__dirname, "..", "db", "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);

  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt + ";");
    }
  } finally {
    client.release();
  }

  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log("Tables:", rows.map((r) => r.table_name).join(", "));
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
