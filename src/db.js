import Dexie from './libs/dexie.mjs';

export const db = new Dexie('lightPOS_DB');

// Define schema: 
// ++id is auto-incrementing if needed, 
// but usually, you'll use the 'id' from your cloud DB.
db.version(13).stores({
    items: 'id, name, category, updatedAt',
    transactions: '++id, timestamp, sync_status',
    stock_logs: '++id, timestamp, sync_status',
    adjustments: '++id, timestamp, sync_status',
    sync_metadata: 'key, value',
    customers: 'id, name, phone',
    stockins: 'id, timestamp',
    syncQueue: '++id, action',
    suspended_transactions: '++id, timestamp, user_email, sync_status',
    notifications: '++id, timestamp, read',
    returns: '++id, transaction_id, timestamp',
    shifts: 'id, user_id, status'
});

export default db;