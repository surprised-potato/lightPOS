import { db } from "./db.js";

export const syncManager = {
    async enqueue(task) {
        // task structure: { action: 'string', data: object, timestamp: string }
        console.log(`Enqueuing sync task: ${task.action}`);
        await db.syncQueue.add(task);
        
        // Trigger sync immediately if online
        if (navigator.onLine) {
            console.log("Online detected, triggering immediate queue processing.");
            const { processQueue } = await import("./services/sync-service.js");
            processQueue();
        }
    }
};