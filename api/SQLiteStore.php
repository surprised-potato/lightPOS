<?php

require_once __DIR__ . '/db/Database.php';

class SQLiteStore {
    public $pdo;
    private $collections;
    private $schemaCache = [];

    public function __construct() {
        $this->pdo = Database::getInstance()->getConnection();
        // Enable WAL mode for better concurrency and set timeout for locks
        $this->pdo->exec("PRAGMA journal_mode=WAL;");
        $this->pdo->exec("PRAGMA busy_timeout = 5000;");
        // Enable emulated prepares to handle parameter reuse and older drivers better
        $this->pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);
        error_log("SQLiteStore initialized with ATTR_EMULATE_PREPARES=true");
        $this->collections = [
            'items', 'transactions', 'users', 'customers', 'suppliers',
            'shifts', 'expenses', 'returns', 'stock_movements',
            'adjustments', 'stockins', 'suspended_transactions', 'sync_metadata',
            'stock_logs', 'settings', 'notifications',
            'purchase_orders', 'supplier_config', 'inventory_metrics'
        ];
    }

    private function getTableColumns($collection) {
        if (isset($this->schemaCache[$collection])) {
            return $this->schemaCache[$collection];
        }

        $stmt = $this->pdo->prepare("PRAGMA table_info($collection)");
        $stmt->execute();
        $columns = $stmt->fetchAll(PDO::FETCH_COLUMN, 1);
        $this->schemaCache[$collection] = $columns;
        return $columns;
    }

    public function getAll($collection) {
        if (!in_array($collection, $this->collections)) {
            throw new Exception("Unknown collection: $collection");
        }
        $stmt = $this->pdo->prepare("SELECT * FROM $collection WHERE _deleted = 0");
        $stmt->execute();
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_map([$this, 'hydrate'], $results);
    }

    public function getChanges($collection, $since) {
        if (!in_array($collection, $this->collections)) {
            throw new Exception("Unknown collection: $collection");
        }
        $stmt = $this->pdo->prepare("SELECT * FROM $collection WHERE _updatedAt > ?");
        $stmt->execute([$since]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_map([$this, 'hydrate'], $results);
    }

    public function upsert($collection, $record) {
        if (!in_array($collection, $this->collections)) {
            throw new Exception("Unknown collection: $collection");
        }

        $tableColumns = $this->getTableColumns($collection);
        $jsonColumn = in_array('full_data', $tableColumns) ? 'full_data' : (in_array('json_body', $tableColumns) ? 'json_body' : null);

        $dbRecord = [];
        $jsonData = [];

        // Special handling for nested JSON objects from old format
        if (isset($record['items']) && is_array($record['items'])) {
            $record['items_json'] = json_encode($record['items']);
            unset($record['items']);
        }
        if (isset($record['permissions']) && is_array($record['permissions'])) {
            $record['permissions_json'] = json_encode($record['permissions']);
            unset($record['permissions']);
        }

        // Hotfix for sync_metadata value being an array
        if ($collection === 'sync_metadata' && isset($record['value']) && is_array($record['value'])) {
            $record['value'] = json_encode($record['value']);
        }

        foreach ($record as $key => $value) {
            if (in_array($key, $tableColumns)) {
                $dbRecord[$key] = $value;
            } else {
                if (strpos($key, '_') !== 0) {
                    $jsonData[$key] = $value;
                }
            }
        }

        if ($jsonColumn && !empty($jsonData)) {
            $dbRecord[$jsonColumn] = json_encode($jsonData);
        }

        $dbRecord['_updatedAt'] = round(microtime(true) * 1000);
        if ($collection !== 'sync_metadata') {
            if (!isset($dbRecord['_version'])) {
                $dbRecord['_version'] = 1;
            }
            // Force _deleted to be a boolean 0 or 1 to prevent bad data from sync
            if (isset($dbRecord['_deleted'])) {
                $dbRecord['_deleted'] = $dbRecord['_deleted'] ? 1 : 0;
            } else {
                $dbRecord['_deleted'] = 0;
            }
        }

        $idColumn = 'id';
        if ($collection === 'users') {
            $idColumn = 'email';
        } elseif ($collection === 'sync_metadata') {
            $idColumn = 'key';
        } elseif ($collection === 'supplier_config') {
            $idColumn = 'supplier_id';
        } elseif ($collection === 'inventory_metrics') {
            $idColumn = 'sku_id';
        }

        if (empty($dbRecord[$idColumn])) {
            // The original JSON record might have the key, even if it's not a DB column (e.g. 'id' for sync_metadata)
            if (isset($record[$idColumn])) {
                $dbRecord[$idColumn] = $record[$idColumn];
            } else {
                throw new Exception("Record for collection '$collection' is missing required ID field '$idColumn'");
            }
        }

        $columns = array_keys($dbRecord);
        $placeholders = array_map(fn($c) => ":$c", $columns);
        
        // Use excluded.column syntax to avoid PDO parameter duplication errors
        // Filter out the ID column from the update set to avoid redundant updates
        $updateColumns = array_filter($columns, fn($c) => $c !== $idColumn);
        $updateSet = array_map(fn($c) => "$c = excluded.$c", $updateColumns);
        
        $conflictAction = empty($updateSet) ? "DO NOTHING" : "DO UPDATE SET " . implode(', ', $updateSet);

        $sql = "INSERT INTO $collection (" . implode(', ', $columns) . ") 
                VALUES (" . implode(', ', $placeholders) . ")
                ON CONFLICT($idColumn) $conflictAction";

        error_log("SQLiteStore::upsert SQL: $sql");
        error_log("SQLiteStore::upsert Params: " . json_encode($dbRecord));

        $stmt = $this->pdo->prepare($sql);
        $this->executeWithRetry($stmt, $dbRecord);
    }

    public function delete($collection, $id) {
        if (!in_array($collection, $this->collections)) {
            throw new Exception("Unknown collection: $collection");
        }
        
        $idColumn = 'id';
        if ($collection === 'users') {
            $idColumn = 'email';
        } elseif ($collection === 'sync_metadata') {
            $idColumn = 'key';
        } elseif ($collection === 'supplier_config') {
            $idColumn = 'supplier_id';
        } elseif ($collection === 'inventory_metrics') {
            $idColumn = 'sku_id';
        }
        
        $stmt = $this->pdo->prepare("UPDATE $collection SET _deleted = 1, _updatedAt = ?, _version = COALESCE(_version, 0) + 1 WHERE $idColumn = ?");
        $this->executeWithRetry($stmt, [round(microtime(true) * 1000), $id]);
    }

    public function wipe($collection) {
        if (!in_array($collection, $this->collections)) {
            throw new Exception("Unknown collection: $collection");
        }
        $stmt = $this->pdo->prepare("DELETE FROM $collection");
        $this->executeWithRetry($stmt);
    }

    private function executeWithRetry($stmt, $params = []) {
        $retries = 0;
        while (true) {
            try {
                $stmt->execute($params);
                return;
            } catch (PDOException $e) {
                // Check for "database is locked" error (SQLSTATE HY000, Error 5)
                if (strpos($e->getMessage(), 'database is locked') !== false && $retries < 5) {
                    $retries++;
                    usleep(500000); // Wait 500ms
                    continue;
                }
                // Enhance error message with SQL and Params for debugging
                $debugMsg = $e->getMessage() . " | SQL: " . $stmt->queryString . " | Params: " . json_encode($params);
                throw new Exception($debugMsg, (int)$e->getCode(), $e);
            }
        }
    }

    public function beginTransaction() {
        $retries = 0;
        while (true) {
            try {
                return $this->pdo->beginTransaction();
            } catch (PDOException $e) {
                if (strpos($e->getMessage(), 'database is locked') !== false && $retries < 5) {
                    $retries++;
                    usleep(500000);
                    continue;
                }
                throw $e;
            }
        }
    }

    public function commit() {
        return $this->pdo->commit();
    }

    public function rollBack() {
        return $this->pdo->rollBack();
    }

    public function inTransaction() {
        return $this->pdo->inTransaction();
    }

    private function hydrate($row) {
        $jsonKeysToRemove = [];
        $dataToMerge = [];

        foreach ($row as $key => $value) {
            if (is_string($value) && (str_ends_with($key, '_json') || $key === 'full_data' || $key === 'json_body')) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    if (str_ends_with($key, '_json')) {
                        $newKey = substr($key, 0, -5); // e.g., 'items_json' -> 'items'
                        $row[$newKey] = $decoded;
                    } else {
                        // For 'full_data' or 'json_body', prepare to merge
                        if (is_array($decoded)) {
                            $dataToMerge = array_merge($dataToMerge, $decoded);
                        }
                    }
                }
                $jsonKeysToRemove[] = $key;
            }
        }

        // Merge data from json_body/full_data, but do not overwrite existing top-level columns
        foreach ($dataToMerge as $key => $value) {
            if (!isset($row[$key])) {
                $row[$key] = $value;
            }
        }

        // Remove the original JSON string columns
        foreach ($jsonKeysToRemove as $key) {
            unset($row[$key]);
        }

        return $row;
    }
}
