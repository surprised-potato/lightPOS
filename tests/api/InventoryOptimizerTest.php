<?php
/**
 * InventoryOptimizerTest.php
 * 
 * Verifies the InventoryOptimizer class logic (ABC-XYZ, ROP, EOQ).
 * Uses an in-memory SQLite database to avoid polluting the main DB.
 * 
 * Usage: php tests/api/InventoryOptimizerTest.php
 */

require_once __DIR__ . '/../../api/InventoryOptimizer.php';

echo "Running InventoryOptimizerTest...\n";

try {
    // 1. Setup In-Memory DB
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 2. Create Schema (Items, Transactions, SupplierConfig, Metrics)
    $pdo->exec("CREATE TABLE items (id TEXT PRIMARY KEY, cost_price REAL, selling_price REAL, supplier_id TEXT, _deleted INTEGER DEFAULT 0)");
    $pdo->exec("CREATE TABLE transactions (id TEXT PRIMARY KEY, items_json TEXT, json_body TEXT, timestamp TEXT, is_voided INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0)");
    $pdo->exec("CREATE TABLE supplier_config (supplier_id TEXT PRIMARY KEY, delivery_cadence TEXT, lead_time_days INTEGER, _deleted INTEGER DEFAULT 0)");
    
    // Load the actual PO schema for the metrics table
    $schemaPo = file_get_contents(__DIR__ . '/../../api/schema_po.sql');
    $pdo->exec($schemaPo);

    // 3. Seed Data
    // Supplier: Weekly delivery, 7 days lead time
    $pdo->exec("INSERT INTO supplier_config (supplier_id, delivery_cadence, lead_time_days) VALUES ('sup1', 'weekly', 7)");

    // Item A: High Value, High Velocity (Should be Class A, X)
    // Cost: 100. Sales: 10 units/day for 30 days.
    $pdo->exec("INSERT INTO items (id, cost_price, supplier_id) VALUES ('itemA', 100, 'sup1')");
    
    // Item B: Low Value, Low Velocity (Should be Class C)
    // Cost: 10. Sales: 1 unit/day for 30 days.
    $pdo->exec("INSERT INTO items (id, cost_price, supplier_id) VALUES ('itemB', 10, 'sup1')");

    // Item C: Mid Value, Variable Sales (Class B, Y)
    // Cost: 50. Sales: Alternating 3 and 5 (Avg 4).
    $pdo->exec("INSERT INTO items (id, cost_price, supplier_id) VALUES ('itemC', 50, 'sup1')");

    // Item D: Low Value, Erratic Sales (Class C, Z)
    // Cost: 10. Sales: 10 every 5th day (Avg ~2).
    $pdo->exec("INSERT INTO items (id, cost_price, supplier_id) VALUES ('itemD', 10, 'sup1')");

    // Generate Transactions
    // Item A: 10 units every day for last 30 days
    // Item B: 1 unit every day for last 30 days
    $stmt = $pdo->prepare("INSERT INTO transactions (id, items_json, timestamp) VALUES (?, ?, ?)");
    
    for ($i = 0; $i < 30; $i++) {
        $date = date('Y-m-d', strtotime("-$i days")) . 'T12:00:00';
        
        $qtyC = ($i % 2 == 0) ? 3 : 5; // Alternating 3, 5, 3, 5...
        $qtyD = ($i % 5 == 0) ? 10 : 0; // 10, 0, 0, 0, 0, 10...

        $itemsJson = json_encode([
            ['id' => 'itemA', 'qty' => 10],
            ['id' => 'itemB', 'qty' => 1],
            ['id' => 'itemC', 'qty' => $qtyC],
            ['id' => 'itemD', 'qty' => $qtyD]
        ]);
        $stmt->execute(["tx_$i", $itemsJson, $date]);
    }

    // 4. Run Optimizer
    $optimizer = new InventoryOptimizer($pdo);
    $result = $optimizer->calculateMetrics();

    // 5. Assertions
    echo "✅ Optimizer ran successfully. Processed: " . $result['items_processed'] . "\n";

    // Check the structure of the result
    if (!isset($result['success']) || $result['success'] !== true) {
        throw new Exception("Result array should have a 'success' key with a value of true.");
    }
    if (!isset($result['items_processed'])) {
        throw new Exception("Result array should have an 'items_processed' key.");
    }
    if (!isset($result['metrics_updated'])) {
        throw new Exception("Result array should have a 'metrics_updated' key.");
    }
    echo "   - Result structure is correct.\n";

    // Check Item A
    $stmt = $pdo->prepare("SELECT * FROM inventory_metrics WHERE sku_id = 'itemA'");
    $stmt->execute();
    $metricA = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$metricA) throw new Exception("Item A metrics not found.");
    
    // Velocity check: 300 units / 30 effective days = 10
    // Note: Effective days might be slightly different depending on 'first_sale' logic (today vs 29 days ago)
    // If first sale was 29 days ago, effective days is ~30.
    echo "   - Item A Velocity: " . $metricA['daily_velocity'] . " (Expected ~10)\n";
    if (abs($metricA['daily_velocity'] - 10) > 1) throw new Exception("Item A Velocity incorrect.");

    // ABC Check: Item A has much higher value than B, should be 'A'
    echo "   - Item A Class: " . $metricA['abc_class'] . " (Expected 'A')\n";
    if ($metricA['abc_class'] !== 'A') throw new Exception("Item A should be Class A.");

    // XYZ Check: Stable sales (10 every day) -> CV should be 0 -> Class X
    echo "   - Item A XYZ: " . $metricA['xyz_class'] . " (Expected 'X')\n";
    if ($metricA['xyz_class'] !== 'X') throw new Exception("Item A should be Class X.");

    // ROP Check
    // Velocity = 10. Lead Time = 7. Review Period (Weekly) = 7.
    // Risk Period = 14 days.
    // Demand during risk = 140.
    // Safety Stock (Stable) ~ 0 (or small due to float precision).
    // ROP ~ 140.
    echo "   - Item A ROP: " . $metricA['rop_trigger'] . " (Expected ~140)\n";
    if ($metricA['rop_trigger'] < 135 || $metricA['rop_trigger'] > 145) throw new Exception("Item A ROP calculation off.");

    // Check Item B
    $stmt = $pdo->prepare("SELECT * FROM inventory_metrics WHERE sku_id = 'itemB'");
    $stmt->execute();
    $metricB = $stmt->fetch(PDO::FETCH_ASSOC);

    // ABC Check: Item B is < 5% of total value, should be 'C' (or B depending on exact math, but likely C here)
    // Total Value = (300*100) + (30*10) = 30000 + 300 = 30300.
    // Item A % = 99%. Item B % = 1%.
    // A is Top 80% -> A.
    // B is in the tail -> C.
    echo "   - Item B Class: " . $metricB['abc_class'] . " (Expected 'C')\n";
    if ($metricB['abc_class'] !== 'C') throw new Exception("Item B should be Class C.");

    // Check Item C (Class B, Y)
    $stmt = $pdo->prepare("SELECT * FROM inventory_metrics WHERE sku_id = 'itemC'");
    $stmt->execute();
    $metricC = $stmt->fetch(PDO::FETCH_ASSOC);

    echo "   - Item C Class: " . $metricC['abc_class'] . " (Expected 'B')\n";
    if ($metricC['abc_class'] !== 'B') throw new Exception("Item C should be Class B.");

    echo "   - Item C XYZ: " . $metricC['xyz_class'] . " (Expected 'Y')\n";
    // CV for alternating 3 and 5 (Mean 4, StdDev 1) is 0.25. Range [0.2, 0.5] is Y.
    if ($metricC['xyz_class'] !== 'Y') throw new Exception("Item C should be Class Y.");

    // Check Item D (Class C, Z)
    $stmt = $pdo->prepare("SELECT * FROM inventory_metrics WHERE sku_id = 'itemD'");
    $stmt->execute();
    $metricD = $stmt->fetch(PDO::FETCH_ASSOC);

    echo "   - Item D Class: " . $metricD['abc_class'] . " (Expected 'C')\n";
    if ($metricD['abc_class'] !== 'C') throw new Exception("Item D should be Class C.");

    echo "   - Item D XYZ: " . $metricD['xyz_class'] . " (Expected 'Z')\n";
    // CV for sporadic sales (Mean ~2, StdDev ~4) is > 0.5. Range > 0.5 is Z.
    if ($metricD['xyz_class'] !== 'Z') throw new Exception("Item D should be Class Z.");

    echo "🎉 InventoryOptimizerTest Passed!\n";
    
} catch (Exception $e) {
    echo "❌ Test Failed: " . $e->getMessage() . "\n";
    echo "Stack Trace:\n" . $e->getTraceAsString() . "\n";
    exit(1);
}
?>