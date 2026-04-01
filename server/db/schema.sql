-- PRD §6.2 — PostgreSQL schema (coffee order app)

CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  image_url TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS options (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL REFERENCES menus (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_options_menu_id ON options (menu_id);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT '주문 접수'
    CHECK (status IN ('주문 접수', '제조 중', '완료')),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders (ordered_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  menu_id INTEGER NOT NULL REFERENCES menus (id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  line_amount INTEGER NOT NULL CHECK (line_amount >= 0),
  CONSTRAINT line_amount_matches CHECK (line_amount = unit_price * quantity)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_id ON order_items (menu_id);

CREATE TABLE IF NOT EXISTS order_item_options (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES options (id) ON DELETE RESTRICT,
  option_price INTEGER NOT NULL DEFAULT 0 CHECK (option_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_item_options_order_item_id
  ON order_item_options (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_options_option_id
  ON order_item_options (option_id);
