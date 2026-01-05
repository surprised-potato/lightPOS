import Dexie from './libs/dexie.mjs';

export const db = new Dexie('lightPOS_DB');

// Define schema: 
// ++id is auto-incrementing if needed, 
// but usually, you'll use the 'id' from your cloud DB.
db.version(25).stores({
    items: '++id, name, category, updatedAt, sync_status, _version, _updatedAt, _deleted',
    transactions: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
    stock_movements: '++id, item_id, timestamp, sync_status, _version, _updatedAt, _deleted',
    stock_logs: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
    adjustments: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
    sync_metadata: 'key, value',
    customers: '++id, name, phone, sync_status, _version, _updatedAt, _deleted',
    stockins: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
    syncQueue: '++id, action',
    suspended_transactions: '++id, timestamp, user_email, sync_status, _version, _updatedAt, _deleted',
    notifications: '++id, timestamp, read',
    returns: '++id, transaction_id, timestamp, sync_status, _version, _updatedAt, _deleted',
    shifts: '++id, user_id, status, sync_status, _version, _updatedAt, _deleted',
    expenses: '++id, date, category, sync_status, _version, _updatedAt, _deleted',
    suppliers: '++id, name, sync_status, _version, _updatedAt, _deleted',
    users: 'email, name, is_active, sync_status, _version, _updatedAt, _deleted',
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