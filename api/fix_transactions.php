<?php
header("Content-Type: text/plain");
require_once __DIR__ . '/SQLiteStore.php';

echo "Attempting to fix 'is_voided' column in transactions...\n";
echo "=========================================================\n\n";

try {
    $store = new SQLiteStore();
    $pdo = $store->pdo;

    echo "Executing UPDATE query on 'transactions' table...\n";

    // This query finds any transaction that is not explicitly voided (is_voided = 1)
    // and sets its status to 0. This corrects empty strings, NULLs, and other non-standard values.
    $stmt = $pdo->prepare("UPDATE transactions SET is_voided = 0 WHERE is_voided IS NOT 1");
    $stmt->execute();
    
    $count = $stmt->rowCount();

    echo "Query executed successfully.\n";
    echo "Number of transactions fixed: " . $count . "\n\n";

    if ($count > 0) {
        echo "[SUCCESS] The transactions table has been corrected. Please try the 'Recalculate Metrics' function again.\n";
    } else {
        echo "[INFO] No transactions needed to be fixed.\n";
    }

} catch (Exception $e) {
    echo "\n❌ An error occurred: " . $e->getMessage() . "\n";
}

