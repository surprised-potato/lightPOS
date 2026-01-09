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

// --- START Schema Initialization Logic ---
function ensureSchema($pdo) {
    // Enable WAL mode for better concurrency
    $pdo->exec("PRAGMA journal_mode=WAL;");
    $pdo->exec("PRAGMA busy_timeout = 5000;");

    // Check if the 'settings' table exists
    $stmt = $pdo->prepare("PRAGMA table_info(settings)");
    $stmt->execute();
    $tableInfo = $stmt->fetchAll();

    if (empty($tableInfo)) {
        // If 'settings' table does not exist, execute the full schema
        $schemaSql = file_get_contents(__DIR__ . '/../schema.sql');
        if ($schemaSql === false) {
            error_log("Error: Could not read schema.sql file.");
            // Depending on desired behavior, you might want to throw an exception or die here
            return; 
        }
        $pdo->exec($schemaSql);
        error_log("SQLite database schema initialized successfully.");
    }

    // Check if 'inventory_metrics' (PO module) exists
    $stmt1 = $pdo->prepare("PRAGMA table_info(inventory_metrics)");
    $stmt1->execute();
    $stmt2 = $pdo->prepare("PRAGMA table_info(purchase_orders)");
    $stmt2->execute();
    if (empty($stmt1->fetchAll()) || empty($stmt2->fetchAll())) {
        $schemaPo = file_get_contents(__DIR__ . '/schema_po.sql');
        if ($schemaPo) {
            $pdo->exec($schemaPo);
            error_log("PO Module schema initialized successfully.");
        }
    }

    // V1.1 Migration: Add is_active to users table
    $userCols = $pdo->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('is_active', $userCols)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
        error_log("DB Migration: Added is_active column to users table.");
    }

    // Fix for missing permissions_json and password_hash
    if (!in_array('permissions_json', $userCols)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN permissions_json TEXT");
        error_log("DB Migration: Added permissions_json column to users table.");
    }
    if (!in_array('password_hash', $userCols)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
        error_log("DB Migration: Added password_hash column to users table.");
    }

    // Auto-repair Admin if password_hash is missing
    $pdo->exec("UPDATE users SET password_hash = '" . md5('admin123') . "' WHERE email = 'admin@lightpos.com' AND (password_hash IS NULL OR password_hash = '')");

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
        error_log("Seeded default admin user via router.php");
    }
}
// --- END Schema Initialization Logic ---

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$store = new SQLiteStore();
// Call the schema check after the store is initialized and PDO is available
ensureSchema($store->pdo);
$allowedFiles = ['items', 'users', 'suppliers', 'customers', 'transactions', 'shifts', 'expenses', 'stock_in_history', 'stockins', 'adjustments', 'suspended_transactions', 'returns', 'sync_metadata', 'last_sync', 'stock_movements', 'valuation_history', 'stock_logs', 'notifications', 'settings', 'inventory_metrics', 'supplier_config', 'purchase_orders'];

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
        $data = $store->getAll($file);
        // Decode permissions_json for the frontend
        if ($file === 'users') {
            foreach ($data as &$row) {
                if (isset($row['permissions_json']) && is_string($row['permissions_json'])) {
                    $row['permissions'] = json_decode($row['permissions_json'], true);
                }
            }
        }
        echo json_encode($data);
    } elseif ($action === 'debug_data') { // Temporary debug endpoint
        $usersData = $store->getAll('users');
        $settingsData = $store->getAll('settings');
        echo json_encode(["users" => $usersData, "settings" => $settingsData]);
    } elseif ($action === 'fix_admin') {
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
        echo json_encode(["success" => true, "message" => "Admin user reset to default (admin@lightpos.com / admin123) with full permissions."]);
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
            // Helper to process records before insertion
            $processRecord = function(&$record) use ($file) {
                // Auto-hash passwords for users if they look like plain text (legacy migration)
                if ($file === 'users' && isset($record['password_hash'])) {
                    // MD5 hex is 32 chars. If length differs, or it contains non-hex chars, assume plain text.
                    if (strlen($record['password_hash']) !== 32 || !ctype_xdigit($record['password_hash'])) {
                        $record['password_hash'] = md5($record['password_hash']);
                    }
                }
            };

            if ($mode === 'append') {
                $currentData = $store->getAll($file);
                if (is_array($input)) {
                    foreach($input as $record) {
                        $processRecord($record);
                        $store->upsert($file, $record);
                    }
                }
            } else {
                $store->wipe($file);
                foreach($input as $record) {
                    $processRecord($record);
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
                if (isset($foundUser['permissions_json']) && is_string($foundUser['permissions_json'])) {
                    $foundUser['permissions'] = json_decode($foundUser['permissions_json'], true);
                }
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

            $store->pdo->commit();
            echo json_encode(['status' => 'success', 'message' => 'System fully reset to factory defaults.']);
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