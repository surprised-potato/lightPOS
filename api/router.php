<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once __DIR__ . '/JsonStore.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/../data/';
$store = new JsonStore($dataDir);
$allowedFiles = ['items', 'users', 'suppliers', 'customers', 'transactions', 'shifts', 'expenses', 'stock_in_history', 'stockins', 'adjustments', 'suspended_transactions', 'returns', 'sync_metadata', 'last_sync', 'stock_movements', 'valuation_history', 'stock_logs', 'notifications', 'settings'];

$action = $_GET['action'] ?? null;
$file = $_GET['file'] ?? null;
$mode = $_GET['mode'] ?? 'overwrite';
$dryRun = isset($_GET['dry_run']) && $_GET['dry_run'] === 'true';

if ($file && !in_array($file, $allowedFiles)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid file"]);
    exit;
}

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

// Ensure data directory is writable by the server
if (!is_writable($dataDir)) {
    http_response_code(500);
    echo json_encode(["error" => "Server Data Directory is not writable. Please check permissions."]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($file) {
        echo json_encode($store->read($file));
    } else {
        echo json_encode(["message" => "API Ready"]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    
    // Security: Prevent wiping data if payload is null/invalid (e.g. due to size limits)
    if ($file && !is_array($input)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid payload or empty body received."]);
        exit;
    }

    if ($file) {
        if (!$dryRun) {
            // Check if specific file is writable (if it exists)
            $targetPath = $dataDir . $file . '.json';
            if (file_exists($targetPath) && !is_writable($targetPath)) {
                http_response_code(500);
                echo json_encode(["error" => "File $file.json is not writable."]);
                exit;
            }

            if ($mode === 'append') {
                $currentData = $store->read($file);
                if (!is_array($currentData)) $currentData = [];
                if (is_array($input)) {
                    $currentData = array_merge($currentData, $input);
                }
                $store->write($file, $currentData);
            } else {
                $store->write($file, $input);
            }
        }
        echo json_encode(["success" => true]);
    } elseif ($action === 'login') {
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? ''; 

        // Auto-seed admin if file missing
        $users = $store->read('users');
        if (empty($users)) {
            $defaultAdmin = [[
                "email" => "admin@lightpos.com",
                "name" => "Super Admin",
                "password" => "21232f297a57a5a743894a0e4a801fc3", // "admin"
                "is_active" => true,
                "_version" => 1,
                "_updatedAt" => round(microtime(true) * 1000),
                "_deleted" => false,
                "permissions" => [
                    "pos" => ["read" => true, "write" => true], "customers" => ["read" => true, "write" => true],
                    "items" => ["read" => true, "write" => true], "suppliers" => ["read" => true, "write" => true],
                    "stockin" => ["read" => true, "write" => true], "stock-count" => ["read" => true, "write" => true],
                    "reports" => ["read" => true, "write" => true], "expenses" => ["read" => true, "write" => true],
                    "users" => ["read" => true, "write" => true], "shifts" => ["read" => true, "write" => true],
                    "migrate" => ["read" => true, "write" => true], "returns" => ["read" => true, "write" => true],
                    "settings" => ["read" => true, "write" => true]
                ]
            ]];
            $store->write('users', $defaultAdmin);
            $users = $defaultAdmin;
        }

        $foundUser = null;
        foreach ($users as $u) {
            if ($u['email'] === $email && $u['password'] === md5($password)) {
                $foundUser = $u;
                break;
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
    } elseif ($action === 'reset_all') {
        // Nuclear option: Delete all JSON files in data directory
        $files = glob($dataDir . '*.json');
        foreach ($files as $f) {
            if (basename($f) !== 'users.json') { // Keep users so we can still login
                unlink($f);
            }
        }
        echo json_encode(["success" => true, "message" => "All data except users has been wiped."]);
    } elseif ($action === 'restore_backup') {
        $backupData = null;

        if (is_array($input) && !empty($input)) {
            $backupData = $input;
        } elseif (isset($_FILES['backup_file'])) {
            $backupFile = $_FILES['backup_file'];
            if ($backupFile['error'] !== UPLOAD_ERR_OK) {
                http_response_code(500);
                echo json_encode(["error" => "File upload error: " . $backupFile['error']]);
                exit;
            }

            $backupContent = file_get_contents($backupFile['tmp_name']);
            $backupData = json_decode($backupContent, true);
        }

        if (is_array($backupData)) {
            $serverTime = round(microtime(true) * 1000);

            foreach ($backupData as $fileName => $data) {
                if (in_array($fileName, $allowedFiles) && is_array($data)) {
                    // To ensure all restored data is synced, we update the timestamp.
                    foreach ($data as &$item) {
                        if (is_array($item)) {
                           $item['_updatedAt'] = $serverTime;
                        }
                    }
                    unset($item); // Unset reference after loop
                    if (!$dryRun) {
                        $store->write($fileName, $data);
                    }
                }
            }
            echo json_encode(["success" => true, "message" => "Restore complete."]);
        } else {
            http_response_code(400);
            echo json_encode(["error" => "No valid backup data received."]);
        }
    }
}
?>