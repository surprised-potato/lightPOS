<?php
header("Content-Type: text/plain");
require_once __DIR__ . '/SQLiteStore.php';

echo "Attempting to undelete all items...\n";
echo "====================================\n\n";

try {
    $store = new SQLiteStore();
    $pdo = $store->pdo;

    echo "Executing UPDATE query on 'items' table...\n";

    $stmt = $pdo->prepare("UPDATE items SET _deleted = 0 WHERE _deleted != 0");
    $stmt->execute();
    
    $count = $stmt->rowCount();

    echo "Query executed successfully.\n";
    echo "Number of items undeleted: " . $count . "\n\n";

    if ($count > 0) {
        echo "[SUCCESS] All items have been restored. Please try the 'Recalculate Metrics' function again.\n";
    } else {
        echo "[INFO] No items needed to be undeleted.\n";
    }

} catch (Exception $e) {
    echo "\n❌ An error occurred: " . $e->getMessage() . "\n";
}

