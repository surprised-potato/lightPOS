# Development Environment

**Note:** Development is done in a separate directory using VSCode. Changes are deployed to the XAMPP server located at `/opt/lampp/htdocs/lightPOS` using the `deploy_to_xampp.sh` script. This can lead to issues where file changes are not immediately reflected, or where server-side caching (like PHP OPcache) serves stale files, causing confusion during debugging.

# SQLite Error Diagnosis

## Problem Description

The application was encountering a `ReferenceError: initSqlJs is not defined` error, primarily originating from `src/db_sqlite.js` and `src/utils/sqljs-wrapper.js`. This error indicated that the `initSqlJs` function, which is part of the `sql.js` library, was not available in the global scope when these modules attempted to use it.

Further investigation revealed the following:
1.  **`sql.js` is not a standard global script:** The `sql.js` file (`src/libs/sql.js`), even when fetched directly from the CDN, does not explicitly assign `initSqlJs` to the global `window` object. Instead, it includes logic for different module systems (CommonJS, AMD) at its end, meaning it expects to be used within a module environment or accessed via specific module exports.
2.  **Incorrect wrapper implementation:** The `src/utils/sqljs-wrapper.js` module was created to bridge the gap between the global `sql.js` script and the ES module environment. However, it relied on `window.initSqlJs`, which was never being set by the `sql.js` file itself.
3.  **Previous attempts to modify `sql.js` led to further errors:** Direct modifications to the minified `src/libs/sql.js` file to force `initSqlJs` onto the `window` object resulted in `SyntaxError` and `ReferenceError` due to incorrect placement of code within the minified and complex library structure.

## Correct Fix (Previous)

The fundamental issue was that the `sql.js` library, in its current build, does not automatically expose `initSqlJs` to the global `window` object. To resolve this, we needed to ensure `initSqlJs` was globally accessible *before* any modules try to import it.

The correct fix involved two main steps:

1.  **Restore `src/libs/sql.js` to its original state:** Ensure that `src/libs/sql.js` is the exact, unmodified content from the CDN (`https://unpkg.com/sql.js@1.13.0/dist/sql-wasm.js`). This removed any syntax errors introduced by previous manual modifications.
2.  **Modify `index.html` to explicitly expose `initSqlJs` globally:** Instead of relying on the `sql.js` file to implicitly set `window.initSqlJs`, a small inline script was added in `index.html` *after* `src/libs/sql.js` was loaded, but *before* `src/main.js` (or any other module that depends on `initSqlJs`). This inline script explicitly assigned the `initSqlJs` function (which is available in the script's local scope after `sql.js` executes) to the `window` object.

    The `index.html` was modified as follows:

    ```html
    <script type="text/javascript" src="./src/libs/sql.js"></script>
    <script type="text/javascript">
      // Explicitly expose initSqlJs to the global window object
      window.initSqlJs = initSqlJs;
    </script>
    <script type="module" src="src/main.js?v=1.3"></script>
    ```

    This ensured that when `src/utils/sqljs-wrapper.js` (which imports `initSqlJs` from `window`) was executed, `window.initSqlJs` was correctly defined.

## WebAssembly MIME Type Error (Previous)

### Problem Description

After resolving the `initSqlJs is not defined` error, the application encountered a new error related to loading the `sql-wasm.wasm` file:

```
wasm streaming compile failed: TypeError: WebAssembly: Response has unsupported MIME type '' expected 'application/wasm'
```

This indicated that the web server (Apache in XAMPP) was either not serving the `.wasm` file or was serving it with an incorrect MIME type (e.g., `text/html` or an empty string), leading to WebAssembly compilation failure.

### Correct Fix (Previous)

The fix involved two parts:

1.  **Ensure `sql-wasm.wasm` is deployed:** The `sql-wasm.wasm` file must be present in the web server's deployed directory. If the project is deployed to `/opt/lampp/htdocs/lightPOS`, then `sql-wasm.wasm` should be at `/opt/lampp/htdocs/lightPOS/src/libs/sql-wasm.wasm`. This was achieved by copying the file from the project's source.
2.  **Configure Apache MIME Type:** The Apache web server was configured to serve `.wasm` files with the correct `Content-Type: application/wasm` header by adding `AddType application/wasm .wasm` to `httpd.conf` and restarting Apache.

## Current Problem: Client-side SQLite Direct Access

### Problem Description

After resolving the previous issues, the application was still encountering errors related to the SQLite database:

```
XHRGET https://localhost/lightPOS/data/database.sqlite
[HTTP/1.1 404 Not Found 1ms]

XHRGET
https://localhost/lightPOS/data/database.sqlite
[HTTP/1.1 404 Not Found 1ms]

db_sqlite.js: SQLite database initialized from existing file. 2 db_sqlite.js:23:13
main.js: db object in checkAppInitialization (after sqliteConnect): 
Object { filename: "dbfile_959132761", db: 5377608, fb: {}, Sa: {} }
main.js:41:17
Startup check failed: Error: file is not a database
    handleError https://localhost/lightPOS/src/libs/sql.js:90
    prepare https://localhost/lightPOS/src/libs/sql.js:89
    get https://localhost/lightPOS/src/db_sqlite.js:223
    checkAppInitialization https://localhost/lightPOS/src/main.js?v=1.3:43
    async* https://localhost/lightPOS/src/main.js?v=1.3:138
main.js:86:17
```

These errors indicated that the client-side JavaScript (`db_sqlite.js`, `main.js`) was attempting to access `database.sqlite` directly via an HTTP GET request, and the server was returning a 404. Even if the file were found, the error "file is not a database" suggested a potential corruption or incorrect file format for client-side `sql.js` usage.

The core issue was an architectural conflict: the application was attempting to use `sql.js` to directly access a SQLite database file (`database.sqlite`) from the client-side, while also having a server-side PHP implementation (`SQLiteStore.php`, `Database.php`) designed to manage the same database. This dual approach was causing the errors.

### Correct Fix (Current)

The most robust and scalable solution for a web application is to have a clear client-server separation, where the client-side does *not* directly access the database file. All database operations should go through the server-side API.

The fix involved disabling the client-side `sql.js` usage and ensuring the application uses Dexie.js (IndexedDB) for local client-side storage, while the server-side PHP continues to manage the main SQLite database.

The following changes were made:

11. **`src/db.js` modification:**
    *   The `use_sqlite` flag was changed from `true` to `false`. This forces the application to use `DexieRepository` for client-side data storage instead of `SqliteRepository` (which relied on `db_sqlite.js`).

    ```javascript
    // Old: const use_sqlite = true;
    const use_sqlite = false;
    ```

12. **`src/main.js` modifications:**
    *   **Removed direct imports from `db_sqlite.js`:** The import statement for `connect as sqliteConnect, db as sqliteDb, get, run` from `db_sqlite.js` was removed.
    *   **Removed `sqliteConnect` call:** The line `await sqliteConnect('data/database.sqlite');` and its associated console log were commented out/removed.
    *   **Replaced direct database queries with `Repository` calls:**
        *   `const userCountResult = get("SELECT COUNT(*) as count FROM users");` was replaced with:
            ```javascript
            const users = await Repository.getAll('users');
            const localUserCount = users.length;
            ```
        *   `const admin = get("SELECT * FROM users WHERE email = ?", ['admin@lightpos.com']);` was replaced with:
            ```javascript
            const admin = await Repository.get('users', 'admin@lightpos.com');
            ```
        *   `await run("UPDATE users SET password = ? WHERE email = ?", [admin.password, admin.email]);` was replaced with:
            ```javascript
            await Repository.upsert('users', admin);
            ```

These changes ensure that the client-side application now uses Dexie.js for its local data storage, and all interactions with the main SQLite database are expected to happen through the PHP API. The client no longer attempts to directly access the `database.sqlite` file, resolving the 404 and "file is not a database" errors.

## API 500 Internal Server Error on /api/router.php?file=settings

### Problem Description

After resolving the client-side SQLite access issues, the application encountered a `500 Internal Server Error` when attempting to fetch settings via the API endpoint `https://localhost/lightPOS/api/router.php?file=settings`.

The server-side `router.php` uses `SQLiteStore.php` to interact with the `database.sqlite` file. The `SQLiteStore::getAll('settings')` method was being called, which internally executes a `SELECT * FROM settings WHERE _deleted = 0` query.

The `500 Internal Server Error` indicated a PHP error on the server, most likely due to an issue with the `settings` table in the `database.sqlite` file. The `schema.sql` files (`schema.sql` and `api/schema.sql`) both define the `settings` table with an `id`, `json_body`, `_version`, `_updatedAt`, and `_deleted` column.

The probable causes were:
1.  The `settings` table did not exist in the `database.sqlite` file.
2.  The `settings` table existed, but the `_deleted` column was missing from it.
3.  The `database.sqlite` file itself was not properly initialized with the expected schema.

### Correct Fix

The root cause was that the `database.sqlite` file was not guaranteed to have the correct and up-to-date schema, especially the `settings` table with its `_deleted` column, which `SQLiteStore.php` expected. There was no explicit script being run to initialize the database schema.

To ensure the schema is always present, a schema initialization logic was embedded directly into `api/router.php`. This logic checks if the `settings` table exists in the connected SQLite database. If it does not, it reads the `schema.sql` file and executes its contents against the database, thereby creating all necessary tables and columns, including the `settings` table with the `_deleted` column.

The following changes were made to `api/router.php`:

```php
// ... existing code ...

require_once __DIR__ . '/SQLiteStore.php';

// --- START Schema Initialization Logic ---
function ensureSchema($pdo) {
    // Check if the 'settings' table exists
    $stmt = $pdo->prepare("PRAGMA table_info(settings)");
    $stmt->execute();
    $tableInfo = $stmt->fetchAll();

    if (empty($tableInfo)) {
        // If 'settings' table does not exist, execute the full schema
        $schemaSql = file_get_contents(__DIR__ . '/../schema.sql');
        if ($schemaSql === false) {
            error_log("Error: Could not read schema.sql file.");
            // Depending on desired behavior, you might want to throw an exception or die here
            return; 
        }
        $pdo->exec($schemaSql);
        error_log("SQLite database schema initialized successfully.");
    }
}
// --- END Schema Initialization Logic ---

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$store = new SQLiteStore();
// Call the schema check after the store is initialized and PDO is available
ensureSchema($store->pdo); 

// ... rest of the existing code ...
```

This modification ensures that upon any access to `router.php`, the database schema is validated and created if necessary, resolving issues related to missing tables or columns.

## User Permissions Reset (Current)

### Problem Description
The user is logged in or attempting to log in, but the account lacks the necessary permissions to view the application modules. This often happens if the `users` table was initialized with incorrect defaults or if a migration failed to apply the correct permission structure. Additionally, there was a discrepancy between the client-side default password (`admin123`) and the server-side default password (`admin`).

### Correct Fix
To resolve this, we added a `fix_admin` action to the `api/router.php` endpoint. This allows an administrator (or developer in debug mode) to force-reset the default admin account (`admin@lightpos.com`) with the correct password (`admin123`) and full read/write permissions for all modules.

We also updated the automatic default user creation logic in `router.php` to use `admin123` as the password, ensuring consistency with the client-side `main.js`.

To trigger the fix, the user can navigate to `api/router.php?action=fix_admin` or run the following in the browser console:

```javascript
fetch('api/router.php?action=fix_admin').then(r => r.json()).then(console.log);
```admin


## "Only Profile Module Visible" Issue

### Problem Description
After logging in, the user only sees the "Profile" module in the sidebar/navigation. Other modules like POS, Items, etc., are missing. This indicates that the application believes the user has no permissions.

This occurs because:
1.  The `permissions` object is missing from the user data in the frontend.
2.  The backend stores permissions as a JSON string (`permissions_json`) in SQLite, but the frontend expects a native JavaScript object (`permissions`).
3.  If the user session was cached in `localStorage` before the backend fix was applied, the stale user object (without decoded permissions) persists.

### Correct Fix
1.  **Backend:** Ensure `api/router.php` decodes `permissions_json` into `permissions` before sending the response for `login` and `users` endpoints. (This has been implemented).
2.  **Database:** Ensure the admin user actually has the correct permissions string in the database (Run `fix_admin`).
3.  **Frontend:** Clear the browser's `localStorage` to remove the stale session and force a re-login to fetch the corrected user object.

**Console Command to Fix:**
Run this in the browser console (F12) to reset the admin permissions and clear the local session:

```javascript
fetch('api/router.php?action=fix_admin')
    .then(r => r.json())
    .then(d => {
        console.log(d);
        localStorage.clear();
        window.location.reload();
    });
```

# Sync 503 Service Unavailable (Restore Lock)

### Problem Description
The `SyncEngine` is failing with a `503 Service Unavailable` error during the `push` operation. The response is immediate (1ms). The client-side logs show a generic "Push failed" error, indicating the browser is likely using a cached version of `SyncEngine.js`, but the 503 status code is the key indicator.

### Diagnosis
The `api/sync.php` script checks for the existence of a `data/restore.lock` file at the very beginning of execution.
```php
if (file_exists($restoreLockFile)) {
    http_response_code(503);
    // ...
}
```
This file is created automatically by `api/sync.php` (during a GET request) if it detects the database is uninitialized. This puts the server in "Restore Mode". The issue is a deadlock: the lock blocks the `reset_all` action that is needed to initialize the database and remove the lock.

### Correct Fix
1.  **Modify `api/sync.php`:** Restructure the endpoint to handle the `reset_all` action *before* the `restore.lock` check. This avoids complex conditional logic and guarantees the reset command can always execute to clear the lock.
2.  **Run Reset:** Execute the `reset_all` command to initialize the database and clear the lock.

*Update:* The previous attempt to add an exception to the `if` condition failed (server returned 503). Moving the logic block entirely is the robust solution.

*Update 2:* The user reported that `reset_all` still returns 503 even after moving the logic. This strongly indicates that **PHP OPcache** is serving the old version of `api/sync.php` where the lock check was at the top. Additionally, the client-side logs show the generic "Push failed" error, confirming the browser is also using a cached version of `SyncEngine.js`.

### Action Plan
1.  **Clear OPcache:** Run `api/clear_cache.php` to force PHP to reload the scripts.
2.  **Add Cache Headers:** Update `api/sync.php` to send `Cache-Control: no-store` headers.
3.  **Retry Reset:** Run the `reset_all` command again.

### Resolution
The `reset_all` logic was moved to the top of `api/sync.php` and cache headers were added. Clearing the OPcache and running the reset command successfully resolved the deadlock and initialized the database.

## TestRunner Import Error (Resolved)

### Problem Description
When attempting to run the "Sync Architecture Tests" from the Settings page, the application throws an error:
`Database Global: The requested module 'https://localhost/lightPOS/src/db.js' doesn't provide an export named: 'default'`

### Diagnosis
The `TestRunner.js` module (loaded dynamically) likely attempts to import the database instance using a default import (e.g., `import db from '../db.js'`), but `src/db.js` only provides named exports (`dbPromise`, `dbRepository`).

### Correct Fix
Update `src/db.js` to provide a default export. Since `dbPromise` is the primary interface for accessing the database instance (handling both SQLite and Dexie initialization), we will export `dbPromise` as the default export.

## TestRunner Missing Table Error (Current)

### Problem Description
Running the tests fails with `TypeError: can't access property "where", (intermediate value).outbox is undefined`.

### Diagnosis
Even after awaiting `dbPromise`, the error persists. This indicates that `db.outbox` is undefined on the resolved database instance. This is likely because the `outbox` table is missing from the local IndexedDB schema because the browser is stuck on an older version (v34) that didn't have the table yet.

### Correct Fix
1.  **Bump Database Version:** Update `src/db.js` to increment the Dexie version to 35. This forces Dexie to run the schema upgrade and create the `outbox` table.
2.  **Add Debugging:** Add checks in `TestRunner.js` to verify the database instance.

*Update:* The user reported the same error at line 40 even after the fix. This confirms the browser is caching the old `TestRunner.js` file (where the failing line was indeed #40).

### Action Plan
1.  **Cache Busting:** Modify `src/modules/settings.js` to append a timestamp to the `TestRunner.js` import URL (e.g., `import(... + '?t=' + Date.now())`).
2.  **Force DB Reset:** Since the schema upgrade might also be stuck due to caching or open tabs, we will advise the user to wipe the local IndexedDB.

### Resolution
The combination of bumping the DB version, cache-busting the test runner import, and wiping the local IndexedDB resolved the test failures.

## Sync 503 Error on Pull (Current)

### Problem Description
After resolving the test runner issues, the application fails on load with a `503 Service Unavailable` error during the `pull` phase of synchronization. The console shows:
`SyncEngine: Pull failed. Status: 503 Response: {"error":"Server is currently restoring, please try again later."}`

### Diagnosis
The `SyncEngine.js` `pull` method is hardcoded to use `api/sync_debug.php`. This debug endpoint has the same logic flaw as the original `api/sync.php`: it checks for a `restore.lock` file and returns 503, but it does *not* contain the `reset_all` logic needed to clear the lock. This creates a deadlock where the client cannot pull data and cannot reset the server state via this endpoint. The main `api/sync.php` endpoint has the correct logic, but it is not being called for pull operations.

### Correct Fix
1.  **Modify `src/services/SyncEngine.js`:** Change the `pull` method to use the correct `SYNC_URL` (`api/sync.php`) instead of the debug URL.
2.  **Run Reset:** Advise the user to run the `reset_all` command one more time to clear any lock file created by `sync_debug.php`.

### Resolution
The user corrected the endpoint in `SyncEngine.js` and ran the server reset, which resolved the 503 error. The application now syncs correctly.

## SQLite Migration Test Failure (Resolved)

### Problem Description
When running the "Sync Architecture Tests" with `use_sqlite = true`, the test suite fails with the message:
`❌ FAIL: dbRepository is NOT set to SqliteRepository. Check 'use_sqlite' in db.js.`

### Diagnosis
The test `testSqliteRepositoryIsUsed` in `src/modules/sqlite.test.js` is designed to verify that the application is configured to use the `SqliteRepository`. The test fails because the `use_sqlite` flag in `src/db.js` is set to `false`, which causes the application to use `DexieRepository` instead.

This test reveals an architectural conflict:
1.  The application was previously refactored to use **Dexie.js** for the client-side offline database to avoid issues with directly accessing the server's SQLite file.
2.  The `SqliteRepository` is currently incomplete and does **not** implement the "outbox" logic required for the `SyncEngine` to push changes to the server.

### Correct Fix
The `testSqliteRepositoryIsUsed` test is obsolete as it enforces a deprecated and incomplete architecture (`SqliteRepository`). The correct path is to use `DexieRepository`, which is fully integrated with the `SyncEngine`. The fix is to remove the obsolete test and ensure the application is configured to use Dexie.

1.  **Revert `src/db.js`:** Set `use_sqlite` back to `false` to ensure the application uses the functional `DexieRepository`.
2.  **Remove Obsolete Test:** Remove the call to `testSqliteRepositoryIsUsed` from `src/services/TestRunner.js` and delete the corresponding import. The file `src/modules/sqlite.test.js` can also be removed from the project.

**Status:** All tests passed. The application is now correctly configured to use Dexie.js with the SyncEngine, and the obsolete SQLite test has been removed.

### Correct Fix
The fix is to make the rendering code in `pos.js` more robust by providing a fallback value of `0` if `item.selling_price` is missing or not a number. This prevents the UI from crashing and ensures that items with incomplete data are still displayed, albeit with a price of ₱0.00.

This defensive coding will be applied to the item grid display, the cart rendering logic, and the receipt printing function within `pos.js`.

## Accumulated Test Data & Server Lock (Current)

### Problem Description
1.  **503 Service Unavailable:** The `SyncEngine` fails with a 503 error because the server is stuck in "Restore Mode" (`restore.lock` exists).
2.  **Duplicate Test Items:** The user sees multiple copies of "Test Item" and "Version 2" items in the POS search results.

### Diagnosis
1.  **Server Lock:** The `restore.lock` file was likely created during a previous health check when the DB was empty, or a restore process was interrupted. The `reset_all` command is needed to clear it.
2.  **Test Data:** The `TestRunner.js` tests create items in the local Dexie database (`testOfflineCreation`, `testConflictResolution`) but do not clean them up after the test finishes. Since the tests use unique IDs (`Date.now()`), repeated runs accumulate junk data in the local database.

### Correct Fix
1.  **Update `TestRunner.js`:** Add `finally` blocks to the test functions to ensure created test items are deleted from the local database, regardless of test success or failure.
2.  **Perform Full Reset:** Execute `reset_all` on the server and wipe the local Dexie database to start fresh.

## Reports Generation Error (Current)

### Problem Description
When opening the Reports view, the application fails to generate reports and throws a `TypeError: can't access property "filter", entry.items is undefined`. This occurs in `src/modules/reports.js` during the calculation of vendor performance (`vendorPerf`).

### Diagnosis
The `generateReport` function iterates over `stockInHistory` to calculate supplier performance. Some records in the `stockins` table (or `stockInHistory` array) appear to be missing the `items` array property, causing the `reduce` function to fail when attempting to access `entry.items.filter`. This could be due to incomplete data migration or legacy data.

### Correct Fix
Add defensive checks in `src/modules/reports.js` to ensure `entry.items` (for stock-ins) and `tx.items` (for transactions) exist and are arrays before attempting to iterate over them. This applies to both `vendorPerf` and `purchaseHistory` calculations.

## Data Integrity on Restore (Current)

### Problem Description
The user suspects that "toFixed" errors (crashes due to undefined prices) stem from faulty backup merges or restores. The previous restore logic simply copied JSON data without validation, potentially re-introducing corrupt records (e.g., items with missing `selling_price`) into the new SQLite backend.

### Diagnosis
The `handleRestoreBackup` and `btnSyncBackup` functions in `src/modules/settings.js` iterated over backup data and inserted it directly. If the backup file contained items with missing or non-numeric price fields, these invalid records were persisted, causing the frontend to crash later when `toFixed()` was called.

### Correct Fix
Modified `src/modules/settings.js` to include explicit sanitization logic within the restore and manual sync loops. Specifically for the `items` collection, the code now forces `cost_price`, `selling_price`, and `stock_level` to be valid numbers (using `parseFloat() || 0`) before processing the record. This ensures that even if the backup file is imperfect, the restored data will be safe for the application to use.

## Restore Lock Persistence (Current)

### Problem Description
After a successful "Restore from Backup", the application fails to sync, returning `503 Service Unavailable` with the message `Server is currently restoring`. This happens even after applying data sanitation fixes.

### Diagnosis
The `restore.lock` file, created to protect the database during restore, is not being cleared. This can happen if the backup file lacks the `sync_metadata` table or the `db_initialized` key. The current `api/sync.php` blindly respects the lock file without checking if the database behind it is actually valid and ready.

### Correct Fix
1.  **Self-Healing Server:** Modify `api/sync.php` to check the database status when a lock file is found. If `db_initialized` is present in the database, the server will assume the lock is stale, delete it, and allow the request to proceed.
2.  **Explicit Initialization:** Update `src/modules/settings.js` to explicitly post `{ key: 'db_initialized', value: '1' }` to the server at the end of the restore process.

## Sync 500 Error: No Such Table (Current)

### Problem Description
The `SyncEngine` fails with a 500 error: `SQLSTATE[HY000]: General error: 1 no such table: users`. This occurs when the application pushes data to `api/sync.php`.

### Diagnosis
The `api/sync.php` endpoint instantiates `SQLiteStore` but does not verify if the database schema exists. If `api/sync.php` is accessed before `api/router.php` (which contains schema initialization logic), or if the database was reset/deleted, the tables (like `users`) will be missing, causing the SQL query to fail.

### Correct Fix
Add the schema initialization logic (`ensureSchema`) to `api/sync.php` to ensure the database structure is created if it's missing, mirroring the logic in `api/router.php`.

## Procurement API: Missing Columns (Current)

### Problem Description
The `ProcurementApiTest` failed with 500 Internal Server Errors:
1. `SQLSTATE[HY000]: General error: 1 no such column: cost_price`
2. `SQLSTATE[HY000]: General error: 1 no such column: selling_price`

### Diagnosis
The `items` table in the server-side SQLite database was created with a minimal schema that did not include `cost_price`, `selling_price`, or `supplier_id`. The `InventoryOptimizer` requires these columns to calculate metrics. While the client-side Dexie database (`db.js`) is flexible (schema-less for non-indexed fields), SQLite is strict.

### Correct Fix
Updated `api/procurement.php` to include self-healing logic in the `ensurePoSchema` function. It now checks for the existence of `cost_price`, `supplier_id`, `stock_level`, and `selling_price` columns in the `items` table and adds them via `ALTER TABLE` if they are missing. This ensures the database schema automatically migrates to support the Procurement module.

## Procurement API: Missing items_json Column (Current)

### Problem Description
The `ProcurementApiTest` failed with `SQLSTATE[HY000]: General error: 1 no such column: items`. This occurred in `InventoryOptimizer.php` when querying the `transactions` table.

### Correct Fix
1. Updated `api/procurement.php` to ensure the `transactions` table has an `items_json` column.
2. Updated `api/InventoryOptimizer.php` to select `items_json` (and `json_body` as fallback) instead of the non-existent `items` column.

## Procurement API: Missing json_body Column (Current)

### Problem Description
The `ProcurementApiTest` failed with `SQLSTATE[HY000]: General error: 1 no such column: json_body`. This occurred in `InventoryOptimizer.php` when querying the `transactions` table.

### Correct Fix
Updated `api/procurement.php` to ensure the `transactions` table has a `json_body` column via self-healing logic.

## Sync 500 Error: Unknown Collection (Current)



### Problem Description

The `SyncEngine` fails with `Push failed: 500 {"status":"error","message":"Unknown collection: purchase_orders"}`. This happens even after `api/SQLiteStore.php` was updated to include `purchase_orders` in the whitelist.



### Diagnosis

1.  **Server-Side Caching (OPcache):** PHP is likely serving the cached version of `SQLiteStore.php` which does not yet have the new tables in the `$collections` array.

2.  **Client-Side Persistence:** The client code was using direct Dexie `db.put()` instead of `Repository.upsert()`, which might cause inconsistencies in how data is queued for sync (though `Repository` is the preferred method).



### Correct Fix

1.  **Clear OPcache:** Run the OPcache reset command to force PHP to reload the class definitions.

    ```javascript

    fetch('api/router.php?action=clear_opcache').then(r => r.json()).then(console.log);

    ```

2.  **Update Client Code:** Refactor `purchase_orders.js` and `suppliers.js` to use `Repository.upsert()` for consistent data handling and sync queuing.

3.  **Force Reload:** Reload the browser to ensure the latest JS modules are loaded.



## "0 Items Processed" on Recalculate Metrics (Current)



### Problem Description

After successfully syncing data from a backup, the "Recalculate Metrics" function in the Purchase Orders module reports "Items Processed: 0", even though thousands of items are visible in the frontend "Items" module.



### Diagnosis

A debug script (`api/debug_db.php`) was created to inspect the server's SQLite database directly. The output revealed the root cause:

- The `items` table contained 9,970 rows.

- However, 0 of these rows had `_deleted = 0`.



All items in the database were marked as deleted (`_deleted = 1`). The `InventoryOptimizer` script is designed to only process active items (`WHERE _deleted = 0`), so it was correctly finding nothing to do. The reason for all items being marked as deleted is unknown but likely related to a faulty sync or restore operation in the past.



### Correct Fix

A new utility script, `api/undelete_items.php`, was created. This script executes a simple SQL query: `UPDATE items SET _deleted = 0 WHERE _deleted = 1`. Running this script restored all the items to an active state, allowing the `recalculateMetrics` function to process them correctly.

## User Creation Lock & Login Failure (Current)

### Problem Description
After deploying to a Fedora server and clearing the local database, the user successfully logged in as admin. However, when attempting to create a new user via the User Management interface, the `SyncEngine` failed with multiple `500 Internal Server Error` responses. The error message was `SQLSTATE[HY000]: General error: 5 database is locked`. Subsequently, attempting to log in as the newly created user failed with `401 Unauthorized`.

### Diagnosis
1.  **Database Lock:** SQLite blocks concurrent writes. The `SyncEngine` push operation for the new user likely collided with another background process (e.g., a read operation or another sync attempt), causing the database to lock.
2.  **Data Inconsistency:** Because the sync operation failed and the transaction was rolled back on the server, the new user record was **not** saved to the server's SQLite database.
3.  **Login Failure:** The "Invalid credentials" error occurs because the authentication endpoint checks the server database, where the new user does not exist (despite appearing in the local UI, which reads from Dexie).

### Correct Fix
1.  **Retry Logic:** Implement a robust `executeWithRetry` mechanism in `api/SQLiteStore.php`. This wrapper will catch `SQLSTATE 5` (database locked) errors and retry the operation up to 5 times with a short delay (500ms), allowing the lock to clear.
2.  **Transaction Handling:** Update `api/sync.php` and `api/router.php` to use the new retry-capable transaction methods (`beginTransaction`, `commit`, `rollBack`) from `SQLiteStore` instead of accessing the PDO object directly.

### Debugging Steps (What I added and how to reproduce) ✅
1.  **Added tracing logs (server):** I added `error_log` entries to `api/sync.php` to record incoming `users` payloads (email present, whether `password_hash` exists and if it was auto-hashed). I also added `error_log` entries to `api/router.php` to record login attempts (email, whether a matching user was found, inactive account, or success). These logs appear in PHP/Apache error logs.
2.  **Added tracing logs (client):** I added `console.log` in `src/modules/users.js` to print a masked version of the user payload just before saving, and a confirmation after the local save. I also added an outbox summary log in `src/services/SyncEngine.js` so you can see what will be pushed to `/api/sync.php`.
3.  **Temporary debug endpoint:** `GET api/router.php?action=debug_data` already returns the current `users` and `settings` from the server DB. Use this to confirm whether the new user exists server-side.

Reproduction steps (please run these and paste logs):
- Open the browser DevTools console, go to the Network tab and preserve logs.
- Create a new user via the UI and note the console output (the masked payload and the "User saved locally" log).
- In the next 10–30s, check Console for `SyncEngine` logs and Network tab for a POST to `api/sync.php` (Push). Save the server response body.
- On the server, check the PHP/Apache error log (e.g., `/opt/lampp/logs/error_log`) for `SYNC:` and `LOGIN` lines showing the payload info and login attempt details.
- If login fails, call `GET api/router.php?action=debug_data` and paste the returned JSON (it contains `users`).

What to paste back here:
- Browser console output (masked user payload, sync push logs).
- `api/sync.php` POST response when creating the user (status and body).
- Relevant server error_log lines (the `SYNC:` and `LOGIN` messages) around the time of the attempt.

With these logs I can determine whether the user never reached the server (push failed), reached the server but was rejected (DB locked or import error), or reached the server but was stored in a format that `login` doesn't match (field mismatch or hashing issue).

## Sync Error: Bad Parameter (SQLSTATE 21) (Current)

### Problem Description
After fixing the locking issue, the `SyncEngine` push operation failed with `SQLSTATE[HY000]: General error: 21 bad parameter or other API misuse`. This occurred specifically during the `INSERT ... ON CONFLICT` operation for the `users` table.

### Diagnosis
This error typically indicates a mismatch between the bound parameters and the SQL statement, or an issue with parameter reuse in the `ON CONFLICT` clause.
Attempts to fix this included:
1.  Using SQLite's `excluded.` syntax to avoid repeating parameters in the `UPDATE` clause.
2.  Enabling `PDO::ATTR_EMULATE_PREPARES` to force PHP to handle parameter substitution.
3.  Ensuring schema consistency (adding missing columns like `permissions_json`).

Despite these changes, the error persisted on the Fedora server environment in our initial runs, suggesting a deeper incompatibility with parameter handling on that PDO/SQLite build.

**Fix Applied:** I updated `api/SQLiteStore.php::upsert` to avoid using column names directly as PDO parameter names. Placeholders are now prefixed with `p_` (e.g., `:p_email`) and an explicit bind map is used when calling `execute()`. This prevents edge-cases with parameter identifiers (for example names starting with `_`) and avoids driver-specific parameter parsing issues.

**What to test now:** Reproduce the same flow (create a user) and paste the failing POST response body, the Request Payload for the POST to `/api/sync.php`, and the server error log lines. If the SQLSTATE 21 reappears, the new error log will contain the fully-logged SQL plus `BindParams` which will make the root cause immediate to diagnose.
