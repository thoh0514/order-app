/**
 * DB의 menus.image_url을 seed.js와 동일하게 맞춤 (재시드 없이 갱신).
 * Run: node scripts/update-local-menu-images.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { pool } = require("../db");

const img = (photoId) =>
  `https://images.unsplash.com/${photoId}?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=85`;

/** seed.js의 menus 항목과 동일한 name → image_url */
const updates = [
  ["아메리카노(ICE)", "/menu/americano-ice.jpg"],
  ["아메리카노(HOT)", "/menu/americano-hot.jpg"],
  ["카페라떼", img("photo-1561882468-9110e03e0f78")],
  ["카푸치노", img("photo-1572442388796-11668a67e53d")],
  ["카라멜 마키아토", "/menu/caramel-macchiato.jpg"],
  ["바닐라라떼", img("photo-1572490122747-3968b75cc699")],
];

async function main() {
  let total = 0;
  for (const [name, url] of updates) {
    const { rowCount } = await pool.query(
      `UPDATE menus SET image_url = $1 WHERE name = $2`,
      [url, name]
    );
    total += rowCount;
    console.log(`${name}: ${rowCount} row(s)`);
  }
  console.log(`Total updated: ${total}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
