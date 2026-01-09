<?php
require_once __DIR__ . '/../../api/SQLiteStore.php';
require_once __DIR__ . '/../../api/ProcurementService.php';

function assertEq($actual, $expected, $msg) {
    if ($actual !== $expected) {
        throw new Exception("$msg: Expected '$expected', got '$actual'");
    }
}

try {
    echo "Running RealtimeTriggerTest...\n";
    $store = new SQLiteStore();
    $pdo = $store->pdo;
    $service = new ProcurementService($pdo);

    // Ensure Schema (Self-Healing for Test)
    $stmt = $pdo->prepare("PRAGMA table_info(items)");
    $stmt->execute();
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('supplier_id', $columns)) {
        $pdo->exec("ALTER TABLE items ADD COLUMN supplier_id TEXT");
    }
    if (!in_array('cost_price', $columns)) {
        $pdo->exec("ALTER TABLE items ADD COLUMN cost_price REAL DEFAULT 0");
    }

    $stmt = $pdo->prepare("PRAGMA table_info(transactions)");
    $stmt->execute();
    $txColumns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('items_json', $txColumns)) {
        $pdo->exec("ALTER TABLE transactions ADD COLUMN items_json TEXT");
    }
    
    // Ensure PO tables exist
    $schemaPath = __DIR__ . '/../../api/schema_po.sql';
    if (file_exists($schemaPath)) $pdo->exec(file_get_contents($schemaPath));

    // 1. Setup Data
    $supId = 'SUP-TRIGGER-' . time();
    $itemId = 'ITEM-TRIGGER-' . time();
    
    // Supplier Config: On Order
    $store->upsert('supplier_config', [
        'supplier_id' => $supId,
        'delivery_cadence' => 'on_order',
        'lead_time_days' => 1,
        '_version' => 1, '_updatedAt' => time(), '_deleted' => 0
    ]);

    // Item linked to supplier
    $store->upsert('items', [
        'id' => $itemId,
        'name' => 'Trigger Item',
        'supplier_id' => $supId,
        'stock_level' => 10,
        'cost_price' => 100,
        '_version' => 1, '_updatedAt' => time(), '_deleted' => 0
    ]);

    // 2. Simulate Transaction
    $tx = [
        'id' => 'TX-' . time(),
        'items_json' => json_encode([
            ['id' => $itemId, 'qty' => 5, 'cost' => 100]
        ]),
        'timestamp' => date('c')
    ];
    
    // 3. Call Trigger Logic
    echo "  - Processing triggers...\n";
    $generatedPOs = $service->processRealtimeTriggers([$tx]);
    
    // 4. Verify
    if (empty($generatedPOs)) {
        throw new Exception("No PO generated for On Order supplier");
    }
    
    $poId = $generatedPOs[0];
    echo "  - Generated PO: $poId\n";
    
    $po = $store->getAll('purchase_orders');
    $targetPO = null;
    foreach ($po as $p) {
        if ($p['id'] === $poId) {
            $targetPO = $p;
            break;
        }
    }
    
    if (!$targetPO) throw new Exception("PO not found in DB");
    assertEq($targetPO['supplier_id'], $supId, "Supplier ID match");
    assertEq($targetPO['status'], 'draft', "Status match");
    
    // Verify items in PO
    $poItems = json_decode($targetPO['items_json'], true);
    assertEq($poItems[0]['item_id'], $itemId, "Item ID match");
    assertEq($poItems[0]['qty'], 5, "Qty match");

    // Cleanup
    $store->delete('supplier_config', $supId);
    $store->delete('items', $itemId);
    $store->delete('purchase_orders', $poId);
    
    echo "RealtimeTriggerTest Passed!\n";

} catch (Exception $e) {
    echo "\nTEST FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
?>