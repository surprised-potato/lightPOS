<?php
/**
 * Migration script to upgrade legacy JSON data to the 
 * Self-Healing Offline-First Architecture.
 */

$dataDir = __DIR__ . '/data/';

if (!is_dir($dataDir)) {
    die("Data directory not found at $dataDir");
}

$files = glob($dataDir . '*.json');

foreach ($files as $file) {
    $filename = basename($file);
    echo "Processing $filename... ";
    
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    
    if (!is_array($data)) {
        echo "Skipped (not an array).\n";
        continue;
    }

    $updated = false;
    foreach ($data as &$item) {
        // Add mandatory metadata if missing
        if (!isset($item['_version'])) {
            $item['_version'] = 1;
            $updated = true;
        }
        if (!isset($item['_updatedAt'])) {
            $item['_updatedAt'] = time();
            $updated = true;
        }
        if (!isset($item['_deleted'])) {
            $item['_deleted'] = false;
            $updated = true;
        }
        
        // Generate hash for integrity checks
        $temp = $item;
        unset($temp['_hash']); // Don't hash the hash itself
        $item['_hash'] = md5(json_encode($temp));
    }

    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
    echo "Done.\n";
}

echo "\nMigration complete. Please clear your browser's IndexedDB before logging in.\n";