import { dbPromise } from '../db.js';
import { handleError } from '../utils.js';

export const DexieRepository = {
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

    async get(collection, id, includeDeleted = false) {
        const db = await dbPromise;
        if (!db[collection]) throw new Error(`Repository Error: Collection '${collection}' does not exist.`);
        const item = await db[collection].get(id);
        if (!item) return null;

        const isDeleted = item._deleted === true || item._deleted === 1 || item._deleted === "1" || item._deleted === "true";
        return (includeDeleted || !isDeleted) ? item : null;
    },

    async getAll(collection, includeDeleted = false) {
        const db = await dbPromise;
        try {
            if (!db[collection]) throw new Error(`Repository Error: Collection '${collection}' does not exist.`);
            const all = await db[collection].toArray();

            const filtered = includeDeleted ? all : all.filter(item => {
                // Robust check for _deleted (handles boolean, numbers 0/1, and strings "0"/"1")
                const isDeleted = item._deleted === true || item._deleted === 1 || item._deleted === "1" || item._deleted === "true";
                return !isDeleted;
            });

            if (!includeDeleted && all.length !== filtered.length) {
                console.log(`[Repository] getAll(${collection}): Filtered ${all.length - filtered.length} deleted items.`);
            }
            return filtered;
        } catch (error) {
            handleError(error, `Repository.getAll(${collection})`);
            return [];
        }
    },

    async remove(collection, id) {
        const db = await dbPromise;
        if (!db[collection]) throw new Error(`Repository Error: Collection '${collection}' does not exist.`);

        let existing = await db[collection].get(id);
        // ID Type Mismatch Safeguard
        if (!existing && !isNaN(id)) {
            existing = await db[collection].get(parseInt(id));
        }

        if (!existing) {
            console.warn(`[Repository] remove(${collection}): Record with ID ${id} not found.`);
            return;
        }

        // Soft delete: increment version and set _deleted flag
        await this.upsert(collection, {
            ...existing,
            _deleted: true
        });
    },

    async find(collection, query, ignoreCase = false) {
        const db = await dbPromise;
        let result = db[collection];
        const key = Object.keys(query)[0];
        const value = Object.values(query)[0];

        if (ignoreCase) {
            result = result.where(key).equalsIgnoreCase(value);
        } else {
            result = result.where(query);
        }
        return result.first();
    },

    async query(collection, queryObj) {
        const db = await dbPromise;
        let result = db[collection];

        if (queryObj.where) {
            const whereClauses = Object.entries(queryObj.where);
            if (whereClauses.length > 0) {
                const [key, value] = whereClauses[0];
                if (typeof value === 'object' && value.operator) {
                    switch (value.operator) {
                        case '>=':
                            result = result.where(key).aboveOrEqual(value.value);
                            break;
                        case '<=':
                            result = result.where(key).belowOrEqual(value.value);
                            break;
                        case '>':
                            result = result.where(key).above(value.value);
                            break;
                        case '<':
                            result = result.where(key).below(value.value);
                            break;
                        default:
                            result = result.where(queryObj.where);
                            break;
                    }
                } else {
                    result = result.where(queryObj.where);
                }
            }
        }

        if (queryObj.orderBy) {
            result = result.orderBy(queryObj.orderBy);
            if (queryObj.reverse) {
                result = result.reverse();
            }
        }

        if (queryObj.filters) {
            for (const filter of queryObj.filters) {
                result = result.filter(filter);
            }
        }

        if (queryObj.limit) {
            result = result.limit(queryObj.limit);
        }

        if (queryObj.each) {
            return result.each(queryObj.each);
        }

        if (queryObj.last) {
            return result.last();
        }

        return result.toArray();
    }
};
