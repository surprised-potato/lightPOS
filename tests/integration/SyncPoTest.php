<?php
require_once __DIR__ . '/../../api/SQLiteStore.php';

function assertEq($actual, $expected, $msg) {
    if ($actual !== $expected) {
        throw new Exception("$msg: Expected '$expected', got '$actual'");
    }
}

try {
    echo "Running SyncPoTest (Integration)...\n";
    $store = new SQLiteStore();
    
    // --- Test 1: Supplier Config (Custom PK: supplier_id) ---
    echo "  - Testing Supplier Config Sync... ";
    $supId = 'SUP-TEST-' . time();
    $config = [
        'supplier_id' => $supId,
        'delivery_cadence' => 'weekly',
        'lead_time_days' => 14,
        '_version' => 1,
        '_updatedAt' => round(microtime(true) * 1000),
        '_deleted' => 0
    ];
    
    $store->upsert('supplier_config', $config);
    
    // Verify Fetch
    $fetched = $store->getAll('supplier_config');
    $found = false;
    foreach ($fetched as $row) {
        if ($row['supplier_id'] === $supId) {
            assertEq($row['delivery_cadence'], 'weekly', 'Cadence match');
            assertEq((int)$row['lead_time_days'], 14, 'Lead time match');
            $found = true;
            break;
        }
    }
    if (!$found) throw new Exception("Supplier Config not found after upsert");
    
    // Cleanup
    $store->delete('supplier_config', $supId);
    echo "OK\n";

    // --- Test 2: Purchase Orders (Standard PK: id) ---
    echo "  - Testing Purchase Order Sync... ";
    $poId = 'PO-TEST-' . time();
    $po = [
        'id' => $poId,
        'supplier_id' => $supId,
        'status' => 'draft',
        '_version' => 1,
        '_updatedAt' => round(microtime(true) * 1000),
        '_deleted' => 0
    ];
    $store->upsert('purchase_orders', $po);
    
    $fetchedPo = $store->getAll('purchase_orders');
    $foundPo = false;
    foreach ($fetchedPo as $row) {
        if ($row['id'] === $poId) {
            assertEq($row['status'], 'draft', 'Status match');
            $foundPo = true;
            break;
        }
    }
    if (!$foundPo) throw new Exception("PO not found after upsert");
    
    $store->delete('purchase_orders', $poId);
    echo "OK\n";

    echo "Integration Tests Passed!\n";

} catch (Exception $e) {
    echo "\nTEST FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
?>