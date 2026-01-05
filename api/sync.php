<?php
/**
 * Sync Endpoint for the Self-Healing Architecture.
 * Handles Push (mutations) and Pull (deltas).
 */
require_once __DIR__ . '/JsonStore.php';

header('Content-Type: application/json');
$store = new JsonStore();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // PUSH: Apply incoming changes from client outbox
    $input = json_decode(file_get_contents('php://input'), true);
    $outbox = $input['outbox'] ?? [];
    
    foreach ($outbox as $change) {
        $col = $change['collection'];
        $payload = $change['payload'];
        $data = $store->read($col);
        
        $idField = ($col === 'users') ? 'email' : 'id';
        $idx = -1;
        foreach ($data as $i => $item) {
            if ($item[$idField] === $payload[$idField]) {
                $idx = $i;
                break;
            }
        }
        
        if ($idx !== -1) {
            // Conflict Resolution: Higher version wins (Last Write Wins)
            if ($payload['_version'] > $data[$idx]['_version']) {
                $data[$idx] = $payload;
                $data[$idx]['_hash'] = md5(json_encode($payload));
            }
        } else {
            $payload['_hash'] = md5(json_encode($payload));
            $data[] = $payload;
        }
        
        $store->write($col, $data);
        $store->appendLog($change);
    }
    
    echo json_encode(['status' => 'success']);
    exit;
}

if ($method === 'GET') {
    // PULL: Return deltas based on timestamp
    $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
    $collections = ['items', 'transactions', 'shifts', 'expenses', 'users', 'stock_movements', 'adjustments', 'customers', 'suppliers'];
    $response = [];

    foreach ($collections as $col) {
        $data = $store->read($col);
        $deltas = array_filter($data, function($item) use ($since) {
            return $item['_updatedAt'] > $since;
        });
        if (!empty($deltas)) {
            $response[$col] = array_values($deltas);
        }
    }

    echo json_encode([
        'deltas' => $response,
        'serverTime' => time()
    ]);
    exit;
}
?>