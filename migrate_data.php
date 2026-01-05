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
$summary = [];

foreach ($files as $file) {
    $filename = basename($file);
    $collectionName = str_replace('.json', '', $filename);
    echo "Processing collection: [ $collectionName ] ... ";
    
    $recordCount = 0;
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
        $recordCount++;
    }

    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
    echo "Done ($recordCount records updated).\n";
    $summary[$collectionName] = $recordCount;
}

echo "\n" . str_repeat("=", 40) . "\n";
echo "MIGRATION SUMMARY\n";
echo str_repeat("=", 40) . "\n";
foreach ($summary as $col => $count) {
    printf("%-25s : %d records\n", $col, $count);
}
echo str_repeat("-", 40) . "\n";
echo "Total Collections: " . count($summary) . "\n";
echo str_repeat("=", 40) . "\n";
echo "\nMigration complete. Please clear your browser's IndexedDB before logging in.\n";