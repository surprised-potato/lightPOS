<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/JsonStore.php';
require_once __DIR__ . '/SQLiteStore.php';

$dbFile = __DIR__ . '/../data/database.sqlite';
$schemaFile = __DIR__ . '/schema.sql';

if (file_exists($dbFile)) {
    die("Database file already exists. Please remove it before running the migration.\n");
}

try {
    // 1. Create database and execute schema
    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $schema = file_get_contents($schemaFile);
    $pdo->exec($schema);
    echo "Database created and schema applied.\n";

    // 2. Initialize stores
    $jsonStore = new JsonStore();
    $sqliteStore = new SQLiteStore();

    $collections = [
        'items', 'transactions', 'users', 'customers', 'suppliers',
        'shifts', 'expenses', 'returns', 'stock_movements',
        'adjustments', 'stockins', 'suspended_transactions', 'sync_metadata',
        'stock_logs', 'settings', 'notifications'
    ];

    $totalRecordsRead = 0;
    $totalRecordsInserted = 0;

    // 3. Migrate data
    $sqliteStore->pdo->beginTransaction();

    foreach ($collections as $collection) {
        echo "Migrating $collection...\n";
        $data = $jsonStore->read($collection);
        $recordCount = count($data);
        $totalRecordsRead += $recordCount;

        foreach ($data as $record) {
            $sqliteStore->upsert($collection, $record);
            $totalRecordsInserted++;
        }
        echo "  $recordCount records migrated.\n";
    }

    $sqliteStore->pdo->commit();

    echo "\nMigration complete!\n";
    echo "Total records read: $totalRecordsRead\n";
    echo "Total records inserted: $totalRecordsInserted\n";

} catch (Exception $e) {
    if (isset($sqliteStore) && $sqliteStore->pdo->inTransaction()) {
        $sqliteStore->pdo->rollBack();
    }
    die("Migration failed: " . $e->getMessage() . "\n");
}
