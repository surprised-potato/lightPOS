import { db } from "../db.js";

/**
 * Repository pattern for data access.
 * Ensures every write is versioned and queued in the outbox for sync.
 */
export const Repository = {
    async upsert(collection, data) {
        const doc = {
            ...data,
            _version: (data._version || 0) + 1,
            _updatedAt: Math.floor(Date.now() / 1000),
            _deleted: false
        };
        
        // 1. Update local store (Optimistic UI)
        await db[collection].put(doc);
        
        // 2. Add mutation to outbox
        await db.outbox.add({
            collection,
            docId: doc.id || doc.email,
            type: 'upsert',
            payload: doc,
            timestamp: Math.floor(Date.now() / 1000)
        });
        
        return doc;
    },

    async remove(collection, id) {
        const existing = await db[collection].get(id);
        if (!existing) return;

        const doc = {
            ...existing,
            _version: (existing._version || 0) + 1,
            _updatedAt: Math.floor(Date.now() / 1000),
            _deleted: true
        };

        // 1. Soft delete local
        await db[collection].put(doc);

        // 2. Add mutation to outbox
        await db.outbox.add({
            collection,
            docId: id,
            type: 'remove',
            payload: doc,
            timestamp: Math.floor(Date.now() / 1000)
        });
    },

    async get(collection, id) {
        const doc = await db[collection].get(id);
        return (doc && !doc._deleted) ? doc : null;
    },

    async getAll(collection) {
        return await db[collection].filter(item => !item._deleted).toArray();
    }
};