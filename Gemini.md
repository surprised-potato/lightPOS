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


We are fixing our application this is a collaborative effort. you cant run commands on the terminal just ask me i will do it for you and send you back the results.

We are in debugging mode add console logs to get new information as we go.

Modify this document to record our progress

## Deployment Inquiry: New Server Requirements

### Problem Description
The user asked if additional installations are required to deploy the current SQLite-based version to a new server running XAMPP, noting that previous versions did not use SQLite.

### Diagnosis
XAMPP typically includes SQLite binaries, so no external *installation* is usually required. However, *configuration* is necessary because the default XAMPP installation might not have the SQLite PDO extension enabled, or the specific Apache configurations for WebAssembly.

### Resolution / Instructions provided
1.  **Enable `pdo_sqlite`:** In `php.ini`, ensure `extension=pdo_sqlite` is uncommented.
2.  **Configure MIME Types:** In `httpd.conf`, ensure `AddType application/wasm .wasm` is present (to prevent MIME type errors if WASM is loaded).
3.  **Permissions:** Ensure the `data` directory is writable (`chmod 777` or `chown daemon:daemon`) so the PHP script can create `database.sqlite`.

*Update:* These steps have been automated in `deploy_to_xampp.sh`.

## Deployment Inquiry: Cleanup Requirements

### Problem Description
User asked if they should delete the previous server instance and clear client-side IndexedDB when deploying the new SQLite version over an older non-SQLite version.

### Diagnosis
1.  **Server-side:** The `deploy_to_xampp.sh` script uses `rsync --delete`, which automatically removes files on the server that are not present in the source. This effectively performs a "clean" deployment of the code. However, old data files (JSON) will be deleted if not backed up.
2.  **Client-side:** The database architecture has shifted from JSON/LocalStorage to SQLite/IndexedDB (Dexie). The schema is likely incompatible. Retaining old IndexedDB data will cause application errors.

### Resolution / Instructions provided
1.  **Client:** **Yes**, clearing IndexedDB is mandatory to prevent schema conflicts.
2.  **Server:** Manual deletion is not strictly necessary because the script cleans up, but **backing up old data** is recommended before running the script if preservation is required.

## Deployment Inquiry: 503 Restore Loop

### Problem Description
After a fresh deployment, the user encountered persistent `503 Service Unavailable` errors with the message "Server is currently restoring". This occurs because the `SyncEngine` polls the server immediately; if the DB is uninitialized, the server creates a `restore.lock` file, but the concurrent requests prevent the initialization logic from completing or clearing the lock.

### Diagnosis
Race condition between `SyncEngine` (client) and `ensureSchema` (server). The server enters "Restore Mode" (lock file created) but gets stuck there.

### Resolution
1.  **Immediate:** User ran `fetch('api/router.php?action=reset_all', { method: 'POST' })` to clear the lock.
2.  **Prevention:** Updated `deploy_to_xampp.sh` to pre-initialize the SQLite database using `sqlite3` and `schema.sql` before the web server serves requests. This bypasses the need for the server to create a lock file on first run.

## Post-Restore Critical Failure: Login & Database Lock

### Problem Description
1.  **Login Failure:** After performing a "Merge Backup and Sync", the user could not log in. This is likely because the restored data overwrote the `users` table with old credentials or incompatible password hashes.
2.  **Database Locked:** Attempting to create a new user (likely via the setup wizard or console) resulted in `SQLSTATE[HY000]: General error: 5 database is locked`. This indicates a SQLite-level lock, distinct from the application's `restore.lock`.

### Diagnosis
*   **Lock:** The restore process likely timed out or crashed, leaving a PHP process hanging with an open transaction on the SQLite database. This prevents any new writes (like creating a user).
*   **Login:** The backup contained user data that is either unknown or incompatible with the current authentication logic.

### Resolution
1.  **Clear Lock:** Restart the XAMPP server to kill stuck processes releasing the file lock.
    *   Command: `sudo /opt/lampp/lampp restart`
2.  **Reset Admin:** Use the `fix_admin` endpoint to force-reset the `admin@lightpos.com` account to a known state (`admin123`).
    *   Console Command: `fetch('api/router.php?action=fix_admin').then(r => r.json()).then(console.log);`

## Data Migration: Password Field Mismatch

### Problem Description
The user reported issues logging in after restoring data from a backup. The legacy JSON data likely uses the field `password`, whereas the new SQLite schema expects `password_hash`. This mismatch causes the password to be dropped or the insert to fail during sync/restore.

### Diagnosis
Schema mismatch between legacy JSON backups (`password`) and SQLite schema (`password_hash`).

### Resolution
Updated `src/modules/settings.js` in both `handleRestoreBackup` (Full Restore) and `btnSyncBackup` (Manual Sync) to explicitly check for `users` collection items. If `password` exists but `password_hash` is missing, the value is mapped to `password_hash` and the old `password` field is removed to prevent "no such column" errors.

## Data Migration: Plain Text Passwords

### Problem Description
After restoring legacy data, users could not log in. While `settings.js` correctly renamed `password` to `password_hash`, it sent the plain-text password to the server. The server expects an MD5 hash, so the login comparison (`md5(input) === stored_value`) failed.

### Diagnosis
Legacy backups contain plain-text passwords. The new system stores MD5 hashes.

### Resolution
1.  **Server-Side Hashing:** Updated `api/router.php` to inspect incoming `users` records. If `password_hash` is not a valid 32-character hex string (MD5 format), it assumes the value is plain text and hashes it before saving to SQLite.
2.  **Deployment Fix:** Updated `deploy_to_xampp.sh` to insert the `db_initialized` key into `sync_metadata` immediately after creating the database. This prevents `sync.php` from falsely detecting an uninitialized DB and throwing 503 errors on fresh installs.

## Restore Stability: 500 Internal Server Error

### Problem Description
User reported a 500 error after performing a "Merge Backup and Sync". This is likely due to SQLite locking issues (`database is locked`) or timeouts when processing large datasets record-by-record without a transaction.

### Diagnosis
Inserting records one by one in a loop is slow and can cause contention/locking issues in SQLite, especially if `SyncEngine` is also polling.

### Resolution
1.  **Transactions:** Updated `api/router.php` to wrap the import loop in a database transaction (`beginTransaction` / `commit`). This significantly improves performance and prevents locking issues during the restore process.
2.  **Error Handling:** Added `try-catch` blocks to catch exceptions during import and return a meaningful JSON error message instead of a generic 500.
3.  **Advisory:** For setting up a new server, users should use the **"Restore from Backup"** button (which uses the optimized `router.php`) rather than "Merge & Sync" (which relies on the client-side `SyncEngine` and `api/sync.php`).

## Deployment Stability: Database Locks & Password Hashing

### Problem Description
1.  **Database Locked:** User encountered `SQLSTATE[HY000]: General error: 5 database is locked` during sync/user creation.
2.  **Login Issues:** Other users (non-admin) could not log in after deployment, and changing passwords failed.

### Diagnosis
1.  **Locking:** SQLite defaults to a very short timeout. Concurrent requests (Sync + User Action) caused immediate failure.
2.  **Passwords:** Legacy data imported via `sync.php` (Push) or existing in the DB contained plain-text passwords, but the login logic expects MD5 hashes.

### Resolution
1.  **Busy Timeout:** Added `$store->pdo->exec("PRAGMA busy_timeout = 5000;");` to `api/sync.php` and `api/router.php`. This makes SQLite wait up to 5 seconds for a lock to clear before failing.
2.  **Sync Hashing:** Updated `api/sync.php` to automatically detect and hash plain-text passwords in the `users` collection during a PUSH operation.
3.  **Repair Utility:** Added `repair_users` action to `api/router.php` to batch-fix existing users in the database.