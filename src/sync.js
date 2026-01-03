import { db } from './db.js';

export async function syncProductCatalog(fetchChangesFromCloud) {
    try {
        // 1. Get the last sync time
        const lastSyncRecord = await db.sync_metadata.get('last_item_sync');
        const lastSync = lastSyncRecord ? lastSyncRecord.value : 0;

        console.log(`Starting sync. Last sync was: ${new Date(lastSync).toISOString()}`);

        // 2. Fetch only changed items from your API/Firebase
        // The fetchChangesFromCloud function should point to your specific backend logic
        const changedItems = await fetchChangesFromCloud(lastSync);

        if (changedItems.length > 0) {
            // 3. Update local database
            // bulkPut handles both creating new records and updating existing ones by primary key
            await db.items.bulkPut(changedItems);
            
            // 4. Update the sync timestamp to the latest 'updatedAt' found in the batch
            const latestTimestamp = Math.max(...changedItems.map(item => item.updatedAt));
            await db.sync_metadata.put({ key: 'last_item_sync', value: latestTimestamp });
            
            console.log(`Sync complete. Updated ${changedItems.length} items.`);
        } else {
            console.log('Local database is already up to date.');
        }
    } catch (error) {
        console.error('Sync failed:', error);
        throw error;
    }
}

/**
 * Example usage for UI components:
 * Instead of calling the cloud, use this:
 */
export async function searchItems(query) {
    return await db.items
        .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
        .toArray();
}