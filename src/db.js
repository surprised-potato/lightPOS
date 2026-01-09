import Dexie from './libs/dexie.mjs';
import { handleError } from './utils.js';
import { DexieRepository } from './services/DexieRepository.js';
import { SqliteRepository } from './services/SqliteRepository.js';
import { connect } from './db_sqlite.js';

import { connect as sqliteConnect, db as sqliteDb } from './db_sqlite.js';

const use_sqlite = true;

// Dynamically set database name based on the URL directory (e.g., /lightPOS/ -> lightPOS_DB)
// This ensures that copies of the app in different folders use separate local databases.
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const dbName = (pathSegments[0] || 'lightPOS') + '_DB';

let repository;
let dbPromise; // New promise for the database instance

if (use_sqlite) {
    repository = SqliteRepository;
    dbPromise = (async () => {
        await sqliteConnect('data/database.sqlite'); // Initialize SQLite DB
        return sqliteDb; // Resolve with the initialized SQLite DB
    })();
} else {
    const dexieDb = new Dexie(dbName);
    dexieDb.version(34).stores({
        items: '++id, name, barcode, category, updatedAt, sync_status, _version, _updatedAt, _deleted',
        transactions: '++id, timestamp, customer_id, *item_ids, sync_status, _version, _updatedAt, _deleted',
        stock_movements: '++id, item_id, timestamp, sync_status, _version, _updatedAt, _deleted',
        stock_logs: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
        adjustments: '++id, item_id, timestamp, sync_status, _version, _updatedAt, _deleted',
        sync_metadata: 'key, _version, _updatedAt, _deleted',
        customers: '++id, name, phone, account_number, sync_status, _version, _updatedAt, _deleted',
        stockins: '++id, timestamp, sync_status, _version, _updatedAt, _deleted',
        suspended_transactions: '++id, timestamp, user_email, sync_status, _version, _updatedAt, _deleted',
        notifications: 'id, timestamp, read, target, sync_status, _version, _updatedAt, _deleted',
        returns: '++id, transaction_id, timestamp, sync_status, _version, _updatedAt, _deleted',
        shifts: '++id, user_id, status, sync_status, _version, _updatedAt, _deleted',
        expenses: '++id, date, category, sync_status, _version, _updatedAt, _deleted',
        suppliers: '++id, name, sync_status, _version, _updatedAt, _deleted',
        users: 'email, name, is_active, sync_status, _version, _updatedAt, _deleted',
        settings: 'id, sync_status, _version, _updatedAt, _deleted',
        outbox: '++id, collection, docId, type, [collection+docId]'
    }).upgrade(tx => {
        return tx.transactions.toCollection().modify(transaction => {
            if (transaction.items && Array.isArray(transaction.items)) {
                transaction.item_ids = transaction.items.map(item => item.id);
            } else {
                transaction.item_ids = [];
            }
        });
    });
    repository = DexieRepository;
    dbPromise = Promise.resolve(dexieDb); // Resolve with the Dexie instance
}

// Global error handler for unhandled database exceptions
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.name && event.reason.name.includes('Error')) {
        handleError(event.reason, 'Database Global');
    }
});

if (!use_sqlite) {
    dbPromise.then(db => { // Access the Dexie instance from the promise
        db.on('versionchange', function (event) {
            console.warn("Database version change detected in another tab. Closing connection...");
            db.close();
            alert("The system has been updated. This tab will now reload.");
            window.location.reload();
        });

        db.on('blocked', function (event) {
            console.warn("Database upgrade blocked by other open tabs.");
        });

        db.on('populate', (trans) => {
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
    });
}

export const dbRepository = repository;
export { dbPromise };
