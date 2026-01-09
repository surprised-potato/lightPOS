// src/modules/db_schema.test.js
import { dbPromise } from '../db.js';

export const testDbSchemaUpgrade = async () => {
    const name = "Dexie Schema Upgrade";
    const description = "Verifies the Dexie database schema version and structure.";
    console.group(`Unit Test: ${name}`);
    try {
        const db = await dbPromise;
        // 1. Verify that the database version is 37
        if (db.verno !== 37) {
            throw new Error(`Expected Dexie DB version 37, but got ${db.verno}`);
        }
        console.log(`✅ Dexie DB version is ${db.verno}.`);

        // 2. Verify that new tables (stores) exist
        const expectedTables = ['supplier_config', 'purchase_orders', 'inventory_metrics'];
        const missingTables = expectedTables.filter(table => !db[table]);

        if (missingTables.length > 0) {
            throw new Error(`Missing expected tables: ${missingTables.join(', ')}`);
        }
        console.log(`✅ All expected tables (${expectedTables.join(', ')}) exist.`);

        // 3. Attempt to open the database to trigger any upgrade logic
        await db.open();
        console.log('✅ Dexie database opened successfully, upgrade logic (if any) triggered.');

        console.log(`✅ PASS: ${name}`);
        return { name, description, success: true, error: null };
    } catch (error) {
        console.error(`❌ FAIL: ${name}: ${error.message}`);
        return { name, description, success: false, error };
    } finally {
        console.groupEnd();
    }
};
