import { db } from '../db.js';

/**
 * Repository Pattern for Data Access.
 * Centralizes data operations and ensures the Outbox is updated for synchronization.
 */
export const Repository = {
    /**
     * Retrieves a document by its primary key.
     * @param {string} collection - The Dexie table name.
     * @param {any} id - The primary key value.
     */
    async get(collection, id) {
        return await db[collection].get(id);
    },

    /**
     * Get all documents in a collection (excluding soft-deleted).
     */
    async getAll(collection) {
        return await db[collection]
            .filter(item => !item._deleted)
            .toArray();
    },

    /**
     * Upserts a document into the local database and queues it for synchronization.
     * @param {string} collection - The Dexie table name.
     * @param {Object} data - The document payload.
     */
    async upsert(collection, data) {
        const idField = db[collection].schema.primKey.name;
        const id = data[idField];

        return await db.transaction('rw', [db[collection], db.outbox], async () => {
            const existing = id ? await db[collection].get(id) : null;
            
            const record = {
                ...data,
                _version: (existing?._version || 0) + 1,
                _updatedAt: Date.now(),
                _deleted: false
            };

            // Save to local store
            const savedId = await db[collection].put(record);
            const finalId = id || savedId;

            // Ensure the record in outbox has the correct ID (especially for new auto-incremented records)
            if (!record[idField]) record[idField] = finalId;

            // Add to outbox for sync
            await db.outbox.add({
                collection,
                docId: finalId,
                type: 'upsert',
                payload: record
            });

            return record;
        });
    },

    /**
     * Performs a soft-delete by setting the _deleted flag and incrementing the version.
     * @param {string} collection - The Dexie table name.
     * @param {any} id - The primary key value.
     */
    async remove(collection, id) {
        return await db.transaction('rw', [db[collection], db.outbox], async () => {
            const existing = await db[collection].get(id);
            if (!existing) return;

            const record = {
                ...existing,
                _version: (existing._version || 0) + 1,
                _updatedAt: Date.now(),
                _deleted: true
            };

            await db[collection].put(record);
            await db.outbox.add({
                collection,
                docId: id,
                type: 'delete',
                payload: record
            });
        });
    }
};