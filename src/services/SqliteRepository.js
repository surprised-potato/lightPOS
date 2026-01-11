import { get, getAll, run } from '../db_sqlite.js';
import { handleError } from '../utils.js';

function getPrimaryKey(collection) {
    const primaryKeys = {
        items: 'id',
        transactions: 'id',
        stock_movements: 'id',
        stock_logs: 'id',
        adjustments: 'id',
        sync_metadata: 'key',
        customers: 'id',
        stockins: 'id',
        suspended_transactions: 'id',
        notifications: 'id',
        returns: 'id',
        shifts: 'id',
        expenses: 'id',
        suppliers: 'id',
        users: 'email',
        settings: 'id',
        outbox: 'id'
    };
    return primaryKeys[collection];
}

export const SqliteRepository = {
    async upsert(collection, data) {
        try {
            const idField = getPrimaryKey(collection);
            const id = data[idField];

            const existing = await this.get(collection, id);

            const newVersion = (existing?._version || 0) + 1;

            const updatedDoc = {
                ...data,
                _version: newVersion,
                _updatedAt: Date.now(),
                _deleted: data._deleted || false
            };

            const columns = Object.keys(updatedDoc);
            const values = Object.values(updatedDoc);
            const placeholders = columns.map(() => '?').join(', ');

            // For upsert, we need to handle both insert and update
            // The ON CONFLICT clause requires SQLite 3.24.0+
            const updateSet = columns.map(col => `${col} = excluded.${col}`).join(', ');

            const query = `
                INSERT INTO ${collection} (${columns.join(', ')}) 
                VALUES (${placeholders})
                ON CONFLICT(${idField}) DO UPDATE SET ${updateSet}
            `;

            run(query, values);

            console.log(`Upsert on ${collection} with id ${id}`);

            return updatedDoc;
        } catch (error) {
            handleError(error, `SqliteRepository.upsert(${collection})`);
            throw error;
        }
    },

    async get(collection, id, includeDeleted = false) {
        const idField = getPrimaryKey(collection);
        let query = `SELECT * FROM ${collection} WHERE ${idField} = ?`;
        if (!includeDeleted) {
            query += ` AND (_deleted = 0 OR _deleted IS NULL OR _deleted = '0' OR _deleted = 'false') AND (_deleted != 1 AND _deleted != '1' AND _deleted != 'true')`;
        }
        return get(query, [id]);
    },

    async getAll(collection, includeDeleted = false) {
        let query = `SELECT * FROM ${collection}`;
        if (!includeDeleted) {
            // Check if _deleted column exists to avoid errors on tables without it
            // Robust check for 1, '1', 'true'
            query += ` WHERE (_deleted = 0 OR _deleted IS NULL OR _deleted = '0' OR _deleted = 'false') AND (_deleted != 1 AND _deleted != '1' AND _deleted != 'true')`;
        }
        return getAll(query);
    },

    async remove(collection, id) {
        const existing = await this.get(collection, id);
        if (!existing) return;

        await this.upsert(collection, {
            ...existing,
            _deleted: true
        });
    },

    async find(collection, query) {
        const whereEntries = Object.entries(query);
        const whereClause = whereEntries.map(([key]) => `${key} = ?`).join(' AND ');
        const params = whereEntries.map(([, value]) => value);
        const sql = `SELECT * FROM ${collection} WHERE ${whereClause} LIMIT 1`;
        return get(sql, params);
    },

    async query(collection, queryObj) {
        let sql = `SELECT * FROM ${collection}`;
        const params = [];

        if (queryObj.where) {
            const whereEntries = Object.entries(queryObj.where);
            if (whereEntries.length > 0) {
                const whereClause = whereEntries.map(([key]) => `${key} = ?`).join(' AND ');
                sql += ` WHERE ${whereClause}`;
                params.push(...whereEntries.map(([, value]) => value));
            }
        }

        if (queryObj.orderBy) {
            sql += ` ORDER BY ${queryObj.orderBy}`;
            if (queryObj.reverse) {
                sql += ' DESC';
            } else {
                sql += ' ASC';
            }
        }

        if (queryObj.last) {
            if (!queryObj.orderBy) {
                const idField = getPrimaryKey(collection);
                sql += ` ORDER BY ${idField}`;
            }
            sql += ' DESC LIMIT 1';
        }


        if (queryObj.limit && !queryObj.last) {
            sql += ` LIMIT ?`;
            params.push(queryObj.limit);
        }

        let results = getAll(sql, params);

        if (queryObj.filters) {
            for (const filter of queryObj.filters) {
                results = results.filter(filter);
            }
        }

        if (queryObj.each) {
            results.forEach(queryObj.each);
            return;
        }

        if (queryObj.last) {
            return results[0];
        }

        return results;
    }
};
