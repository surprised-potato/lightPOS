# LightPOS

A lightweight, offline-first Point of Sale system designed for speed and reliability.

## Features

- **POS Terminal**: Fast item search, customer selection, and checkout with keyboard shortcuts (F1-F4). Supports barcode scanning and receipt printing.
- **Inventory Management**: Comprehensive tracking of stock levels, suppliers, and stock-in history. Includes a robust audit/stock count module.
- **Shift Management**: Secure register sessions with opening/closing cash tracking and discrepancy alerts.
- **Customer Loyalty**: Manage customer profiles and track loyalty points earned from purchases.
- **Returns & Refunds**: Process returns with manager approval and track inventory disposition (restockable vs damaged).
- **Advanced Reporting**: Real-time business overview, financial summaries, inventory valuation (historical OHLC charts), and product performance analysis.
- **Expense Tracking**: Record and categorize business expenses.
- **User Roles & Permissions**: Granular access control for Admin, Manager, and Cashier roles.
- **Offline-First Architecture**: Built with IndexedDB (Dexie.js) to ensure the system works without an internet connection, syncing automatically when back online.
- **Data Migration**: Bulk import items via CSV or JSON files.

## Installation

### Prerequisites

- A web server with PHP support (e.g., XAMPP, LAMPP, or Nginx with PHP-FPM).
- A modern web browser (Chrome, Firefox, Edge).

### Setup Instructions

1. **Clone the Repository**:
   Copy the `lightPOS` folder to your web server's document root (e.g., `/opt/lampp/htdocs/` on Linux or `C:\xampp\htdocs\` on Windows).

2. **Configure Permissions**:
   Ensure the web server has write permissions to the `api/` directory, as it uses JSON files for data persistence.

3. **Access the Application**:
   Open your browser and navigate to `http://localhost/lightPOS`.

4. **Default Credentials**:
   - **Email**: `admin@lightpos.com`
   - **Password**: `admin`

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules), Tailwind CSS, Chart.js.
- **Database**: IndexedDB (via Dexie.js) for local storage.
- **Backend**: PHP (API Router) with JSON file-based storage.
- **Testing**: Playwright for E2E testing.