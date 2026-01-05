# Transition Checklist: Self-Healing Architecture

## Phase 1: Server-Side Foundation
- [x] **Atomic Storage Class (`JsonStore.php`)**
    - [x] Implement `read(collection)`
    - [x] Implement `write(collection, data)` with `flock` and `rename`.
    - [x] Implement `appendLog(entry)` for `oplog.jsonl`.
- [x] **Migration Script (`migrate_v2.php`)**
    - [x] Backup existing `data/` directory.
    - [x] Script reads all JSON files.
    - [x] Script injects `_version`, `_updatedAt`, `_deleted`, `_hash`.
    - [x] Script saves files using `JsonStore`.
    - [x] Run migration and verify `data/` integrity.

## Phase 2: Client-Side Storage (Dexie)
- [x] **Update `src/db.js`**
    - [x] Add `_version`, `_updatedAt` to indexes.
    - [x] Create `outbox` store (`++id, collection, docId, type, payload`).
- [x] **Create `src/services/Repository.js`**
    - [x] Implement `upsert(collection, data)`: Updates local store + adds to outbox.
    - [x] Implement `remove(collection, id)`: Soft deletes local + adds to outbox.
    - [x] Implement `get(collection, id)`.

## Phase 3: The Sync Engine
- [x] **Server Endpoint (`api/sync.php`)**
    - [x] specific logic to handle "Push" (Apply incoming changes).
    - [x] specific logic to handle "Pull" (Return deltas based on timestamp).
    - [x] Implement Conflict Resolution (Version check).
- [x] **Client Engine (`src/services/SyncEngine.js`)**
    - [x] Implement `navigator.locks` wrapper.
    - [x] Implement `push()`: Send outbox to server.
    - [x] Implement `pull()`: Process server response and update Dexie.
    - [x] Implement `cleanup()`: Remove synced outbox items.
    - [ ] Implement `calculateHash()`: Verify data integrity (Optional/Advanced).

## Phase 4: Application Refactoring
 [x] **Refactor `src/modules/items.js`**
    - [x] Replace `db.items.put` with `Repository.upsert('items', ...)`.
 [x] **Refactor `src/modules/users.js`**
    - [x] Replace `db.users.put` with `Repository.upsert('users', ...)`.
 [x] **Refactor `src/modules/pos.js`**
    - [x] Ensure transactions use the new Repository pattern.
- [x] **Refactor `src/modules/stockin.js`**
    - [x] Ensure stock updates use the new Repository pattern.
- [x] stock-count, 
- [x] reports,
- [x] returns, 
- [x] customers, 
- [x] suppliers, 
- [x] expenses, 
- [x] shifts, and 
- [x] adjustments

## Phase 5: UI & Testing
- [x] **UI Components**
    - [x] Add Sync Status Indicator (Green/Yellow/Red) in `src/layout.js`.
    - [x] Add "Force Sync" button.
- [ ] **Testing Scenarios**
    - [ ] **Offline Creation:** Create item offline -> Refresh -> Online -> Verify Sync.
    - [ ] **Conflict:** Edit Item A on Device 1 (Offline). Edit Item A on Device 2 (Online). Connect Device 1. Verify Device 2's edit wins (or higher version wins).
    - [ ] **Interruption:** Kill server process mid-sync (simulate). Verify no data corruption (Atomic write check).
    - [ ] **Tab Concurrency:** Open App in 2 tabs. Trigger sync. Verify only one network request fires.

## Phase 6: Cleanup
- [x] Remove old `sync-service.js` (replaced by `SyncEngine.js`).
- [x] Archive old `api/router.php` logic (replaced by `sync.php` and `JsonStore`).