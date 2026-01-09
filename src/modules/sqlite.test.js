import { dbRepository } from '../db.js';
import { SqliteRepository } from '../services/SqliteRepository.js';

export async function testSqliteRepositoryIsUsed() {
    console.group("Unit Test: SQLite Migration - dbRepository uses SqliteRepository");

    try {
        if (dbRepository === SqliteRepository) {
            console.log("✅ PASS: dbRepository is correctly set to SqliteRepository.");
        } else {
            console.error("❌ FAIL: dbRepository is NOT set to SqliteRepository. Check 'use_sqlite' in db.js.");
            console.log("Expected: SqliteRepository instance");
            console.log("Actual:", dbRepository);
        }
    } catch (error) {
        console.error("❌ TEST ERROR:", error);
    } finally {
        console.groupEnd();
    }
}
