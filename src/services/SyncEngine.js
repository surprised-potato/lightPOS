import { db } from "../db.js";

const SYNC_URL = 'api/sync.php';

/**
 * Sync Engine managing the flow of data between Client and Server.
 * Uses Web Locks to prevent concurrent sync operations.
 */
export const SyncEngine = {
    async sync() {
        if (!navigator.onLine) return;

        const performSync = async () => {
            window.dispatchEvent(new CustomEvent('sync-started'));
            console.log("Sync started...");
            try {
                await this.push();
                await this.pull();
                localStorage.setItem('last_sync_timestamp', new Date().toISOString());
                window.dispatchEvent(new CustomEvent('sync-updated'));
                console.log("Sync completed.");
            } catch (error) {
                window.dispatchEvent(new CustomEvent('sync-failed'));
                console.error("Sync failed:", error);
            }
        };

        // Use Web Locks API to ensure only one tab performs sync (requires Secure Context/HTTPS)
        if (navigator.locks) {
            return await navigator.locks.request('sync_lock', performSync);
        } else {
            return await performSync();
        }
    },

    async push() {
        const outboxItems = await db.outbox.toArray();
        if (outboxItems.length === 0) return;

        const response = await fetch(SYNC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outbox: outboxItems })
        });

        if (response.ok) {
            const ids = outboxItems.map(i => i.id);
            await db.outbox.bulkDelete(ids);
        } else {
            throw new Error("Push failed");
        }
    },

    async pull() {
        const lastSyncMeta = await db.sync_metadata.get('last_pull_timestamp');
        const since = lastSyncMeta ? lastSyncMeta.value : 0;

        const response = await fetch(`${SYNC_URL}?since=${since}`);
        if (!response.ok) throw new Error("Pull failed");

        const { deltas, serverTime } = await response.json();

        for (const [collection, items] of Object.entries(deltas)) {
            if (!db[collection]) continue;

            await db.transaction('rw', db[collection], async () => {
                for (const item of items) {
                    const idField = db[collection].schema.primKey.name;
                    const local = await db[collection].get(item[idField]);
                    
                    const localVersion = local?._version || 0;
                    const serverVersion = item._version || 0;
                    const localUpdated = local?._updatedAt || 0;
                    const serverUpdated = item._updatedAt || 0;

                    // Apply change if local is missing or server version is higher (LWW)
                    if (!local || serverVersion > localVersion || (serverVersion === localVersion && serverUpdated > localUpdated)) {
                        await db[collection].put(item);
                        
                        // If we just applied a newer server version, remove any stale pending 
                        // changes for this specific record from the outbox.
                        await db.outbox
                            .where({ collection: collection, docId: item[idField] })
                            .delete();
                    }
                }
            });
        }

        await db.sync_metadata.put({ key: 'last_pull_timestamp', value: serverTime });
    }
};

// Auto-sync when coming back online
window.addEventListener('online', () => SyncEngine.sync());

// Periodic sync every 30 seconds
setInterval(() => SyncEngine.sync(), 30000);