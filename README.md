# LightPOS

A lightweight, offline-first Point of Sale and Inventory Management system designed for speed, reliability, and scalability.

## System Architecture

LightPOS utilizes a **"Self-Healing" Offline-First Architecture**:

- **Frontend**: Single Page Application (SPA) built with Vanilla JavaScript (ES6 Modules) and Tailwind CSS.
- **Local Database**: **Dexie.js (IndexedDB)** stores all data locally in the browser, ensuring the POS works instantly and without an internet connection.
- **Backend**: **PHP 7.4+** API handling synchronization and data persistence.
- **Server Database**: **SQLite 3** (`data/database.sqlite`) using a **Hybrid Relational/Document Schema**.
- **Sync Strategy**: Delta-based synchronization. The client pushes an "Outbox" of changes and pulls "Deltas" (changes since the last sync) from the server. Conflict resolution uses a Last-Write-Wins (LWW) strategy based on versioning.

## Features

### Core Modules
- **Point of Sale (POS)**: 
    - Fast item search (Barcode/Name).
    - Keyboard shortcuts (F1-F4) for high-speed operation.
    - Transaction suspension (Hold/Resume).
    - Offline transaction queuing.
- **Inventory Management**: 
    - **Items**: Master list with barcode, cost, price, and stock levels.
    - **Stock In**: Receive deliveries with supplier tracking.
    - **Stock Count (Audit)**: Perform physical inventory counts with variance logging.
    - **Suppliers**: Manage vendor details and performance.
- **Financials & Shifts**: 
    - **Shift Management**: Opening/Closing cash, X-Reports (mid-shift), and Z-Reports (end-of-day).
    - **Cash Control**: Track discrepancies and cash variances.
    - **Expenses**: Record operational costs.
- **CRM & Loyalty**: 
    - Customer profiles with purchase history.
    - Loyalty points system.
- **Reporting & Analytics**:
    - **Financials**: Gross Sales, Net Profit, Tax Liability, Cashflow.
    - **Inventory**: Valuation (Historical OHLC), Stock Movement Logs, Shrinkage Analysis.
    - **Insights**: Sales Velocity, Product Affinity (Basket Analysis), Retailer's Matrix (Winners/Dogs).
- **Administration**:
    - **User Management**: Granular permission-based access control (Read/Write per module).
    - **Data Migration**: Bulk import/export via CSV/JSON.
    - **Backup & Restore**: Full system backup and restore capabilities.

## Data Schema (Hybrid SQLite)

The backend uses SQLite with a hybrid approach to support the flexibility of a document store with the integrity of a relational database.

### Standard Columns (All Tables)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT PRIMARY KEY | UUID or Email (for users) |
| `_version` | INTEGER | Sync versioning for conflict resolution |
| `_updatedAt` | INTEGER | Unix timestamp of last modification |
| `_deleted` | INTEGER | Soft delete flag (0/1) |
| `json_body` | TEXT | (Optional) Full JSON payload for nested/flexible data |

### Key Tables
1.  **items**: `id`, `barcode`, `name`, `category`, `supplier_id`, `stock_level`, `full_data` (JSON).
2.  **transactions**: `id`, `timestamp`, `user_email`, `customer_id`, `total_amount`, `items_json` (JSON Array).
3.  **users**: `email` (PK), `name`, `password_hash`, `role`, `permissions_json` (JSON).
4.  **stock_movements**: Log of every inventory change (Sale, Receive, Adjustment, Return).

## Installation

### Prerequisites

- A web server with **PHP 7.4+** (e.g., XAMPP, LAMPP, Apache, Nginx).
- **SQLite 3** extension enabled in PHP (`extension=pdo_sqlite`).
- A modern web browser (Chrome, Firefox, Edge).

### Setup Instructions

1. **Clone the Repository**:
   Copy the project folder to your web server's document root (e.g., `/opt/lampp/htdocs/lightPOS` or `C:\xampp\htdocs\lightPOS`).

2. **Configure Permissions**:
   Ensure the web server has **write permissions** to the `data/` directory, as this is where the SQLite database (`database.sqlite`) will be created.
   ```bash
   chmod -R 777 data/
   ```

3. **Access the Application**:
   Open your browser and navigate to `http://localhost/lightPOS`.
   *The application will automatically initialize the database schema on the first run.*

4. **Default Credentials**:
   - **Email**: `admin@lightpos.com`
   - **Password**: `admin123`

## Troubleshooting & Maintenance

### Common Issues

**1. Sync Error: "503 Service Unavailable" / Server Stuck in Restore Mode**
If the server detects a database issue or a restore operation is interrupted, it creates a lock file.
- **Fix**: Run the reset command via the browser console or API:
  ```javascript
  fetch('api/router.php?action=reset_all', { method: 'POST' });
  ```
  Or manually delete `data/restore.lock` on the server.

**2. Admin Permissions Lost**
If the admin user loses access or permissions are corrupted:
- **Fix**: Run the fix command in the browser console (F12):
  ```javascript
  fetch('api/router.php?action=fix_admin').then(r => r.json()).then(console.log);
  ```
  Then clear LocalStorage and reload:
  ```javascript
  localStorage.clear();
  window.location.reload();
  ```

**3. "File is not a database" / Client-side SQLite Errors**
The application previously attempted to access SQLite directly from the client. This has been deprecated in favor of Dexie.js.
- **Fix**: Ensure `src/db.js` has `const use_sqlite = false;`.

**4. Reports Generation Error**
If reports fail to load, it may be due to legacy data missing specific fields (e.g., `items` array in stock history).
- **Fix**: The system includes defensive checks, but a full data reset (`Settings > Advanced > Reset Application Data`) is recommended if migrating from a very old version.

### Developer Tools

- **Sync Architecture Tests**: Located in `Settings > Advanced`. Runs a suite of tests to verify offline creation, conflict resolution, and web locks.
- **Diagnostic Report**: Generates a JSON dump comparing Local Dexie data vs. Server SQLite data to identify sync discrepancies.

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules), Tailwind CSS, Chart.js.
- **Database**: IndexedDB (via Dexie.js) for local storage.
- **Backend**: PHP (API Router) with SQLite 3.
- **Testing**: Playwright for E2E testing.

## Key Business Logic

### Automatic Unit Breakdown
If selling a single unit (e.g., "Can") and stock is 0, but a parent item (e.g., "Case") exists:
1. System subtracts 1 from Parent Stock.
2. System adds `conv_factor` to Child Stock.
3. Sale proceeds automatically.

### Transaction Suspension
Sales can be suspended to handle another customer. Suspended transactions are stored locally and synced to the server, allowing them to be resumed from any terminal.

### Offline-to-Online Sync
1. **Offline**: Transactions are saved to IndexedDB (`outbox` table).
2. **Online**: `SyncEngine` detects connection.
3. **Push**: Outbox items are sent to `api/sync.php`.
4. **Pull**: Client requests records with `_updatedAt` > last sync time.
5. **Merge**: Incoming records update local Dexie store.