<?php
/**
 * Sync Endpoint for the Self-Healing Architecture - DEBUG VERSION.
 * Handles Push (mutations) and Pull (deltas).
 */
require_once __DIR__ . '/SQLiteStore.php';

header('Content-Type: application/json');

$dataDir = __DIR__ . '/../data/';
$restoreLockFile = $dataDir . 'restore.lock';

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

// Ensure data directory is writable
if (!is_writable($dataDir)) {
    http_response_code(500);
    echo json_encode(["error" => "Server Data Directory is not writable. Please check permissions."]);
    exit;
}

// If a restore is in progress, tell other clients to wait.
if (file_exists($restoreLockFile)) {
    http_response_code(503);
    echo json_encode(["error" => "Server is currently restoring, please try again later."]);
    exit;
}

$store = new SQLiteStore();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // This debug endpoint does not handle POST, it's for GET requests only.
    // The regular sync.php will handle the push.
    http_response_code(405);
    echo json_encode(["error" => "Method Not Allowed for debug endpoint."]);
    exit;
}

if ($method === 'GET') {
    // Health Check: See if the database is initialized.
    try {
        $stmt = $store->pdo->prepare("SELECT value FROM sync_metadata WHERE key = 'db_initialized'");
        $stmt->execute();
        $initialized = $stmt->fetchColumn();

        if ($initialized === false) {
            // Database is not initialized. Enter restore mode.
            file_put_contents($restoreLockFile, '1');
            echo json_encode(['status' => 'needs_restore', 'serverTime' => round(microtime(true) * 1000)]);
            exit;
        }
    } catch (Exception $e) {
        // This can happen if the table doesn't exist.
        file_put_contents($restoreLockFile, '1');
        echo json_encode(['status' => 'needs_restore', 'serverTime' => round(microtime(true) * 1000)]);
        exit;
    }


    // PULL: Return deltas based on timestamp
    $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
    $collections = [
        'items', 'transactions', 'shifts', 'expenses', 'users', 'stock_movements', 
        'adjustments', 'customers', 'suppliers', 'stockins', 'suspended_transactions', 
        'returns', 'notifications', 'stock_logs', 'settings'
    ];
    $response = [];
    $debug_info = [
        'file' => 'sync_debug.php',
        'received_since' => $since,
        'queries' => []
    ];

    foreach ($collections as $col) {
        $debug_info['queries'][$col] = "SELECT * FROM $col WHERE _updatedAt > $since";
        $deltas = $store->getChanges($col, $since);
        if (!empty($deltas)) {
            $response[$col] = $deltas;
        }
    }

    echo json_encode([
        'deltas' => $response,
        'serverTime' => round(microtime(true) * 1000),
        'debug' => $debug_info
    ]);
    exit;
}
?>