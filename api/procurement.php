<?php
/**
 * Procurement API Endpoint
 * Handles Inventory Optimization triggers, Alerts, and PO generation.
 */

require_once __DIR__ . '/SQLiteStore.php';
require_once __DIR__ . '/InventoryOptimizer.php';
require_once __DIR__ . '/ProcurementService.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Initialize Store
$store = new SQLiteStore();
$pdo = $store->pdo;

// Helper to ensure schema exists (similar to router.php)
// This ensures that if this endpoint is hit by a Cron job before the UI is loaded, tables exist.
function ensurePoSchema($pdo) {
    $stmt = $pdo->prepare("PRAGMA table_info(inventory_metrics)");
    $stmt->execute();
    if (empty($stmt->fetchAll())) {
        $schemaPo = file_get_contents(__DIR__ . '/schema_po.sql');
        if ($schemaPo) {
            $pdo->exec($schemaPo);
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

    // Ensure transactions table has items_json
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
ensurePoSchema($pdo);

$action = $_GET['action'] ?? null;

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ($action === 'recalculate') {
            $optimizer = new InventoryOptimizer($pdo);
            $result = $optimizer->calculateMetrics();
            echo json_encode($result);
        } 
        elseif ($action === 'alerts') {
            // Fetch items where stock <= ROP
            // We join items and inventory_metrics
            $sql = "
                SELECT i.id, i.name, i.stock_level, i.supplier_id,
                       m.rop_trigger, m.abc_class, m.eoq_qty, m.safety_stock
                FROM items i
                JOIN inventory_metrics m ON i.id = m.sku_id
                WHERE i._deleted = 0 
                  AND (i.stock_level IS NOT NULL)
                  AND (m.rop_trigger IS NOT NULL)
                  AND (i.stock_level <= m.rop_trigger)
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute();
            $alerts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($alerts);
        } 
        elseif ($action === 'suggested-order') {
            $supplierId = $_GET['supplier_id'] ?? null;
            if (!$supplierId) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing supplier_id']);
                exit;
            }
            $service = new ProcurementService($pdo);
            $result = $service->getSuggestedOrder($supplierId);
            echo json_encode($result);
        } 
        elseif ($action === 'calculate-otb') {
            $supplierId = $_GET['supplier_id'] ?? null;
            if (!$supplierId) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing supplier_id']);
                exit;
            }
            $service = new ProcurementService($pdo);
            $result = $service->calculateOtb($supplierId);
            echo json_encode($result);
        }
        else {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
        }
    } 
    elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents("php://input"), true);
        
        if ($action === 'settings') {
            if (empty($input['supplier_id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing supplier_id']);
                exit;
            }
            
            // Fetch existing to merge
            $existingStmt = $pdo->prepare("SELECT * FROM supplier_config WHERE supplier_id = ?");
            $existingStmt->execute([$input['supplier_id']]);
            $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            
            $cadence = $input['delivery_cadence'] ?? $existing['delivery_cadence'] ?? 'weekly';
            $leadTime = $input['lead_time_days'] ?? $existing['lead_time_days'] ?? 7;
            $otb = $input['monthly_otb'] ?? $existing['monthly_otb'] ?? 0;
            $spend = $input['current_spend'] ?? $existing['current_spend'] ?? 0;
            $version = ($existing['_version'] ?? 0) + 1;
            $updatedAt = round(microtime(true) * 1000);
            
            $stmt = $pdo->prepare("INSERT OR REPLACE INTO supplier_config 
                (supplier_id, delivery_cadence, lead_time_days, monthly_otb, current_spend, _version, _updatedAt, _deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)");
            
            $stmt->execute([$input['supplier_id'], $cadence, $leadTime, $otb, $spend, $version, $updatedAt]);
            
            echo json_encode(['success' => true]);
        }
        elseif ($action === 'create-po') {
             $service = new ProcurementService($pdo);
             $poId = $service->createPurchaseOrder($input);
             echo json_encode(['success' => true, 'id' => $poId]);
        }
        else {
             http_response_code(400);
             echo json_encode(['error' => 'Invalid action']);
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}