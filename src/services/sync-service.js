import { db } from "../db.js";
import { generateUUID } from "../utils.js";

const API_URL = 'api/router.php';
const SYNC_INTERVAL = 30000; // 30 seconds

/**
 * Wrapper for fetch with a timeout to prevent hanging requests
 */
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 5000 } = options; // Default 5s timeout
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/**
 * Synchronizes a local change with the remote JSON-based storage.
 * Used for simple CRUD entities like items, suppliers, and customers.
 */
export async function syncCollection(fileName, id, data, isDelete = false) {
    if (!navigator.onLine) return false;

    try {
        const response = await fetchWithTimeout(`${API_URL}?file=${fileName}`);
        let remoteData = await response.json();
        if (!Array.isArray(remoteData)) remoteData = [];

        if (isDelete) {
            remoteData = remoteData.filter(item => item.id !== id);
        } else {
            const index = remoteData.findIndex(item => item.id === id);
            const payload = { ...data, id, sync_status: 1 };
            if (index !== -1) {
                remoteData[index] = { ...remoteData[index], ...payload };
            } else {
                remoteData.push(payload);
            }
        }

        const saveResponse = await fetchWithTimeout(`${API_URL}?file=${fileName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(remoteData)
        });

        return saveResponse.ok;
    } catch (error) {
        console.error(`Sync error for ${fileName}:`, error);
        return false;
    }
}

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
    const extraEntities = ['shifts', 'expenses', 'adjustments', 'returns', 'suppliers', 'settings', 'stock_in_history', 'stock_movements', 'suspended_transactions', 'users'];
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
        fetchWithTimeout(`${API_URL}?file=last_sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: newTs })
        }).catch(() => {}); // Silent fail for network errors
    }
}

async function updateSyncHistory(entity) {
    if (db.isOpen()) {
        await db.sync_metadata.put({ 
            key: `sync_history_${entity}`, 
            value: new Date().toISOString() 
        });
    }
}

/**
 * Generic helper to sync data down from server to local Dexie
 */
async function syncEntityDown(file, table) {
    if (!navigator.onLine) return;
    try {
        const response = await fetchWithTimeout(`${API_URL}?file=${file}`);
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
            await updateSyncHistory(file);
        }
    } catch (error) {
        console.error(`Error syncing ${file} down:`, error);
    }
}

async function syncItemsDown() {
    if (!navigator.onLine) return;
    
    try {
        // Fetch items and global sync metadata
        const response = await fetchWithTimeout(`${API_URL}?file=items`);
        
        // Fetch metadata separately to avoid blocking or console noise if missing
        fetchWithTimeout(`${API_URL}?file=last_sync`)
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
        await updateSyncHistory('items');
        console.log(`Synced ${items.length} items from Server.`);
    } catch (error) {
        console.error("Error syncing items down:", error);
    }
}

async function syncCustomersDown() {
    if (!navigator.onLine) return;
    
    try {
        const response = await fetchWithTimeout(`${API_URL}?file=customers`);
        if (!response.ok) return;
        
        let customers = await response.json();
        if (!Array.isArray(customers)) customers = [];

        await db.customers.bulkPut(customers);
        updateLastSyncTimestamp();
        await updateSyncHistory('customers');
    } catch (error) {
        console.error("Error syncing customers down:", error);
    }
}

async function syncTransactionsDown() {
    if (!navigator.onLine) return;
    
    try {
        const response = await fetchWithTimeout(`${API_URL}?file=transactions`);
        if (!response.ok) return;
        
        let transactions = await response.json();
        if (!Array.isArray(transactions)) transactions = [];

        transactions = transactions.map(tx => ({
            ...tx,
            timestamp: new Date(tx.timestamp),
            voided_at: tx.voided_at ? new Date(tx.voided_at) : null
        }));

        if (db.isOpen()) {
            await db.transactions.bulkPut(transactions);
            updateLastSyncTimestamp();
            await updateSyncHistory('transactions');
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
        console.log("Starting manual sync of all entities...");
        
        console.log("Syncing items...");
        await syncItemsDown();
        
        console.log("Syncing customers...");
        await syncCustomersDown();
        
        console.log("Syncing transactions...");
        await syncTransactionsDown();
        
        console.log("Processing sync queue...");
        await processQueue();
        
        const entities = [
            { file: 'shifts', table: 'shifts' },
            { file: 'expenses', table: 'expenses' },
            { file: 'adjustments', table: 'adjustments' },
            { file: 'returns', table: 'returns' },
            { file: 'suppliers', table: 'suppliers' },
            { file: 'stock_movements', table: 'stock_movements' },
            { file: 'users', table: 'users' }
        ];
        
        for (const entity of entities) {
            console.log(`Syncing ${entity.file}...`);
            await syncEntityDown(entity.file, entity.table);
        }

        updateLastSyncTimestamp();
        console.log("Manual sync completed successfully.");
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
        // 1. Get unsynced local data (including items and customers)
        const [unsyncedTxs, unsyncedMovements, unsyncedStockins, unsyncedAdjustments, unsyncedItems, unsyncedCustomers, unsyncedSuppliers, unsyncedExpenses, unsyncedShifts, unsyncedUsers, syncQueueItems] = await Promise.all([
            db.transactions.where("sync_status").equals(0).toArray(),
            db.stock_movements.where("sync_status").equals(0).toArray(),
            db.stockins.where("sync_status").equals(0).toArray(),
            db.adjustments.where("sync_status").equals(0).toArray(),
            db.items.where("sync_status").equals(0).toArray(),
            db.customers.where("sync_status").equals(0).toArray(),
            db.suppliers.where("sync_status").equals(0).toArray(),
            db.expenses.where("sync_status").equals(0).toArray(),
            db.shifts.where("sync_status").equals(0).toArray(),
            db.users.where("sync_status").equals(0).toArray(),
            db.syncQueue.toArray()
        ]);

        if (unsyncedTxs.length === 0 && unsyncedMovements.length === 0 && 
            unsyncedStockins.length === 0 && unsyncedAdjustments.length === 0 && 
            unsyncedItems.length === 0 && unsyncedCustomers.length === 0 &&
            unsyncedSuppliers.length === 0 && unsyncedExpenses.length === 0 &&
            unsyncedShifts.length === 0 && unsyncedUsers.length === 0 &&
            syncQueueItems.length === 0) return;

        console.log("Processing background sync for all entities...");

        // 2. Fetch Server State
        const [itemsRes, txRes, movementsRes, stockinsRes, adjustmentsRes, customersRes, suppliersRes, expensesRes, shiftsRes, usersRes] = await Promise.all([
            fetchWithTimeout(`${API_URL}?file=items`),
            fetchWithTimeout(`${API_URL}?file=transactions`),
            fetchWithTimeout(`${API_URL}?file=stock_movements`),
            fetchWithTimeout(`${API_URL}?file=stock_in_history`),
            fetchWithTimeout(`${API_URL}?file=adjustments`),
            fetchWithTimeout(`${API_URL}?file=customers`),
            fetchWithTimeout(`${API_URL}?file=suppliers`),
            fetchWithTimeout(`${API_URL}?file=expenses`),
            fetchWithTimeout(`${API_URL}?file=shifts`),
            fetchWithTimeout(`${API_URL}?file=users`)
        ]);

        let serverItems = await itemsRes.json();
        if (!Array.isArray(serverItems)) serverItems = [];

        let serverTxs = await txRes.json();
        if (!Array.isArray(serverTxs)) serverTxs = [];

        let serverMovements = await movementsRes.json();
        if (!Array.isArray(serverMovements)) serverMovements = [];

        let serverStockins = await stockinsRes.json();
        if (!Array.isArray(serverStockins)) serverStockins = [];

        let serverAdjustments = await adjustmentsRes.json();
        if (!Array.isArray(serverAdjustments)) serverAdjustments = [];

        let serverCustomers = await customersRes.json();
        if (!Array.isArray(serverCustomers)) serverCustomers = [];

        let serverSuppliers = await suppliersRes.json();
        if (!Array.isArray(serverSuppliers)) serverSuppliers = [];

        let serverExpenses = await expensesRes.json();
        if (!Array.isArray(serverExpenses)) serverExpenses = [];

        let serverShifts = await shiftsRes.json();
        if (!Array.isArray(serverShifts)) serverShifts = [];

        let serverUsers = await usersRes.json();
        if (!Array.isArray(serverUsers)) serverUsers = [];

        // 3. Process each unsynced transaction
        for (const tx of unsyncedTxs) {
            const serverIdx = serverTxs.findIndex(s => s.id === tx.id);
            
            if (serverIdx !== -1) {
                // Update existing transaction (e.g. Void status)
                serverTxs[serverIdx] = { ...tx, sync_status: 1 };
            } else {
                // Add new transaction
                const serverTx = { ...tx, sync_status: 1 };
                serverTxs.push(serverTx);
            }

            // b. Update Server Stock & Record Movements (Only for active sales)
            if (!tx.is_voided && tx.items && Array.isArray(tx.items)) {
                tx.items.forEach(cartItem => {
                    const itemIndex = serverItems.findIndex(i => i.id === cartItem.id);
                    if (itemIndex !== -1) {
                        serverItems[itemIndex].stock_level -= cartItem.qty;

                        // Record movement for the sale
                        const mRecord = {
                            id: `${tx.id}-${cartItem.id}`, // Deterministic ID to prevent duplicates
                            item_id: cartItem.id,
                            item_name: cartItem.name,
                            timestamp: tx.timestamp,
                            type: 'Sale',
                            qty: -cartItem.qty,
                            user: tx.user_email || 'Unknown',
                            transaction_id: tx.id,
                            reason: 'Customer Purchase',
                            sync_status: 1
                        };
                        serverMovements.push(mRecord);
                        
                        // Also save locally so reports are instant
                        db.stock_movements.put(mRecord).catch(() => {});
                    }
                });
            }
        }

        // c. Process local unsynced movements (Returns, Adjustments, etc.)
        for (const m of unsyncedMovements) {
            if (!serverMovements.some(sm => sm.id === m.id)) {
                serverMovements.push({ ...m, sync_status: 1 });

                // Apply movement to server items stock
                const itemIdx = serverItems.findIndex(i => i.id === m.item_id);
                if (itemIdx !== -1) {
                    serverItems[itemIdx].stock_level += m.qty;
                }
            }
        }

        // f. Process local unsynced items
        for (const item of unsyncedItems) {
            const idx = serverItems.findIndex(si => si.id === item.id);
            if (idx !== -1) {
                serverItems[idx] = { ...item, sync_status: 1 };
            } else {
                serverItems.push({ ...item, sync_status: 1 });
            }
        }

        // g. Process local unsynced customers
        for (const cust of unsyncedCustomers) {
            const idx = serverCustomers.findIndex(sc => sc.id === cust.id);
            if (idx !== -1) {
                serverCustomers[idx] = { ...cust, sync_status: 1 };
            } else {
                serverCustomers.push({ ...cust, sync_status: 1 });
            }
        }

        // h. Process local unsynced suppliers
        for (const sup of unsyncedSuppliers) {
            const idx = serverSuppliers.findIndex(s => s.id === sup.id);
            if (idx !== -1) {
                serverSuppliers[idx] = { ...sup, sync_status: 1 };
            } else {
                serverSuppliers.push({ ...sup, sync_status: 1 });
            }
        }

        // i. Process local unsynced expenses
        for (const exp of unsyncedExpenses) {
            if (!serverExpenses.some(e => e.id === exp.id)) {
                serverExpenses.push({ ...exp, sync_status: 1 });
            }
        }

        // j. Process local unsynced shifts
        for (const shift of unsyncedShifts) {
            const idx = serverShifts.findIndex(s => s.id === shift.id);
            if (idx !== -1) {
                serverShifts[idx] = { ...shift, sync_status: 1 };
            } else {
                serverShifts.push({ ...shift, sync_status: 1 });
            }
        }

        // k. Process local unsynced users
        for (const user of unsyncedUsers) {
            const idx = serverUsers.findIndex(s => s.email === user.email);
            if (idx !== -1) {
                serverUsers[idx] = { ...user, sync_status: 1 };
            } else {
                serverUsers.push({ ...user, sync_status: 1 });
            }
        }

        // d. Process local unsynced stock-ins (History logs)
        for (const s of unsyncedStockins) {
            if (!serverStockins.some(ss => ss.id === s.id)) {
                serverStockins.push({ ...s, sync_status: 1 });
            }
        }

        // e. Process local unsynced adjustments (History logs)
        for (const a of unsyncedAdjustments) {
            if (!serverAdjustments.some(sa => sa.id === a.id)) {
                serverAdjustments.push({ ...a, sync_status: 1 });
            }
        }

        // 4. Save back to Server
        await Promise.all([
            fetchWithTimeout(`${API_URL}?file=items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverItems)
            }),
            fetchWithTimeout(`${API_URL}?file=transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverTxs)
            }),
            fetchWithTimeout(`${API_URL}?file=stock_movements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverMovements)
            }),
            fetchWithTimeout(`${API_URL}?file=stock_in_history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverStockins)
            }),
            fetchWithTimeout(`${API_URL}?file=adjustments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverAdjustments)
            }),
            fetchWithTimeout(`${API_URL}?file=customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverCustomers)
            }),
            fetchWithTimeout(`${API_URL}?file=suppliers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverSuppliers)
            }),
            fetchWithTimeout(`${API_URL}?file=expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverExpenses)
            }),
            fetchWithTimeout(`${API_URL}?file=shifts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverShifts)
            }),
            fetchWithTimeout(`${API_URL}?file=users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverUsers)
            })
        ]);

        // 5. Mark local records as synced
        await db.transaction('rw', [db.transactions, db.stock_movements, db.stockins, db.adjustments, db.items, db.customers, db.suppliers, db.expenses, db.shifts, db.users], async () => {
            for (const tx of unsyncedTxs) {
                await db.transactions.update(tx.id, { sync_status: 1 });
            }
            for (const m of unsyncedMovements) {
                await db.stock_movements.update(m.id, { sync_status: 1 });
            }
            for (const s of unsyncedStockins) {
                await db.stockins.update(s.id, { sync_status: 1 });
            }
            for (const a of unsyncedAdjustments) {
                await db.adjustments.update(a.id, { sync_status: 1 });
            }
            for (const i of unsyncedItems) {
                await db.items.update(i.id, { sync_status: 1 });
            }
            for (const c of unsyncedCustomers) {
                await db.customers.update(c.id, { sync_status: 1 });
            }
            for (const s of unsyncedSuppliers) {
                await db.suppliers.update(s.id, { sync_status: 1 });
            }
            for (const e of unsyncedExpenses) {
                await db.expenses.update(e.id, { sync_status: 1 });
            }
            for (const s of unsyncedShifts) {
                await db.shifts.update(s.id, { sync_status: 1 });
            }
            for (const u of unsyncedUsers) {
                await db.users.update(u.email, { sync_status: 1 });
            }
        });

        updateLastSyncTimestamp(null, true);
        await updateSyncHistory('uplink_queue');

        // 6. Process Generic Sync Queue (e.g., Stock In)
        if (syncQueueItems.length > 0) {
            console.log(`Processing ${syncQueueItems.length} queued actions...`);
            
            for (const item of syncQueueItems) {
                try {
                    // Handle special actions like deletions
                    if (item.action === 'delete_item') {
                        const res = await fetchWithTimeout(`${API_URL}?file=${item.data.fileName}`);
                        let remoteData = await res.json();
                        remoteData = remoteData.filter(r => r.id !== item.data.id);
                        await fetchWithTimeout(`${API_URL}?file=${item.data.fileName}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(remoteData)
                        });
                        await db.syncQueue.delete(item.id);
                        continue;
                    }

                    if (item.action === 'update_settings') {
                        await fetchWithTimeout(`${API_URL}?file=settings`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(item.data)
                        });
                        await db.syncQueue.delete(item.id);
                        continue;
                    }

                    if (item.action === 'sync_user') {
                        const res = await fetchWithTimeout(`${API_URL}?file=${item.data.fileName}`);
                        let remoteData = await res.json();
                        if (!Array.isArray(remoteData)) remoteData = [];
                        const idx = remoteData.findIndex(u => u.email === item.data.id);
                        if (idx !== -1) remoteData[idx] = item.data.payload;
                        else remoteData.push(item.data.payload);
                        
                        await fetchWithTimeout(`${API_URL}?file=${item.data.fileName}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(remoteData)
                        });
                        await db.syncQueue.delete(item.id);
                        continue;
                    }

                    const res = await fetchWithTimeout(`${API_URL}?action=${item.action}`, {
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