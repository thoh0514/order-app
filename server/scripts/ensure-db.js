/**
 * One-off: connect to `postgres` DB and create PGDATABASE if missing.
 * Run: node scripts/ensure-db.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { Client, escapeIdentifier } = require("pg");

const adminUrl = () => {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    try {
      const u = new URL(url);
      u.pathname = "/postgres";
      return u.toString();
    } catch {
      /* fall through */
    }
  }
  const host = process.env.PGHOST || "localhost";
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER || "postgres";
  const password = process.env.PGPASSWORD ?? "";
  const enc = encodeURIComponent;
  return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/postgres`;
};

const targetDb = process.env.PGDATABASE || "postgres";

async function main() {
  const c = new Client({ connectionString: adminUrl() });
  await c.connect();
  const { rows } = await c.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [targetDb]
  );
  if (rows.length) {
    console.log(`Database "${targetDb}" already exists.`);
  } else {
    await c.query(`CREATE DATABASE ${escapeIdentifier(targetDb)}`);
    console.log(`Created database "${targetDb}".`);
  }
  await c.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
