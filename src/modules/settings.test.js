import { runDiagnosticExport } from './settings.js';
import { db } from '../db.js';

/**
 * Unit test to verify that runDiagnosticExport correctly identifies 
 * a mismatch between server settings and local settings.
 */
export async function testSettingsMismatchDetection() {
    console.group("Unit Test: runDiagnosticExport - Settings Mismatch");
    
    // 1. Mock Data: Different store names to trigger a mismatch
    const mockServerSettings = { store: { name: "Cloud POS System" } };
    const mockLocalSettings = { store: { name: "Local POS Terminal" } };
    
    // 2. Backup original implementations to restore later
    const originalFetch = window.fetch;
    const originalGet = db.sync_metadata.get;
    const originalOutboxCount = db.outbox.count;
    const originalOutboxToArray = db.outbox.toArray;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    try {
        // 3. Apply Mocks
        window.fetch = async (url) => {
            if (url.includes('file=settings')) {
                return { ok: true, json: async () => mockServerSettings };
            }
            // Return empty arrays for other entity checks to keep the test focused
            return { ok: true, json: async () => [] };
        };

        db.sync_metadata.get = async (key) => {
            if (key === 'settings') return { value: mockLocalSettings };
            if (key === 'last_pull_timestamp') return { value: Date.now() };
            return null;
        };

        db.outbox.count = async () => 0;
        db.outbox.toArray = async () => [];
        
        // Prevent actual file download/UI interaction during test
        URL.createObjectURL = () => "blob:test-diagnostic-report";
        URL.revokeObjectURL = () => {};

        // 4. Execute the diagnostic tool
        const report = await runDiagnosticExport();

        // 5. Assert results
        const expectedMessage = "Mismatch between server settings.json and local sync_metadata['settings']";
        
        if (report.discrepancies.settings === expectedMessage) {
            console.log("✅ PASS: Settings mismatch correctly identified.");
        } else {
            console.error("❌ FAIL: Settings mismatch not detected or incorrect message.");
            console.log("Expected:", expectedMessage);
            console.log("Actual:", report.discrepancies.settings);
        }

    } catch (error) {
        console.error("❌ TEST ERROR:", error);
    } finally {
        // 6. Restore original implementations
        window.fetch = originalFetch;
        db.sync_metadata.get = originalGet;
        db.outbox.count = originalOutboxCount;
        db.outbox.toArray = originalOutboxToArray;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        console.groupEnd();
    }
}