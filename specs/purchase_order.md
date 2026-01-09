# Purchase Order Process & Procurement Engine

This document outlines the end-to-step process of the Purchase Order (PO) module in LightPOS, detailing the algorithms, abstractions, and configuration modes that drive inventory optimization.

## 1. The Procurement Engine

The core of the PO module is the **Procurement Engine**, which runs client-side (in `purchase_orders.js`) to generate real-time restocking suggestions based on sales velocity and inventory metrics.

### A. Velocity Calculation
*   **Live Velocity**: Calculated by analyzing transaction history over a lookback window (default 180 days).
*   **Formula**: `Total Qty Sold / Effective Days`
*   **Effective Days**: The number of days the item has been selling (capped at the lookback window). This ensures new items don't have artificially low velocity.

### B. Item Classification (ABC/XYZ)
Items are automatically classified to determine their priority during budgeting (OTB).
*   **ABC Class** (Value): Based on Annual Usage Value (`Velocity * 365 * Cost`).
    *   **A**: Top 80% of value (High Priority).
    *   **B**: Next 15% of value (Medium Priority).
    *   **C**: Bottom 5% of value (Low Priority).
*   **XYZ Class** (Volatility): Based on the Coefficient of Variation (CV) of daily sales.
    *   **X**: Stable demand (CV < 0.2).
    *   **Y**: Variable demand (0.2 <= CV <= 0.5).
    *   **Z**: Erratic demand (CV > 0.5).

### C. Key Formulas
1.  **EOQ (Economic Order Quantity)**: The theoretical optimal order size to minimize total inventory costs.
    *   `sqrt((2 * AnnualDemand * OrderingCost) / HoldingCost)`
2.  **Safety Stock**: Buffer stock to prevent stockouts during lead time.
    *   `ServiceLevelZ * StdDev * sqrt(LeadTime + ReviewPeriod)`
3.  **ROP (Reorder Point)**: The stock level that triggers a reorder suggestion.
    *   `(Velocity * LeadTime) + SafetyStock`
    *   *Abstraction*: If a manual `min_stock` is set on the item, `ROP = max(CalculatedROP, min_stock)`.
4.  **Target Level (Order-Up-To)**: The maximum stock level we aim to hold.
    *   If `max_stock` is set on the item: `TargetLevel = max_stock`.
    *   Otherwise: `TargetLevel = Velocity * CadenceDays`.
5.  **Net Requirement**:
    *   `TargetLevel - CurrentStock`.
6.  **Suggested Quantity**:
    *   `Math.ceil(NetRequirement)` (if positive).

---

## 2. Settings & Modes

The behavior of the engine is controlled by Global Settings (`settings.js`) under the **Procurement** tab.

### A. OTB Calculation Mode (`otb_mode`)
Determines how the "Open-To-Buy" (Budget) requirement is calculated for an item.
*   **Standard (Audit Based)**:
    *   `Requirement = (Planned Sales + Safety Stock) - Current Stock`.
    *   This mode accounts for existing inventory. If you are overstocked, it suggests 0.
*   **Replenishment (Sales Based)**:
    *   `Requirement = Planned Sales`.
    *   This mode ignores current stock levels and simply replaces what is expected to be sold. Useful for "Just-in-Time" or perishable goods.

### B. K-Factor (`k_factor`)
*   **Definition**: A multiplier applied to the sales projection to account for growth or seasonality.
*   **Default**: `110%` (1.1x).
*   **Usage**: `Planned Sales = Velocity * Cadence * K-Factor`.

### C. Service Level (`service_level`)
*   **Definition**: The target probability of *not* stocking out during a replenishment cycle.
*   **Values**:
    *   `1.28` (90%) - Low Safety Stock.
    *   `1.65` (95%) - Standard Retail.
    *   `2.33` (99%) - High Availability (Requires significantly more stock).

### D. Cost Parameters
*   **Ordering Cost (S)**: Fixed cost to place a single order (shipping, admin time). Used for EOQ.
*   **Holding Cost Rate (H)**: Annual cost to hold inventory as a percentage of unit cost (e.g., 20%). Used for EOQ.

### E. Young Store Mode (Assumed Stock)
*   **Purpose**: To prevent over-ordering in new stores where initial inventory might not be fully entered or is inaccurate (negative/zero stock).
*   **Condition**: Active if `assumed_stock_new_store` is enabled AND the oldest sales transaction is < 30 days old.
*   **Logic**: If an item's stock is <= 0:
    *   `CurrentStock = 0.5 * Velocity * CadenceDays` (Assumes half a cycle of stock exists).
    *   Otherwise, uses system stock.

---

## 3. Supplier Configuration

Each supplier has specific settings that dictate the rhythm of orders.

*   **Delivery Cadence**: How often we order/receive from this supplier.
    *   `Weekly` (7 days), `Biweekly` (14 days), `Monthly` (30 days).
    *   `Every 2 Days` (2 days), `Twice a Week` (3.5 days).
    *   `On Order`: Triggered manually or by low stock alerts (0 days review period).
*   **Lead Time**: Days between placing an order and receiving goods.
*   **OTB Budget**: A hard cap on the monetary value of a PO for this supplier.

---

## 4. The PO Lifecycle

### Step 1: Suggestion & Filtering (The "Triple Filter")
When creating a PO, the system aggregates all item requirements for a supplier. If the total value exceeds the Supplier's **OTB Budget**, the **Triple Filter** logic is applied:
1.  **Priority 1 (Class A)**: High-value items are prioritized. If Class A items alone exceed the budget, they are scaled down proportionally to fit.
2.  **Priority 2 (Class B)**: If budget remains after Class A, Class B items are added. If they exceed the remaining budget, they are scaled down.
3.  **Priority 3 (Class C)**: Low-value items are dropped completely if the budget is constrained.

### Step 2: Demand Roll-up (Parent/Child Abstraction)
*   **Scenario**: You sell single "Cans" (Child) but order "Cases" (Parent).
*   **Logic**: The engine calculates the deficit for the Child item (e.g., need 10 cans). It checks for a `parent_id`.
*   **Action**: The deficit is converted using `conv_factor` and added to the Parent item's requirement. The Child item's suggestion is set to 0 to prevent double ordering.

### Step 3: Draft Creation
*   A `draft` PO is created in the local database (`purchase_orders` table).
*   Users can manually edit quantities or add items not suggested by the engine.

### Step 4: Approval
*   Status changes to `approved`.
*   The PO is now locked for editing and ready for receiving.

### Step 5: Receiving
*   User opens the "Receive Stock" modal.
*   **Discrepancy Handling**: User enters actual received quantities. If `Received < Ordered`, a reason (e.g., "Out of Stock") is required.
*   **Inventory Update**:
    *   System creates a `Stock-In` record.
    *   Updates `stock_level` in the `items` table.
    *   Logs a `Stock-In` event in `stock_movements`.
*   **Status Update**:
    *   `received`: All items fully received.
    *   `partially_received`: Some items missing.

---

## 5. Data Architecture

*   **Client-Side (Dexie.js)**:
    *   `purchase_orders`: Stores PO headers and item JSON.
    *   `supplier_config`: Stores cadence and budget rules.
    *   `inventory_metrics`: (Optional) Cached metrics for offline alerts.
*   **Server-Side (PHP)**:
    *   `api/ProcurementService.php`: Handles server-side validation and background recalculations (if triggered via API).
    *   `api/sync.php`: Synchronizes POs and Configs between devices.