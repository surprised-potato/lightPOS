<?php
require_once __DIR__ . '/SQLiteStore.php';

class InventoryOptimizer {
    private $pdo;

    // Defaults for EOQ calculation if not in settings
    private $orderingCost = 50.0; // 'S'
    private $holdingCostRate = 0.20; // 'H' (20% of unit cost)
    private $serviceLevelZ = 1.65; // 95% Service Level

    public function __construct($pdo = null) {
        if ($pdo) {
            $this->pdo = $pdo;
        } else {
            $store = new SQLiteStore();
            $this->pdo = $store->pdo;
        }
    }

    /**
     * Main entry point to recalculate metrics for all items.
     */
    public function calculateMetrics() {
        $processed = 0;
        $errors = 0;

        try {
            // 0. Load Global Settings for EOQ parameters
            $stmt = $this->pdo->prepare("SELECT json_body FROM settings WHERE id = 'global'");
            $stmt->execute();
            $settings = json_decode($stmt->fetchColumn() ?: '{}', true);
            
            $this->orderingCost = floatval($settings['procurement']['ordering_cost'] ?? 50.0);
            $this->holdingCostRate = floatval($settings['procurement']['holding_cost_rate'] ?? 20) / 100;

            // 1. Fetch all active items
            $stmt = $this->pdo->prepare("SELECT id, cost_price, supplier_id, selling_price FROM items WHERE _deleted = 0");
            $stmt->execute();
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // 2. Fetch Supplier Configs
            $stmt = $this->pdo->prepare("SELECT * FROM supplier_config WHERE _deleted = 0");
            $stmt->execute();
            $supplierConfigs = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $supplierConfigs[$row['supplier_id']] = $row;
            }

            // 3. Pre-fetch Sales History (Last 180 Days)
            // To avoid N+1 queries, we fetch all relevant transactions and aggregate in PHP
            $lookbackDate = date('Y-m-d', strtotime('-180 days'));
            $stmt = $this->pdo->prepare("SELECT items_json, json_body, timestamp FROM transactions WHERE timestamp >= ? AND _deleted = 0 AND (is_voided = 0 OR is_voided IS NULL)");
            $stmt->execute([$lookbackDate . 'T00:00:00']); // ISO format assumption
            $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Aggregate Sales Data per Item
            $salesData = []; // [itemId => ['dates' => [date => qty], 'total_qty' => 0, 'first_sale' => null]]
            
            foreach ($transactions as $tx) {
                $txDate = substr($tx['timestamp'], 0, 10); // YYYY-MM-DD
                
                $rawItems = $tx['items_json'] ?? null;
                if (empty($rawItems) && !empty($tx['json_body'])) {
                    $body = json_decode($tx['json_body'], true);
                    $rawItems = isset($body['items']) ? json_encode($body['items']) : null;
                }

                $txItems = $rawItems ? json_decode($rawItems, true) : [];
                
                if (is_array($txItems)) {
                    foreach ($txItems as $item) {
                        $id = $item['id'];
                        $qty = (float)($item['qty'] ?? 0);
                        
                        if (!isset($salesData[$id])) {
                            $salesData[$id] = ['dates' => [], 'total_qty' => 0, 'first_sale' => $txDate];
                        }

                        if (!isset($salesData[$id]['dates'][$txDate])) {
                            $salesData[$id]['dates'][$txDate] = 0;
                        }
                        $salesData[$id]['dates'][$txDate] += $qty;
                        $salesData[$id]['total_qty'] += $qty;

                        if ($txDate < $salesData[$id]['first_sale']) {
                            $salesData[$id]['first_sale'] = $txDate;
                        }
                    }
                }
            }

            // 4. Calculate Individual Metrics (Velocity, XYZ, Annual Usage)
            $itemMetrics = [];
            $totalAnnualValue = 0;

            foreach ($items as $item) {
                $id = $item['id'];
                $data = $salesData[$id] ?? ['dates' => [], 'total_qty' => 0, 'first_sale' => null];
                
                // Dynamic Lookback
                $firstSale = $data['first_sale'] ?? date('Y-m-d');
                $daysSinceFirstSale = (time() - strtotime($firstSale)) / (60 * 60 * 24);
                $effectiveDays = max(1, min(180, ceil($daysSinceFirstSale)));
                
                $velocity = $data['total_qty'] / $effectiveDays;
                $annualDemand = $velocity * 365;
                $annualUsageValue = $annualDemand * ($item['cost_price'] ?: 0);
                $totalAnnualValue += $annualUsageValue;

                // XYZ Analysis (Coefficient of Variation)
                $stdDev = 0;
                $cv = 0;
                if ($effectiveDays > 0 && count($data['dates']) > 0) {
                    // Calculate variance of daily sales (including zero days in the window?)
                    // Simplified: Standard Deviation of the days with sales, or over the whole period?
                    // Specs say: std_dev_sales. Usually calculated over the period.
                    // For simplicity and performance, we'll calculate based on the active sales days vs average.
                    // A more accurate approach fills 0s for non-sale days, but let's stick to the provided data points for now 
                    // or better: Variance = Sum((DailySales - Mean)^2) / N
                    
                    $sumSquaredDiff = 0;
                    // We need to account for 0 sales days to get true volatility
                    // But iterating 180 days is expensive. 
                    // Shortcut: Sum(x^2) - (Sum(x)^2 / N)
                    $sumX = $data['total_qty'];
                    $sumX2 = 0;
                    foreach ($data['dates'] as $qty) {
                        $sumX2 += ($qty * $qty);
                    }
                    // Add 0s for days without sales
                    // sumX2 remains same. N = effectiveDays.
                    
                    $variance = ($sumX2 - ($sumX * $sumX / $effectiveDays)) / $effectiveDays;
                    $stdDev = sqrt(max(0, $variance));
                    
                    if ($velocity > 0) {
                        $cv = $stdDev / $velocity;
                    }
                }

                $xyz = 'Z';
                if ($cv < 0.2) $xyz = 'X';
                elseif ($cv <= 0.5) $xyz = 'Y';

                $itemMetrics[] = [
                    'item' => $item,
                    'velocity' => $velocity,
                    'std_dev' => $stdDev,
                    'cv' => $cv,
                    'xyz' => $xyz,
                    'annual_usage_value' => $annualUsageValue,
                    'first_sale' => $firstSale
                ];
            }

            // 5. ABC Analysis (Sort by Value)
            usort($itemMetrics, function($a, $b) {
                return $b['annual_usage_value'] <=> $a['annual_usage_value'];
            });

            $runningValue = 0;
            $this->pdo->beginTransaction();

            foreach ($itemMetrics as $m) {
                $previousCumulative = ($totalAnnualValue > 0) ? ($runningValue / $totalAnnualValue) : 0.0;
                $runningValue += $m['annual_usage_value'];

                $abc = 'C';
                if ($previousCumulative < 0.80) $abc = 'A';
                elseif ($previousCumulative < 0.95) $abc = 'B';

                // 6. Calculate EOQ & ROP
                $supplierId = $m['item']['supplier_id'];
                $config = $supplierConfigs[$supplierId] ?? ['lead_time_days' => 3, 'delivery_cadence' => 'weekly'];
                
                $leadTime = $config['lead_time_days'] ?: 3;
                $cadenceMap = ['weekly' => 7, 'biweekly' => 14, 'monthly' => 30, 'on_order' => 0];
                $reviewPeriod = $cadenceMap[$config['delivery_cadence'] ?? 'weekly'] ?? 7;

                // Safety Stock = Z * StdDev * Sqrt(LeadTime + ReviewPeriod)
                $riskPeriod = $leadTime + $reviewPeriod;
                $safetyStock = ceil($this->serviceLevelZ * $m['std_dev'] * sqrt($riskPeriod));

                // ROP
                $rop = ceil(($m['velocity'] * $riskPeriod) + $safetyStock);

                // EOQ
                $eoq = 0;
                if ($m['item']['cost_price'] > 0) {
                    $annualDemand = $m['velocity'] * 365;
                    $holdingCost = $m['item']['cost_price'] * $this->holdingCostRate;
                    $eoq = sqrt((2 * $annualDemand * $this->orderingCost) / $holdingCost);
                }
                $eoq = ceil($eoq);

                // 7. Save to DB
                $stmt = $this->pdo->prepare("INSERT OR REPLACE INTO inventory_metrics 
                    (sku_id, first_sale_date, abc_class, xyz_class, cv_value, daily_velocity, std_dev_sales, eoq_qty, rop_trigger, safety_stock, last_recalc, _version, _updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)");
                
                $stmt->execute([
                    $m['item']['id'],
                    $m['first_sale'],
                    $abc,
                    $m['xyz'],
                    $m['cv'],
                    $m['velocity'],
                    $m['std_dev'],
                    $eoq,
                    $rop,
                    $safetyStock,
                    date('c'),
                    round(microtime(true) * 1000)
                ]);
                $processed++;
            }

            $this->pdo->commit();

        return [
            'success' => true,
            'items_processed' => $processed,
            'metrics_updated' => $processed
        ];
        } catch (Exception $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
}
        