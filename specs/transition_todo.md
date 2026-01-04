# Transition Checklist: Self-Healing Architecture

## Phase 1: Server-Side Foundation
- [ ] **Atomic Storage Class (`JsonStore.php`)**
    - [ ] Implement `read(collection)`
    - [ ] Implement `write(collection, data)` with `flock` and `rename`.
    - [ ] Implement `appendLog(entry)` for `oplog.jsonl`.
- [ ] **Migration Script (`migrate_v2.php`)**
    - [ ] Backup existing `data/` directory.
    - [ ] Script reads all JSON files.
    - [ ] Script injects `_version`, `_updatedAt`, `_deleted`, `_hash`.
    - [ ] Script saves files using `JsonStore`.
    - [ ] Run migration and verify `data/` integrity.

## Phase 2: Client-Side Storage (Dexie)
- [ ] **Update `src/db.js`**
    - [ ] Add `_version`, `_updatedAt` to indexes.
    - [ ] Create `outbox` store (`++id, collection, docId, type, payload`).
- [ ] **Create `src/services/Repository.js`**
    - [ ] Implement `upsert(collection, data)`: Updates local store + adds to outbox.
    - [ ] Implement `remove(collection, id)`: Soft deletes local + adds to outbox.
    - [ ] Implement `get(collection, id)`.

## Phase 3: The Sync Engine
- [ ] **Server Endpoint (`api/sync.php`)**
    - [ ] specific logic to handle "Push" (Apply incoming changes).
    - [ ] specific logic to handle "Pull" (Return deltas based on timestamp).
    - [ ] Implement Conflict Resolution (Version check).
- [ ] **Client Engine (`src/services/SyncEngine.js`)**
    - [ ] Implement `navigator.locks` wrapper.
    - [ ] Implement `push()`: Send outbox to server.
    - [ ] Implement `pull()`: Process server response and update Dexie.
    - [ ] Implement `cleanup()`: Remove synced outbox items.
    - [ ] Implement `calculateHash()`: Verify data integrity (Optional/Advanced).

## Phase 4: Application Refactoring
- [ ] **Refactor `src/modules/items.js`**
    - [ ] Replace `db.items.put` with `Repository.upsert('items', ...)`.
- [ ] **Refactor `src/modules/users.js`**
    - [ ] Replace `db.users.put` with `Repository.upsert('users', ...)`.
- [ ] **Refactor `src/modules/pos.js`**
    - [ ] Ensure transactions use the new Repository pattern.
- [ ] **Refactor `src/modules/stockin.js`**
    - [ ] Ensure stock updates use the new Repository pattern.

## Phase 5: UI & Testing
- [ ] **UI Components**
    - [ ] Add Sync Status Indicator (Green/Yellow/Red) in `src/layout.js`.
    - [ ] Add "Force Sync" button.
- [ ] **Testing Scenarios**
    - [ ] **Offline Creation:** Create item offline -> Refresh -> Online -> Verify Sync.
    - [ ] **Conflict:** Edit Item A on Device 1 (Offline). Edit Item A on Device 2 (Online). Connect Device 1. Verify Device 2's edit wins (or higher version wins).
    - [ ] **Interruption:** Kill server process mid-sync (simulate). Verify no data corruption (Atomic write check).
    - [ ] **Tab Concurrency:** Open App in 2 tabs. Trigger sync. Verify only one network request fires.

## Phase 6: Cleanup
- [ ] Remove old `sync-service.js` (replaced by `SyncEngine.js`).
- [ ] Archive old `api/router.php` logic (replaced by `sync.php` and `JsonStore`).