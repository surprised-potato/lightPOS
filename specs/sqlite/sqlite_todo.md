# Transition Checklist: JSON to SQLite

## Phase 1: Database Foundation
- [x] **Define Schema (`api/schema.sql`)**
    - [x] Create `items` table (Index: `barcode`, `supplier_id`).
    - [x] Create `transactions` table (Index: `timestamp`, `user_email`).
    - [x] Create `customers`, `suppliers`, `shifts`, `expenses`, `returns`, `stock_movements`, `adjustments`, `stockins`, `suspended_transactions` tables.
    - [x] Create `users` table.
    - [x] Create `sync_metadata` table.
- [x] **Database Connection Class (`api/db/Database.php`)**
    - [x] Implement Singleton pattern for PDO connection.
    - [x] Configure SQLite WAL mode (`PRAGMA journal_mode=WAL;`) for concurrency.

## Phase 2: Backend Logic
- [x] **Create `SQLiteStore.php`**
    - [x] Implement `getAll(collection)`: Returns all non-deleted records.
    - [x] Implement `getChanges(collection, since)`: `SELECT * FROM table WHERE _updatedAt > ?`.
    - [x] Implement `upsert(collection, record)`: Use `INSERT OR REPLACE` or `ON CONFLICT`.
    - [x] Implement `delete(collection, id)`: Soft delete (`UPDATE table SET _deleted=1...`).
    - [x] **Helper:** `hydrate(row)`: Convert JSON columns (like `items` in transactions) back to arrays.
- [x] **Update `api/sync.php`**
    - [x] Replace `JsonStore` instantiation with `SQLiteStore`.
    - [x] Ensure `push` logic handles transactions (SQL `BEGIN/COMMIT`) for atomicity.

## Phase 3: Migration Tooling
- [x] **Create `api/migrate_to_sqlite.php`**
    - [x] Check for `data/database.sqlite`. If exists, abort or prompt.
    - [x] Execute `schema.sql`.
    - [x] Loop through known collections (`items`, `transactions`, etc.).
    - [x] Read corresponding `.json` file.
    - [x] Prepare `INSERT` statements.
    - [x] Execute batch inserts.
    - [x] Output migration stats (Records read vs Records inserted).

## Phase 4: Admin & Maintenance
- [x] **Update `api/router.php`** (Admin API)
    - [x] Update "Backup" logic to dump SQLite database or export tables to JSON (for compatibility).
    - [x] Update "Reset" logic to `DELETE FROM tables` instead of deleting files.

## Phase 5: Testing & Cutover
- [x] **Dry Run**
    - [x] Run migration script locally.
    - [x] Verify `api/sync.php?since=0` returns correct JSON structure.
- [ ] **Cutover**
    - [ ] Stop web server (maintenance mode).
    - [ ] Run migration on production.
    - [ ] Rename JSON files to `.bak`.
    - [ ] Restart server.