# LightPOS

A lightweight, cloud-based Point of Sale (POS) & Inventory system built with Vanilla JavaScript, Tailwind CSS, and Firebase.

## Features
- **Offline-First:** Works without internet using Dexie.js (IndexedDB).
- **Realtime Sync:** Syncs data to Firestore when online.
- **Inventory Management:** Items, Suppliers, Stock In/Out, Stock Counts.
- **POS:** Cart, Checkout, Auto-Breakdown of units.
- **Reporting:** Dashboard, Sales Reports, Expense Tracking.
- **Shift Management:** Cash control and shift tracking.

## Setup
1. Clone the repository.
2. Update `src/firebase-config.js` with your Firebase project credentials.
3. Open `index.html` in a browser (or serve with a local server like Live Server).

## Deployment (GitHub Pages)
1. Push the code to a GitHub repository.
2. Go to **Settings > Pages**.
3. Select the `main` branch as the source.
4. Click **Save**.
5. Your POS will be live at `https://<username>.github.io/<repo-name>/`.

## Testing Offline Mode
1. Open the app and let it sync initial data.
2. Disconnect your internet connection.
3. Process a sale in the POS.
4. Reconnect to the internet.
5. Watch the console logs or Dashboard to verify the transaction synced.