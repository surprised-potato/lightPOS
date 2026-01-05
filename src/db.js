import Dexie from './libs/dexie.mjs';
import { handleError } from './utils.js';

export const db = new Dexie('lightPOS_DB');

// Define schema: 
// ++id is auto-incrementing if needed, 
// but usually, you'll use the 'id' from your cloud DB.
db.version(30).stores({
    items: '++id, name, barcode, category, updatedAt, sync_status, _version, _updatedAt, _deleted',
    transactions: '++id, timestamp, customer_id, sync_status, _version, _updatedAt, _deleted',
    stock_movements: '++id, item_id, timestamp, sync_status, _version, _updatedAt, _deleted',
    stock_logs: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
    adjustments: '++id, item_id, timestamp, sync_status, _version, _updatedAt, _deleted',
    sync_metadata: 'key, _version, _updatedAt, _deleted',
    customers: '++id, name, phone, account_number, sync_status, _version, _updatedAt, _deleted',
    stockins: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
    suspended_transactions: '++id, timestamp, user_email, sync_status, _version, _updatedAt, _deleted',
    notifications: '++id, timestamp, read',
    returns: '++id, transaction_id, timestamp, sync_status, _version, _updatedAt, _deleted',
    shifts: '++id, user_id, status, sync_status, _version, _updatedAt, _deleted',
    expenses: '++id, date, category, sync_status, _version, _updatedAt, _deleted',
    suppliers: '++id, name, sync_status, _version, _updatedAt, _deleted',
    users: 'email, name, is_active, sync_status, _version, _updatedAt, _deleted',
    outbox: '++id, collection, docId, type'
});

// Global error handler for unhandled database exceptions
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.name && event.reason.name.includes('Error')) {
        handleError(event.reason, 'Database Global');
    }
});

// Handle multi-tab synchronization and upgrades
db.on('versionchange', function (event) {
    // Another tab has upgraded the database. We must close our connection
    // to allow the upgrade to proceed, then reload to get the new schema.
    console.warn("Database version change detected in another tab. Closing connection...");
    db.close();
    alert("The system has been updated. This tab will now reload.");
    window.location.reload();
});

db.on('blocked', function (event) {
    // This tab is trying to upgrade the database, but other tabs are blocking it.
    console.warn("Database upgrade blocked by other open tabs.");
});

db.on('populate', (trans) => {
    // This runs only once when the database is first created.
    console.log("Database created for the first time. Seeding initial data...");
});

db.open().catch("UpgradeError", err => {
    console.error("Database upgrade failed due to schema change. Wiping local data for a fresh start...");
    db.delete().then(() => {
        console.log("Database deleted. Reloading...");
        window.location.reload();
    });
}).catch(err => {
    console.error("Failed to open db:", err);
});

export default db;