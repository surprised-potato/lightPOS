import { db } from '../db.js';

export const Repository = {
    /**
     * Performs a local update and queues it for synchronization.
     * Increments _version to ensure Last-Write-Wins (LWW) consistency.
     */
    async upsert(collection, data) {
        const idField = collection === 'users' ? 'email' : 'id';
        const id = data[idField];

        // 1. Get existing record to determine the next version
        const existing = await db[collection].get(id);
        
        // 2. Increment version: 
        // If it's a new record, start at 1.
        // If it's an update, increment the existing version.
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
        // The SyncEngine will pick this up and push it to the server.
        await db.outbox.add({
            collection,
            docId: id,
            type: 'upsert',
            payload: updatedDoc
        });

        return updatedDoc;
    },

    async get(collection, id) {
        return await db[collection].get(id);
    },

    async getAll(collection) {
        return await db[collection].toArray();
    },

    async remove(collection, id) {
        const existing = await db[collection].get(id);
        if (!existing) return;

        // Soft delete: increment version and set _deleted flag
        await this.upsert(collection, { 
            ...existing, 
            _deleted: true 
        });
    }
};