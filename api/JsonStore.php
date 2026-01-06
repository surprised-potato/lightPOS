<?php
/**
 * Atomic Storage Class for JSON collections.
 * Implements file locking and atomic renames to prevent data corruption.
 */
class JsonStore {
    private $dataDir;
    private $oplogFile;

    public function __construct($dataDir = null) {
        $this->dataDir = $dataDir ?: __DIR__ . '/../data';
        $this->oplogFile = $this->dataDir . '/oplog.jsonl';
        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0777, true);
        }
    }

    public function read($collection) {
        $path = $this->dataDir . '/' . $collection . '.json';
        if (!file_exists($path)) return [];
        
        $fp = fopen($path, 'r');
        if (!$fp) return [];
        
        $content = '';
        if (flock($fp, LOCK_SH)) {
            $content = file_get_contents($path);
            flock($fp, LOCK_UN);
        }
        fclose($fp);
        
        return json_decode($content, true) ?: [];
    }

    public function write($collection, $data) {
        $path = $this->dataDir . '/' . $collection . '.json';
        $tmpPath = $path . '.tmp';
        
        $json = json_encode($data, JSON_PRETTY_PRINT);
        if (file_put_contents($tmpPath, $json) === false) {
            return false;
        }
        
        $success = false;
        $fp = fopen($path, 'c+');
        if ($fp && flock($fp, LOCK_EX)) {
            $success = rename($tmpPath, $path);
            flock($fp, LOCK_UN);
        }
        if ($fp) fclose($fp);
        
        if (!$success && file_exists($tmpPath)) {
            unlink($tmpPath);
        }
        
        return $success;
    }

    public function appendLog($entry) {
        $entry['_server_timestamp'] = time();
        return file_put_contents($this->oplogFile, json_encode($entry) . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}
?>