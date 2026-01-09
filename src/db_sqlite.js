import { initSqlJs } from './utils/sqljs-wrapper.js';

/*
IMPORTANT: 
This file requires the sql-wasm.wasm file to be present in the src/libs/ directory.
Please download it from https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm 
and place it in src/libs/sql.wasm
*/



export let db = null;

export async function connect(dbPath) {
  // Fallback: If the module import failed (undefined), try the global window object
  let sqlInit = initSqlJs;
  if (!sqlInit && window.initSqlJs) {
      sqlInit = window.initSqlJs;
  }

  const SQL = await sqlInit({
    locateFile: file => `./src/libs/${file}`
  });
  
  try {
    const response = await fetch(dbPath);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const buffer = await response.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));
    console.log('db_sqlite.js: SQLite database initialized from existing file.');
  } catch (error) {
    console.error("Failed to load database:", error);
    // Create a new database if it doesn't exist
    db = new SQL.Database();
    console.log('db_sqlite.js: New SQLite database created.');
    await applySchema(db); // Apply schema to the new database
  }
}

async function applySchema(database) {
  const schemaSql = `
-- Refactored schema for SQLite migration, aligning with sqlite_ipp.md

-- Use WAL mode for better concurrency
PRAGMA journal_mode=WAL;

-- Main tables with hybrid relational/document structure

CREATE TABLE items (
    id TEXT PRIMARY KEY,
    barcode TEXT,
    name TEXT,
    category TEXT,
    supplier_id TEXT,
    stock_level REAL,
    full_data TEXT, -- JSON payload for other fields
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_items_barcode ON items(barcode);
CREATE INDEX idx_items_supplier_id ON items(supplier_id);
CREATE INDEX idx_items_updatedAt ON items(_updatedAt);

CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    user_email TEXT,
    customer_id TEXT,
    total_amount REAL,
    voided_at INTEGER,
    items_json TEXT, -- JSON array of transaction items
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX idx_transactions_user_email ON transactions(user_email);
CREATE INDEX idx_transactions_updatedAt ON transactions(_updatedAt);

CREATE TABLE users (
    email TEXT PRIMARY KEY,
    name TEXT,
    password_hash TEXT,
    role TEXT,
    permissions_json TEXT, -- JSON for flexible permissions
    phone TEXT,
    is_active INTEGER DEFAULT 1,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_users_updatedAt ON users(_updatedAt);

-- Standardized tables (using json_body for unstructured data)

CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_customers_updatedAt ON customers(_updatedAt);

CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_suppliers_updatedAt ON suppliers(_updatedAt);

CREATE TABLE shifts (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_shifts_updatedAt ON shifts(_updatedAt);

CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_expenses_updatedAt ON expenses(_updatedAt);

CREATE TABLE returns (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_returns_updatedAt ON returns(_updatedAt);

CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_stock_movements_updatedAt ON stock_movements(_updatedAt);

CREATE TABLE adjustments (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_adjustments_updatedAt ON adjustments(_updatedAt);

CREATE TABLE stockins (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_stockins_updatedAt ON stockins(_updatedAt);

CREATE TABLE suspended_transactions (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_suspended_transactions_updatedAt ON suspended_transactions(_updatedAt);

CREATE TABLE stock_logs (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_stock_logs_updatedAt ON stock_logs(_updatedAt);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_notifications_updatedAt ON notifications(_updatedAt);

CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    json_body TEXT,
    _version INTEGER,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_settings_updatedAt ON settings(_updatedAt);


-- Sync and client-side specific tables

CREATE TABLE sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    _updatedAt INTEGER
);

-- This table is for the client-side sync queue, leave as is.
CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection TEXT,
    docId TEXT,
    type TEXT
);
  `;
  try {
    database.exec(schemaSql);
    console.log('db_sqlite.js: Schema applied to new database.');
  } catch (error) {
    console.error('db_sqlite.js: Failed to apply schema:', error);
    throw error;
  }
}

function get(query, params = []) {
  if (!db) return null;
  const stmt = db.prepare(query);
  stmt.bind(params);
  const result = stmt.get();
  stmt.free();
  return result;
}

function getAll(query, params = []) {
  if (!db) return [];
  const stmt = db.prepare(query);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function run(query, params = []) {
  if (!db) throw new Error("Database not initialized");
  db.run(query, params);
}

export { get, getAll, run };
