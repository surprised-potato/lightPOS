# LightPOS

A lightweight, self-hosted Point of Sale (POS) & Inventory system built with Vanilla JavaScript, Tailwind CSS, and PHP/JSON storage.

## Features
- **Offline-First:** Works without internet using Dexie.js (IndexedDB).
- **Simple Sync:** Syncs data to server JSON files when online.
- **Inventory Management:** Items, Suppliers, Stock In/Out, Stock Counts.
- **POS:** Cart, Checkout, Auto-Breakdown of units.
- **Reporting:** Dashboard, Sales Reports, Expense Tracking.
- **Shift Management:** Cash control and shift tracking.

## Setup
1. Clone the repository.
2. Ensure you have a web server (Apache/Nginx) with PHP enabled.
3. Place the files in your web root.
4. Ensure the `data/` directory is writable by the web server.

## Deployment
1. Copy files to your server.
2. Secure the `data/` directory so it cannot be accessed directly via browser (use `.htaccess`).

## Testing Offline Mode
1. Open the app and let it sync initial data.
2. Disconnect your internet connection.
3. Process a sale in the POS.
4. Reconnect to the internet.
5. Watch the console logs or Dashboard to verify the transaction synced.