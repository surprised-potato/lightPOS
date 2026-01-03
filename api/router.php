<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/../data/';
$allowedFiles = ['items', 'users', 'suppliers', 'customers', 'transactions', 'shifts', 'expenses', 'stock_in_history', 'adjustments', 'suspended_transactions', 'returns', 'settings'];

$action = $_GET['action'] ?? null;
$file = $_GET['file'] ?? null;

if ($file && !in_array($file, $allowedFiles)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid file"]);
    exit;
}

$filePath = $dataDir . $file . '.json';

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

// Helper to initialize file if missing
function initFile($path) {
    if (!file_exists($path)) {
        file_put_contents($path, json_encode([]));
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($file) {
        initFile($filePath);
        if (file_exists($filePath)) {
            echo file_get_contents($filePath);
        } else {
            echo json_encode([]);
        }
    } else {
        echo json_encode(["message" => "API Ready"]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    
    if ($file) {
        initFile($filePath);
        $fp = fopen($filePath, 'c+');
        if (flock($fp, LOCK_EX)) {
            // Truncate and write
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($input, JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Could not lock file"]);
        }
        fclose($fp);
        echo json_encode(["success" => true]);
    } elseif ($action === 'login') {
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? ''; 
        
        $usersPath = $dataDir . 'users.json';
        
        // Auto-seed admin if file missing
        if (!file_exists($usersPath)) {
            $defaultAdmin = [[
                "email" => "admin@lightpos.com",
                "name" => "Super Admin",
                "password" => "21232f297a57a5a743894a0e4a801fc3", // "admin"
                "is_active" => true,
                "permissions" => [
                    "pos" => ["read" => true, "write" => true],
                    "customers" => ["read" => true, "write" => true],
                    "items" => ["read" => true, "write" => true],
                    "suppliers" => ["read" => true, "write" => true],
                    "stockin" => ["read" => true, "write" => true],
                    "stock-count" => ["read" => true, "write" => true],
                    "reports" => ["read" => true, "write" => true],
                    "expenses" => ["read" => true, "write" => true],
                    "users" => ["read" => true, "write" => true],
                    "shifts" => ["read" => true, "write" => true],
                    "migrate" => ["read" => true, "write" => true],
                    "returns" => ["read" => true, "write" => true]
                ]
            ]];
            file_put_contents($usersPath, json_encode($defaultAdmin, JSON_PRETTY_PRINT));
        }
        
        $users = json_decode(file_get_contents($usersPath), true);
        
        $foundUser = null;
        if (is_array($users)) {
            foreach ($users as $u) {
                // Simple MD5 check as per PRD for MVP
                if ($u['email'] === $email && $u['password'] === md5($password)) {
                    $foundUser = $u;
                    break;
                }
            }
        }
        
        if ($foundUser) {
            if (isset($foundUser['is_active']) && !$foundUser['is_active']) {
                http_response_code(403);
                echo json_encode(["error" => "Account inactive"]);
            } else {
                unset($foundUser['password']); // Don't send hash back
                echo json_encode(["success" => true, "user" => $foundUser]);
            }
        } else {
            http_response_code(401);
            echo json_encode(["error" => "Invalid credentials"]);
        }
    } elseif ($action === 'batch_stock_in') {
        $payload = $input['data'] ?? null;
        $supplierOverride = $payload['supplier_id_override'] ?? null;
        
        if ($payload) {
            $itemsPath = $dataDir . 'items.json';
            $historyPath = $dataDir . 'stock_in_history.json';
            
            initFile($itemsPath);
            initFile($historyPath);
            
            // 1. Update Items Stock
            $items = json_decode(file_get_contents($itemsPath), true);
            $itemsMap = [];
            foreach ($items as &$item) {
                $itemsMap[$item['id']] = &$item;
            }
            unset($item);
            
            foreach ($payload['items'] as $cartItem) {
                if (isset($itemsMap[$cartItem['item_id']])) {
                    $item = &$itemsMap[$cartItem['item_id']];
                    $item['stock_level'] = ($item['stock_level'] ?? 0) + $cartItem['quantity'];
                    
                    // Update supplier if override provided and item has none
                    if ($supplierOverride && (empty($item['supplier_id']))) {
                        $item['supplier_id'] = $supplierOverride;
                    }
                }
            }
            
            file_put_contents($itemsPath, json_encode(array_values($itemsMap), JSON_PRETTY_PRINT));
            
            // 2. Log History
            $history = json_decode(file_get_contents($historyPath), true);
            if (!is_array($history)) $history = [];
            
            // Prepend new record
            array_unshift($history, $payload);
            
            file_put_contents($historyPath, json_encode($history, JSON_PRETTY_PRINT));
            
            echo json_encode(["success" => true]);
        } else {
            http_response_code(400);
            echo json_encode(["error" => "No data provided"]);
        }
    }
}
?>