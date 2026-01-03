# Project Checklist: Light Cloud-Based POS
Use this checklist to track your progress through the development phases.

## Phase 1: Foundation & Authentication
### 1.1 Project Scaffold
- [x] Create project directory structure.
- [x] Create `index.html` (Main entry point).
- [x] Create `style.css` (Import Tailwind via CDN).
- [x] Create `src/main.js` (App entry point).
- [x] Create `src/firebase-config.js`.

### 1.2 Firebase Setup
- [x] Initialize Firebase App in `src/firebase-config.js`.
- [x] Initialize Firestore service.
- [x] Initialize Authentication service.

### 1.3 Authentication Logic
- [x] Create `src/auth.js`.
- [x] Implement `login(email, password)` function.
- [x] Implement `logout()` function.
- [x] Implement `monitorAuthState(callback)` observer.
- [x] UI: Add Login Form to `index.html` (hidden by default).
- [x] UI: Add Main App Container to `index.html` (hidden by default).
- [x] Logic: Wire up `monitorAuthState` to toggle between Login Form and App Container.

### 1.4 Shell & Navigation
- [x] Create `src/router.js` handling `window.onhashchange`.
- [x] Define routes: `#dashboard`, `#pos`, `#items`, `#stockin`, `#reports`.
- [x] Create `src/layout.js`.
- [x] Implement `renderSidebar()` with Tailwind styling.
- [x] Wire up `main.js` to render the layout and handle routing.

## Phase 2: Master Data Management (Online First)
### 2.1 Suppliers Module
- [x] Create `src/modules/suppliers.js`.
- [x] Implement `loadSuppliersView()` function.
- [x] Read: Fetch and render suppliers collection in a table.
- [x] Create: Build "Add Supplier" Modal (Name, Contact, Email).
- [x] Delete: Implement delete functionality for suppliers.

### 2.2 Items Module (Basic)
- [x] Create `src/modules/items.js`.
- [x] Implement `loadItemsView()` function.
- [x] Read: Fetch and render items collection (Barcode, Name, Cost, Price, Stock).
- [x] Create/Update: Build "Item Form" Modal.
- [x] Link: Populate "Supplier" dropdown in the form.
- [x] Add `min_stock` field for low stock alerts.

### 2.3 Items Module (Advanced Relationships)
- [x] Update Item Form HTML to include "Parent Item" section.
- [x] Add "Parent Item" dropdown (fetches existing items).
- [x] Add "Conversion Factor" number input.
- [x] Add "Base Unit" text input (e.g., "Can").
- [x] Validation: Prevent an item from being its own parent.

## Phase 3: Inventory Logic
### 3.1 Stock In Module
- [x] Create `src/modules/stockin.js`.
- [x] UI: Create Search Bar to find items.
- [x] UI: Add "Quantity" and "Cost Per Unit" inputs.
- [x] Logic: Implement "Receive Stock" button handler.
- [x] Logic: Compare Input Cost vs. Firestore Cost.
- [x] Modal: Trigger "Price Discrepancy" modal if costs differ.
- [x] Option A: Update Master Cost.
- [x] Option B: Keep Old Cost.
- [x] Write: Increment `stock_level` in Firestore.

### 3.2 Stock Count (Audit)
- [x] Create `src/modules/stock-count.js`.
- [x] UI: Display Item + Current System Stock.
- [x] UI: Input field for "Actual Count".
- [x] Logic: Calculate difference (Actual - System).
- [x] Write: Create document in `adjustments` collection (log reason/user).
- [x] Write: Update `stock_level` in Firestore only after logging.

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
- [x] Logic: Listen to Firestore items (`onSnapshot`).
- [x] Logic: On change, run `db.items.bulkPut()` to update IndexedDB.
- [x] Initialize this service in `main.js`.

## Phase 5: Point of Sale (POS)
### 5.1 POS UI & Layout
- [x] Create `src/modules/pos.js`.
- [x] Create Split Layout: Item Grid (Left) vs. Cart (Right).
- [x] Read: Fetch items from Dexie (not Firestore).
- [x] Search: Implement local search filtering on Dexie results.

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
- [x] Write: Create transaction object `{ synced: false, ... }`.
- [x] Write: Save to Dexie `transactions` table.
- [x] Clear Cart and show success message.

## Phase 6: Synchronization & Reporting
### 6.1 Sync Service (Uplink)
- [x] Update `src/services/sync-service.js`.
- [x] Implement `processQueue()`.
- [x] Listener: Add `window.addEventListener('online', ...)` trigger.
- [x] Loop: Query Dexie for `synced: false`.
- [x] Write: Add to Firestore `transactions` collection.
- [x] Write: Batch update Firestore items (decrement stock).
- [x] Update: Set Dexie transaction to `synced: true`.

### 6.2 Dashboard & Reports
- [x] Create `src/modules/dashboard.js`.
- [x] Fetch recent transactions from Firestore.
- [x] Calculate KPIs: Total Sales, Total Profit.
- [x] Low Stock: Fetch & Render items where stock < `min_stock`.
- [x] Trend: Render Sales Trend (Table or Chart).

### 6.3 Advanced Reporting
- [x] Create `src/modules/reports.js`.
- [x] UI: Date Range Picker (Start Date, End Date).
- [x] Report: Sales by User (Table: User, Total Sales, Transaction Count).
- [x] Report: Financial Summary (Gross Sales, Cost of Goods, Gross Profit).

## Phase 7: Shift Management
- [x] Create `src/modules/shift.js`.
- [x] UI: "Open Shift" Modal (Input: Opening Petty Cash).
- [x] Logic: Block POS access if no shift is open.
- [x] UI: "Close Shift" Modal (Input: Closing Cash Count).
- [x] Logic: Calculate Expected Cash (Opening + Total Cash Sales in Shift).
- [x] Report: Show Overage/Shortage summary upon closing.
- [x] Write: Save shift records to Firestore `shifts` collection.

## Phase 8: Expense Management
- [x] Create `src/modules/expenses.js`.
- [x] UI: Expense List View (Table).
- [x] UI: "Add Expense" Modal.
- [x] Form: Amount, Category (Dropdown), Description, Date.
- [x] Link: Optional "Supplier" dropdown (reuse `fetchSuppliers`).
- [x] Write: Save to Firestore `expenses` collection.

## Phase 9: User Management
- [x] Create `src/modules/users.js`.
- [x] UI: User List View (Table).
- [x] UI: User Form Modal (Email, Name, Active Status).
- [x] UI: Permissions Matrix (Read/Write checkboxes per module).
- [x] Write: Save user profile and permissions to Firestore `users` collection.
- [x] Logic: Update `auth.js` to fetch user profile on login.
- [x] Logic: Auto-create Firestore document for new users with 0 permissions.
- [x] UI: Create "Pending Approval" view for users with no access.
- [x] Logic: Implement `checkPermission(module, action)` utility.
- [x] UI: Update Sidebar to hide links based on 'read' permission.
- [x] UI: Update Modules to disable buttons based on 'write' permission.

## Final Polish
- [ ] Testing: Verify Offline mode (Disconnect Network -> Sell -> Reconnect).
- [ ] Testing: Verify Auto-breakdown math.
- [ ] Deploy: Push code to GitHub and enable GitHub Pages.