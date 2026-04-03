/**
 * DB만 갱신: 아메리카노(ICE) → 로컬 참조 이미지 (ui/public/menu/americano-ice.jpg).
 * Run: node scripts/update-ice-americano-image.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { pool } = require("../db");

const IMAGE_URL = "/menu/americano-ice.jpg";

async function main() {
  const { rowCount } = await pool.query(
    `UPDATE menus SET image_url = $1 WHERE name = $2`,
    [IMAGE_URL, "아메리카노(ICE)"]
  );
  console.log(`Updated ${rowCount} row(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
