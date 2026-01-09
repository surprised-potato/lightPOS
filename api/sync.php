<?php
/**
 * Sync Endpoint for the Self-Healing Architecture.
 * Handles Push (mutations) and Pull (deltas).
 */
require_once __DIR__ . '/SQLiteStore.php';

header('Content-Type: application/json');

$dataDir = __DIR__ . '/../data/';
$restoreLockFile = $dataDir . 'restore.lock';

// Ensure data directory is writable
if (!is_dir($dataDir) || !is_writable($dataDir)) {
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
    // Handle Nuclear Reset
    if (isset($_GET['action']) && $_GET['action'] === 'reset_all') {
        $toWipe = [
            'items', 'transactions', 'shifts', 'expenses', 'stock_movements', 
            'adjustments', 'customers', 'suppliers', 'stockins', 
            'suspended_transactions', 'returns', 'notifications', 'stock_logs', 'settings'
        ];
        try {
            $store->pdo->beginTransaction();
            foreach ($toWipe as $col) {
                $store->wipe($col);
            }
            $store->pdo->commit();
            echo json_encode(['status' => 'success', 'message' => 'Data wiped successfully']);
        } catch (Exception $e) {
            $store->pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        exit;
    }

    // PUSH: Apply incoming changes from client outbox
    $input = json_decode(file_get_contents('php://input'), true);
    $outbox = $input['outbox'] ?? [];

    try {
        $store->pdo->beginTransaction();

        foreach ($outbox as $change) {
            $collection = $change['collection'];
            $payload = $change['payload'];
            
            // The logic inside upsert now handles conflict resolution
            $store->upsert($collection, $payload);
        }

        $store->pdo->commit();
        echo json_encode(['status' => 'success']);

    } catch (Exception $e) {
        $store->pdo->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    
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