<?php
require_once __DIR__ . '/SQLiteStore.php';

echo "Seeding database with sample data...\n";

try {
    $store = new SQLiteStore();
    $pdo = $store->pdo;

    // Ensure schema exists
    $schemaSql = file_get_contents(__DIR__ . '/../schema.sql');
    $pdo->exec($schemaSql);
    $schemaPo = file_get_contents(__DIR__ . '/schema_po.sql');
    $pdo->exec($schemaPo);

    echo "Schema initialized.\n";

    // --- Seed Suppliers ---
    $suppliers = [
        ['id' => 'SUP001', 'name' => 'General Groceries Inc.', 'contact_name' => 'John Doe', 'email' => 'contact@grocinc.com', 'phone' => '555-1234'],
        ['id' => 'SUP002', 'name' => 'Fresh Produce Co.', 'contact_name' => 'Jane Smith', 'email' => 'sales@freshproduce.co', 'phone' => '555-5678'],
    ];
    foreach ($suppliers as $supplier) {
        $store->upsert('suppliers', $supplier);
    }
    echo "Seeded " . count($suppliers) . " suppliers.\n";

    // --- Seed Supplier Config for Procurement ---
    $supplierConfigs = [
        ['supplier_id' => 'SUP001', 'delivery_cadence' => 'weekly', 'lead_time_days' => 3],
        ['supplier_id' => 'SUP002', 'delivery_cadence' => 'biweekly', 'lead_time_days' => 7],
    ];
    foreach ($supplierConfigs as $config) {
        $store->upsert('supplier_config', $config);
    }
    echo "Seeded " . count($supplierConfigs) . " supplier configs.\n";


    // --- Seed Items ---
    $items = [];
    $categories = ['Beverages', 'Snacks', 'Canned Goods', 'Dairy'];
    for ($i = 1; $i <= 50; $i++) {
        $cost = rand(10, 500) / 10;
        $items[] = [
            'id' => 'ITEM' . str_pad($i, 3, '0', STR_PAD_LEFT),
            'name' => 'Sample Item ' . $i,
            'barcode' => '123456789' . str_pad($i, 3, '0', STR_PAD_LEFT),
            'category' => $categories[array_rand($categories)],
            'supplier_id' => ($i % 2 == 0) ? 'SUP001' : 'SUP002',
            'cost_price' => $cost,
            'selling_price' => $cost * 1.5,
            'stock_level' => rand(0, 100),
            'min_stock' => 10,
        ];
    }
    foreach ($items as $item) {
        $store->upsert('items', $item);
    }
    echo "Seeded " . count($items) . " items.\n";

    // --- Seed Transactions (for sales history) ---
    $transactions = [];
    for ($i = 0; $i < 100; $i++) {
        $txItems = [];
        $itemCount = rand(1, 5);
        for ($j = 0; $j < $itemCount; $j++) {
            $item = $items[array_rand($items)];
            $txItems[] = [
                'id' => $item['id'],
                'name' => $item['name'],
                'qty' => rand(1, 3),
                'price' => $item['selling_price'],
            ];
        }
        
        $timestamp = date('Y-m-d H:i:s', time() - rand(0, 30 * 24 * 60 * 60));

        $transactions[] = [
            'id' => 'TX' . time() . $i,
            'items_json' => json_encode($txItems),
            'total' => array_reduce($txItems, fn($sum, $item) => $sum + ($item['qty'] * $item['price']), 0),
            'timestamp' => $timestamp,
        ];
    }

    foreach ($transactions as $transaction) {
        $store->upsert('transactions', $transaction);
    }
    echo "Seeded " . count($transactions) . " transactions.\n";


    echo "\nDatabase seeding complete!\n";

} catch (Exception $e) {
    echo "\n❌ Error during seeding: " . $e->getMessage() . "\n";
    exit(1);
}
