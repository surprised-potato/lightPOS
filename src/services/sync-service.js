import { db } from "../db.js";

const API_URL = 'api/router.php';
const SYNC_INTERVAL = 30000; // 30 seconds

export function startRealtimeSync() {
    console.log("Starting sync service...");
    
    // 1. Downlink: Poll for item updates
    syncItemsDown();
    setInterval(syncItemsDown, SYNC_INTERVAL);

    syncCustomersDown();
    setInterval(syncCustomersDown, SYNC_INTERVAL);

    syncTransactionsDown();
    setInterval(syncTransactionsDown, SYNC_INTERVAL);

    // 1b. Additional Downlink entities
    const extraEntities = ['shifts', 'expenses', 'adjustments', 'returns', 'suppliers', 'settings', 'stock_in_history'];
    extraEntities.forEach(entity => {
        let table = entity;
        if (entity === 'settings') table = 'sync_metadata';
        if (entity === 'stock_in_history') table = 'stockins';

        syncEntityDown(entity, table);
        setInterval(() => {
            syncEntityDown(entity, table);
        }, SYNC_INTERVAL);
    });

    // 2. Uplink: Listen for online status
    window.addEventListener('online', processQueue);
    
    // 3. Try processing queue on startup
    processQueue();
}

function updateLastSyncTimestamp(timestamp = null, pushToServer = false) {
    const newTs = timestamp || new Date().toISOString();
    const localTs = localStorage.getItem('last_sync_timestamp');
    
    // Only update local storage if the new timestamp is actually newer
    if (!localTs || new Date(newTs) > new Date(localTs)) {
        localStorage.setItem('last_sync_timestamp', newTs);
        window.dispatchEvent(new CustomEvent('sync-updated'));
    }
    
    // Only push to server if explicitly requested (e.g., after a successful upload)
    if (pushToServer && navigator.onLine) {
        fetch(`${API_URL}?file=last_sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: newTs })
        }).catch(() => {}); // Silent fail for network errors
    }
}

/**
 * Generic helper to sync data down from server to local Dexie
 */
async function syncEntityDown(file, table) {
    if (!navigator.onLine) return;
    try {
        const response = await fetch(`${API_URL}?file=${file}`);
        if (!response.ok) return;
        
        let data = await response.json();
        // Settings/Metadata might be an object, others are arrays
        if (table !== 'sync_metadata' && !Array.isArray(data)) data = [];

        // Convert date strings to Date objects for indexing and range queries
        if (Array.isArray(data)) {
            data = data.map(item => {
                if (item.timestamp) item.timestamp = new Date(item.timestamp);
                if (item.date) item.date = new Date(item.date);
                if (item.start_time) item.start_time = new Date(item.start_time);
                if (item.end_time) item.end_time = item.end_time ? new Date(item.end_time) : null;
                if (item.updatedAt) item.updatedAt = new Date(item.updatedAt);
                if (item.voided_at) item.voided_at = new Date(item.voided_at);
                return item;
            });
        }

        if (db.isOpen()) {
            if (table === 'sync_metadata') {
                await db[table].put({ key: file, value: data });
            } else {
                await db[table].bulkPut(data);
            }
        }
    } catch (error) {
        console.error(`Error syncing ${file} down:`, error);
    }
}

async function syncItemsDown() {
    if (!navigator.onLine) return;
    
    try {
        // Fetch items and global sync metadata
        const response = await fetch(`${API_URL}?file=items`);
        
        // Fetch metadata separately to avoid blocking or console noise if missing
        fetch(`${API_URL}?file=last_sync`)
            .then(async (res) => {
                if (res.ok) {
                    const meta = await res.json().catch(() => null);
                    if (meta && meta.timestamp) updateLastSyncTimestamp(meta.timestamp);
                }
            })
            .catch(() => {}); 

        if (!response.ok) return;
        
        let items = await response.json();
        if (!Array.isArray(items)) items = [];

        items = items.map(i => ({
            ...i,
            updatedAt: i.updatedAt ? new Date(i.updatedAt) : new Date()
        }));

        // Bulk put updates existing items by ID and adds new ones
        await db.items.bulkPut(items);
        updateLastSyncTimestamp();
        console.log(`Synced ${items.length} items from Server.`);
    } catch (error) {
        console.error("Error syncing items down:", error);
    }
}

async function syncCustomersDown() {
    if (!navigator.onLine) return;
    
    try {
        const response = await fetch(`${API_URL}?file=customers`);
        if (!response.ok) return;
        
        let customers = await response.json();
        if (!Array.isArray(customers)) customers = [];

        await db.customers.bulkPut(customers);
        updateLastSyncTimestamp();
    } catch (error) {
        console.error("Error syncing customers down:", error);
    }
}

async function syncTransactionsDown() {
    if (!navigator.onLine) return;
    
    try {
        const response = await fetch(`${API_URL}?file=transactions`);
        if (!response.ok) return;
        
        let transactions = await response.json();
        if (!Array.isArray(transactions)) transactions = [];

        transactions = transactions.map(tx => ({
            ...tx,
            timestamp: new Date(tx.timestamp)
        }));

        if (db.isOpen()) {
            await db.transactions.bulkPut(transactions);
            updateLastSyncTimestamp();
        } else {
            console.warn("Database is closed. Skipping transactions downlink sync.");
        }
    } catch (error) {
        console.error("Error syncing transactions down:", error);
    }
}

export async function syncAll() {
    if (!navigator.onLine) return;
    console.log("Manual sync triggered...");
    try {
        await Promise.all([
            syncItemsDown(),
            syncCustomersDown(),
            syncTransactionsDown(),
            processQueue(),
            syncEntityDown('shifts', 'shifts'),
            syncEntityDown('expenses', 'expenses'),
            syncEntityDown('adjustments', 'adjustments'),
            syncEntityDown('returns', 'returns'),
            syncEntityDown('suppliers', 'suppliers')
        ]);
        updateLastSyncTimestamp();
    } catch (e) {
        console.error("Manual sync failed", e);
    }
}

export async function processQueue() {
    if (!navigator.onLine) {
        console.log("Offline. Skipping sync.");
        return;
    }

    try {
        // 1. Get unsynced local transactions
        const unsyncedTxs = await db.transactions.where("sync_status").equals(0).toArray();
        if (unsyncedTxs.length === 0) return;

        console.log(`Syncing ${unsyncedTxs.length} transactions to Server...`);

        // 2. Fetch Server State (Items & Transactions)
        const [itemsRes, txRes] = await Promise.all([
            fetch(`${API_URL}?file=items`),
            fetch(`${API_URL}?file=transactions`)
        ]);

        let serverItems = await itemsRes.json();
        if (!Array.isArray(serverItems)) serverItems = [];

        let serverTxs = await txRes.json();
        if (!Array.isArray(serverTxs)) serverTxs = [];

        // 3. Process each unsynced transaction
        for (const tx of unsyncedTxs) {
            // a. Prepare server transaction object (already has UUID)
            if (serverTxs.some(s => s.id === tx.id)) {
                continue;
            }

            const serverTx = { ...tx, sync_status: 1 };
            serverTxs.push(serverTx);

            // b. Update Server Stock
            if (tx.items && Array.isArray(tx.items)) {
                tx.items.forEach(cartItem => {
                    const itemIndex = serverItems.findIndex(i => i.id === cartItem.id);
                    if (itemIndex !== -1) {
                        serverItems[itemIndex].stock_level -= cartItem.qty;
                    }
                });
            }
        }

        // 4. Save back to Server
        await Promise.all([
            fetch(`${API_URL}?file=items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverItems)
            }),
            fetch(`${API_URL}?file=transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverTxs)
            })
        ]);

        // 5. Mark local transactions as synced
        await db.transaction('rw', db.transactions, async () => {
            for (const tx of unsyncedTxs) {
                await db.transactions.update(tx.id, { sync_status: 1 });
            }
        });

        updateLastSyncTimestamp(null, true);

        // 6. Process Generic Sync Queue (e.g., Stock In)
        const syncQueueItems = await db.syncQueue.toArray();
        if (syncQueueItems.length > 0) {
            console.log(`Processing ${syncQueueItems.length} queued actions...`);
            
            for (const item of syncQueueItems) {
                try {
                    const res = await fetch(`${API_URL}?action=${item.action}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: item.data })
                    });
                    
                    if (res.ok) {
                        await db.syncQueue.delete(item.id);
                        updateLastSyncTimestamp();
                    }
                } catch (e) {
                    console.error(`Failed to sync action ${item.action}`, e);
                }
            }
        }

        console.log("Sync complete.");

    } catch (error) {
        console.error("Error processing sync queue:", error);
    }
}