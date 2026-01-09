# Technical Specification: SQLite Backend Transition

## 1. Overview
This document outlines the strategy to migrate the **surprised-potato POS** backend from flat JSON file storage to **SQLite 3**. This move will improve data integrity, concurrency handling, and query performance while maintaining the "Self-Healing" synchronization protocol established in the previous phase.

## 2. Architecture Changes

### 2.1 Database Layer (`api/db/`)
- **Current:** `JsonStore.php` reads/writes entire JSON files with `flock`.
- **New:** `Database.php` (Singleton) manages a persistent PDO connection to `data/database.sqlite`.
- **New:** `SQLiteStore.php` implements the same interface as `JsonStore` but translates calls to SQL queries.

### 2.2 Data Schema Strategy (Hybrid Relational/Document)
To minimize friction with the existing frontend (which expects nested JSON objects), we will use a **Hybrid Schema**. Core fields needed for sorting, filtering, and syncing will be columns; complex nested structures (like transaction items) will be stored as JSON text.

#### Standard Columns (All Tables)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT PRIMARY KEY | UUID or Email (for users) |
| `_version` | INTEGER | Sync versioning |
| `_updatedAt` | INTEGER | Unix timestamp |
| `_deleted` | INTEGER | Boolean flag (0/1) |
| `json_body` | TEXT | (Optional) Full JSON payload if schema is flexible |

#### Key Tables
1.  **items**: `id`, `barcode`, `name`, `category`, `supplier_id`, `stock_level`, `_version`, `_updatedAt`, `_deleted`, `full_data` (JSON).
2.  **transactions**: `id`, `timestamp`, `user_email`, `customer_id`, `total_amount`, `_version`, `_updatedAt`, `_deleted`, `items_json` (TEXT).
3.  **users**: `email` (PK), `name`, `password_hash`, `role`, `_version`, `_updatedAt`, `_deleted`, `permissions_json` (TEXT).
4.  **sync_metadata**: `key` (PK), `value` (TEXT), `_updatedAt`.

### 2.3 API Adaptation
The `api/sync.php` endpoint will be refactored to use `SQLiteStore`.

- **Pull (GET):**
  - **Old:** Read JSON, filter in PHP loop.
  - **New:** `SELECT * FROM {table} WHERE _updatedAt > :since`.

- **Push (POST):**
  - **Old:** Read JSON, find index, replace, write file.
  - **New:** `INSERT INTO {table} (...) VALUES (...) ON CONFLICT(id) DO UPDATE SET ...`.

## 3. Migration Strategy

### 3.1 The Migration Script (`api/migrate_json_to_sqlite.php`)
A standalone script will:
1.  Create the SQLite database file and tables (DDL).
2.  Iterate through existing `data/*.json` files.
3.  Insert records into SQLite, preserving `_version` and `_updatedAt`.
4.  Rename `data/*.json` to `data/*.json.bak` to prevent accidental usage.

### 3.2 Backward Compatibility
The frontend `SyncEngine` expects JSON responses. The PHP `SQLiteStore` must hydrate the SQL result sets back into the expected JSON structure (e.g., expanding `permissions_json` string back into a PHP array) before sending the response.

## 4. Implementation Steps

1.  **Environment Setup:** Ensure PHP `pdo_sqlite` extension is enabled.
2.  **DDL Generation:** Write `schema.sql`.
3.  **Backend Logic:** Implement `Database` and `SQLiteStore` classes.
4.  **API Refactor:** Switch `sync.php` to use the new store.
5.  **Data Migration:** Run migration script.
6.  **Verification:** Run the frontend diagnostic report.

## 5. Rollback Plan
If critical issues arise:
1.  Restore `api/sync.php` to use `JsonStore`.
2.  Restore `.json.bak` files to `.json`.
