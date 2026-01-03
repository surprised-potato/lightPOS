import { db as localDb } from "../db.js";
import { db as remoteDb } from "../firebase-config.js";
import { collection, onSnapshot, addDoc, writeBatch, doc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function startRealtimeSync() {
    console.log("Starting realtime sync service...");
    
    // Uplink: Listen for online status and try syncing immediately
    window.addEventListener('online', processQueue);
    // Try processing queue on startup
    processQueue();

    // Sync Items: Firestore -> Dexie
    // This listener stays active as long as the app is running
    const unsubscribe = onSnapshot(collection(remoteDb, "items"), (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
        });

        // Bulk update local DB
        // bulkPut will add new items and update existing ones by primary key (id)
        localDb.items.bulkPut(items).then(() => {
            console.log(`Synced ${items.length} items from Cloud to Local DB.`);
            // Verification: Log current Dexie state
            return localDb.items.toArray();
        }).then((dexieItems) => {
            console.log("Current Dexie Items:", dexieItems);
        }).catch((err) => {
            console.error("Error syncing items to local DB:", err);
        });
    }, (error) => {
        console.error("Firestore sync error:", error);
    });
    
    return unsubscribe;
}

export async function processQueue() {
    if (!navigator.onLine) {
        console.log("Offline. Skipping sync.");
        return;
    }

    try {
        // Query Dexie for unsynced transactions (sync_status === 0)
        const unsyncedTxs = await localDb.transactions.where("sync_status").equals(0).toArray();

        if (unsyncedTxs.length === 0) return;

        console.log(`Syncing ${unsyncedTxs.length} transactions to Cloud...`);

        for (const tx of unsyncedTxs) {
            // 1. Write to Firestore transactions collection
            // Exclude the local Dexie ID
            const { id, ...txData } = tx;
            await addDoc(collection(remoteDb, "transactions"), txData);

            // 2. Batch update Firestore items (decrement stock)
            const batch = writeBatch(remoteDb);
            tx.items.forEach(item => {
                const itemRef = doc(remoteDb, "items", item.id);
                batch.update(itemRef, { 
                    stock_level: increment(-item.qty) 
                });
            });
            await batch.commit();

            // 3. Update Dexie transaction synced status
            await localDb.transactions.update(id, { sync_status: 1 });
            console.log(`Transaction ${id} synced successfully.`);
        }
    } catch (error) {
        console.error("Error processing sync queue:", error);
    }
}