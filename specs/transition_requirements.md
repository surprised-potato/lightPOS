# Technical Specification: Self-Healing Database Transition

## 1. Overview
This document defines the requirements for transitioning the **surprised-potato POS** from a simple JSON storage model to a **Self-Healing, Offline-First Architecture**. The goal is to ensure data integrity, handle network interruptions gracefully, and resolve conflicts automatically using an "Eventual Consistency" model.

## 2. Architectural Changes

### 2.1 Distributed State Machine
- **Current:** Server is the only source of truth; Client fetches full lists.
- **New:**
    - **Client (Dexie.js):** Acts as the primary "Hot" storage.
    - **Server (PHP/JSON):** Acts as the "Ledger" and synchronization hub.
    - **Sync Engine:** A dedicated background process managing the flow of data between Client and Server.

### 2.2 Data Schema & Metadata
To support conflict resolution (Last Write Wins) and integrity checks, every record in both `items.json`, `users.json`, etc., and IndexedDB must include standard metadata fields.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_version` | integer | Monotonically increasing version number. |
| `_updatedAt` | timestamp | Unix timestamp of the last modification. |
| `_deleted` | boolean | Soft-delete flag (tombstone). |
| `_hash` | string | Simple hash (e.g., CRC32 or MD5) of the data payload for integrity verification. |

### 2.3 Storage Strategy
- **Sharding:** To prevent I/O bottlenecks and corruption of massive files, data should be sharded where appropriate (e.g., `data/transactions/YYYY-MM.json` or `data/users/{uuid}.json`) rather than monolithic files.
- **Atomic Writes (Server):** PHP must implement atomic file writing:
    1. Write to `filename.json.tmp`.
    2. `flock` (File Lock).
    3. `rename()` (Atomic move) to `filename.json`.

## 3. Synchronization Protocol

### 3.1 The Outbox Pattern (Client)
- The client must maintain an `outbox` store in IndexedDB.
- **Write Operation:**
    1. Update local `data_store` (Optimistic UI).
    2. Add mutation record to `outbox_store`.
    3. Trigger Sync Engine.

### 3.2 Sync Cycle
1. **Push:** Client sends `outbox` (pending mutations) to Server.
2. **Process:** Server applies mutations if `client_version > server_version`.
3. **Pull:** Server responds with records where `server_version > client_last_known_version`.
4. **Ack:** Client removes successfully synced items from `outbox`.

### 3.3 Conflict Resolution
- **Strategy:** Last Write Wins (LWW).
- **Logic:** If IDs match, the record with the higher `_version` wins. If versions are equal, the higher `_updatedAt` wins.

## 4. Self-Healing Mechanisms

### 4.1 Integrity Check (The Hash)
- During sync, the client and server exchange a hash of the collection.
- If hashes mismatch after a sync, a **Full Re-fetch** is triggered for that specific collection to repair corruption.

### 4.2 Server Oplog (Operations Log)
- The server must maintain an append-only `oplog.json`.
- **Purpose:** If a JSON data file becomes corrupted or unreadable, the system can replay the `oplog` to reconstruct the current state.

### 4.3 Concurrency Control
- **Browser:** Use **Web Locks API** (`navigator.locks`) to ensure only one tab/window performs synchronization at a time.
- **Server:** PHP `flock` ensures no two requests write to the same JSON file simultaneously.

## 5. Migration Strategy
- **Data Migration:** Existing JSON files must be parsed and rewritten to include `_version: 1`, `_updatedAt: now`, and `_hash`.
- **Backward Compatibility:** The API must handle legacy requests during the transition period or enforce a maintenance window.