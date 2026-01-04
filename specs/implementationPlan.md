# Project Implementation Blueprint & Prompt Chain (Vanilla JS Edition)
This document outlines the step-by-step execution plan for the surprised-potato Self-Hosted POS using Vanilla JavaScript (ES6 Modules), Tailwind CSS, and a minimal PHP 8 backend for JSON storage.

## Phase 1: Foundation & Authentication
**Goal:** Establish the project structure, secure the app, and set up the local data context.
- **Project Scaffold:** Setup standard HTML5 + Tailwind (via CDN for simplicity or CLI) + ES6 Modules.
- **Backend Init:** Create `api/router.php` to handle JSON file reading/writing.
- **Auth Module:** Create an `auth.js` module to handle login against `users.json`.
- **Router & Layout:** Create a lightweight hash-based router (`#pos`, `#items`) and a persistent Sidebar/Top bar renderer.

## Phase 2: Master Data Management (Online First)
**Goal:** Create the "Back Office" CRUD functionality using pure JS and DOM manipulation.
- **Suppliers Module:** Functions to render the Supplier table and handle Modal forms.
- **Items Module - Basic:** Add/Edit Items with basic fields (Barcode, Name, Prices).
- **Items Module - Advanced:** Add relationships (`parent_id` for breakdown) and Supplier linking.
- **Customers Module:** CRUD for customer profiles and tracking loyalty points.

## Phase 3: Inventory Logic (The "Stock" Lifecycle)
**Goal:** Manage how goods enter and leave the system outside of sales.
- **Stock In Logic (Invoice Cart):** Implement a cart-based system for receiving stock. This allows users to add multiple items to a "pending invoice" list to match against the supplier's physical invoice before committing to Firestore.
- **Stock Count (Audit):** Build the "Adjustment Log" feature.
- **Stock Out/Conversion:** Manual forms for spoilage or manual de-kitting.

## Phase 4: The Offline Layer (Dexie.js)
**Goal:** Make the app independent of the internet for core sales functions.
- **Dexie Setup:** Initialize IndexedDB in a `db.js` module.
- **Item Sync:** Create a `sync-service.js` that polls `items.json` and updates Dexie.

## Phase 5: Point of Sale (POS)
**Goal:** The cashier interface.
- **POS Layout:** Render the Split screen (Search/Grid vs. Cart).
- **Cart Logic:** Global cart array, rendering functions, and **Customer Selection** for the reward system.
- **Auto-Breakdown Logic:** If stock is 0, find parent in Dexie, decrement parent, increment child, update Cart.
- **Checkout & Queue:** "Pay" button saves to Dexie transactions queue.

## Phase 6: Synchronization & Reporting
**Goal:** Reconcile offline data and visualize results.
- **Sync Service:** The "Back Online" logic. Loop through Dexie queue -> POST to API -> Update Stock.
- **Dashboard & Reports:** Read-only views using Chart.js or simple HTML tables. Includes Financials (Tax, COGS, Valuation) and Performance (Product Mix, Voids).

## Phase 7: Shift Management
**Goal:** Cash control and session tracking.
- **Shift Logic:** Open/Close shift with cash reconciliation. Implement X-Report (snapshot) and Z-Report (finalization).
- **Enforcement:** Block POS access if no shift is open.

## Phase 8: Expense Management
**Goal:** Track operational costs.
- **Expense Module:** CRUD for expenses, optionally linked to suppliers.

## Phase 9: User Management & Access Control
**Goal:** Administer users and enforce granular permissions.
- **User Module:** CRUD for users with a permissions matrix (Read/Write per module).
- **Enforcement:** Update `auth.js` to fetch permissions on login.
- **UI Logic:** Conditionally render Sidebar links and disable action buttons based on permissions.

## Phase 10: Enterprise Features (Valuation & Audit)
**Goal:** Advanced financial tracking and forensic auditing.
- **Valuation Logic:** Implement FIFO/LIFO/Weighted Average costing.
- **Audit Logging:** Create a comprehensive stock movement log capturing every event with User ID and Timestamp.
- **Advanced Reporting:** Historical inventory snapshots and shrinkage analysis by category.

---

# LLM Prompts (Copy & Paste these sequentially)
Use the following prompts in order. They assume a standard HTML5 + ES6 structure.

## Prompt Set 1: Foundation

### Prompt 1.1: Project Skeleton & Auth
Act as a Senior Web Developer. We are building a Self-Hosted POS using Vanilla JS, Tailwind CSS, and PHP 8/JSON for storage.
1. Create a standard project structure: `index.html`, `style.css` (Tailwind via CDN), `src/main.js`, `api/router.php`, `data/`.
2. Create `api/router.php`: A simple PHP script that accepts GET (read JSON) and POST (write JSON) requests. It should read/write files from the `data/` directory.
3. Create `src/auth.js`. Export functions `login(email, password)`, `logout()`, and `monitorAuthState()`. Login should `fetch` `data/users.json` and verify credentials (simple check for now).
4. In `index.html`, create a simple Login Form (hidden by default) and a "App Container" (hidden by default).
5. Logic: If `monitorAuthState` detects a user, show App Container; otherwise, show Login Form.
Output the code for these core files.

### Prompt 1.2: App Shell & Routing
Build the Navigation and Routing system.
1. Create `src/router.js`. It should listen to `window.onhashchange`.
2. Define routes: `#dashboard`, `#pos`, `#items`, `#stockin`, `#reports`.
3. Create `src/layout.js`. Export a function `renderSidebar()` that injects the Sidebar HTML into the DOM with categorized sections (Front Office vs Backroom) and Unicode icons.
4. The Sidebar must use Tailwind classes for responsive design.
5. In `main.js`, wire up the router to clear the `#main-content` div and log which page "would" load (placeholder).

## Prompt Set 2: Data Management

### Prompt 2.1: Suppliers CRUD
We need to manage Suppliers.
1. Create `src/modules/suppliers.js`.
2. Export a function `loadSuppliersView()` that renders a Table and an "Add Supplier" button into `#main-content`.
3. Use `fetch('api/router.php?file=suppliers')` to get data.
4. Implement a custom Modal (HTML dialog or hidden div) to "Add Supplier" (Fields: Name, Contact, Email).
5. Implement the Delete function (DOM removal + POST to API to update JSON).

### Prompt 2.2: Items Management (Master List)
Build the Items Management module.
1. Create `src/modules/items.js` with `loadItemsView()`.
2. Render a table of items from `items.json`.
3. Columns: Barcode, Name, Cost Price, Selling Price, Current Stock.
4. Create a Form Modal to Add/Edit items.
5. The Form must allow selecting a `Supplier` (fetch from `suppliers.json`).
6. Include `min_stock` field.

### Prompt 2.3: Item Relationships (Units)
Update the `items.js` module to support Unit Conversion.
1. Update the Add/Edit Form HTML to include a "Parent Item" dropdown.
2. If a Parent is selected, show "Conversion Factor" input (e.g., 12).
3. Add "Base Unit" text input.
4. Validation: Ensure an item cannot select itself as a parent.

### Prompt 2.4: Customer Management & Rewards
Build the Customers module.
1. Create `src/modules/customers.js` with `loadCustomersView()`.
2. Render a table of customers from `customers.json`.
3. Fields: Name, Phone (unique ID), Email, and `loyalty_points`.
4. Create a Form Modal to Add/Edit customers.
5. Add a search function to find customers by phone or name.

### Prompt 2.5: Data Migration (Bulk Import)
Build the Migration module.
1. Create `src/modules/migrate.js` with `loadMigrateView()`.
2. UI: Create a file upload area for JSON and CSV files.
3. UI: Add buttons to download sample JSON and CSV templates.
4. Logic: Parse the JSON or CSV file and validate that it is an array.
5. Logic: Send the array to `api/router.php` to overwrite/append `items.json`.
6. Logic: Ensure numeric fields (prices, stock) are correctly parsed as numbers.

## Prompt Set 3: Inventory Transactions

### Prompt 3.1: Stock In with Invoice Cart
Build the `src/modules/stockin.js` module using a cart-based approach.
1. UI: Search bar to find items, and a "Stock In Cart" table to list items being received.
2. For each item added to the cart:
   - Input "Qty Received" and "New Cost Price".
   - Compare input Cost vs stored `cost_price`.
   - If different, trigger a custom Modal: "Price Discrepancy". Buttons: "Update Master" or "Keep Old".
3. Footer: Display "Total Invoice Value" (sum of Qty * Cost).
4. "Commit Invoice" button:
   - Send payload to API to update `items.json` (increment stock).
   - If "Update Master" was selected for an item, update its `cost_price` in the payload.
   - Log the transaction in `stock_in_history.json`.

### Prompt 3.2: Stock Adjustments (Audit)
Build `src/modules/stock-count.js` for auditing.
1. UI: Search item, display current system stock.
2. Input: "Actual Count".
3. Logic: Calculate difference.
4. Create/Append to `adjustments.json`.
5. Log: `{itemId, oldStock, newStock, difference, reason, userId, timestamp}`.
6. Only AFTER logging, update the stock level in `items.json` via API.

## Prompt Set 4: The Offline Layer

### Prompt 4.1: Dexie.js Setup
We need offline capability. Use `dexie` (load via CDN in index.html).
1. Create `src/db.js`. Initialize Dexie with stores:
   - `items`: `id, barcode, name, parent_id`
   - `transactions`: `++id, timestamp, sync_status`
2. Create `src/services/sync-service.js`.
3. Add a function `startRealtimeSync()`:
   - Poll `api/router.php?file=items` every 30 seconds.
   - `db.items.bulkPut()` the data to keep IndexedDB updated.
   - Call this function in `main.js` upon login.

## Prompt Set 5: Point of Sale

### Prompt 5.1: POS UI & Cart
Build `src/modules/pos.js`.
1. Layout: Left col (Item Grid), Right col (Cart + Customer Selection).
2. **Important**: Fetch items from `db.items` (Dexie), NOT Server.
3. Implement a Search Bar filtering the Dexie results.
4. Customer Selection: Add a small search bar to link a customer to the current sale. Display their current points.
5. Cart State: Maintain a simple array `cart = []`.
6. Functions: `renderCart()`, `addToCart(item)`, `removeFromCart(index)`.
7. Display Total Amount.

### Prompt 5.2: Auto-Breakdown Logic
Implement "Auto-De-Kitting" in `addToCart`.
1. Check `item.stock_level` in Dexie.
2. If `stock_level` < requested qty:
   - Query Dexie for `item.parent_id`.
   - If parent found and `parent.stock > 0`:
     - Logic: Decrement Parent stock (in memory/UI context), Increment Child stock by `conversion_factor`.
     - Proceed with add to cart.
     - Show Toast: "Auto-converted 1 Case to Cans".

### Prompt 5.3: Checkout & Queue
Implement Checkout in `pos.js`.
1. "Pay" Button opens "Amount Tendered" Modal.
2. Calculate Change.
3. On Confirm:
   - Create object: `{ items: cart, total, customerId, pointsEarned, timestamp, synced: false }`.
   - Points Logic: Calculate points (e.g., 1 point per 100 PHP).
   - `db.transactions.add()` (Save to Dexie).
   - Clear Cart.
   - Show "Transaction Saved" message.

## Prompt Set 6: Synchronization

### Prompt 6.1: The Sync Worker
Update `src/services/sync-service.js`.
1. Add `processQueue()` function.
2. Listener: `window.addEventListener('online', processQueue)`.
3. Logic:
   - Query Dexie `transactions` where `synced: false`.
   - For each:
     - POST to `api/router.php` (action=sync).
     - Backend updates `transactions.json` and decrements stock in `items.json`.
     - If `customerId` is present, update `customers.json`.
     - Update Dexie transaction `synced: true`.

## Prompt Set 7: Reporting

### Prompt 7.1: Dashboard
Build `src/modules/dashboard.js`.
1. Fetch `transactions.json` from API.
2. Compute: Total Sales, Total Profit, and **Tax Liability**.
3. Fetch `items` where `stock_level` < `min_stock` for "Low Stock" table.
4. Render a simple HTML table or use a lightweight chart lib (like Chart.js via CDN) for "Sales Trend".

### Prompt 7.2: Advanced Reporting
Build `src/modules/reports.js`.
1. UI: Date Range Picker (Start/End).
2. Report: **Financial Summary** (Gross Sales, Tax, COGS, Gross Profit, Payment Method breakdown).
3. Report: **Inventory Valuation** (Current stock at Cost vs Retail).
4. Report: **Audit Logs** (Voided transactions and Returns).
5. Report: **Product Performance** (Advanced Metrics):
   - Velocity: Units Sold, Sell-Through Rate (STR), Inventory Turnover.
   - Profitability: Gross Margin (%), GMROI.
   - Risk: Return Rate, Shrinkage %.
   - Strategic: Basket Penetration, Product Affinity.
   - Slow Moving: Items with zero sales in the selected period.
6. Report: Sales by User (Table: User, Total Sales, Transaction Count).

### Prompt 7.3: Enterprise Financial & Audit Reports
Build advanced enterprise reports.
1. **Inventory Ledger**: Implement a report showing total asset value. Add a date picker for "Snapshot Date" to calculate historical value based on `stock_movement.json`.
2. **Valuation Methods**: Add a toggle to switch between FIFO, LIFO, and Weighted Average for COGS and Inventory Valuation calculations.
3. **Landed Costs**: Update the Stock In module to allow inputting freight/duties/insurance and allocate them to the unit cost of items.
4. **Stock Movement Log**: Create a view that renders `stock_movement.json` in a searchable table. Columns: Timestamp, User, Item, Type, Qty, Cost.
5. **Shrinkage Analysis**: Create a report comparing system stock vs physical counts (from `adjustments.json`). Categorize discrepancies by cause.

## Prompt Set 8: Shift Management

### Prompt 8.1: Shift Logic
Build `src/modules/shift.js`.
1. UI: "Open Shift" Modal (Input: Opening Petty Cash).
2. UI: "Close Shift" Modal (Input: Closing Cash Count).
3. Logic: `checkShiftStatus()` - if no open shift, block POS view.
4. Logic: On Close, calculate Expected Cash (Opening + Cash Sales from `transactions` in current shift window).
5. UI: Show Overage/Shortage summary upon closing.
6. Write: Save shift records to `shifts.json` via API.

## Prompt Set 9: Expense Management

### Prompt 9.1: Expenses CRUD
Build `src/modules/expenses.js`.
1. UI: Render a table of expenses from `expenses.json`.
2. UI: "Add Expense" Modal.
   - Fields: Amount, Category (Dropdown: Utilities, Salary, Procurement, Other), Description, Date.
   - Supplier Link: Optional dropdown (reuse `suppliers` data).
3. Write: Save to `expenses.json`.

## Prompt Set 10: User Management

### Prompt 10.1: User Administration
Build `src/modules/users.js`.
1. UI: Render a table of users from `users.json`.
2. UI: "Add/Edit User" Modal.
   - Fields: Email, Display Name, Is Active (Toggle).
   - Permissions Matrix: List modules (POS, Items, Stock In, Stock Count, Reports, Expenses, Users).
   - For each module, show "Read" and "Write" checkboxes.
3. Write: Save the `permissions` map to `users.json` via API.

### Prompt 10.2: Access Control Enforcement
Enforce permissions in the app.
1. Update `src/auth.js`: On login, fetch the user's profile from `users.json`. Store permissions in memory.
2. Create helper `checkPermission(module, type)` (type = 'read'|'write').
3. Update `src/layout.js`: 
   - If user has no permissions, render a "Pending Approval" screen instead of the Sidebar/App.
   - Else, hide specific Sidebar links if user lacks 'read' permission.
4. Update `src/modules/*.js`: Disable "Add/Save/Delete" buttons if user lacks 'write' permission.
