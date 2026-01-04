# Project Checklist: surprised-potato Cloud-Based POS
Use this checklist to track your progress through the development phases.

## Phase 1: Foundation & Authentication
### 1.1 Project Scaffold
- [x] Create project directory structure.
- [x] Create `index.html` (Main entry point).
- [x] Create `style.css` (Import Tailwind via CDN).
- [x] Create `src/main.js` (App entry point).
- [x] Create `api/router.php` (Simple backend handler).
- [x] Create `data/` directory with empty JSON files (`items.json`, `users.json`, `stock_movement.json`, `adjustments.json`, etc.).

### 1.2 Backend Setup (Apache/PHP 8)
- [x] Implement `GET` logic in `router.php` to read JSON files.
- [x] Implement `POST` logic in `router.php` to write to JSON files.
- [x] Implement file locking (`flock`) to ensure data integrity.

### 1.3 Authentication Logic
- [x] Create `src/auth.js`.
- [x] Implement `login(email, password)` using `fetch` to backend.
- [x] Implement `logout()` function.
- [x] Implement `monitorAuthState(callback)` using LocalStorage/Session.
- [x] UI: Add Login Form to `index.html` (hidden by default).
- [x] UI: Add Main App Container to `index.html` (hidden by default).
- [x] Logic: Wire up `monitorAuthState` to toggle between Login Form and App Container.

### 1.4 Shell & Navigation
- [x] Create `src/router.js` handling `window.onhashchange`.
- [x] Define routes: `#dashboard`, `#pos`, `#items`, `#stockin`, `#reports`.
- [x] Create `src/layout.js`.
- [x] Implement `renderSidebar()` with categorized sections, dividers, and Unicode icons.
- [x] Wire up `main.js` to render the layout and handle routing.

## Phase 2: Master Data Management (Online First)
### 2.1 Suppliers Module
- [x] Create `src/modules/suppliers.js`.
- [x] Implement `loadSuppliersView()` function.
- [x] Read: Fetch `suppliers.json` and render table.
- [x] Create: Build "Add Supplier" Modal (Name, Contact, Email).
- [x] Delete: Implement delete functionality for suppliers.

### 2.2 Items Module (Basic)
- [x] Create `src/modules/items.js`.
- [x] Implement `loadItemsView()` function.
- [x] Read: Fetch `items.json` and render table.
- [x] Create/Update: Build "Item Form" Modal.
- [x] Link: Populate "Supplier" dropdown in the form.
- [x] Add `min_stock` field for low stock alerts.

### 2.3 Items Module (Advanced Relationships)
- [x] Update Item Form HTML to include "Parent Item" section.
- [x] Add "Parent Item" dropdown (fetches existing items).
- [x] Add "Conversion Factor" number input.
- [x] Add "Base Unit" text input (e.g., "Can").
- [x] Validation: Prevent an item from being its own parent.

### 2.4 Customers Module
- [x] Create `src/modules/customers.js`.
- [x] Implement `loadCustomersView()` function.
- [x] Read: Fetch `customers.json`.
- [x] Create/Update: Build "Customer Form" Modal.
- [x] Search: Implement customer search by name or phone.

### 2.5 Migration Module
- [x] Create `src/modules/migrate.js`.
- [x] Implement `loadMigrateView()` function.
- [x] UI: Add file upload (JSON/CSV) and sample download links.
- [x] Logic: Implement JSON and CSV parsing and validation.
- [x] Logic: Implement bulk import by sending large JSON payload to backend.

## Phase 3: Inventory Logic
### 3.1 Stock In Module (Invoice Cart)
 - [x] Refactor `src/modules/stockin.js` to use a cart system.
 - [x] UI: Add "Stock In Cart" table to list multiple items.
 - [x] UI: Add "Total Invoice Value" display.
 - [x] Logic: Implement "Add to Stock In Cart" from search.
 - [ ] UI/Logic: Add Landed Cost inputs (Freight, Duties, Insurance) and allocation logic.
 - [x] Logic: Compare Input Cost vs. Stored Cost for each item in cart.
 - [x] Modal: Trigger "Price Discrepancy" modal per item.
 - [x] Option A: Update Master Cost.
 - [x] Option B: Keep Old Cost.
 - [x] Write: "Commit Invoice" button to update `items.json` via API.
 - [x] Write: Log to `stock_in_history.json`.

### 3.2 Stock Count (Audit)
- [x] Create `src/modules/stock-count.js`.
- [x] UI: Display Item + Current System Stock.
- [x] UI: Input field for "Actual Count".
- [x] Logic: Calculate difference (Actual - System).
 - [ ] UI/Write: Append to `adjustments.json` with mandatory reason (Theft, Admin Error, Vendor Fraud).
 - [x] Write: Update `stock_level` in `items.json`.

## Phase 4: The Offline Layer (Dexie.js)
### 4.1 Dexie Setup
- [x] Import Dexie.js (CDN).
- [x] Create `src/db.js`.
- [x] Initialize Database `pos_db`.
- [x] Define Store: `items` (id, barcode, name, parent_id).
- [x] Define Store: `transactions` (++id, timestamp, sync_status).

### 4.2 Realtime Sync (Downlink)
- [x] Create `src/services/sync-service.js`.
- [x] Implement `startRealtimeSync()`.
- [ ] Logic: Poll `items.json` every X seconds (or manual refresh).
- [x] Logic: On change, run `db.items.bulkPut()` to update IndexedDB.
- [x] Initialize this service in `main.js`.

## Phase 5: Point of Sale (POS)
### 5.1 POS UI & Layout
- [x] Create `src/modules/pos.js`.
- [ ] Update Split Layout: Item Grid (Left) vs. Cart + Customer Selection (Right).
- [x] Read: Fetch items from Dexie (not Server).
- [x] Search: Implement local search filtering on Dexie results.
- [ ] UI: Add Customer Search/Selection in POS.

### 5.2 Cart Logic
- [x] Create cart state array.
- [x] Implement `renderCart()` to update UI.
- [x] Implement `removeFromCart()` and `updateQty()`.
- [x] Implement Total Amount calculation (PHP).

### 5.3 Auto-Breakdown Logic
- [x] Modify `addToCart()` logic.
- [x] Check: Is `stock_level` < requested qty?
- [x] Fetch: If yes, find `parent_id` in Dexie.
- [x] Logic: If Parent Stock > 0:
    - [x] Decrement Parent Stock (in memory/UI).
    - [x] Increment Child Stock by `conversion_factor`.
    - [x] Proceed to add to cart.
    - [x] Show Toast notification.

### 5.4 Checkout & Queuing
- [x] Implement "Pay" Button.
- [x] UI: "Amount Tendered" Modal & Change Calculation.
- [ ] Write: Create transaction object `{ customerId, pointsEarned, synced: false, ... }`.
- [ ] Logic: Calculate loyalty points based on total.
- [x] Write: Save to Dexie `transactions` table.
- [x] Clear Cart and show success message.

## Phase 6: Synchronization & Reporting
### 6.1 Sync Service (Uplink)
- [x] Update `src/services/sync-service.js`.
- [x] Implement `processQueue()`.
- [x] Listener: Add `window.addEventListener('online', ...)` trigger.
- [x] Loop: Query Dexie for `synced: false`.
- [x] Write: POST to `api/router.php?action=sync_transaction`.
- [x] Write: Backend updates `transactions.json` and decrements stock in `items.json`.
- [x] Write: If `customerId` present, backend updates `customers.json`.
- [x] Update: Set Dexie transaction to `synced: true`.

### 6.2 Dashboard & Reports
- [x] Create `src/modules/dashboard.js`.
- [ ] Fetch recent transactions from `transactions.json`.
- [x] Calculate KPIs: Total Sales, Total Profit.
- [x] Calculate Tax Liability (VAT) for the dashboard.
- [x] Low Stock: Fetch & Render items where stock < `min_stock`.
- [x] Trend: Render Sales Trend (Table or Chart).

### 6.3 Advanced Reporting
- [x] Create `src/modules/reports.js`.
- [x] UI: Date Range Picker (Start Date, End Date).
- [x] Report: Sales by User (Table: User, Total Sales, Transaction Count).
- [x] Report: Financial Summary (Gross Sales, Tax, COGS, Gross Profit).
- [x] Report: Payment Method Breakdown (Cash vs Card vs E-wallet).
- [x] Report: Inventory Valuation (Total Cost vs Total Retail Value).
- [x] Report: Void & Return Log (Audit trail).
- [x] Report: Product Performance (Product Mix/Ranking).
- [x] Report: Advanced Product Metrics (STR, Turnover, GMROI).
- [x] Report: Risk Metrics (Return Rate, Shrinkage %).
- [x] Report: Strategic Metrics (Basket Penetration, Affinity).
- [x] Report: Slow Moving Items (zero sales in period).
- [x] Report: Retailer's Matrix Visualization.

## Phase 10: Enterprise Features (Valuation & Audit)
- [ ] Logic: Implement FIFO/LIFO/Weighted Average valuation logic.
- [ ] Logic: Implement Landed Cost allocation in Stock In module.
- [x] Write: Implement `stock_movement.json` logging for all inventory events (Sales, Receives, Adjustments).
- [x] Report: Inventory Ledger with historical snapshotting.
- [ ] Report: Advanced COGS Analysis (including Landed Costs).
- [x] Report: Detailed Stock Movement / Transaction Log (User ID + Timestamp).
- [x] Report: Shrinkage / Variance Analysis with categorization (Theft, Admin Error, Vendor Fraud).

## Phase 7: Shift Management
- [x] Create `src/modules/shift.js`.
- [x] UI: "Open Shift" Modal (Input: Opening Petty Cash).
- [x] Logic: Block POS access if no shift is open.
- [x] UI: "X-Report" button (Snapshot of current sales without closing).
- [x] UI: "Close Shift" Modal (Input: Closing Cash Count).
- [x] Logic: Calculate Expected Cash (Opening + Total Cash Sales in Shift).
- [x] Report: Show Overage/Shortage summary upon closing.
- [x] Report: Generate "Z-Report" on shift close (Final summary).
- [ ] Write: Save shift records to `shifts.json`.

## Phase 8: Expense Management
- [x] Create `src/modules/expenses.js`.
- [x] UI: Expense List View (Table).
- [x] UI: "Add Expense" Modal.
- [x] Form: Amount, Category (Dropdown), Description, Date.
- [x] Link: Optional "Supplier" dropdown (reuse `fetchSuppliers`).
- [ ] Write: Save to `expenses.json`.

## Phase 9: User Management
- [x] Create `src/modules/users.js`.
- [x] UI: User List View (Table).
- [x] UI: User Form Modal (Email, Name, Active Status).
- [x] UI: Permissions Matrix (Read/Write checkboxes per module).
- [x] Write: Save user profile and permissions to `users.json`.
- [x] Logic: Update `auth.js` to fetch user profile from `users.json` on login.
- [x] Logic: Admin must manually create users (or simple registration flow).
- [x] UI: Create "Pending Approval" view for users with no access.
- [x] Logic: Implement `checkPermission(module, action)` utility.
- [x] UI: Update Sidebar to hide links based on 'read' permission.
- [x] UI: Update Modules to disable buttons based on 'write' permission.

## Final Polish
- [ ] Testing: Verify Offline mode (Disconnect Network -> Sell -> Reconnect).
- [ ] Testing: Verify Auto-breakdown math.
- [ ] Deploy: Copy files to Apache `htdocs` or `www` folder.