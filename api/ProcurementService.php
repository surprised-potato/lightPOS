<?php
require_once __DIR__ . '/SQLiteStore.php';

class ProcurementService {
    private $pdo;

    public function __construct($pdo = null) {
        if ($pdo) {
            $this->pdo = $pdo;
        } else {
            $store = new SQLiteStore();
            $this->pdo = $store->pdo;
        }
    }

    public function calculateOtb($supplierId) {
        // 1. Get Global Settings for K-Factor
        $stmt = $this->pdo->prepare("SELECT json_body FROM settings WHERE id = 'global'");
        $stmt->execute();
        $settings = json_decode($stmt->fetchColumn() ?: '{}', true);
        $kFactorSetting = $settings['procurement']['k_factor'] ?? 110;
        if ($kFactorSetting < 100) $kFactorSetting = 100; // Enforce min 100%
        $multiplier = $kFactorSetting / 100;

        // 2. Get Supplier Config
        $stmt = $this->pdo->prepare("SELECT * FROM supplier_config WHERE supplier_id = ? AND _deleted = 0");
        $stmt->execute([$supplierId]);
        $config = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $cadenceMap = ['weekly' => 7, 'biweekly' => 14, 'monthly' => 30, 'on_order' => 7];
        $cadenceDays = $cadenceMap[$config['delivery_cadence'] ?? 'weekly'] ?? 7;

        // 3. Get Items and Metrics
        $sql = "
            SELECT i.id, i.stock_level, i.cost_price,
                   m.daily_velocity, m.safety_stock
            FROM items i
            LEFT JOIN inventory_metrics m ON i.id = m.sku_id
            WHERE i.supplier_id = ? AND i._deleted = 0
        ";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$supplierId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalOtb = 0;
        foreach ($items as $item) {
            $velocity = $item['daily_velocity'] ?? 0;
            $safetyStock = $item['safety_stock'] ?? 0;
            $currentStock = max(0, $item['stock_level'] ?? 0);
            $cost = $item['cost_price'] ?? 0;

            // OTB = (Velocity * Cadence * K) + Ending(Safety) - Beginning(Current)
            $projectedSales = $velocity * $cadenceDays * $multiplier;
            $requiredQty = $projectedSales + $safetyStock - $currentStock;
            
            if ($requiredQty > 0) {
                $totalOtb += ($requiredQty * $cost);
            }
        }

        // 4. Update Supplier Config
        $now = round(microtime(true) * 1000);
        if ($config) {
            $stmt = $this->pdo->prepare("UPDATE supplier_config SET monthly_otb = ?, _updatedAt = ?, _version = _version + 1 WHERE supplier_id = ?");
            $stmt->execute([$totalOtb, $now, $supplierId]);
        } else {
            $stmt = $this->pdo->prepare("INSERT INTO supplier_config (supplier_id, monthly_otb, delivery_cadence, lead_time_days, _version, _updatedAt, _deleted) VALUES (?, ?, 'weekly', 3, 1, ?, 0)");
            $stmt->execute([$supplierId, $totalOtb, $now]);
        }

        return ['supplier_id' => $supplierId, 'new_otb' => $totalOtb];
    }

    public function getSuggestedOrder($supplierId) {
        // 1. Get Supplier Config
        $stmt = $this->pdo->prepare("SELECT * FROM supplier_config WHERE supplier_id = ? AND _deleted = 0");
        $stmt->execute([$supplierId]);
        $config = $stmt->fetch(PDO::FETCH_ASSOC);

        // Calculate Available Budget (OTB)
        // If config is missing, we assume no specific budget limit (infinite), 
        // but for the sake of the algorithm, we'll treat it as 0 if not set, or handle logic below.
        // However, if config exists, we strictly enforce it.
        $budget = ($config['monthly_otb'] ?? 0) - ($config['current_spend'] ?? 0);
        $hasBudgetLimit = !empty($config);

        // 2. Calculate On Order per Item (from open POs)
        $onOrderMap = [];
        $stmt = $this->pdo->prepare("SELECT items_json FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('received', 'cancelled') AND _deleted = 0");
        $stmt->execute([$supplierId]);
        $openPos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($openPos as $po) {
            $items = json_decode($po['items_json'], true);
            if (is_array($items)) {
                foreach ($items as $poItem) {
                    $id = $poItem['item_id'] ?? $poItem['id'];
                    $qty = $poItem['qty'] ?? 0;
                    if (!isset($onOrderMap[$id])) $onOrderMap[$id] = 0;
                    $onOrderMap[$id] += $qty;
                }
            }
        }

        // 3. Fetch Candidates (Stock <= ROP)
        $sql = "
            SELECT i.id, i.cost_price, i.stock_level, i.name,
                   m.abc_class, m.rop_trigger, m.eoq_qty
            FROM items i
            LEFT JOIN inventory_metrics m ON i.id = m.sku_id
            WHERE i.supplier_id = ? AND i._deleted = 0
        ";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$supplierId]);
        $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $suggestedItems = [];

        foreach ($candidates as $item) {
            $id = $item['id'];
            $stock = $item['stock_level'] ?? 0;
            $onOrder = $onOrderMap[$id] ?? 0;
            $rop = $item['rop_trigger'] ?? 0;
            
            // Trigger Logic: (Current + OnOrder) <= ROP
            if (($stock + $onOrder) <= $rop) {
                $qty = $item['eoq_qty'] ?? 0;
                if ($qty <= 0) $qty = 1; // Minimum order 1 if triggered

                $cost = $item['cost_price'] ?? 0;
                $lineTotal = $qty * $cost;
                
                $suggestedItems[] = [
                    'item_id' => $id,
                    'name' => $item['name'] ?? 'Unknown',
                    'qty' => $qty,
                    'cost' => $cost,
                    'total' => $lineTotal,
                    'abc' => $item['abc_class'] ?? 'C'
                ];
            }
        }

        // 4. OTB Optimization (The Triple Filter)
        // Sort Priority: A -> B -> C
        usort($suggestedItems, function($a, $b) {
            $priority = ['A' => 1, 'B' => 2, 'C' => 3];
            $pa = $priority[$a['abc']] ?? 3;
            $pb = $priority[$b['abc']] ?? 3;
            return $pa <=> $pb;
        });

        $finalItems = [];
        $currentTotal = 0;

        foreach ($suggestedItems as $item) {
            $isCritical = ($item['abc'] === 'A');
            
            // Priority 1: Keep Class A items at 100% (even if over budget, usually)
            // But if we strictly follow "If Total > OTB", we might need to check.
            // For now, we assume A is critical.
            if ($isCritical) {
                $finalItems[] = $item;
                $currentTotal += $item['total'];
            } else {
                // For B and C, check budget
                if (!$hasBudgetLimit || ($currentTotal + $item['total']) <= $budget) {
                    $finalItems[] = $item;
                    $currentTotal += $item['total'];
                } else {
                    // Priority 2: Reduce Class B to fit
                    if ($item['abc'] === 'B' && $hasBudgetLimit) {
                        $remaining = $budget - $currentTotal;
                        if ($remaining > 0 && $item['cost'] > 0) {
                            $canBuy = floor($remaining / $item['cost']);
                            if ($canBuy > 0) {
                                $item['qty'] = $canBuy;
                                $item['total'] = $canBuy * $item['cost'];
                                $finalItems[] = $item;
                                $currentTotal += $item['total'];
                            }
                        }
                    }
                    // Priority 3: Remove Class C (do nothing, effectively dropped)
                }
            }
        }

        return [
            'supplier_id' => $supplierId,
            'items' => $finalItems,
            'total_estimated' => $currentTotal,
            'budget_limit' => $hasBudgetLimit ? $budget : 'unlimited'
        ];
    }

    public function createPurchaseOrder($data) {
        $id = $this->generateUUID();
        $supplierId = $data['supplier_id'];
        $status = $data['status'] ?? 'draft';
        $items = $data['items'] ?? [];
        $itemsJson = json_encode($items);
        
        $total = 0;
        foreach ($items as $i) {
            $total += ($i['qty'] * $i['cost']);
        }

        $now = date('c');
        $version = 1;
        $updatedAt = round(microtime(true) * 1000);

        $stmt = $this->pdo->prepare("INSERT INTO purchase_orders 
            (id, supplier_id, status, items_json, total_amount, created_at, _version, _updatedAt, _deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)");
        
        $stmt->execute([$id, $supplierId, $status, $itemsJson, $total, $now, $version, $updatedAt]);

        return $id;
    }

    public function processRealtimeTriggers($transactions) {
        $generatedPOs = [];
        $supplierItems = []; // supplier_id => [item_id => qty]

        // 1. Aggregate items from transactions
        foreach ($transactions as $tx) {
            $items = [];
            if (isset($tx['items_json'])) {
                $items = json_decode($tx['items_json'], true);
            } elseif (isset($tx['json_body'])) {
                $body = json_decode($tx['json_body'], true);
                if (isset($body['items'])) $items = $body['items'];
            }

            if (is_array($items)) {
                foreach ($items as $item) {
                    $id = $item['id'] ?? $item['item_id'];
                    $qty = $item['qty'] ?? 0;
                    if ($qty > 0) {
                        $stmt = $this->pdo->prepare("SELECT supplier_id, cost_price, name FROM items WHERE id = ?");
                        $stmt->execute([$id]);
                        $itemData = $stmt->fetch(PDO::FETCH_ASSOC);
                        
                        if ($itemData && $itemData['supplier_id']) {
                            $supId = $itemData['supplier_id'];
                            if (!isset($supplierItems[$supId])) {
                                $supplierItems[$supId] = [];
                            }
                            if (!isset($supplierItems[$supId][$id])) {
                                $supplierItems[$supId][$id] = [
                                    'qty' => 0, 
                                    'cost' => $itemData['cost_price'],
                                    'name' => $itemData['name']
                                ];
                            }
                            $supplierItems[$supId][$id]['qty'] += $qty;
                        }
                    }
                }
            }
        }

        // 2. Check Supplier Config and Generate POs
        foreach ($supplierItems as $supId => $items) {
            $stmt = $this->pdo->prepare("SELECT delivery_cadence FROM supplier_config WHERE supplier_id = ?");
            $stmt->execute([$supId]);
            $config = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($config && $config['delivery_cadence'] === 'on_order') {
                // Check for existing draft PO
                $stmt = $this->pdo->prepare("SELECT id, items_json FROM purchase_orders WHERE supplier_id = ? AND status = 'draft' AND _deleted = 0 LIMIT 1");
                $stmt->execute([$supId]);
                $existingPO = $stmt->fetch(PDO::FETCH_ASSOC);

                $poItems = $existingPO ? (json_decode($existingPO['items_json'], true) ?: []) : [];

                foreach ($items as $itemId => $data) {
                    $found = false;
                    foreach ($poItems as &$pi) {
                        if (($pi['item_id'] ?? $pi['id']) === $itemId) {
                            $pi['qty'] += $data['qty'];
                            $pi['total'] = $pi['qty'] * $pi['cost'];
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $poItems[] = [
                            'item_id' => $itemId,
                            'name' => $data['name'],
                            'qty' => $data['qty'],
                            'cost' => $data['cost'],
                            'total' => $data['qty'] * $data['cost'],
                            'abc' => 'N/A'
                        ];
                    }
                }

                $totalAmount = array_reduce($poItems, fn($sum, $i) => $sum + ($i['total'] ?? 0), 0);
                $itemsJson = json_encode($poItems);
                $now = round(microtime(true) * 1000);

                if ($existingPO) {
                    $stmt = $this->pdo->prepare("UPDATE purchase_orders SET items_json = ?, total_amount = ?, _updatedAt = ?, _version = _version + 1 WHERE id = ?");
                    $stmt->execute([$itemsJson, $totalAmount, $now, $existingPO['id']]);
                    $generatedPOs[] = $existingPO['id'];
                } else {
                    $newId = $this->generateUUID();
                    $stmt = $this->pdo->prepare("INSERT INTO purchase_orders (id, supplier_id, status, items_json, total_amount, created_at, _version, _updatedAt, _deleted) VALUES (?, ?, 'draft', ?, ?, ?, 1, ?, 0)");
                    $stmt->execute([$newId, $supId, $itemsJson, $totalAmount, date('c'), $now]);
                    $generatedPOs[] = $newId;
                }
            }
        }

        return $generatedPOs;
    }

    private function generateUUID() {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
?>