<?php
/**
 * Sync Endpoint for the Self-Healing Architecture.
 * Handles Push (mutations) and Pull (deltas).
 */
require_once __DIR__ . '/SQLiteStore.php';
require_once __DIR__ . '/ProcurementService.php';

header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

$dataDir = __DIR__ . '/../data/';
$restoreLockFile = $dataDir . 'restore.lock';

// Ensure data directory is writable
if (!is_dir($dataDir) || !is_writable($dataDir)) {
    http_response_code(500);
    echo json_encode(["error" => "Server Data Directory is not writable. Please check permissions."]);
    exit;
}

$store = new SQLiteStore();

// Ensure Schema exists (Self-Healing)
function ensureSchema($pdo) {
    // Check if the 'settings' table exists, as it's a good indicator of an initialized DB
    $stmt = $pdo->prepare("PRAGMA table_info(settings)");
    $stmt->execute();
    $tableInfo = $stmt->fetchAll();

    if (empty($tableInfo)) {
        // If 'settings' table does not exist, execute the full schema
        $schemaSql = file_get_contents(__DIR__ . '/../schema.sql');
        if ($schemaSql !== false) {
            $pdo->exec($schemaSql);
            error_log("Main schema initialized via sync.php");
        }
    }

    // Seed Default Admin if users table is empty (Deployment Initialization)
    $stmt = $pdo->query("SELECT COUNT(*) FROM users");
    if ($stmt && $stmt->fetchColumn() == 0) {
        $defaultPermissions = json_encode([
            "pos" => ["read" => true, "write" => true], "customers" => ["read" => true, "write" => true],
            "items" => ["read" => true, "write" => true], "suppliers" => ["read" => true, "write" => true],
            "stockin" => ["read" => true, "write" => true], "stock-count" => ["read" => true, "write" => true],
            "reports" => ["read" => true, "write" => true], "expenses" => ["read" => true, "write" => true],
            "users" => ["read" => true, "write" => true], "shifts" => ["read" => true, "write" => true],
            "migrate" => ["read" => true, "write" => true], "returns" => ["read" => true, "write" => true],
            "settings" => ["read" => true, "write" => true], "purchase_orders" => ["read" => true, "write" => true]
        ]);
        $passwordHash = md5('admin123');
        $now = round(microtime(true) * 1000);
        
        $sql = "INSERT INTO users (email, name, password_hash, is_active, permissions_json, _version, _updatedAt, _deleted) 
                VALUES ('admin@lightpos.com', 'Administrator', '$passwordHash', 1, '$defaultPermissions', 1, $now, 0)";
        $pdo->exec($sql);
        $pdo->exec("INSERT OR IGNORE INTO sync_metadata (key, value, _updatedAt) VALUES ('db_initialized', '1', $now)");
        error_log("Seeded default admin user via sync.php");
    }
}
ensureSchema($store->pdo);

// Ensure PO Schema exists (Self-Healing for new module)
function ensurePoSchema($pdo) {
    $stmt = $pdo->prepare("PRAGMA table_info(inventory_metrics)");
    $stmt->execute();
    if (empty($stmt->fetchAll())) {
        $schemaPo = file_get_contents(__DIR__ . '/schema_po.sql');
        if ($schemaPo) {
            $pdo->exec($schemaPo);
            error_log("PO schema initialized via sync.php");
        }
    }

    // Ensure items table has required columns for procurement
    $stmt = $pdo->prepare("PRAGMA table_info(items)");
    $stmt->execute();
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);

    if (!in_array('cost_price', $columns)) {
        $pdo->exec("ALTER TABLE items ADD COLUMN cost_price REAL DEFAULT 0");
    }
    if (!in_array('supplier_id', $columns)) {
        $pdo->exec("ALTER TABLE items ADD COLUMN supplier_id TEXT");
    }
    if (!in_array('stock_level', $columns)) {
        $pdo->exec("ALTER TABLE items ADD COLUMN stock_level INTEGER DEFAULT 0");
    }
    if (!in_array('selling_price', $columns)) {
        $pdo->exec("ALTER TABLE items ADD COLUMN selling_price REAL DEFAULT 0");
    }

    // Ensure transactions table has items_json and json_body
    $stmt = $pdo->prepare("PRAGMA table_info(transactions)");
    $stmt->execute();
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('items_json', $columns)) {
        $pdo->exec("ALTER TABLE transactions ADD COLUMN items_json TEXT");
    }
    if (!in_array('json_body', $columns)) {
        $pdo->exec("ALTER TABLE transactions ADD COLUMN json_body TEXT");
    }
    if (!in_array('is_voided', $columns)) {
        $pdo->exec("ALTER TABLE transactions ADD COLUMN is_voided INTEGER DEFAULT 0");
    }
}
ensurePoSchema($store->pdo);

$method = $_SERVER['REQUEST_METHOD'];

// 1. Handle Nuclear Reset (Bypass Lock)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'reset_all') {
    $toWipe = [
        'items', 'transactions', 'shifts', 'expenses', 'stock_movements', 
        'adjustments', 'customers', 'suppliers', 'stockins', 
        'suspended_transactions', 'returns', 'notifications', 'stock_logs', 'settings',
        'users', 'sync_metadata'
    ];
    try {
        $store->pdo->beginTransaction();
        foreach ($toWipe as $col) {
            $store->wipe($col);
        }

        // Re-seed Admin
        $defaultAdmin = [
            "email" => "admin@lightpos.com",
            "name" => "Super Admin",
            "password_hash" => md5("admin123"),
            "is_active" => true,
            "_version" => 1,
            "_updatedAt" => round(microtime(true) * 1000),
            "_deleted" => false,
            "permissions_json" => json_encode([
                "pos" => ["read" => true, "write" => true], "customers" => ["read" => true, "write" => true],
                "items" => ["read" => true, "write" => true], "suppliers" => ["read" => true, "write" => true],
                "stockin" => ["read" => true, "write" => true], "stock-count" => ["read" => true, "write" => true],
                "reports" => ["read" => true, "write" => true], "expenses" => ["read" => true, "write" => true],
                "users" => ["read" => true, "write" => true], "shifts" => ["read" => true, "write" => true],
                "migrate" => ["read" => true, "write" => true], "returns" => ["read" => true, "write" => true],
                "settings" => ["read" => true, "write" => true]
            ])
        ];
        $store->upsert('users', $defaultAdmin);
        $store->upsert('sync_metadata', ['key' => 'db_initialized', 'value' => '1']);
        
        if (file_exists($restoreLockFile)) {
            unlink($restoreLockFile);
        }

        $store->pdo->commit();
        echo json_encode(['status' => 'success', 'message' => 'System fully reset to factory defaults.']);
    } catch (Exception $e) {
        $store->pdo->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// 2. If a restore is in progress, tell other clients to wait.
if (file_exists($restoreLockFile)) {
    // Self-healing: Check if the DB is actually initialized. If so, remove the stale lock.
    try {
        $stmt = $store->pdo->prepare("SELECT value FROM sync_metadata WHERE key = 'db_initialized'");
        $stmt->execute();
        $initialized = $stmt->fetchColumn();
        
        if ($initialized == '1') {
            unlink($restoreLockFile);
        } else {
            throw new Exception("Database not initialized");
        }
    } catch (Exception $e) {
        http_response_code(503);
        echo json_encode(["error" => "Server is currently restoring, please try again later."]);
        exit;
    }
}

if ($method === 'POST') {
    // PUSH: Apply incoming changes from client outbox
    $input = json_decode(file_get_contents('php://input'), true);
    $outbox = $input['outbox'] ?? [];

    try {
        $store->pdo->beginTransaction();
        $pushedTransactions = [];

        foreach ($outbox as $change) {
            $collection = $change['collection'];
            $payload = $change['payload'];
            
            // The logic inside upsert now handles conflict resolution
            $store->upsert($collection, $payload);
            
            if ($collection === 'transactions') {
                $pushedTransactions[] = $payload;
            }
        }

        if (!empty($pushedTransactions)) {
            $procurement = new ProcurementService($store->pdo);
            $procurement->processRealtimeTriggers($pushedTransactions);
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
            // Database is not initialized. Return status but DO NOT LOCK.
            echo json_encode(['status' => 'needs_restore', 'serverTime' => round(microtime(true) * 1000)]);
            exit;
        }
    } catch (Exception $e) {
        // This can happen if the table doesn't exist.
        echo json_encode(['status' => 'needs_restore', 'serverTime' => round(microtime(true) * 1000)]);
        exit;
    }


    // PULL: Return deltas based on timestamp
    $since = isset($_GET['since']) ? (int)$_GET['since'] : 0;
    $collections = [
        'items', 'transactions', 'shifts', 'expenses', 'users', 'stock_movements', 
        'adjustments', 'customers', 'suppliers', 'stockins', 'suspended_transactions', 
        'returns', 'notifications', 'stock_logs', 'settings',
        'purchase_orders', 'supplier_config', 'inventory_metrics'
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