# Technical Specification: surprised-potato Cloud-Based POS & Inventory System

## 1. System Architecture
- **Frontend:** Single Page Application (SPA) hosted on Apache Web Server.
- **Backend:** Minimal PHP 7.4+ script for file I/O (Read/Write JSON).
- **Database:** JSON files stored in a protected `/data` directory on the server.
- **Local Persistence (Offline):** Dexie.js (IndexedDB) for local caching of items and queuing transactions.
- **Sync Strategy:** Delta-based synchronization (Subtract quantities) to handle multi-terminal offline sales.

## 2. Core Modules & Views
- **Dashboard:** High-level KPIs (Revenue, Profit), Low Stock Alerts, and Sales Trends (Fast/Slow moving).
- **Items:** Master list of products with barcode/search focus.
- **Suppliers:** Management of vendor contact details and procurement history.
- **Stock In:** Receiving deliveries using an invoice-cart system to verify against supplier invoices with cost-discrepancy alerts.
- **Stock Count:** Inventory auditing with mandatory adjustment logging, including shrinkage categorization (Theft, Admin Error, Vendor Fraud).
- **Point of Sale (POS):** Transaction processing with "Quick Add," customer rewards, automatic unit breakdown, and transaction suspension.
- **Stock Out / Item Change:** Handling spoilage, theft, and manual unit conversions.
- **Customers:** Data tracking for sales history and PHP-based reward points.
- **Migrate:** Bulk import of item data via JSON files.
- **Profile:** User account management for viewing details and updating name, contact number, and password.
- **User Management:** Granular permission-based access control. No fixed roles; access is defined per module with specific Read and Write privileges.
- **Shift Management:** Cash control features including opening petty cash entry and closing cash count reconciliation. Supports **X-Reports** (mid-shift snapshot) and **Z-Reports** (end-of-day reset).
- **Expense Management:** Recording operational expenses and procurement costs, optionally linked to suppliers.
- **Reports:** Comprehensive reporting suite including:
    - **Financials:** 
        - **Z-Report:** Final daily summary (Sales, Tax, Payment Methods).
        - **X-Report:** Real-time snapshot of current shift sales.
        - **Tax Liability:** Aggregated VAT/Sales Tax collected for compliance.
        - **Payment Method Breakdown:** Sales by Cash, Card, E-wallet, etc.
        - **Cash Variance:** Comparison of expected vs. actual cash (Short/Over).
        - **Inventory Ledger / Valuation (Enterprise):** Total value of assets on hand at a specific timestamp. Supports historical "snapshotting" to view inventory value at any past date.
        - **Valuation Methods:** Support for FIFO (First-In, First-Out), LIFO (Last-In, First-Out), or Weighted Average Costing.
        - **COGS Analysis (Enterprise):** Detailed breakdown of costs associated with sold items, including **Landed Costs** (freight, duties, insurance) allocated to unit cost.
    - **Inventory:** 
        - **Inventory Valuation:** Total stock value at Cost and Retail prices.
        - **COGS (Cost of Goods Sold):** Cost of items sold to calculate Gross Margin.
        - **Low Stock:** Items below threshold for reordering.
    - **Audit & Security (Enterprise):**
        - **Stock Movement / Transaction Log:** Chronological list of every inventory event (Sale, Return, Receive, Adjustment, Transfer, Damage) capturing User ID and Timestamp.
        - **Shrinkage / Variance Analysis:** Discrepancy between "Book Stock" and "Physical Count," categorized by cause (Theft, Admin Error, Vendor Fraud).
    - **Performance & Audit:**
        - **Product Performance (Advanced Metrics):**
            - **Velocity:** Units Sold, Sell-Through Rate (STR), Inventory Turnover.
            - **Profitability:** Gross Margin (%), GMROI (Gross Margin Return on Investment).
            - **Risk & Quality:** Return Rate, Shrinkage %.
            - **Contribution:** Basket Penetration, Product Affinity (Attach Rate).
        - **Retailer's Matrix:** Categorizing products into Winners, Cash Cows, Sleepers, and Dogs.
        - **Slow Moving Items:** Identifying products with zero sales over a specific period.
        - **Void & Return Report:** Log of cancelled or refunded transactions for fraud prevention.
    - **User Performance:** Sales breakdown by cashier/user for specific date ranges.

## 3. Data Schema (JSON Files)

### File: `data/items.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `barcode` | string | Unique SKU or Barcode |
| `name` | string | Item name |
| `base_unit` | string | e.g., "Can", "Bottle" |
| `parent_id` | string | ID of bulk item (e.g., Case) for auto-breakdown |
| `conv_factor` | number | e.g., 12 (1 case = 12 cans) |
| `cost_price` | number | Current purchase cost (PHP) |
| `selling_price` | number | Current retail price (PHP) |
| `stock_level` | number | Total in Base Units |
| `min_stock` | number | Threshold for low stock alerts |
| `supplier_id` | string | Ref to suppliers collection |

### File: `data/transactions.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `timestamp` | timestamp | Date of sale |
| `items` | array | `[{item_id, qty, price, cost}]` |
| `total_php` | number | Gross total |
| `customer_id` | string | "Guest" or UUID |
| `points_earned` | number | Calculated total points |
| `is_synced` | boolean | For Dexie.js tracking |

### File: `data/shifts.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `user_id` | string | The cashier |
| `start_time` | timestamp | Shift start |
| `end_time` | timestamp | Shift end (null if open) |
| `opening_cash` | number | Petty cash amount |
| `closing_cash` | number | Actual cash counted |
| `expected_cash` | number | Calculated (Opening + Cash Sales) |
| `status` | string | "open" or "closed" |

### File: `data/expenses.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `description` | string | Expense details |
| `amount` | number | Cost in PHP |
| `category` | string | e.g., "Utilities", "Procurement", "Salary" |
| `supplier_id` | string | Optional link to supplier |
| `date` | timestamp | When expense occurred |
| `user_id` | string | Who recorded it |

### File: `data/users.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `email` | string | Primary Key (matches Auth email) |
| `name` | string | Display Name |
| `password` | string | Hashed password (simple md5/sha for MVP) |
| `phone` | string | Contact Number |
| `permissions` | object | Object keyed by module (e.g., `items`, `pos`) |
| `permissions.<module>` | map | `{ read: boolean, write: boolean }` |
| `is_active` | boolean | Soft delete / Login block |

### File: `data/stock_movement.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `item_id` | string | Ref to items |
| `type` | string | Sale, Return, Receive, Adjustment, Transfer, Damage |
| `qty` | number | Change in quantity |
| `unit_cost` | number | Cost at time of movement (including landed costs) |
| `user_id` | string | Who performed the action |
| `timestamp` | timestamp | When it happened |

### File: `data/adjustments.json` (Array of Objects)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `item_id` | string | Ref to items |
| `old_stock` | number | System stock before adjustment |
| `new_stock` | number | Actual count |
| `difference` | number | Discrepancy |
| `reason` | string | Theft, Admin Error, Vendor Fraud, etc. |
| `user_id` | string | Who performed the audit |
| `timestamp` | timestamp | When it happened |

### Local Store: `suspended_transactions` (Dexie.js)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID Primary Key |
| `timestamp` | timestamp | Date of suspension |
| `items` | array | `[{item_id, qty, price, cost}]` |
| `customer` | object | `{id, name}` |
| `user_email` | string | Associated cashier email |
| `total` | number | Subtotal amount |
| `sync_status` | number | 0 = Unsynced, 1 = Synced |

## 4. Key Business Logic

### A. Automatic Unit Breakdown (De-kitting)
- If `item.stock_level < sale.qty` AND `item.parent_id` is present:
    1. Check parent item stock.
    2. Subtract 1 from parent stock.
    3. Add `conv_factor` to child stock.
    4. Re-validate sale.
- **Note:** The child item uses its own pre-defined `cost_price` (accounting for higher handling) rather than the parent's divided cost.

### B. Stock In Costing Alert
- During delivery entry into the Stock In Cart:
    - For each item, if `entered_cost != stored_cost`:
        - Flag the item and display a "Price Discrepancy" alert.
        - Options per item: `[Update Master Cost]` `[Keep Current Cost]`.
    - **Landed Costs:** Users can input total freight, duties, and insurance for the invoice. These are distributed proportionally across the items' unit costs.

### C. Offline-to-Online Sync (Dexie.js)
- Transactions are saved to IndexedDB immediately.
- If navigator is online, POST to `api.php`.
- If offline, queue transactions.
- On reconnection: Loop through queue and POST to server.
- **Inventory Update:** Server script reads `items.json`, updates stock, and saves back.
- **Concurrency Note:** For this simple file-based system, "Last Write Wins" applies.

### E. Transaction Suspension
- Cashiers can "Suspend" a current sale to handle another customer.
- Suspended transactions are stored locally in IndexedDB and synced to `suspended_transactions.json` on the server for persistence across sessions and devices.
- A modal allows viewing and resuming suspended sales, showing customer name and subtotal.

### D. User Permissions
- **Simple Auth:** Login checks against `users.json`.
- **Module-Level Granularity:** Each user has a permission map for every core module (POS, Items, Stock In, Reports, etc.).
    - **Read:** Can view the module and data.
    - **Write:** Can create, update, or delete data within that module.
- **Default Access Policy:**
    - **New Users:** Default to **Zero Access** (no read/write permissions) upon registration or first login.
    - **Onboarding:** New users see a "Pending Approval" screen and must wait for an Admin to grant module access.
    - **Admins:** Initial setup assumes at least one user has full access to configure others.
- **Enforcement:**
    - UI: Hide navigation links if `read` is false. Disable buttons/forms if `write` is false.
    - API: `api.php` checks session/token before writing.

## 5. UI/UX Requirements
- **Search Bar:** The POS must focus the search/barcode input by default on load.
- **Quick Add:** A button in POS to quickly register an item without leaving the sales screen.
- **Receipts:** Browser print layout (58mm/80mm) with the text: "This is not an Official Receipt."
- **Mobile Responsive:** The UI must remain functional on tablets for floor-walking staff.

## 6. Error Handling Strategy
- **Connectivity:** Handle `fetch` errors.
- **Conflict Resolution:** If a transaction fails to sync due to a deleted item, flag for Admin review in a "Sync Error" log.
- **Data Integrity:** PHP script uses `flock` (file locking) to prevent corrupting JSON files during concurrent writes.

## 7. Testing Plan

| Feature | Test Case | Expected Result |
| **Offline Sale** | Turn off Wi-Fi, process sale, turn on Wi-Fi. | Transaction is sent to `api.php`; stock is reduced in `items.json`. |
| **Auto-Breakdown** | Sell 1 can when can stock is 0 but case stock is 1. | Case stock becomes 0; can stock becomes 11. |
| **Permissions** | Login as user without `view_cost`. | Cost prices are hidden or masked across all views. |
| **Sync Conflict** | Two terminals sell the same item offline. | Final stock reflects total sum of both subtractions. |