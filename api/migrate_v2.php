<?php
/**
 * Migration script to upgrade data to V2 (Self-Healing Architecture).
 * Injects metadata fields: _version, _updatedAt, _deleted, _hash.
 */
require_once __DIR__ . '/JsonStore.php';

$store = new JsonStore();
$dataDir = __DIR__ . '/../data';
$backupDir = $dataDir . '_backup_' . date('Ymd_His');

echo "Starting migration to V2 (Self-Healing Architecture)...\n";

// 1. Backup existing data
if (is_dir($dataDir)) {
    echo "Creating backup at $backupDir...\n";
    mkdir($backupDir, 0777, true);
    foreach (scandir($dataDir) as $file) {
        if ($file !== '.' && $file !== '..' && is_file($dataDir . '/' . $file)) {
            copy($dataDir . '/' . $file, $backupDir . '/' . $file);
        }
    }
}

// 2. Migrate collections
$collections = ['items', 'transactions', 'shifts', 'expenses', 'users', 'stock_movements', 'adjustments', 'customers', 'suppliers'];

foreach ($collections as $col) {
    echo "Processing $col...";
    $data = $store->read($col);
    
    if (empty($data) && !file_exists($dataDir . '/' . $col . '.json')) {
        echo " skipped (not found).\n";
        continue;
    }

    $migrated = array_map(function($item) {
        if (!isset($item['_version'])) {
            $item['_version'] = 1;
            $item['_updatedAt'] = time();
            $item['_deleted'] = false;
            $item['_hash'] = md5(json_encode($item));
        }
        return $item;
    }, $data);

    if ($store->write($col, $migrated)) {
        echo " done (" . count($migrated) . " records).\n";
    } else {
        echo " FAILED.\n";
    }
}

echo "Migration complete.\n";
?>