<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Add a special action to clear OPcache for debugging
if (isset($_GET['action']) && $_GET['action'] === 'clear_opcache') {
    if (function_exists('opcache_reset')) {
        opcache_reset();
        echo json_encode(["success" => true, "message" => "PHP OPcache has been cleared."]);
    } else {
        echo json_encode(["success" => false, "message" => "OPcache is not enabled."]);
    }
    exit;
}

require_once __DIR__ . '/SQLiteStore.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$store = new SQLiteStore();
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

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($file) {
        echo json_encode($store->getAll($file));
    } else {
        echo json_encode(["message" => "API Ready"]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    
    if ($file && !is_array($input)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid payload or empty body received."]);
        exit;
    }

    if ($file) {
        if (!$dryRun) {
            if ($mode === 'append') {
                $currentData = $store->getAll($file);
                if (is_array($input)) {
                    foreach($input as $record) {
                        $store->upsert($file, $record);
                    }
                }
            } else {
                $store->wipe($file);
                foreach($input as $record) {
                    $store->upsert($file, $record);
                }
            }
        }
        echo json_encode(["success" => true]);
    } elseif ($action === 'login') {
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? ''; 

        $users = $store->getAll('users');
        if (empty($users)) {
            $defaultAdmin = [
                "email" => "admin@lightpos.com",
                "name" => "Super Admin",
                "password_hash" => md5("admin"),
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
            $users = [$defaultAdmin];
        }

        $foundUser = null;
        foreach ($users as $u) {
            if ($u['email'] === $email && $u['password_hash'] === md5($password)) {
                $foundUser = $u;
                break;
            }
        }

        if ($foundUser) {
            if (isset($foundUser['is_active']) && !$foundUser['is_active']) {
                http_response_code(403);
                echo json_encode(["error" => "Account inactive"]);
            } else {
                unset($foundUser['password_hash']); // Don't send hash back
                echo json_encode(["success" => true, "user" => $foundUser]);
            }
        } else {
            http_response_code(401);
            echo json_encode(["error" => "Invalid credentials"]);
        }
    } elseif ($action === 'reset_all') {
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
    } elseif ($action === 'restore_from_client') {
        $toWipe = [
            'items', 'transactions', 'users', 'customers', 'suppliers',
            'shifts', 'expenses', 'returns', 'stock_movements',
            'adjustments', 'stockins', 'suspended_transactions', 'sync_metadata',
            'stock_logs', 'settings', 'notifications'
        ];
        $dataDir = __DIR__ . '/../data/';
        $restoreLockFile = $dataDir . 'restore.lock';

        try {
            $store->pdo->beginTransaction();

            // 1. Wipe all tables
            foreach ($toWipe as $col) {
                if ($col !== 'sync_metadata') { // Don't wipe sync_metadata yet
                    $store->wipe($col);
                }
            }
            // Clear metadata separately
            $store->wipe('sync_metadata');

            // 2. Insert data from client
            foreach ($input as $collection => $records) {
                if (!in_array($collection, $toWipe)) continue;
                foreach ($records as $record) {
                    $store->upsert($collection, $record);
                }
            }

            // 3. Mark database as initialized
            $store->upsert('sync_metadata', ['key' => 'db_initialized', 'value' => '1']);

            $store->pdo->commit();

            // 4. Remove restore lock
            if (file_exists($restoreLockFile)) {
                unlink($restoreLockFile);
            }

            echo json_encode(["success" => true, "message" => "Restore from client complete."]);

        } catch (Exception $e) {
            $store->pdo->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Restore failed: ' . $e->getMessage()]);
        }

    } elseif ($action === 'backup_db') {
        $dbPath = __DIR__ . '/../data/database.sqlite';
        $backupFile = __DIR__ . '/../data/backup.sql';
        $command = "sqlite3 " . escapeshellarg($dbPath) . " .dump > " . escapeshellarg($backupFile);
        shell_exec($command);

        if (file_exists($backupFile)) {
            header('Content-Description: File Transfer');
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . basename($backupFile) . '"');
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            header('Content-Length: ' . filesize($backupFile));
            readfile($backupFile);
            unlink($backupFile);
            exit;
        } else {
            http_response_code(500);
            echo json_encode(["error" => "Backup failed."]);
        }
    } elseif ($action === 'restore_backup') {
        if (isset($_FILES['backup_file'])) {
            $backupFile = $_FILES['backup_file'];
            if ($backupFile['error'] !== UPLOAD_ERR_OK) {
                http_response_code(500);
                echo json_encode(["error" => "File upload error: " . $backupFile['error']]);
                exit;
            }

            $sql = file_get_contents($backupFile['tmp_name']);
            if ($sql) {
                try {
                    // Wipe all data first
                    $toWipe = [
                        'items', 'transactions', 'users', 'customers', 'suppliers',
                        'shifts', 'expenses', 'returns', 'stock_movements',
                        'adjustments', 'stockins', 'suspended_transactions', 'sync_metadata',
                        'stock_logs', 'settings', 'notifications'
                    ];
                    $store->pdo->beginTransaction();
                    foreach ($toWipe as $col) {
                        $store->wipe($col);
                    }
                    $store->pdo->exec($sql);
                    $store->pdo->commit();
                    echo json_encode(["success" => true, "message" => "Restore complete."]);
                } catch (Exception $e) {
                    $store->pdo->rollBack();
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            } else {
                http_response_code(400);
                echo json_encode(["error" => "Invalid backup file."]);
            }
        } else {
            http_response_code(400);
            echo json_encode(["error" => "No backup file received."]);
        }
    }
}
?>