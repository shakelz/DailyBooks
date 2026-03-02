PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS app_state;
DROP TABLE IF EXISTS repairs;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS shops;

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  address TEXT,
  owner_email TEXT,
  telephone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  shop_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  pin TEXT,
  password TEXT,
  hourlyRate REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_online INTEGER NOT NULL DEFAULT 0,
  photo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  level1 TEXT NOT NULL,
  level2 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  product_id TEXT,
  item_name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  color TEXT,
  variant TEXT,
  level1 TEXT,
  level2 TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL,
  source TEXT,
  status TEXT,
  amount REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 1,
  item_id TEXT,
  item_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  note TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS repairs (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  user_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  device_type TEXT,
  device_model TEXT,
  issue TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  estimate REAL NOT NULL DEFAULT 0,
  advance REAL NOT NULL DEFAULT 0,
  due REAL NOT NULL DEFAULT 0,
  notes TEXT,
  date_in TEXT,
  date_out TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  hours REAL NOT NULL DEFAULT 0,
  status TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_state (
  state_key TEXT NOT NULL,
  shop_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  state_value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (state_key, shop_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_shop_id ON profiles(shop_id);
CREATE INDEX IF NOT EXISTS idx_profiles_shop_role ON profiles(shop_id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_shop_pin ON profiles(shop_id, pin);
CREATE INDEX IF NOT EXISTS idx_profiles_shop_online ON profiles(shop_id, is_online);

CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON categories(shop_id);
CREATE INDEX IF NOT EXISTS idx_categories_shop_l1_l2 ON categories(shop_id, level1, level2);

CREATE INDEX IF NOT EXISTS idx_inventory_shop_id ON inventory(shop_id);
CREATE INDEX IF NOT EXISTS idx_inventory_shop_product ON inventory(shop_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_shop_name ON inventory(shop_id, item_name);

CREATE INDEX IF NOT EXISTS idx_transactions_shop_id ON transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_date ON transactions(shop_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_status ON transactions(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_source ON transactions(shop_id, source);

CREATE INDEX IF NOT EXISTS idx_repairs_shop_id ON repairs(shop_id);
CREATE INDEX IF NOT EXISTS idx_repairs_shop_status ON repairs(shop_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_shop_user_date ON attendance(shop_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_app_state_key ON app_state(state_key);
CREATE INDEX IF NOT EXISTS idx_app_state_shop_user ON app_state(shop_id, user_id);
