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

    // 2. Uplink: Listen for online status
    window.addEventListener('online', processQueue);
    
    // 3. Try processing queue on startup
    processQueue();
}

async function syncItemsDown() {
    if (!navigator.onLine) return;
    
    try {
        const response = await fetch(`${API_URL}?file=items`);
        if (!response.ok) return;
        
        let items = await response.json();
        if (!Array.isArray(items)) items = [];

        // Bulk put updates existing items by ID and adds new ones
        await db.items.bulkPut(items);
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
    } catch (error) {
        console.error("Error syncing customers down:", error);
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
            // a. Prepare server transaction object
            // Generate a UUID for the server record, keep local ID for reference if needed
            const serverTx = { 
                ...tx, 
                id: crypto.randomUUID(), 
                sync_status: 1,
                local_id: tx.id 
            };
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