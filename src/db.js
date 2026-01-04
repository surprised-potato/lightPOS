import Dexie from './libs/dexie.mjs';

export const db = new Dexie('lightPOS_DB');

// Define schema: 
// ++id is auto-incrementing if needed, 
// but usually, you'll use the 'id' from your cloud DB.
db.version(23).stores({
    items: '++id, name, category, updatedAt, sync_status',
    transactions: '++id, timestamp, sync_status',
    stock_movements: '++id, item_id, timestamp, sync_status',
    stock_logs: '++id, timestamp, sync_status',
    adjustments: '++id, timestamp, sync_status',
    sync_metadata: 'key, value',
    customers: '++id, name, phone, sync_status',
    stockins: '++id, timestamp, sync_status',
    syncQueue: '++id, action',
    suspended_transactions: '++id, timestamp, user_email, sync_status',
    notifications: '++id, timestamp, read',
    returns: '++id, transaction_id, timestamp, sync_status',
    shifts: '++id, user_id, status, sync_status',
    expenses: '++id, date, category, sync_status',
    suppliers: '++id, name, sync_status',
    users: 'email, name, is_active, sync_status'
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