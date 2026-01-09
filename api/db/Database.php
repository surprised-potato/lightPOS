<?php

class Database {
    private static $instance = null;
    private $pdo;

    private function __construct() {
        $dbPath = __DIR__ . '/../../data/database.sqlite';
        
        try {
            $this->pdo = new PDO('sqlite:' . $dbPath);
            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->pdo->exec('PRAGMA journal_mode=WAL;');
        } catch (PDOException $e) {
            // Handle connection error
            die("Database connection failed: " . $e->getMessage());
        }
    }

    public static function getInstance() {
        if (self::$instance == null) {
            self::$instance = new Database();
        }
        return self::$instance;
    }

    public function getConnection() {
        return $this->pdo;
    }
}
