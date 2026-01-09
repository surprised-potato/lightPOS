import { SyncEngine } from './SyncEngine.js';
import { dbPromise } from '../db.js';

// Mock database for testing
const mockDb = {
    outbox: {
        toArray: async () => [],
        bulkDelete: async () => {},
    },
    sync_metadata: {
        get: async () => ({ value: 0 }),
        put: async () => {},
    },
    items: {
        put: async () => {},
    },
    transaction: async (mode, tables, fn) => {
        await fn();
    }
};

async function setup() {
    // Backup original fetch
    const originalFetch = window.fetch;
    const db = await dbPromise;
    const originalOutboxToArray = db.outbox.toArray;
    const originalOutboxBulkDelete = db.outbox.bulkDelete;
    const originalSyncMetaGet = db.sync_metadata.get;
    const originalSyncMetaPut = db.sync_metadata.put;
    const originalItemsPut = db.items.put;
    const originalTransaction = db.transaction;

    // Apply mocks
    db.outbox.toArray = mockDb.outbox.toArray;
    db.outbox.bulkDelete = mockDb.outbox.bulkDelete;
    db.sync_metadata.get = mockDb.sync_metadata.get;
    db.sync_metadata.put = mockDb.sync_metadata.put;
    db.items.put = mockDb.items.put;
    db.transaction = mockDb.transaction;

    return {
        teardown: () => {
            window.fetch = originalFetch;
            db.outbox.toArray = originalOutboxToArray;
            db.outbox.bulkDelete = originalOutboxBulkDelete;
            db.sync_metadata.get = originalSyncMetaGet;
            db.sync_metadata.put = originalSyncMetaPut;
            db.items.put = originalItemsPut;
            db.transaction = originalTransaction;
        }
    };
}

export async function testPushWithData() {
    const description = "Verifies that SyncEngine.push sends data from the outbox to the server.";
    const { teardown } = await setup();
    let success = false;
    let error = null;

    try {
        const db = await dbPromise;
        db.outbox.toArray = async () => [{ id: 1, payload: { name: 'test' } }];
        
        let fetchCalled = false;
        window.fetch = async (url, options) => {
            fetchCalled = true;
            const body = JSON.parse(options.body);
            if (url.includes('sync.php') && options.method === 'POST' && body.outbox && body.outbox.length > 0) {
                success = true;
            }
            return { ok: true, json: async () => ({ status: 'success' }) };
        };

        await SyncEngine.push();

        if (!fetchCalled) {
            throw new Error("fetch was not called during push.");
        }
    } catch (e) {
        error = e;
        success = false;
    } finally {
        teardown();
        return { name: "SyncEngine Push", description, success, error };
    }
}

export async function testPullAndApplyDeltas() {
    const description = "Verifies that SyncEngine.pull fetches deltas and applies them to the local database.";
    const { teardown } = await setup();
    let success = false;
    let error = null;

    try {
        const db = await dbPromise;
        let itemPutCalled = false;
        
        db.items.put = async (item) => {
            if (item.id === 'server-item-1') {
                itemPutCalled = true;
            }
        };

        window.fetch = async (url) => {
            if (url.includes('sync.php?since=')) {
                return { 
                    ok: true, 
                    json: async () => ({
                        deltas: {
                            items: [{ id: 'server-item-1', name: 'Server Item', _version: 2, _updatedAt: Date.now() }]
                        },
                        serverTime: Date.now()
                    })
                };
            }
            return { ok: false, json: async () => ({}) };
        };

        await SyncEngine.pull();

        if (!itemPutCalled) {
            throw new Error("db.items.put was not called with the server data.");
        }
        success = true;

    } catch (e) {
        error = e;
        success = false;
    } finally {
        teardown();
        return { name: "SyncEngine Pull", description, success, error };
    }
}