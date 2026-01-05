import Dexie from './libs/dexie.mjs';

export const db = new Dexie('lightPOS_DB');

// Define schema: 
// ++id is auto-incrementing if needed, 
// but usually, you'll use the 'id' from your cloud DB.
db.version(24).stores({
    items: '++id, name, category, updatedAt, sync_status, _version, _updatedAt',
    transactions: '++id, timestamp, sync_status, _version, _updatedAt',
    stock_movements: '++id, item_id, timestamp, sync_status, _version, _updatedAt',
    stock_logs: '++id, timestamp, sync_status, _version, _updatedAt',
    adjustments: '++id, timestamp, sync_status, _version, _updatedAt',
    sync_metadata: 'key, value',
    customers: '++id, name, phone, sync_status, _version, _updatedAt',
    stockins: '++id, timestamp, sync_status, _version, _updatedAt',
    syncQueue: '++id, action',
    suspended_transactions: '++id, timestamp, user_email, sync_status, _version, _updatedAt',
    notifications: '++id, timestamp, read',
    returns: '++id, transaction_id, timestamp, sync_status, _version, _updatedAt',
    shifts: '++id, user_id, status, sync_status, _version, _updatedAt',
    expenses: '++id, date, category, sync_status, _version, _updatedAt',
    suppliers: '++id, name, sync_status, _version, _updatedAt',
    users: 'email, name, is_active, sync_status, _version, _updatedAt',
    outbox: '++id, collection, docId, type'
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