const { Pool } = require("pg");

function connectionString() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;

  const host = process.env.PGHOST || "localhost";
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER || "postgres";
  const password = process.env.PGPASSWORD ?? "";
  const database = process.env.PGDATABASE || "postgres";

  const enc = encodeURIComponent;
  return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${database}`;
}

const pool = new Pool({
  connectionString: connectionString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

async function ping() {
  const { rows } = await pool.query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

module.exports = { pool, ping };
