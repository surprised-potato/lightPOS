-- api/schema_po.sql

-- Metrics calculated by the Inventory Optimization Engine
CREATE TABLE IF NOT EXISTS inventory_metrics (
    sku_id TEXT PRIMARY KEY,
    first_sale_date TEXT,
    abc_class TEXT, -- 'A', 'B', 'C'
    xyz_class TEXT, -- 'X', 'Y', 'Z'
    cv_value REAL, -- Coefficient of Variation
    daily_velocity REAL,
    std_dev_sales REAL,
    eoq_qty INTEGER, -- Economic Order Quantity
    rop_trigger INTEGER, -- Reorder Point
    safety_stock INTEGER,
    last_recalc TEXT,
    _version INTEGER DEFAULT 1,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);

-- Configuration for Suppliers (Procurement Rules)
CREATE TABLE IF NOT EXISTS supplier_config (
    supplier_id TEXT PRIMARY KEY,
    delivery_cadence TEXT, -- 'weekly', 'biweekly', 'monthly', 'on_order'
    lead_time_days INTEGER,
    monthly_otb REAL, -- Open-to-Buy Budget
    current_spend REAL,
    _version INTEGER DEFAULT 1,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    supplier_id TEXT,
    status TEXT, -- 'draft', 'approved', 'ordered', 'received', 'cancelled'
    items_json TEXT, -- JSON array of {item_id, qty, cost}
    total_amount REAL,
    created_at TEXT,
    expected_delivery TEXT,
    received_at TEXT,
    notes TEXT,
    _version INTEGER DEFAULT 1,
    _updatedAt INTEGER,
    _deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_sku ON inventory_metrics(sku_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);