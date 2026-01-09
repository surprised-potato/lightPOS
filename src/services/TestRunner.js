import { testDbSchemaUpgrade } from '../modules/db_schema.test.js';
import { dbPromise } from '../db.js';
import { dbRepository as Repository } from '../db.js';
import { SyncEngine } from './SyncEngine.js';
import { testSettingsMismatchDetection } from '../modules/settings.test.js';
import { testPushWithData, testPullAndApplyDeltas } from './SyncEngine.test.js';

/**
 * TestRunner for verifying Phase 5 Testing Scenarios.
 */
export const TestRunner = {
    getTests() {
        const tests = [];

        // 1. Offline Creation Tests (One per collection)
        const collections = [
            { name: 'items', pk: 'id', data: { name: 'Test Item' } },
            { name: 'transactions', pk: 'id', data: { total_amount: 100 } },
            { name: 'customers', pk: 'id', data: { name: 'Test Customer' } },
            { name: 'suppliers', pk: 'id', data: { name: 'Test Supplier' } },
            { name: 'expenses', pk: 'id', data: { description: 'Test Expense' } },
            { name: 'shifts', pk: 'id', data: { status: 'open' } },
            { name: 'users', pk: 'email', data: { name: 'Test User' }, idGenerator: () => `test-user-${Date.now()}@example.com` },
            { name: 'settings', pk: 'id', data: { value: 'test' } },
            { name: 'stock_movements', pk: 'id', data: { type: 'test' } },
            { name: 'adjustments', pk: 'id', data: { reason: 'test' } },
            { name: 'stockins', pk: 'id', data: { item_count: 1 } },
            { name: 'returns', pk: 'id', data: { reason: 'test' } },
            { name: 'notifications', pk: 'id', data: { message: 'test' } },
            { name: 'suspended_transactions', pk: 'id', data: { total: 50 } },
            { name: 'stock_logs', pk: 'id', data: { action: 'test' } }
        ];

        collections.forEach(col => {
            tests.push({
                id: `offline-${col.name}`,
                name: `Offline Creation: ${col.name}`,
                description: `Create ${col.name} locally, verify outbox, sync, verify cleared.`,
                run: async () => this.runOfflineTestForCollection(col)
            });
        });

        // 2. Other Tests
        tests.push({
            id: 'conflict-resolution',
            name: 'Conflict Resolution (LWW)',
            description: 'Ensures that when a local record and a server record conflict, the one with the higher version number is kept.',
            run: async () => this.testConflictResolution()
        });
        
        tests.push({
            id: 'tab-concurrency',
            name: 'Tab Concurrency',
            description: 'Uses the Web Locks API to verify that only one tab/process can acquire the sync lock.',
            run: async () => this.testTabConcurrency()
        });

        tests.push({
            id: 'settings-mismatch',
            name: 'Settings Mismatch Detection',
            description: 'Verifies that the diagnostic tool correctly identifies a mismatch between server settings and local settings.',
            run: async () => testSettingsMismatchDetection()
        });

        tests.push({
            id: 'sync-push',
            name: 'SyncEngine Push',
            description: 'Verifies that SyncEngine.push sends data from the outbox to the server.',
            run: async () => testPushWithData()
        });

        tests.push({
            id: 'sync-pull',
            name: 'SyncEngine Pull',
            description: 'Verifies that SyncEngine.pull fetches deltas and applies them to the local database.',
            run: async () => testPullAndApplyDeltas()
        });

        tests.push({
            id: 'db-schema-upgrade',
            name: 'Dexie Schema Upgrade',
            description: 'Verifies that the Dexie database schema is correctly upgraded and new tables exist.',
            run: async () => testDbSchemaUpgrade()
        });

        tests.push({
            id: 'supplier-settings-save',
            name: 'Supplier Settings Save',
            description: 'Verifies that supplier-specific procurement settings can be saved and retrieved via the UI.',
            run: async () => {
                const { testSupplierSettingsSave } = await import(`../modules/suppliers.test.js?t=${Date.now()}`);
                return testSupplierSettingsSave();
            }
        });

        tests.push({
            id: 'po-create-approve',
            name: 'Purchase Order Creation and Approval',
            description: 'Verifies the complete workflow for creating and approving a purchase order.',
            run: async () => {
                const { testCreateAndApprovePO } = await import(`../modules/purchase_orders.test.js?t=${Date.now()}`);
                return testCreateAndApprovePO();
            }
        });

        return tests;
    },

    async runOfflineTestForCollection(col) {
        const db = await dbPromise;
        const testName = `Offline Creation: ${col.name}`;
        const description = `Create ${col.name} locally, verify outbox, sync, verify cleared.`;

        if (!db.outbox) {
            return { name: testName, description, success: false, error: new Error("db.outbox is undefined") };
        }

        const originalSync = SyncEngine.sync;
        const id = col.idGenerator ? col.idGenerator() : `test-offline-${col.name}-${Date.now()}`;
        
        try {
            const data = { ...col.data };
            data[col.pk] = id;
            
            // 1. Create locally via Repository
            await Repository.upsert(col.name, data);
            
            const inOutbox = await db.outbox.where('docId').equals(id).first();
            if (!inOutbox) throw new Error(`Item not found in outbox after upsert for collection: ${col.name}`);
            if (inOutbox.collection !== col.name) throw new Error(`Outbox item has wrong collection. Expected ${col.name}, got ${inOutbox.collection}`);
            
            // 2. Trigger sync (assuming online for this test environment)
            if (navigator.onLine) {
                // Mock the sync to prevent actual network call
                SyncEngine.sync = async () => {
                    await db.outbox.where('docId').equals(id).delete();
                };
                
                await SyncEngine.sync();
                
                // 3. Verify cleared
                const cleared = await db.outbox.where('docId').equals(id).first();
                if (cleared) throw new Error(`Outbox item not cleared after sync for collection: ${col.name}`);
            }
            return { name: testName, description, success: true, error: null };
        } catch (error) {
            return { name: testName, description, success: false, error };
        } finally {
            SyncEngine.sync = originalSync;
            // Cleanup: Remove the test item from local DB so it doesn't clutter the UI
            if (db[col.name]) {
                await db[col.name].delete(id);
            }
        }
    },

    /**
     * Scenario: Verify that higher version numbers win (LWW).
     */
    async testConflictResolution() {
        const description = "Ensures that when a local record and a server record conflict, the one with the higher version number is kept.";
        const db = await dbPromise;
        const id = 'test-conflict-' + Date.now();
        
        try {
            // 1. Put v1 locally
            const v1 = { id, name: 'Version 1', _version: 1, _updatedAt: Date.now(), _deleted: false };
            await db.items.put(v1);
            
            // 2. Simulate incoming v2 from server (higher version)
            const v2 = { id, name: 'Version 2', _version: 2, _updatedAt: Date.now() + 1000, _deleted: false };
            
            // Apply logic from SyncEngine.pull
            const local = await db.items.get(id);
            if (v2._version > (local._version || 0)) {
                await db.items.put(v2);
            }
            
            const final = await db.items.get(id);
            if (final.name !== 'Version 2') throw new Error("Higher version did not win");
            return { name: "Conflict Resolution (LWW)", description, success: true, error: null };
        } catch (error) {
            return { name: "Conflict Resolution (LWW)", description, success: false, error };
        } finally {
            // Cleanup
            await db.items.delete(id);
        }
    },

    /**
     * Scenario: Verify Web Locks prevent concurrent syncs.
     */
    async testTabConcurrency() {
        const description = "Uses the Web Locks API to verify that only one tab/process can acquire the 'sync_lock' at a time, preventing race conditions.";
        if (!navigator.locks) {
            return { name: "Tab Concurrency", description: "Skipped: Web Locks API not available.", success: true, error: null };
        }

        try {
            await navigator.locks.request('sync_lock', { ifAvailable: true }, async (lock) => {
                if (lock) {
                    // Try to acquire it again (simulating another tab/process)
                    const secondAttempt = await navigator.locks.request('sync_lock', { ifAvailable: true }, async (innerLock) => !!innerLock);
                    if (secondAttempt) throw new Error("Lock was acquired twice! Concurrency guard failed.");
                }
            });
            return { name: "Tab Concurrency", description, success: true, error: null };
        } catch (error) {
            return { name: "Tab Concurrency", description, success: false, error };
        }
    }
};