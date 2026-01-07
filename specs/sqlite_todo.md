# Transition Checklist: JSON to SQLite

## Phase 1: Database Foundation
- [ ] **Define Schema (`api/schema.sql`)**
    - [ ] Create `items` table (Index: `barcode`, `supplier_id`).
    - [ ] Create `transactions` table (Index: `timestamp`, `user_email`).
    - [ ] Create `customers`, `suppliers`, `shifts`, `expenses`, `returns`, `stock_movements`, `adjustments`, `stockins`, `suspended_transactions` tables.
    - [ ] Create `users` table.
    - [ ] Create `sync_metadata` table.
- [ ] **Database Connection Class (`api/db/Database.php`)**
    - [ ] Implement Singleton pattern for PDO connection.
    - [ ] Configure SQLite WAL mode (`PRAGMA journal_mode=WAL;`) for concurrency.

## Phase 2: Backend Logic
- [ ] **Create `SQLiteStore.php`**
    - [ ] Implement `getAll(collection)`: Returns all non-deleted records.
    - [ ] Implement `getChanges(collection, since)`: `SELECT * FROM table WHERE _updatedAt > ?`.
    - [ ] Implement `upsert(collection, record)`: Use `INSERT OR REPLACE` or `ON CONFLICT`.
    - [ ] Implement `delete(collection, id)`: Soft delete (`UPDATE table SET _deleted=1...`).
    - [ ] **Helper:** `hydrate(row)`: Convert JSON columns (like `items` in transactions) back to arrays.
- [ ] **Update `api/sync.php`**
    - [ ] Replace `JsonStore` instantiation with `SQLiteStore`.
    - [ ] Ensure `push` logic handles transactions (SQL `BEGIN/COMMIT`) for atomicity.

## Phase 3: Migration Tooling
- [ ] **Create `api/migrate_to_sqlite.php`**
    - [ ] Check for `data/database.sqlite`. If exists, abort or prompt.
    - [ ] Execute `schema.sql`.
    - [ ] Loop through known collections (`items`, `transactions`, etc.).
    - [ ] Read corresponding `.json` file.
    - [ ] Prepare `INSERT` statements.
    - [ ] Execute batch inserts.
    - [ ] Output migration stats (Records read vs Records inserted).

## Phase 4: Admin & Maintenance
- [ ] **Update `api/router.php`** (Admin API)
    - [ ] Update "Backup" logic to dump SQLite database or export tables to JSON (for compatibility).
    - [ ] Update "Reset" logic to `DELETE FROM tables` instead of deleting files.

## Phase 5: Testing & Cutover
- [ ] **Dry Run**
    - [ ] Run migration script locally.
    - [ ] Verify `api/sync.php?since=0` returns correct JSON structure.
- [ ] **Cutover**
    - [ ] Stop web server (maintenance mode).
    - [ ] Run migration on production.
    - [ ] Rename JSON files to `.bak`.
    - [ ] Restart server.