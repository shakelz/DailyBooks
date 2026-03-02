PRAGMA foreign_keys = OFF;

-- 1) Inspect any leftover schema SQL that still references profiles_old
SELECT type, name, tbl_name, sql
FROM sqlite_master
WHERE sql LIKE '%profiles_old%';

-- 2) Rebuild dependent tables so all FK refs point to profiles (not profiles_old)

-- transactions
DROP TABLE IF EXISTS transactions_new;
CREATE TABLE transactions_new (
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

INSERT INTO transactions_new (
  id, shop_id, user_id, type, source, status, amount, cost, quantity,
  item_id, item_name, customer_name, customer_phone, note, date, created_at, updated_at
)
SELECT
  id, shop_id, user_id, type, source, status, amount, cost, quantity,
  item_id, item_name, customer_name, customer_phone, note, date, created_at, updated_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

-- repairs
DROP TABLE IF EXISTS repairs_new;
CREATE TABLE repairs_new (
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

INSERT INTO repairs_new (
  id, shop_id, user_id, customer_name, customer_phone, device_type, device_model,
  issue, status, estimate, advance, due, notes, date_in, date_out, created_at, updated_at
)
SELECT
  id, shop_id, user_id, customer_name, customer_phone, device_type, device_model,
  issue, status, estimate, advance, due, notes, date_in, date_out, created_at, updated_at
FROM repairs;

DROP TABLE repairs;
ALTER TABLE repairs_new RENAME TO repairs;

-- attendance
DROP TABLE IF EXISTS attendance_new;
CREATE TABLE attendance_new (
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

INSERT INTO attendance_new (
  id, shop_id, user_id, date, check_in, check_out, hours, status, note, created_at, updated_at
)
SELECT
  id, shop_id, user_id, date, check_in, check_out, hours, status, note, created_at, updated_at
FROM attendance;

DROP TABLE attendance;
ALTER TABLE attendance_new RENAME TO attendance;

-- 3) Recreate indexes for rebuilt tables
CREATE INDEX IF NOT EXISTS idx_transactions_shop_id ON transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_date ON transactions(shop_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_status ON transactions(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_source ON transactions(shop_id, source);

CREATE INDEX IF NOT EXISTS idx_repairs_shop_id ON repairs(shop_id);
CREATE INDEX IF NOT EXISTS idx_repairs_shop_status ON repairs(shop_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_shop_user_date ON attendance(shop_id, user_id, date);

-- 4) Validate FK graph
PRAGMA foreign_key_check;

PRAGMA foreign_keys = ON;