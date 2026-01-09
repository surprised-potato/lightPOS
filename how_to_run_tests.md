# How to Run Tests

To run the tests, follow these steps:

1.  **Open the LightPOS Application**: Make sure your LightPOS application is running in your web browser (e.g., `http://localhost/lightPOS`).
2.  **Navigate to Settings**: In the application, go to the "Settings" page.
3.  **Go to the Advanced Tab**: Within the Settings page, click on the "Advanced" tab.
4.  **Run Tests**: Locate and click the button labeled "Run Sync Architecture Tests".

## What the Tests Do

The "Sync Architecture Tests" execute a suite of unit and integration tests to verify the core synchronization and database functionality of the application. Specifically, they cover:

*   **Offline Creation (`testOfflineCreation`)**: This test simulates creating a new item while potentially offline. It verifies that the item is correctly stored in an "outbox" for later synchronization and that this outbox entry is cleared once the item is successfully synced to the server.
*   **Conflict Resolution (`testConflictResolution`)**: This test checks the "Last-Write-Wins" (LWW) strategy for resolving data conflicts. It simulates a scenario where a record is updated in two different places, and ensures that the version with the higher version number (or later timestamp) is the one that prevails.
*   **Tab Concurrency (`testTabConcurrency`)**: This test uses the Web Locks API to ensure that only one browser tab can perform synchronization operations at a time. This prevents data corruption or race conditions when multiple instances of the application are open. (Note: This test might be skipped if your browser environment does not support Web Locks, typically requiring HTTPS).
*   **SQLite Repository Usage (`testSqliteRepositoryIsUsed`)**: This test, which was recently added, verifies that the application's database repository (`dbRepository`) is correctly configured to use the `SqliteRepository`. This is crucial for confirming that the migration to SQLite was successful and that the application is interacting with the SQLite database as intended.

## What Should It Log?

The test results are logged to your browser's developer console. To view the logs:

1.  **Open Developer Tools**: Press `F12` (or `Ctrl+Shift+I` / `Cmd+Option+I` on macOS) in your browser to open the developer tools.
2.  **Go to the Console Tab**: Click on the "Console" tab.

You should see output similar to this:

*   **Overall Test Suite**:
    *   `POS Sync Architecture - Test Suite` (Group start)
    *   `Scenario: Offline Creation...`
    *   `✓ Item correctly queued in outbox`
    *   `✓ Outbox cleared after successful sync`
    *   `Scenario: Conflict Resolution (LWW)...`
    *   `✓ Higher version (v2) successfully overwrote local v1`
    *   `Scenario: Tab Concurrency (Web Locks)...`
    *   `✓ Lock prevents concurrent access as expected` (or a warning if Web Locks are not available)
    *   `Unit Test: SQLite Migration - dbRepository uses SqliteRepository` (Group start)
    *   `✅ PASS: dbRepository is correctly set to SqliteRepository.` (If SQLite is correctly configured)
    *   `❌ FAIL: dbRepository is NOT set to SqliteRepository. Check 'use_sqlite' in db.js.` (If SQLite is NOT correctly configured)
    *   `All tests passed!` (in green, if all tests succeed)
    *   `Test failed: [Error details]` (in red, if any test fails)
    *   `POS Sync Architecture - Test Suite` (Group end)

The most important log for your current task is the one related to `testSqliteRepositoryIsUsed`. If it shows `✅ PASS`, it indicates that your application is successfully using the SQLite repository. If it shows `❌ FAIL`, you might need to check the `use_sqlite` constant in `src/db.js` to ensure it's set to `true` and that the SQLite setup is correct.
