import { dbRepository as Repository } from "../db.js";
import { generateUUID } from "../utils.js";
import { SyncEngine } from "../services/SyncEngine.js";

/**
 * Bulk adds customers from a CSV string.
 * Expected format: "first_name","last_name","account_number","points"
 * @param {string} csvContent 
 * @returns {Promise<number>} The number of customers successfully added.
 */
export async function bulkAddCustomersFromCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return 0;

    let addedCount = 0;
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Robust CSV split: handles commas inside quotes and unquoted NULL
        const values = line.match(/(".*?"|NULL|[^,]+)/g).map(part => {
            part = part.trim();
            if (part.toUpperCase() === 'NULL') return null;
            return part.replace(/^"|"$/g, ''); // Remove surrounding quotes
        });

        if (!values || values.length < 4) continue;

        const [firstName, lastName, accountNumber, points] = values;

        const customerData = {
            id: generateUUID(),
            account_number: accountNumber,
            name: `${firstName} ${lastName}`.trim(),
            phone: "", 
            email: "",
            loyalty_points: parseInt(points) || 0,
            timestamp: new Date().toISOString(),
            sync_status: 0
        };

        try {
            await Repository.upsert('customers', customerData);
            addedCount++;
        } catch (error) {
            console.error("Failed to import customer:", customerData.name, error);
        }
    }

    if (addedCount > 0) {
        SyncEngine.sync();
    }

    return addedCount;
}