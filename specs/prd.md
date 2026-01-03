# Technical Specification: Light Cloud-Based POS & Inventory System

## 1. System Architecture
- **Frontend:** Single Page Application (SPA) hosted on GitHub Pages.
- **Backend/Auth:** Firebase Authentication and Firestore.
- **Local Persistence (Offline):** Dexie.js (IndexedDB) for local caching of items and queuing transactions.
- **Sync Strategy:** Delta-based synchronization (Subtract quantities) to handle multi-terminal offline sales.

## 2. Core Modules & Views
- **Dashboard:** High-level KPIs (Revenue, Profit), Low Stock Alerts, and Sales Trends (Fast/Slow moving).
- **Items:** Master list of products with barcode/search focus.
- **Suppliers:** Management of vendor contact details and procurement history.
- **Stock In:** Receiving deliveries using an invoice-cart system to verify against supplier invoices with cost-discrepancy alerts.
- **Stock Count:** Inventory auditing with mandatory adjustment logging.
- **Point of Sale (POS):** Transaction processing with "Quick Add," customer rewards, and automatic unit breakdown.
- **Stock Out / Item Change:** Handling spoilage, theft, and manual unit conversions.
- **Customers:** Data tracking for sales history and PHP-based reward points.
- **User Management:** Granular permission-based access control. No fixed roles; access is defined per module with specific Read and Write privileges.
- **Shift Management:** Cash control features including opening petty cash entry and closing cash count reconciliation.
- **Expense Management:** Recording operational expenses and procurement costs, optionally linked to suppliers.
- **Reports:** Comprehensive reporting suite including:
    - **Financials:** Profit & Loss (Gross Margin), Daily/Monthly Sales Summaries.
    - **Inventory:** Stock Valuation, Low Stock, and Movement Logs.
    - **User Performance:** Sales breakdown by cashier/user for specific date ranges.

## 3. Data Schema (Firestore)

### Collection: `items`
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

### Collection: `transactions`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `timestamp` | timestamp | Date of sale |
| `items` | array | `[{item_id, qty, price, cost}]` |
| `total_php` | number | Gross total |
| `customer_id` | string | "Guest" or UUID |
| `points_earned` | number | Calculated total points |
| `is_synced` | boolean | For Dexie.js tracking |

### Collection: `shifts`
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

### Collection: `expenses`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | UUID |
| `description` | string | Expense details |
| `amount` | number | Cost in PHP |
| `category` | string | e.g., "Utilities", "Procurement", "Salary" |
| `supplier_id` | string | Optional link to supplier |
| `date` | timestamp | When expense occurred |
| `user_id` | string | Who recorded it |

### Collection: `users`
| Field | Type | Description |
| :--- | :--- | :--- |
| `email` | string | Primary Key (matches Auth email) |
| `name` | string | Display Name |
| `permissions` | map | Object keyed by module (e.g., `items`, `pos`) |
| `permissions.<module>` | map | `{ read: boolean, write: boolean }` |
| `is_active` | boolean | Soft delete / Login block |

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

### C. Offline-to-Online Sync (Dexie.js)
- Transactions are saved to IndexedDB immediately.
- If navigator is online, push to Firestore.
- If offline, queue transactions.
- On reconnection: Loop through queue and push to Firestore.
- **Inventory Update:** Use Firestore `increment(-qty)` to perform delta-based subtraction, avoiding race conditions.
- **Loyalty Points:** If a customer is linked, use Firestore `increment(points)` to update their profile during sync.

### D. User Permissions
- **No Role-Based Access Control (RBAC):** Access is not determined by roles like "Admin" or "Staff".
- **Module-Level Granularity:** Each user has a permission map for every core module (POS, Items, Stock In, Reports, etc.).
    - **Read:** Can view the module and data.
    - **Write:** Can create, update, or delete data within that module.
- **Default Access Policy:**
    - **New Users:** Default to **Zero Access** (no read/write permissions) upon registration or first login.
    - **Onboarding:** New users see a "Pending Approval" screen and must wait for an Admin to grant module access.
    - **Admins:** Initial setup assumes at least one user has full access to configure others.
- **Enforcement:**
    - UI: Hide navigation links if `read` is false. Disable buttons/forms if `write` is false.
    - Firestore Rules: Validate `request.auth.token.email` against the `users` collection permissions.

## 5. UI/UX Requirements
- **Search Bar:** The POS must focus the search/barcode input by default on load.
- **Quick Add:** A button in POS to quickly register an item without leaving the sales screen.
- **Receipts:** Browser print layout (58mm/80mm) with the text: "This is not an Official Receipt."
- **Mobile Responsive:** The UI must remain functional on tablets for floor-walking staff.

## 6. Error Handling Strategy
- **Firestore Connectivity:** Use `onSnapshot` with error callbacks. Implement exponential backoff for retries.
- **Conflict Resolution:** If a transaction fails to sync due to a deleted item, flag for Admin review in a "Sync Error" log.
- **Data Integrity:** Wrap "Stock In" and "Stock Out" actions in Firestore Transactions to ensure atomic updates.

## 7. Testing Plan

| Feature | Test Case | Expected Result |
| :--- | :--- | :--- |
| **Offline Sale** | Turn off Wi-Fi, process sale, turn on Wi-Fi. | Transaction appears in Firestore; stock is reduced. |
| **Auto-Breakdown** | Sell 1 can when can stock is 0 but case stock is 1. | Case stock becomes 0; can stock becomes 11. |
| **Permissions** | Login as user without `view_cost`. | Cost prices are hidden or masked across all views. |
| **Sync Conflict** | Two terminals sell the same item offline. | Final stock reflects total sum of both subtractions. |