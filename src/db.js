// Initialize Dexie
// Note: Dexie is imported via CDN in index.html and is available globally
const db = new Dexie("pos_db");

db.version(1).stores({
    items: "id, barcode, name, parent_id", // Primary key and indexed props
    transactions: "++id, timestamp, sync_status"
});

export { db };