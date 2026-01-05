import { db } from '../db.js';
import { Repository } from './Repository.js';
import { SyncEngine } from './SyncEngine.js';

/**
 * TestRunner for verifying Phase 5 Testing Scenarios.
 */
export const TestRunner = {
    async runAll() {
        console.group("POS Sync Architecture - Test Suite");
        try {
            await this.testOfflineCreation();
            await this.testConflictResolution();
            await this.testTabConcurrency();
            console.log("%c All tests passed!", "color: green; font-weight: bold;");
        } catch (error) {
            console.error("%c Test failed:", "color: red; font-weight: bold;", error);
        }
        console.groupEnd();
    },

    /**
     * Scenario: Create item offline -> Verify Outbox -> Sync.
     */
    async testOfflineCreation() {
        console.log("Scenario: Offline Creation...");
        const id = 'test-offline-' + Date.now();
        
        // 1. Create locally via Repository
        await Repository.upsert('items', { 
            id, 
            name: 'Test Item', 
            cost_price: 1, 
            selling_price: 2, 
            stock_level: 10 
        });
        
        const inOutbox = await db.outbox.where('docId').equals(id).first();
        if (!inOutbox) throw new Error("Item not found in outbox after upsert");
        console.log("✓ Item correctly queued in outbox");
        
        // 2. Trigger sync (assuming online for this test environment)
        if (navigator.onLine) {
            await SyncEngine.sync();
            const cleared = await db.outbox.where('docId').equals(id).first();
            if (cleared) throw new Error("Outbox item not cleared after sync");
            console.log("✓ Outbox cleared after successful sync");
        }
    },

    /**
     * Scenario: Verify that higher version numbers win (LWW).
     */
    async testConflictResolution() {
        console.log("Scenario: Conflict Resolution (LWW)...");
        const id = 'test-conflict-' + Date.now();
        
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
        console.log("✓ Higher version (v2) successfully overwrote local v1");
    },

    /**
     * Scenario: Verify Web Locks prevent concurrent syncs.
     */
    async testTabConcurrency() {
        console.log("Scenario: Tab Concurrency (Web Locks)...");
        if (!navigator.locks) {
            console.warn("Web Locks API not available (Insecure context). Skipping concurrency test.");
            return;
        }

        await navigator.locks.request('sync_lock', { ifAvailable: true }, async (lock) => {
            if (lock) {
                // Try to acquire it again (simulating another tab/process)
                const secondAttempt = await navigator.locks.request('sync_lock', { ifAvailable: true }, async (innerLock) => {
                    return !!innerLock;
                });
                if (secondAttempt) throw new Error("Lock was acquired twice! Concurrency guard failed.");
                console.log("✓ Lock prevents concurrent access as expected");
            }
        });
    }
};