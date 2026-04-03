/**
 * Seed sample menus and per-menu options (PRD 예시 데이터).
 * Run: node scripts/seed.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { pool } = require("../db");

/** Unsplash: 미니멀·고급스러운 커피 사진, 카드 비율에 맞게 크롭 */
const img = (photoId) =>
  `https://images.unsplash.com/${photoId}?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=85`;

const menus = [
  {
    name: "아메리카노(ICE)",
    description: "시원하고 깔끔한 아이스 아메리카노",
    price: 4000,
    /** UI 정적 자산: ui/public/menu/americano-ice.jpg (Vite 루트 기준 경로) */
    image_url: "/menu/americano-ice.jpg",
    stock_quantity: 10,
    options: [
      { name: "샷 추가", price: 500 },
      { name: "시럽 추가", price: 0 },
    ],
  },
  {
    name: "아메리카노(HOT)",
    description: "따뜻하고 진한 핫 아메리카노",
    price: 4000,
    /** UI 정적 자산: ui/public/menu/americano-hot.jpg (Vite 루트 기준 경로) */
    image_url: "/menu/americano-hot.jpg",
    stock_quantity: 8,
    options: [
      { name: "샷 추가", price: 500 },
      { name: "시럽 추가", price: 0 },
    ],
  },
  {
    name: "카페라떼",
    description: "부드러운 우유와 에스프레소의 조화",
    price: 5000,
    image_url: img("photo-1561882468-9110e03e0f78"),
    stock_quantity: 12,
    options: [
      { name: "샷 추가", price: 500 },
      { name: "시럽 추가", price: 0 },
    ],
  },
  {
    name: "카푸치노",
    description: "우유 거품이 올라간 부드러운 카푸치노",
    price: 5000,
    image_url: img("photo-1572442388796-11668a67e53d"),
    stock_quantity: 10,
    options: [
      { name: "샷 추가", price: 500 },
      { name: "시럽 추가", price: 0 },
    ],
  },
  {
    name: "카라멜 마키아토",
    description: "달콤한 카라멜과 에스프레소의 만남",
    price: 6000,
    /** UI 정적 자산: ui/public/menu/caramel-macchiato.jpg (Vite 루트 기준 경로) */
    image_url: "/menu/caramel-macchiato.jpg",
    stock_quantity: 6,
    options: [
      { name: "샷 추가", price: 500 },
      { name: "시럽 추가", price: 0 },
    ],
  },
  {
    name: "바닐라라떼",
    description: "바닐라 시럽이 들어간 부드러운 라떼",
    price: 5500,
    image_url: img("photo-1572490122747-3968b75cc699"),
    stock_quantity: 9,
    options: [
      { name: "샷 추가", price: 500 },
      { name: "시럽 추가", price: 0 },
    ],
  },
];

async function main() {
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query("BEGIN");
    inTx = true;
    await client.query("TRUNCATE order_item_options, order_items, orders, options, menus RESTART IDENTITY CASCADE");

    for (const m of menus) {
      const { rows } = await client.query(
        `INSERT INTO menus (name, description, price, image_url, stock_quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [m.name, m.description, m.price, m.image_url, m.stock_quantity]
      );
      const menuId = rows[0].id;
      for (const opt of m.options) {
        await client.query(
          `INSERT INTO options (menu_id, name, price) VALUES ($1, $2, $3)`,
          [menuId, opt.name, opt.price]
        );
      }
    }

    await client.query("COMMIT");
    inTx = false;
    console.log(`Seeded ${menus.length} menus with options.`);
  } catch (err) {
    if (inTx) {
      try {
        await client.query("ROLLBACK");
      } catch (rbErr) {
        console.error("ROLLBACK failed:", rbErr.message);
      }
    }
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
