<?php
/**
 * Sync Endpoint for the Self-Healing Architecture.
 * Handles Push (mutations) and Pull (deltas).
 */
require_once __DIR__ . '/JsonStore.php';

header('Content-Type: application/json');

$dataDir = __DIR__ . '/../data/';
// Ensure data directory is writable
if (!is_dir($dataDir) || !is_writable($dataDir)) {
    http_response_code(500);
    echo json_encode(["error" => "Server Data Directory is not writable. Please check permissions."]);
    exit;
}

$store = new JsonStore($dataDir);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // Handle Nuclear Reset
    if (isset($_GET['action']) && $_GET['action'] === 'reset_all') {
        // List of collections to wipe (excluding users as per UI requirements)
        $toWipe = [
            'items', 'transactions', 'shifts', 'expenses', 'stock_movements', 
            'adjustments', 'customers', 'suppliers', 'stockins', 
            'suspended_transactions', 'returns', 'notifications', 'stock_logs'
        ];
        foreach ($toWipe as $col) {
            $store->write($col, []);
        }
        echo json_encode(['status' => 'success', 'message' => 'Data wiped successfully']);
        exit;
    }

    // PUSH: Apply incoming changes from client outbox
    $input = json_decode(file_get_contents('php://input'), true);
    $outbox = $input['outbox'] ?? [];

    // Group by collection to minimize I/O
    $collectionsToUpdate = [];
    foreach ($outbox as $change) {
        $col = $change['collection'];
        if (!isset($collectionsToUpdate[$col])) {
            $collectionsToUpdate[$col] = [
                'data' => $store->read($col),
                'changes' => []
            ];
        }
        $collectionsToUpdate[$col]['changes'][] = $change;
    }

    foreach ($collectionsToUpdate as $col => $group) {
        $data = $group['data'];
        $idField = ($col === 'users') ? 'email' : 'id';

        foreach ($group['changes'] as $change) {
            $payload = $change['payload'];
            $idx = -1;
            foreach ($data as $i => $item) {
                if ($item[$idField] === $payload[$idField]) {
                    $idx = $i;
                    break;
                }
            }

            if ($idx !== -1) {
                // Conflict Resolution: Last Write Wins (LWW)
                // Logic: Higher _version wins. If versions are equal, higher _updatedAt wins.
                $clientVersion = $payload['_version'] ?? 0;
                $serverVersion = $data[$idx]['_version'] ?? 0;
                $clientUpdated = $payload['_updatedAt'] ?? 0;
                $serverUpdated = $data[$idx]['_updatedAt'] ?? 0;

                if ($clientVersion > $serverVersion || ($clientVersion === $serverVersion && $clientUpdated > $serverUpdated)) {
                    $data[$idx] = $payload;
                    $data[$idx]['_hash'] = md5(json_encode($payload));
                }
            } else {
                $payload['_hash'] = md5(json_encode($payload));
                $data[] = $payload;
            }
            $store->appendLog($change);
        }
        $store->write($col, $data);
    }
    
    echo json_encode(['status' => 'success']);
    exit;
}

if ($method === 'GET') {
    // PULL: Return deltas based on timestamp
    $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
    $collections = [
        'items', 'transactions', 'shifts', 'expenses', 'users', 'stock_movements', 
        'adjustments', 'customers', 'suppliers', 'stockins', 'suspended_transactions', 
        'returns', 'notifications', 'stock_logs', 'sync_metadata'
    ];
    $response = [];

    foreach ($collections as $col) {
        $data = $store->read($col);
        $deltas = array_filter($data, function($item) use ($since) {
            return ($item['_updatedAt'] ?? 0) > $since;
        });
        if (!empty($deltas)) {
            $response[$col] = array_values($deltas);
        }
    }

    echo json_encode([
        'deltas' => $response,
        'serverTime' => round(microtime(true) * 1000) // Use milliseconds to match JS Date.now()
    ]);
    exit;
}
?>