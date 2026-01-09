import { dbPromise } from '../db.js';
import { handleError } from '../utils.js';

export const Repository = {
    /**
     * Performs a local update and queues it for synchronization.
     * Increments _version to ensure Last-Write-Wins (LWW) consistency.
     */
    async upsert(collection, data) {
        const db = await dbPromise;
        try {
            if (!db[collection]) {
                throw new Error(`Repository Error: Collection '${collection}' does not exist in the local database.`);
            }
            const idField = db[collection].schema.primKey.name;
            const id = data[idField];

            // 1. Get existing record to determine the next version
            const existing = await db[collection].get(id);
            
            // 2. Increment version
            const newVersion = (existing?._version || 0) + 1;

            const updatedDoc = {
                ...data,
                _version: newVersion,
                _updatedAt: Date.now(),
                _deleted: data._deleted || false
            };

            // 3. Update Local Database (Dexie)
            await db[collection].put(updatedDoc);

            // 4. Add to Outbox
            await db.outbox.add({
                collection,
                docId: id,
                type: 'upsert',
                payload: updatedDoc
            });

            return updatedDoc;
        } catch (error) {
            handleError(error, `Repository.upsert(${collection})`);
            throw error; // Re-throw to allow UI to handle failure
        }
    },

    async get(collection, id) {
        const db = await dbPromise;
        if (!db[collection]) throw new Error(`Repository Error: Collection '${collection}' does not exist.`);
        return await db[collection].get(id);
    },

    async getAll(collection) {
        const db = await dbPromise;
        if (!db[collection]) throw new Error(`Repository Error: Collection '${collection}' does not exist.`);
        return await db[collection].toArray();
    },

    async remove(collection, id) {
        const db = await dbPromise;
        if (!db[collection]) throw new Error(`Repository Error: Collection '${collection}' does not exist.`);
        const existing = await db[collection].get(id);
        if (!existing) return;

        // Soft delete: increment version and set _deleted flag
        await this.upsert(collection, { 
            ...existing, 
            _deleted: true 
        });
    }
};