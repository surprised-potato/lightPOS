<?php
header("Content-Type: text/plain");
require_once __DIR__ . '/SQLiteStore.php';

echo "Database Debug Inspector\n";
echo "========================\n\n";

try {
    $store = new SQLiteStore();
    $pdo = $store->pdo;

    echo "[1] Checking 'items' table...\n";

    // Count total items
    $totalStmt = $pdo->query("SELECT COUNT(*) FROM items");
    $totalItems = $totalStmt->fetchColumn();
    echo "  - Total rows in 'items' table: " . $totalItems . "\n";

    // Count non-deleted items
    $activeStmt = $pdo->query("SELECT COUNT(*) FROM items WHERE _deleted = 0");
    $activeItems = $activeStmt->fetchColumn();
    echo "  - Rows where _deleted = 0: " . $activeItems . "\n";

    if ($totalItems == 0) {
        echo "\n[CONCLUSION] The 'items' table is empty. This is why the recalculation processes 0 items.\n";
        exit;
    }
    if ($activeItems == 0) {
        echo "\n[CONCLUSION] All items in the database are marked as deleted. The recalculation process only looks at active items.\n";
        exit;
    }

    echo "\n[2] Checking 'items' table schema...\n";
    $schemaStmt = $pdo->query("PRAGMA table_info(items)");
    $columns = $schemaStmt->fetchAll(PDO::FETCH_ASSOC);
    
    $columnNames = array_map(fn($c) => $c['name'], $columns);
    echo "  - Columns found: " . implode(', ', $columnNames) . "\n";

    $requiredCols = ['id', 'cost_price', 'supplier_id', 'selling_price', '_deleted'];
    $missingCols = [];
    foreach ($requiredCols as $req) {
        if (!in_array($req, $columnNames)) {
            $missingCols[] = $req;
        }
    }

    if (!empty($missingCols)) {
        echo "\n[CONCLUSION] The 'items' table is missing required columns: " . implode(', ', $missingCols) . ". The query in InventoryOptimizer.php is failing because of this.\n";
        exit;
    } else {
        echo "  - All required columns for the optimizer query are present.\n";
    }

    echo "\n[3] Fetching a sample of active items...\n";
    $sampleStmt = $pdo->query("SELECT id, name, cost_price, supplier_id, selling_price, _deleted FROM items WHERE _deleted = 0 LIMIT 5");
    $sampleItems = $sampleStmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($sampleItems)) {
        echo "  - Could not fetch any sample items, even though count is > 0. This is very unusual.\n";
    } else {
        echo "  - Found " . count($sampleItems) . " sample items:\n";
        print_r($sampleItems);
    }

    echo "\n[4] Simulating the exact query from InventoryOptimizer.php...\n";
    $optimizerQuery = "SELECT id, cost_price, supplier_id, selling_price FROM items WHERE _deleted = 0";
    $optimizerStmt = $pdo->prepare($optimizerQuery);
    $optimizerStmt->execute();
    $optimizerItems = $optimizerStmt->fetchAll(PDO::FETCH_ASSOC);
    echo "  - The query executed successfully.\n";
    echo "  - Number of items fetched by the optimizer query: " . count($optimizerItems) . "\n";

    echo "\n[5] Checking 'transactions' table for sales history...\n";
    $totalTxStmt = $pdo->query("SELECT COUNT(*) FROM transactions");
    $totalTx = $totalTxStmt->fetchColumn();
    echo "  - Total rows in 'transactions' table: " . $totalTx . "\n";

    if ($totalTx > 0) {
        $lookbackDate = date('Y-m-d', strtotime('-180 days'));
        $recentTxStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE timestamp >= ?");
        $recentTxStmt->execute([$lookbackDate . 'T00:00:00']);
        $recentTx = $recentTxStmt->fetchColumn();
        echo "  - Transactions in the last 180 days: " . $recentTx . "\n";

        $activeTxStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE timestamp >= ? AND _deleted = 0 AND (is_voided = 0 OR is_voided IS NULL)");
        $activeTxStmt->execute([$lookbackDate . 'T00:00:00']);
        $activeTx = $activeTxStmt->fetchColumn();
        echo "  - ACTIVE transactions in the last 180 days: " . $activeTx . "\n";

        $sampleTxStmt = $pdo->query("SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 1");
        $sampleTx = $sampleTxStmt->fetch(PDO::FETCH_ASSOC);
        echo "  - Sample of the most recent transaction:\n";
        print_r($sampleTx);

        if ($recentTx == 0) {
            echo "\n[CONCLUSION] There are transactions in the database, but none are recent enough (last 180 days) for the velocity calculation.\n";
        } elseif ($activeTx == 0) {
            echo "\n[CONCLUSION] There are recent transactions, but ALL of them are marked as either 'deleted' or 'voided'. The calculation only uses active transactions.\n";
        } elseif (empty($sampleTx['items_json']) && empty($sampleTx['json_body'])) {
            echo "\n[CONCLUSION] Transactions exist, but they seem to be in an old format and are missing the 'items_json' or 'json_body' field, which contains the item details needed for the calculation.\n";
        }
    } else {
        echo "\n[CONCLUSION] The 'transactions' table is empty. Without sales history, all item velocities will be zero.\n";
    }


    if (count($optimizerItems) == 0 && $activeItems > 0) {
        echo "\n[OVERALL CONCLUSION] This is the core of the problem. The query from InventoryOptimizer.php is fetching 0 items, even though there are " . $activeItems . " active items in the database. This could be due to a very subtle issue with the data itself or the PHP/SQLite environment. The seed.php script is the most reliable way to ensure the data is in a state the optimizer can read.\n";
    } elseif (count($optimizerItems) > 0 && $totalTx == 0) {
        echo "\n[OVERALL CONCLUSION] The items are present, but there is no transaction history. This is why all velocities are zero. You can use the seed.php script to generate sample sales data.\n";
    } elseif (count($optimizerItems) > 0) {
        echo "\n[OVERALL CONCLUSION] The optimizer query is working correctly and is fetching items. If you are still seeing '0 items processed', there might be a caching issue with the PHP files. Please try clearing the OPcache from the settings page.\n";
    } else {
        echo "\n[OVERALL CONCLUSION] The optimizer query is correctly fetching 0 items because there are no active items to fetch.\n";
    }

} catch (Exception $e) {
    echo "\n❌ An error occurred: " . $e->getMessage() . "\n";
}

