<?php
/**
 * ProcurementServiceTest.php
 * 
 * Verifies PO generation logic including ROP triggers and OTB filtering.
 * Usage: php tests/api/ProcurementServiceTest.php
 */

require_once __DIR__ . '/../../api/ProcurementService.php';

echo "Running ProcurementServiceTest...\n";

try {
    // 1. Setup In-Memory DB
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create Schema
    $pdo->exec("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, cost_price REAL, stock_level INTEGER, supplier_id TEXT, _deleted INTEGER DEFAULT 0)");
    $pdo->exec("CREATE TABLE supplier_config (supplier_id TEXT PRIMARY KEY, monthly_otb REAL, current_spend REAL, _deleted INTEGER DEFAULT 0)");
    $pdo->exec("CREATE TABLE purchase_orders (id TEXT PRIMARY KEY, supplier_id TEXT, status TEXT, items_json TEXT, total_amount REAL, created_at TEXT, _version INTEGER, _updatedAt INTEGER, _deleted INTEGER DEFAULT 0)");
    
    // Load PO schema for metrics
    $schemaPo = file_get_contents(__DIR__ . '/../../api/schema_po.sql');
    $pdo->exec($schemaPo);

    // 2. Seed Data
    $supplierId = 'sup1';
    // Supplier with 1000 budget
    $pdo->exec("INSERT INTO supplier_config (supplier_id, monthly_otb, current_spend) VALUES ('$supplierId', 1000, 0)");

    // Item A (Class A): High Priority. Cost 100. ROP 10. Stock 5. EOQ 5.
    // Order Value: 5 * 100 = 500.
    $pdo->exec("INSERT INTO items (id, cost_price, stock_level, supplier_id) VALUES ('itemA', 100, 5, '$supplierId')");
    $pdo->exec("INSERT INTO inventory_metrics (sku_id, abc_class, rop_trigger, eoq_qty) VALUES ('itemA', 'A', 10, 5)");

    // Item B (Class C): Low Priority. Cost 50. ROP 10. Stock 5. EOQ 20.
    // Order Value: 20 * 50 = 1000.
    // Total Order (A+B) = 1500. OTB = 1000. Item B should be dropped.
    $pdo->exec("INSERT INTO items (id, cost_price, stock_level, supplier_id) VALUES ('itemB', 50, 5, '$supplierId')");
    $pdo->exec("INSERT INTO inventory_metrics (sku_id, abc_class, rop_trigger, eoq_qty) VALUES ('itemB', 'C', 10, 20)");

    // Item C (Class A): Above ROP. Should not be ordered.
    $pdo->exec("INSERT INTO items (id, cost_price, stock_level, supplier_id) VALUES ('itemC', 100, 50, '$supplierId')");
    $pdo->exec("INSERT INTO inventory_metrics (sku_id, abc_class, rop_trigger, eoq_qty) VALUES ('itemC', 'A', 10, 5)");

    // 3. Run Service
    $service = new ProcurementService($pdo);
    $suggestion = $service->getSuggestedOrder($supplierId);

    echo "✅ Service ran successfully.\n";

    // 4. Assertions
    $items = $suggestion['items'];
    $itemIds = array_column($items, 'item_id');

    // Check ROP Logic
    if (in_array('itemC', $itemIds)) {
        throw new Exception("Item C (Stock > ROP) should not be in the order.");
    }
    echo "   - ROP Logic Verified (Item C excluded).\n";

    // Check OTB Logic
    // Total Need: A(500) + B(1000) = 1500. Budget: 1000.
    // Class A (Item A) is Priority 1. Class C (Item B) is Priority 3.
    // Item B should be removed to fit budget.
    
    if (!in_array('itemA', $itemIds)) {
        throw new Exception("Item A (Class A) missing from order.");
    }
    if (in_array('itemB', $itemIds)) {
        throw new Exception("Item B (Class C) should be removed due to OTB constraints.");
    }
    echo "   - OTB Logic Verified (Item B dropped, Item A kept).\n";

    // Check PO Creation
    $poData = [
        'supplier_id' => $supplierId,
        'items' => $items,
        'status' => 'draft'
    ];
    $poId = $service->createPurchaseOrder($poData);
    
    $stmt = $pdo->prepare("SELECT * FROM purchase_orders WHERE id = ?");
    $stmt->execute([$poId]);
    $po = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$po) throw new Exception("PO not saved to database.");
    if ($po['total_amount'] != 500) throw new Exception("PO Total Amount incorrect. Expected 500, got " . $po['total_amount']);
    
    echo "   - PO Creation Verified (ID: $poId, Total: " . $po['total_amount'] . ").\n";

    echo "🎉 ProcurementServiceTest Passed!\n";

} catch (Error $e) {
    echo "❌ Fatal Error: " . $e->getMessage() . "\n";
    // Check if class not found
    if (strpos($e->getMessage(), 'Class') !== false && strpos($e->getMessage(), 'not found') !== false) {
        echo "   (Did you create api/ProcurementService.php yet?)\n";
    }
    exit(1);
} catch (Exception $e) {
    echo "❌ Test Failed: " . $e->getMessage() . "\n";
    exit(1);
}
?>