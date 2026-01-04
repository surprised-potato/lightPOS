import { checkPermission } from "../auth.js";
import { db } from "../db.js";
import { generateUUID } from "../utils.js";

const API_URL = 'api/router.php';

export function loadMigrateView() {
    const content = document.getElementById("main-content");
    if (!checkPermission("migrate", "write")) {
        content.innerHTML = `<div class="p-6 text-center text-red-600 font-bold">You do not have permission to perform data migration.</div>`;
        return;
    }

    content.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Data Migration & Sync</h2>
            
            <!-- Bulk Import Section -->
            <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-6">
                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-gray-700 mb-2">Bulk Import Items</h3>
                    <p class="text-sm text-gray-600 mb-4">Upload a JSON or CSV file containing your item master list. This will add new items to your inventory.</p>
                    
                    <div class="flex flex-col gap-4">
                        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer" id="drop-zone">
                            <input type="file" id="import-file" class="hidden" accept=".json,.csv">
                            <div class="text-gray-500">
                                <span class="text-4xl block mb-2">📄</span>
                                <p id="file-name">Click to select or drag and drop your JSON or CSV file</p>
                            </div>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <div class="flex gap-4">
                                <button id="btn-download-sample-json" class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                    📥 Sample JSON
                                </button>
                                <button id="btn-download-sample-csv" class="text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1">
                                    📥 Sample CSV
                                </button>
                            </div>
                            <button id="btn-start-import" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                Start Import
                            </button>
                        </div>
                    </div>
                </div>
                
                <div id="import-progress" class="hidden mt-6">
                    <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                        <div id="progress-bar" class="bg-blue-600 h-2.5 rounded-full" style="width: 0%"></div>
                    </div>
                    <p id="progress-text" class="text-xs text-gray-600 text-center">Processing...</p>
                </div>
            </div>

            <!-- Sync Diagnostics Section -->
            <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                <h3 class="text-lg font-semibold text-gray-700 mb-4">Database Synchronization</h3>
                <p class="text-sm text-gray-600 mb-4">Compare your local offline database (IndexedDB) with the server database (JSON) to identify discrepancies.</p>
                
                <div class="flex gap-4 mb-6">
                    <button id="btn-analyze-sync" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded focus:outline-none shadow">
                        Analyze Differences
                    </button>
                </div>

                <div id="sync-results" class="hidden">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div class="p-4 bg-gray-50 rounded border border-gray-200">
                            <div class="text-xs text-gray-500 uppercase font-bold">Server Items</div>
                            <div id="count-server" class="text-2xl font-bold text-gray-800">-</div>
                        </div>
                        <div class="p-4 bg-gray-50 rounded border border-gray-200">
                            <div class="text-xs text-gray-500 uppercase font-bold">Local Items</div>
                            <div id="count-local" class="text-2xl font-bold text-gray-800">-</div>
                        </div>
                        <div class="p-4 bg-gray-50 rounded border border-gray-200">
                            <div class="text-xs text-gray-500 uppercase font-bold">Status</div>
                            <div id="sync-status-text" class="text-lg font-bold text-gray-800">-</div>
                        </div>
                    </div>

                    <table class="min-w-full border mb-4">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discrepancy Type</th>
                                <th class="p-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                                <th class="p-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody id="sync-diff-body" class="bg-white divide-y divide-gray-200"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
}

function setupEventListeners() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("import-file");
    const btnImport = document.getElementById("btn-start-import");
    const btnSampleJson = document.getElementById("btn-download-sample-json");
    const btnSampleCsv = document.getElementById("btn-download-sample-csv");
    const fileNameDisplay = document.getElementById("file-name");

    dropZone.addEventListener("click", () => fileInput.click());
    
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
            btnImport.disabled = false;
        }
    });

    btnSampleJson.addEventListener("click", () => downloadSample("json"));
    btnSampleCsv.addEventListener("click", () => downloadSample("csv"));

    document.getElementById("btn-analyze-sync").addEventListener("click", analyzeSync);

    btnImport.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return;

        btnImport.disabled = true;
        document.getElementById("import-progress").classList.remove("hidden");
        
        try {
            const text = await file.text();
            let data;
            
            if (file.name.endsWith(".json")) {
                data = JSON.parse(text);
            } else if (file.name.endsWith(".csv")) {
                data = parseCSV(text);
            } else {
                throw new Error("Unsupported file format. Please upload JSON or CSV.");
            }
            
            if (!Array.isArray(data)) {
                throw new Error("Invalid format: Data must be an array of items.");
            }

            await processImport(data);
            alert(`Successfully imported ${data.length} items.`);
            loadMigrateView(); // Reset view
        } catch (error) {
            console.error("Import error:", error);
            alert("Import failed: " + error.message);
            btnImport.disabled = false;
        }
    });
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];

    const firstLine = lines[0];
    // Detect delimiter: comma or tab
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    
    // Helper to strip quotes and trim
    const clean = (val) => val ? val.trim().replace(/^"|"$/g, '') : "";

    const headers = lines[0].split(delimiter).map(h => clean(h).toLowerCase());
    const items = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => clean(v));
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });

        // Map CSV fields to internal schema based on the requested layout
        items.push({
            barcode: row.barcode || "",
            name: row.name || "",
            category: row.category || "",
            cost_price: parseFloat(row.cost_price) || 0,
            selling_price: parseFloat(row.unit_price) || 0,
            min_stock: parseFloat(row.reorder_level) || 0,
            stock_level: 0,
            base_unit: "Unit"
        });
    }
    return items;
}

async function processImport(items) {
    const progressBar = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");

    progressBar.style.width = "10%";
    progressText.textContent = "Fetching current inventory...";

    // 1. Fetch current items
    const response = await fetch(`${API_URL}?file=items`);
    let currentItems = [];
    try {
        currentItems = await response.json();
        if (!Array.isArray(currentItems)) currentItems = [];
    } catch (e) {
        currentItems = [];
    }

    progressBar.style.width = "40%";
    progressText.textContent = "Processing data...";

    // 2. Prepare new items
    const newItems = items.map(item => ({
        id: generateUUID(),
        ...item,
        cost_price: parseFloat(item.cost_price) || 0,
        selling_price: parseFloat(item.selling_price) || 0,
        stock_level: parseFloat(item.stock_level) || 0,
        min_stock: parseFloat(item.min_stock) || 0,
        supplier_id: item.supplier_id || ""
    }));

    // 3. Merge (Append)
    const updatedInventory = [...currentItems, ...newItems];

    progressBar.style.width = "70%";
    progressText.textContent = "Saving to server...";

    // 4. Save
    await fetch(`${API_URL}?file=items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInventory)
    });

    progressBar.style.width = "100%";
    progressText.textContent = "Import Complete!";
}

async function analyzeSync() {
    const resultsDiv = document.getElementById("sync-results");
    const tbody = document.getElementById("sync-diff-body");
    const btnAnalyze = document.getElementById("btn-analyze-sync");
    
    resultsDiv.classList.remove("hidden");
    tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-500">Analyzing databases...</td></tr>`;
    btnAnalyze.disabled = true;
    btnAnalyze.classList.add("opacity-50");

    try {
        // 1. Fetch Data
        const [serverRes, localData] = await Promise.all([
            fetch(`${API_URL}?file=items`),
            db.items.toArray()
        ]);
        
        let serverData = await serverRes.json();
        if (!Array.isArray(serverData)) serverData = [];

        // 2. Update Counts
        document.getElementById("count-server").textContent = serverData.length;
        document.getElementById("count-local").textContent = localData.length;

        // 3. Compare
        const serverMap = new Map(serverData.map(i => [i.id, i]));
        const localMap = new Map(localData.map(i => [i.id, i]));

        const onlyInServer = serverData.filter(i => !localMap.has(i.id));
        const onlyInLocal = localData.filter(i => !serverMap.has(i.id));
        
        // Conflict: Exists in both but content differs
        const conflicts = serverData.filter(s => {
            const l = localMap.get(s.id);
            if (!l) return false;
            // Simple JSON comparison (ignoring order of keys if possible, but strict for now)
            // Ideally, we compare specific fields like stock_level, price, name
            return JSON.stringify(s) !== JSON.stringify(l);
        });

        // 4. Render Rows
        tbody.innerHTML = "";
        
        const renderRow = (label, count, btnText, btnClass, actionFn) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="p-3 text-sm font-medium text-gray-900">${label}</td>
                <td class="p-3 text-center text-sm text-gray-500">${count}</td>
                <td class="p-3 text-right">
                    <button class="text-xs px-3 py-1 rounded text-white font-bold ${btnClass} hover:opacity-90 transition">
                        ${btnText}
                    </button>
                </td>
            `;
            tr.querySelector("button").addEventListener("click", async (e) => {
                e.target.disabled = true;
                e.target.textContent = "Processing...";
                await actionFn();
                analyzeSync(); // Refresh after action
            });
            tbody.appendChild(tr);
        };

        if (onlyInServer.length > 0) {
            renderRow("Missing in Local DB", onlyInServer.length, "Download to Local", "bg-blue-500", async () => {
                await db.items.bulkPut(onlyInServer);
            });
        }

        if (onlyInLocal.length > 0) {
            renderRow("Missing in Server DB", onlyInLocal.length, "Upload to Server", "bg-green-500", async () => {
                // Merge local new items into server list
                const newServerList = [...serverData, ...onlyInLocal];
                await saveToServer(newServerList);
            });
        }

        if (conflicts.length > 0) {
            renderRow("Data Mismatch / Conflicts", conflicts.length, "Overwrite Local (Trust Server)", "bg-orange-500", async () => {
                await db.items.bulkPut(conflicts);
            });
            // Optional: Add "Trust Local" button logic if needed
        }

        // 5. Status Update
        const statusEl = document.getElementById("sync-status-text");
        if (onlyInServer.length === 0 && onlyInLocal.length === 0 && conflicts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-green-600 font-bold bg-green-50">All databases are in sync!</td></tr>`;
            statusEl.textContent = "Synced";
            statusEl.className = "text-lg font-bold text-green-600";
        } else {
            statusEl.textContent = "Not Synced";
            statusEl.className = "text-lg font-bold text-red-600";
        }

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-600">Error analyzing data. Check console.</td></tr>`;
    } finally {
        btnAnalyze.disabled = false;
        btnAnalyze.classList.remove("opacity-50");
    }
}

async function saveToServer(items) {
    try {
        await fetch(`${API_URL}?file=items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        alert("Server updated successfully.");
    } catch (error) {
        console.error("Save error:", error);
        alert("Failed to update server.");
    }
}

function downloadSample(type) {
    let content, filename, mimeType;
    
    if (type === "json") {
        const sampleData = [
            {
                "barcode": "1001",
                "name": "Sample Soda 330ml",
                "base_unit": "Can",
                "cost_price": 15.50,
                "selling_price": 25.00,
                "stock_level": 48,
                "min_stock": 12,
                "supplier_id": ""
            }
        ];
        content = JSON.stringify(sampleData, null, 2);
        filename = "surprised-potato-items-sample.json";
        mimeType = "application/json";
    } else {
        // Use the layout provided by the user
        content = '"barcode","name","category","cost_price","unit_price","reorder_level"\n' +
                  '"123465","Rubber Band","SCHOOL SUPPLIES","0.45","0.50","0.000"\n' +
                  '"42184676","Nivea Cool Kick 25ml","DEODORANT","54.00","59.00","2.000"\n' +
                  '"42187608","Nivea Silver P 25ml","DEODORANT","67.00","73.00","2.000"\n' +
                  '"42316688","Nivea Invisible 25ml","DEODORANT","62.00","68.00","2.000"\n' +
                  '"45687485","Royal Rice 1Kl","rice","35.00","43.00","2.000"';
        filename = "surprised-potato-items-sample.csv";
        mimeType = "text/csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}