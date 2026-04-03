const { pool } = require("../db");

const ORDER_STATUSES = ["주문 접수", "제조 중", "완료"];

function nextStatus(current) {
  const i = ORDER_STATUSES.indexOf(current);
  if (i < 0 || i >= ORDER_STATUSES.length - 1) return null;
  return ORDER_STATUSES[i + 1];
}

async function rollbackSafe(client, inTx) {
  if (!inTx) return;
  try {
    await client.query("ROLLBACK");
  } catch (rbErr) {
    console.error("ROLLBACK failed:", rbErr.message);
  }
}

/** @param {import("pg").Pool | import("pg").PoolClient} q */
async function loadMenusWithOptions(q) {
  const menusRes = await q.query(
    `SELECT id, name, description, price, image_url, stock_quantity
     FROM menus
     ORDER BY id ASC`
  );
  const menuIds = menusRes.rows.map((r) => r.id);
  if (menuIds.length === 0) {
    return { rows: [], byMenu: new Map() };
  }
  const optRes = await q.query(
    `SELECT id, menu_id, name, price
     FROM options
     WHERE menu_id = ANY($1::int[])
     ORDER BY menu_id, id`,
    [menuIds]
  );
  const byMenu = new Map();
  for (const row of optRes.rows) {
    if (!byMenu.has(row.menu_id)) byMenu.set(row.menu_id, []);
    byMenu.get(row.menu_id).push({
      id: row.id,
      name: row.name,
      price: row.price,
    });
  }
  return { rows: menusRes.rows, byMenu };
}

/** GET /api/menus — 카드에는 재고 수치 미표시, 장바구니 검증용으로 stock_quantity 포함 */
async function getMenusPublic(req, res) {
  try {
    const { rows, byMenu } = await loadMenusWithOptions(pool);
    const menus = rows.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      price: m.price,
      image_url: m.image_url,
      stock_quantity: m.stock_quantity,
      in_stock: m.stock_quantity > 0,
      options: byMenu.get(m.id) ?? [],
    }));
    res.json({ menus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "메뉴를 불러오지 못했습니다." });
  }
}

/** GET /api/admin/menus */
async function getMenusAdmin(req, res) {
  try {
    const { rows, byMenu } = await loadMenusWithOptions(pool);
    const menus = rows.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      price: m.price,
      image_url: m.image_url,
      stock_quantity: m.stock_quantity,
      options: byMenu.get(m.id) ?? [],
    }));
    res.json({ menus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "메뉴를 불러오지 못했습니다." });
  }
}

/** PATCH /api/admin/menus/:menuId/stock  body: { delta: number } */
async function patchMenuStock(req, res) {
  const menuId = Number(req.params.menuId);
  const delta = Number(req.body?.delta);
  if (!Number.isInteger(menuId) || menuId < 1) {
    return res.status(400).json({ error: "잘못된 메뉴 ID입니다." });
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: "delta는 0이 아닌 숫자여야 합니다." });
  }
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query("BEGIN");
    inTx = true;
    const { rows } = await client.query(
      `UPDATE menus
       SET stock_quantity = GREATEST(0, stock_quantity + $2),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, stock_quantity`,
      [menuId, Math.trunc(delta)]
    );
    if (rows.length === 0) {
      await rollbackSafe(client, inTx);
      inTx = false;
      return res.status(404).json({ error: "메뉴를 찾을 수 없습니다." });
    }
    await client.query("COMMIT");
    inTx = false;
    res.json({ menu: { id: rows[0].id, stock_quantity: rows[0].stock_quantity } });
  } catch (err) {
    await rollbackSafe(client, inTx);
    console.error(err);
    res.status(500).json({ error: "재고를 수정하지 못했습니다." });
  } finally {
    client.release();
  }
}

/** POST /api/orders */
async function createOrder(req, res) {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items 배열이 필요합니다." });
  }

  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query("BEGIN");
    inTx = true;

    let totalAmount = 0;
    const prepared = [];

    for (const raw of items) {
      const menuId = Number(raw.menu_id);
      const quantity = Number(raw.quantity);
      const optionIds = Array.isArray(raw.option_ids)
        ? [...new Set(raw.option_ids.map((x) => Number(x)).filter((x) => Number.isInteger(x)))]
        : [];

      if (!Number.isInteger(menuId) || menuId < 1 || !Number.isInteger(quantity) || quantity < 1) {
        const e = new Error("INVALID_ITEM");
        e.code = "INVALID_ITEM";
        throw e;
      }

      const menuRow = await client.query(
        `SELECT id, price, stock_quantity FROM menus WHERE id = $1 FOR UPDATE`,
        [menuId]
      );
      if (menuRow.rows.length === 0) {
        const e = new Error("MENU_NOT_FOUND");
        e.code = "MENU_NOT_FOUND";
        throw e;
      }
      const menu = menuRow.rows[0];
      if (menu.stock_quantity < quantity) {
        const e = new Error("OUT_OF_STOCK");
        e.code = "OUT_OF_STOCK";
        e.detail = { menu_id: menuId };
        throw e;
      }

      let optionsPrice = 0;
      const optionRows = [];
      if (optionIds.length > 0) {
        const optRes = await client.query(
          `SELECT id, menu_id, price FROM options WHERE id = ANY($1::int[])`,
          [optionIds]
        );
        if (optRes.rows.length !== new Set(optionIds).size) {
          const e = new Error("INVALID_OPTIONS");
          e.code = "INVALID_OPTIONS";
          throw e;
        }
        for (const o of optRes.rows) {
          if (o.menu_id !== menuId) {
            const e = new Error("OPTION_MENU_MISMATCH");
            e.code = "OPTION_MENU_MISMATCH";
            throw e;
          }
          optionsPrice += o.price;
          optionRows.push(o);
        }
      }

      const unitPrice = menu.price + optionsPrice;
      const lineAmount = unitPrice * quantity;
      totalAmount += lineAmount;
      prepared.push({
        menuId,
        quantity,
        unitPrice,
        lineAmount,
        optionRows,
      });
    }

    const orderIns = await client.query(
      `INSERT INTO orders (ordered_at, status, total_amount)
       VALUES (NOW(), '주문 접수', $1)
       RETURNING id, ordered_at, status, total_amount`,
      [totalAmount]
    );
    const order = orderIns.rows[0];

    for (const p of prepared) {
      const itemIns = await client.query(
        `INSERT INTO order_items (order_id, menu_id, quantity, unit_price, line_amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [order.id, p.menuId, p.quantity, p.unitPrice, p.lineAmount]
      );
      const orderItemId = itemIns.rows[0].id;
      for (const o of p.optionRows) {
        await client.query(
          `INSERT INTO order_item_options (order_item_id, option_id, option_price)
           VALUES ($1, $2, $3)`,
          [orderItemId, o.id, o.price]
        );
      }
      await client.query(
        `UPDATE menus
         SET stock_quantity = stock_quantity - $2, updated_at = NOW()
         WHERE id = $1`,
        [p.menuId, p.quantity]
      );
    }

    await client.query("COMMIT");
    inTx = false;
    res.status(201).json({
      order: {
        id: order.id,
        ordered_at: order.ordered_at,
        status: order.status,
        total_amount: order.total_amount,
      },
    });
  } catch (err) {
    await rollbackSafe(client, inTx);
    const code = err.code;
    if (code === "INVALID_ITEM") {
      return res.status(400).json({ error: "주문 항목이 올바르지 않습니다." });
    }
    if (code === "MENU_NOT_FOUND") {
      return res.status(404).json({ error: "메뉴를 찾을 수 없습니다." });
    }
    if (code === "OUT_OF_STOCK") {
      return res.status(409).json({ error: "재고가 부족합니다.", detail: err.detail });
    }
    if (code === "INVALID_OPTIONS" || code === "OPTION_MENU_MISMATCH") {
      return res.status(400).json({ error: "옵션이 올바르지 않습니다." });
    }
    console.error(err);
    res.status(500).json({ error: "주문을 저장하지 못했습니다." });
  } finally {
    client.release();
  }
}

async function getOrderById(req, res) {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: "잘못된 주문 ID입니다." });
  }
  try {
    const oRes = await pool.query(
      `SELECT id, ordered_at, status, total_amount FROM orders WHERE id = $1`,
      [orderId]
    );
    if (oRes.rows.length === 0) {
      return res.status(404).json({ error: "주문을 찾을 수 없습니다." });
    }
    const o = oRes.rows[0];
    const itemsRes = await pool.query(
      `SELECT oi.id, oi.menu_id, oi.quantity, oi.unit_price, oi.line_amount, m.name AS menu_name
       FROM order_items oi
       JOIN menus m ON m.id = oi.menu_id
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [orderId]
    );
    const itemIds = itemsRes.rows.map((r) => r.id);
    let optionsByItem = new Map();
    if (itemIds.length > 0) {
      const optRes = await pool.query(
        `SELECT oio.order_item_id, o.id AS option_id, o.name AS option_name, oio.option_price
         FROM order_item_options oio
         JOIN options o ON o.id = oio.option_id
         WHERE oio.order_item_id = ANY($1::int[])`,
        [itemIds]
      );
      for (const row of optRes.rows) {
        if (!optionsByItem.has(row.order_item_id)) {
          optionsByItem.set(row.order_item_id, []);
        }
        optionsByItem.get(row.order_item_id).push({
          id: row.option_id,
          name: row.option_name,
          price: row.option_price,
        });
      }
    }
    const items = itemsRes.rows.map((row) => ({
      id: row.id,
      menu_id: row.menu_id,
      menu_name: row.menu_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      line_amount: row.line_amount,
      options: optionsByItem.get(row.id) ?? [],
    }));
    res.json({
      order: {
        id: o.id,
        ordered_at: o.ordered_at,
        status: o.status,
        total_amount: o.total_amount,
        items,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "주문을 불러오지 못했습니다." });
  }
}

/** GET /api/admin/orders — 주문·품목·옵션을 배치 쿼리로 조회 */
async function getAdminOrders(req, res) {
  try {
    const oRes = await pool.query(
      `SELECT id, ordered_at, status, total_amount FROM orders ORDER BY ordered_at DESC`
    );
    if (oRes.rows.length === 0) {
      return res.json({ orders: [] });
    }
    const orderIds = oRes.rows.map((r) => r.id);
    const itemsRes = await pool.query(
      `SELECT oi.id, oi.order_id, oi.menu_id, oi.quantity, oi.unit_price, oi.line_amount, m.name AS menu_name
       FROM order_items oi
       JOIN menus m ON m.id = oi.menu_id
       WHERE oi.order_id = ANY($1::int[])
       ORDER BY oi.order_id, oi.id`,
      [orderIds]
    );
    const itemIds = itemsRes.rows.map((r) => r.id);
    let optionsByItem = new Map();
    if (itemIds.length > 0) {
      const optRes = await pool.query(
        `SELECT oio.order_item_id, o.name AS option_name, oio.option_price
         FROM order_item_options oio
         JOIN options o ON o.id = oio.option_id
         WHERE oio.order_item_id = ANY($1::int[])`,
        [itemIds]
      );
      for (const row of optRes.rows) {
        if (!optionsByItem.has(row.order_item_id)) {
          optionsByItem.set(row.order_item_id, []);
        }
        optionsByItem.get(row.order_item_id).push({
          name: row.option_name,
          price: row.option_price,
        });
      }
    }
    const itemsByOrder = new Map();
    for (const row of itemsRes.rows) {
      if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
      itemsByOrder.get(row.order_id).push({
        id: row.id,
        menu_id: row.menu_id,
        menu_name: row.menu_name,
        quantity: row.quantity,
        unit_price: row.unit_price,
        line_amount: row.line_amount,
        options: optionsByItem.get(row.id) ?? [],
      });
    }
    const orders = oRes.rows.map((o) => ({
      id: o.id,
      ordered_at: o.ordered_at,
      status: o.status,
      total_amount: o.total_amount,
      items: itemsByOrder.get(o.id) ?? [],
    }));
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "주문 목록을 불러오지 못했습니다." });
  }
}

/** PATCH /api/admin/orders/:orderId/status */
async function patchOrderStatus(req, res) {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: "잘못된 주문 ID입니다." });
  }
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query("BEGIN");
    inTx = true;
    const cur = await client.query(`SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`, [
      orderId,
    ]);
    if (cur.rows.length === 0) {
      await rollbackSafe(client, inTx);
      inTx = false;
      return res.status(404).json({ error: "주문을 찾을 수 없습니다." });
    }
    const current = cur.rows[0].status;
    const nxt = nextStatus(current);
    if (!nxt) {
      await rollbackSafe(client, inTx);
      inTx = false;
      return res.status(400).json({ error: "더 이상 변경할 수 있는 상태가 없습니다." });
    }
    const upd = await client.query(
      `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1
       RETURNING id, ordered_at, status, total_amount`,
      [orderId, nxt]
    );
    await client.query("COMMIT");
    inTx = false;
    res.json({ order: upd.rows[0] });
  } catch (err) {
    await rollbackSafe(client, inTx);
    console.error(err);
    res.status(500).json({ error: "주문 상태를 변경하지 못했습니다." });
  } finally {
    client.release();
  }
}

module.exports = {
  getMenusPublic,
  getMenusAdmin,
  patchMenuStock,
  createOrder,
  getOrderById,
  getAdminOrders,
  patchOrderStatus,
};
