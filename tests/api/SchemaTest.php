<?php
/**
 * SchemaTest.php
 * 
 * Verifies that api/schema_po.sql creates the expected tables and columns.
 * Usage: php tests/api/SchemaTest.php
 */

$schemaPath = __DIR__ . '/../../api/schema_po.sql';

echo "Running SchemaTest...\n";

if (!file_exists($schemaPath)) {
    echo "❌ Error: Schema file not found at $schemaPath\n";
    exit(1);
}

try {
    // Create in-memory SQLite database
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Load schema
    $sql = file_get_contents($schemaPath);
    
    // Execute schema
    $pdo->exec($sql);
    echo "✅ Schema SQL executed successfully.\n";

    // Define expected tables and key columns
    $expectedTables = [
        'inventory_metrics' => ['sku_id', 'abc_class', 'eoq_qty', 'rop_trigger', '_version'],
        'supplier_config' => ['supplier_id', 'delivery_cadence', 'monthly_otb', '_version'],
        'purchase_orders' => ['id', 'supplier_id', 'status', 'items_json', '_version']
    ];

    foreach ($expectedTables as $table => $columns) {
        // Check table existence
        $stmt = $pdo->prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?");
        $stmt->execute([$table]);
        if ($stmt->fetchColumn() == 0) {
            echo "❌ Error: Table '$table' was not created.\n";
            exit(1);
        }
        echo "✅ Table '$table' exists.\n";

        // Check column existence
        $stmt = $pdo->prepare("PRAGMA table_info($table)");
        $stmt->execute();
        $existingColumns = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'name');

        foreach ($columns as $col) {
            if (!in_array($col, $existingColumns)) {
                echo "❌ Error: Column '$col' missing in table '$table'.\n";
                exit(1);
            }
        }
        echo "   - Verified columns: " . implode(', ', $columns) . "\n";
    }

    echo "🎉 SchemaTest Passed!\n";
    exit(0);

} catch (Exception $e) {
    echo "❌ Exception: " . $e->getMessage() . "\n";
    exit(1);
}
?>