# Supplier PO Module Implementation Plan

## Overview
Implementation of Inventory Optimization & Procurement Engine based on `supplier-po.md`.
Architecture follows `sqlite_error_diagnosis.md`: Server-side PHP for heavy logic/storage, Client-side Dexie/JS for UI and offline capability.

## 1. Database Schema (Server-Side)
- [x] **Create Test**: `tests/api/SchemaTest.php` to verify `inventory_metrics`, `supplier_config`, `purchase_orders` tables creation.
- [x] **Create `api/schema_po.sql`**:
    - `inventory_metrics` table (sku_id, abc_class, xyz_class, eoq_qty, rop_trigger, etc.).
    - `supplier_config` table (supplier_id, delivery_cadence, lead_time_days, monthly_otb, etc.).
    - `purchase_orders` table (po_id, supplier_id, status, created_at, items_json).
- [x] **Run Test**: Verify schema SQL is valid and tables are created.
- [x] **Create Test**: `tests/api/RouterInitTest.php` to verify `api/router.php` initializes new tables.
- [x] **Update `api/router.php`**:
    - Add logic to initialize these tables if they don't exist.
    - *Decision*: Use the main `database.sqlite` for `supplier_config` and `purchase_orders` (to sync easily). Use a separate `metrics.sqlite` for `inventory_metrics` if performance requires, or keep in main DB for simplicity. *Plan: Keep in main DB for now to leverage existing `SQLiteStore` class.*
- [x] **Run Test**: Verify router initializes tables on request.

## 2. Backend Logic (PHP)
- [x] **Create Test**: `tests/api/InventoryOptimizerTest.php` for ABC-XYZ and EOQ logic.
- [x] **Inventory Optimizer Class (`api/InventoryOptimizer.php`)**:
    - `calculateMetrics()`: Performs the ABC-XYZ analysis, Dynamic Lookback, and ROP/EOQ calculations.
    - Should be callable via Cron or API.
- [x] **Run Test**: Verify optimizer calculations against sample data.
- [x] **Create Test**: `tests/api/ProcurementServiceTest.php` for PO generation logic.
- [x] **Procurement Service (`api/ProcurementService.php`)**:
    - `getSuggestedOrder($supplierId)`: Returns optimized order based on ROP and OTB.
    - `createPurchaseOrder($data)`: Saves PO.
- [x] **Run Test**: Verify suggested orders respect OTB and ROP.
- [x] **Create Test**: `tests/api/ProcurementApiTest.php` for endpoints.
- [x] **API Endpoints (`api/procurement.php`)**:
    - `GET /recalculate`: Triggers optimizer.
    - `GET /alerts`: Returns items below ROP.
    - `GET /suggested-order`: Returns JSON for PO creation.
    - `POST /settings`: Updates supplier config.
- [x] **Run Test**: Verify API endpoints return correct JSON structure.

## 3. Frontend Implementation (Client-Side)
- [x] **Create Test**: `src/modules/db_schema.test.js` to verify Dexie version upgrade and new tables.
- [x] **Dexie Schema Update (`src/db.js`)**:
    - Add `supplier_config` and `purchase_orders` to local schema.
    - *Note*: `inventory_metrics` might not need full sync if only used for alerts/suggestions fetched via API, but syncing allows offline "Needs Attention" dashboard. *Plan: Sync `inventory_metrics` as read-only on client.*
- [x] **Run Test**: Verify Dexie database opens with new tables.
- [x] **Create Test**: `src/modules/suppliers.test.js` for settings UI logic.
- [x] **Supplier Settings (`src/modules/suppliers.js`)**:
    - Add UI to edit `delivery_cadence`, `lead_time`, `otb` for each supplier.
- [x] **Run Test**: Verify supplier settings can be saved and retrieved.
- [x] **Create Test**: `src/modules/purchase_orders.test.js` for PO workflow.
- [x] **Purchase Order Module (`src/modules/purchase_orders.js`)**:
    - **Dashboard**: View alerts (Low Stock vs ROP).
    - **PO Management**: List/Create/Edit/Approve POs.
    - **Receiving**: Convert PO to Stock-In (integrate with `stockin.js`).
- [ ] **Run Test**: Verify PO creation and status transitions.

## 4. Integration
- [x] **Create Test**: `tests/integration/SyncPoTest.php` to verify syncing of PO tables.
- [x] **Sync Engine**: Ensure new tables (`supplier_config`, `purchase_orders`) are synced.
- [x] **Run Test**: Verify data pushes/pulls for new tables.
- [ ] **Create Test**: `tests/integration/RealtimeTriggerTest.php` for "On Order" logic.
- [x] **Real-time Triggers**:
    - Modify `api/sync.php` (handle push) to check for "On Order" triggers when sales are synced.
- [x] **Run Test**: Verify sales trigger PO alerts for "On Order" suppliers.