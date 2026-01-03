import { db } from "../firebase-config.js";
import { checkPermission } from "../auth.js";
import { collection, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function loadMigrateView() {
    const content = document.getElementById("main-content");
    if (!checkPermission("items", "write")) {
        content.innerHTML = `<div class="p-6 text-center text-red-600 font-bold">You do not have permission to perform data migration.</div>`;
        return;
    }

    content.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Data Migration</h2>
            
            <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
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
    
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
    const items = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });

        // Map CSV fields to internal schema based on the requested layout
        items.push({
            barcode: row.item_id || "",
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
    
    const batchSize = 500;
    const total = items.length;
    
    for (let i = 0; i < total; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + batchSize);
        
        chunk.forEach(item => {
            const itemRef = doc(collection(db, "items"));
            const sanitizedItem = {
                ...item,
                cost_price: parseFloat(item.cost_price) || 0,
                selling_price: parseFloat(item.selling_price) || 0,
                stock_level: parseFloat(item.stock_level) || 0,
                min_stock: parseFloat(item.min_stock) || 0,
                timestamp: new Date()
            };
            batch.set(itemRef, sanitizedItem);
        });
        
        await batch.commit();
        
        const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `Imported ${i + chunk.length} of ${total} items...`;
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
        content = "item_id,name,category,cost_price,unit_price,reorder_level\n57521,Rubber Band,SCHOOL SUPPLIES,0.45,0.5,0\n122278,Nivea Cool Kick 25ml,DEODORANT,54,59,2\n122279,Nivea Silver P 25ml,DEODORANT,67,73,2\n122280,Nivea Invisible 25ml,DEODORANT,62,68,2";
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