import { dbRepository as Repository } from "../db.js";

export const SyncService = {
    /**
     * Sanitizes a record to ensure it meets the Self-Healing requirements.
     * Adds missing metadata and generates an integrity hash.
     */
    sanitizeRecord(record) {
        let modified = false;

        if (record._version === undefined) {
            record._version = 1;
            modified = true;
        }
        if (record._updatedAt === undefined) {
            record._updatedAt = Math.floor(Date.now() / 1000);
            modified = true;
        }
        if (record._deleted === undefined) {
            record._deleted = false;
            modified = true;
        }

        // Generate hash if missing or if metadata was injected
        if (!record._hash || modified) {
            const { _hash, ...payload } = record;
            // Simple string-based hash for integrity verification
            record._hash = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).slice(0, 16);
        }

        return record;
    },

    /**
     * Prepares local records for pushing to the server by 
     * incrementing versions and updating timestamps.
     */
    prepareForPush(records) {
        return records.map(record => {
            const updated = {
                ...record,
                _version: (record._version || 0) + 1,
                _updatedAt: Math.floor(Date.now() / 1000)
            };
            return this.sanitizeRecord(updated);
        });
    },

    /**
     * Processes incoming records from the server.
     */
    async processIncoming(collectionName, remoteRecords) {
        const healedRecords = remoteRecords.map(r => this.sanitizeRecord(r));
        
        for (const record of healedRecords) {
            const local = await Repository.get(collectionName, record.id || record.email);
            // Conflict Resolution: Last Write Wins (Higher version or newer timestamp)
            if (!local || record._version > (local._version || 0) || record._updatedAt > (local._updatedAt || 0)) {
                await Repository.upsert(collectionName, record);
            }
        }
    },

    /**
     * Legacy wrapper to sync a single collection.
     * Fetches data from the server and processes it through the self-healing logic.
     */
    async syncCollection(collectionName) {
        try {
            const response = await fetch(`api.php?action=pull&collection=${collectionName}`);
            const remoteRecords = await response.json();
            if (Array.isArray(remoteRecords)) {
                await this.processIncoming(collectionName, remoteRecords);
            }
        } catch (error) {
            console.error(`Failed to sync collection ${collectionName}:`, error);
        }
    }
};

export const syncCollection = SyncService.syncCollection.bind(SyncService);