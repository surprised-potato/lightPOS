import { db } from "./db.js";

export const syncManager = {
    async enqueue(task) {
        // task structure: { action: 'string', data: object, timestamp: string }
        await db.syncQueue.add(task);
        
        // Trigger sync immediately if online
        if (navigator.onLine) {
            const { processQueue } = await import("./services/sync-service.js");
            processQueue();
        }
    }
};