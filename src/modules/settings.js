import { checkPermission } from "../auth.js";
import { renderHeader } from "../layout.js";
import { db } from "../db.js";
import { generateUUID } from "../utils.js";

const API_URL = 'api/router.php';

export async function loadSettingsView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("settings", "write");
    const canMigrate = checkPermission("migrate", "write");

    content.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">System Settings</h2>

            <!-- Tab Navigation -->
            <div class="border-b border-gray-200 mb-6">
                <nav class="flex -mb-px space-x-8">
                    <button data-tab="store" class="settings-tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Store Info</button>
                    <button data-tab="tax" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Tax Settings</button>
                    <button data-tab="rewards" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Rewards & Loyalty</button>
                    <button data-tab="advanced" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Advanced</button>
                    <button data-tab="sync" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Sync History</button>
                    ${canMigrate ? '<button data-tab="migration" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Data Migration</button>' : ''}
                </nav>
            </div>

            <form id="form-settings">
                <!-- Store Tab -->
                <div id="settings-tab-store" class="settings-panel space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Store Identity</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Store Name</label>
                                <input type="text" id="set-store-name" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Store Logo</label>
                                <div class="flex items-center gap-4">
                                    <div id="logo-preview" class="w-16 h-16 border rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                                        <span class="text-gray-400 text-[10px]">No Logo</span>
                                    </div>
                                    <input type="file" id="set-store-logo-file" accept="image/*" class="text-xs">
                                    <input type="hidden" id="set-store-logo-base64">
                                </div>
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-bold text-gray-700 mb-2">Store Address / Contact</label>
                                <textarea id="set-store-data" rows="3" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Address, Phone, TIN..."></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tax Tab -->
                <div id="settings-tab-tax" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Taxation (E-VAT)</h3>
                        <div class="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                            <p class="text-xs text-blue-800">
                                <strong>Note:</strong> All prices in the system (Cost and Selling) are treated as <strong>Tax Inclusive</strong>. 
                                The rate below is used to extract the tax component for reporting.
                            </p>
                        </div>
                        <div class="max-w-xs">
                            <label class="block text-sm font-bold text-gray-700 mb-2">VAT Rate (%)</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="set-tax-rate" step="0.01" min="0" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-right">
                                <span class="font-bold text-gray-500">%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Rewards Tab -->
                <div id="settings-tab-rewards" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Loyalty Program</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Points Earning Ratio</label>
                                <div class="flex items-center gap-2">
                                    <span class="text-sm text-gray-500">1 Point per every ₱</span>
                                    <input type="number" id="set-reward-ratio" step="1" min="1" class="w-24 border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-right">
                                    <span class="text-sm text-gray-500">spent</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Advanced Tab -->
                <div id="settings-tab-advanced" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Print Settings</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Paper Width (mm)</label>
                                <input type="number" id="set-print-width" step="1" min="40" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="76">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Header Font Size (px)</label>
                                <input type="number" id="set-print-header-size" step="1" min="8" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="14">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Body Font Size (px)</label>
                                <input type="number" id="set-print-body-size" step="1" min="8" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="12">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Footer Font Size (px)</label>
                                <input type="number" id="set-print-footer-size" step="1" min="8" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="10">
                            </div>
                        </div>
                        <p class="text-[10px] text-gray-500 mt-2 italic">Adjust these if the receipt prints outside the paper boundaries or if text is too small for your printer (e.g. Epson TM-U220).</p>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Shift Settings</h3>
                        <div class="max-w-xs">
                            <label class="block text-sm font-bold text-gray-700 mb-2">Discrepancy Alert Threshold (₱)</label>
                            <input type="number" id="set-shift-threshold" step="0.01" min="0" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00">
                            <p class="text-[10px] text-gray-500 mt-1">Triggers a system notification if the closing discrepancy exceeds this amount.</p>
                        </div>
                        <div class="mt-4">
                            <label class="inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="set-auto-print" class="form-checkbox h-5 w-5 text-blue-600">
                                <span class="ml-2 text-sm font-bold text-gray-700">Auto-print receipt after payment</span>
                            </label>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border border-red-100">
                        <h3 class="text-lg font-bold mb-4 text-red-600">Danger Zone</h3>
                        <p class="text-sm text-gray-600 mb-4">This will permanently delete all transactions, items, and history from the server and local database. Users will be preserved.</p>
                        <button type="button" id="btn-nuclear-reset" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition">Wipe All Data</button>
                    </div>
                </div>

                <!-- Migration Tab -->
                ${canMigrate ? `
                <div id="settings-tab-migration" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <div class="mb-6">
                            <h3 class="text-lg font-bold text-gray-700 mb-2">Bulk Import Items</h3>
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
                                        <button type="button" id="btn-download-sample-json" class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                            📥 Sample JSON
                                        </button>
                                        <button type="button" id="btn-download-sample-csv" class="text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1">
                                            📥 Sample CSV
                                        </button>
                                    </div>
                                    <button type="button" id="btn-start-import" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed" disabled>
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

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold text-gray-700 mb-4">Database Synchronization</h3>
                        <p class="text-sm text-gray-600 mb-4">Compare your local offline database (IndexedDB) with the server database (JSON) to identify discrepancies.</p>
                        
                        <div class="flex gap-4 mb-6">
                            <button type="button" id="btn-analyze-sync" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded focus:outline-none shadow">
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
                </div>` : ''}

                <!-- Sync History Tab -->
                <div id="settings-tab-sync" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Synchronization Log</h3>
                        <p class="text-sm text-gray-600 mb-4">Last successful synchronization for each data entity.</p>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm">
                                <thead>
                                    <tr class="border-b bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                        <th class="text-left p-3">Entity / Data Type</th>
                                        <th class="text-right p-3">Last Successful Sync</th>
                                    </tr>
                                </thead>
                                <tbody id="sync-history-body" class="divide-y divide-gray-100">
                                    <tr><td colspan="2" class="p-4 text-center text-gray-400">Loading history...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="mt-8 flex justify-end">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition ${canWrite ? '' : 'hidden'}">
                        Save All Settings
                    </button>
                </div>
            </form>
        </div>
    `;

    setupEventListeners();
    await loadSettings();
}

function setupEventListeners() {
    const tabs = document.querySelectorAll(".settings-tab-btn");
    const panels = document.querySelectorAll(".settings-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => {
                t.classList.remove("border-blue-500", "text-blue-600");
                t.classList.add("border-transparent", "text-gray-500");
            });
            tab.classList.add("border-blue-500", "text-blue-600");
            tab.classList.remove("border-transparent", "text-gray-500");

            panels.forEach(p => {
                if (p.id === `settings-tab-${target}`) p.classList.remove("hidden");
                else p.classList.add("hidden");
            });

            if (target === 'sync') renderSyncHistory();
        });
    });

    // Logo Upload
    const logoFile = document.getElementById("set-store-logo-file");
    const logoBase64 = document.getElementById("set-store-logo-base64");
    const logoPreview = document.getElementById("logo-preview");

    logoFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                logoBase64.value = base64;
                logoPreview.innerHTML = `<img src="${base64}" class="w-full h-full object-contain">`;
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById("form-settings").addEventListener("submit", handleSave);

    document.getElementById("btn-nuclear-reset")?.addEventListener("click", async () => {
        if (confirm("ARE YOU ABSOLUTELY SURE? This cannot be undone. All sales and inventory data will be lost.")) {
            if (confirm("Final confirmation: Delete everything?")) {
                try {
                    const res = await fetch(`${API_URL}?action=reset_all`, { method: 'POST' });
                    if (res.ok) {
                        const { db } = await import("../db.js");
                        await db.delete();
                        alert("System reset complete. The app will now reload.");
                        window.location.reload();
                    }
                } catch (e) {
                    alert("Reset failed: " + e.message);
                }
            }
        }
    });

    if (checkPermission("migrate", "write")) {
        setupMigrationEventListeners();
    }
}

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}?file=settings`);
        const settings = await response.json();
        
        if (settings) {
            if (settings.store) {
                document.getElementById("set-store-name").value = settings.store.name || "";
                document.getElementById("set-store-data").value = settings.store.data || "";
                if (settings.store.logo) {
                    document.getElementById("set-store-logo-base64").value = settings.store.logo;
                    document.getElementById("logo-preview").innerHTML = `<img src="${settings.store.logo}" class="w-full h-full object-contain">`;
                }
            }
            if (settings.tax) {
                document.getElementById("set-tax-rate").value = settings.tax.rate || 0;
            }
            if (settings.rewards) {
                document.getElementById("set-reward-ratio").value = settings.rewards.ratio || 100;
            }
            if (settings.shift) {
                document.getElementById("set-shift-threshold").value = settings.shift.threshold || 0;
            }
            if (settings.pos) {
                document.getElementById("set-auto-print").checked = settings.pos.auto_print || false;
            }
            if (settings.print) {
                document.getElementById("set-print-width").value = settings.print.paper_width || 76;
                document.getElementById("set-print-header-size").value = settings.print.header_font_size || 14;
                document.getElementById("set-print-body-size").value = settings.print.body_font_size || 12;
                document.getElementById("set-print-footer-size").value = settings.print.footer_font_size || 10;
            }
            await renderSyncHistory();
        }
    } catch (error) {
        console.error("Error loading settings:", error);
    }
}

async function renderSyncHistory() {
    const tbody = document.getElementById("sync-history-body");
    if (!tbody) return;

    const history = await db.sync_metadata.filter(m => m.key.startsWith('sync_history_')).toArray();
    
    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="p-4 text-center text-gray-400 italic">No sync history recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = history.map(h => {
        const entity = h.key.replace('sync_history_', '').replace(/_/g, ' ');
        const date = new Date(h.value);
        return `
            <tr>
                <td class="p-3 font-medium text-gray-700 capitalize">${entity}</td>
                <td class="p-3 text-right text-gray-500">${date.toLocaleString()}</td>
            </tr>
        `;
    }).join('');
}

async function handleSave(e) {
    e.preventDefault();
    
    const settings = {
        store: {
            name: document.getElementById("set-store-name").value.trim(),
            logo: document.getElementById("set-store-logo-base64").value,
            data: document.getElementById("set-store-data").value.trim()
        },
        tax: {
            rate: parseFloat(document.getElementById("set-tax-rate").value) || 0
        },
        rewards: {
            ratio: parseInt(document.getElementById("set-reward-ratio").value) || 100
        },
        shift: {
            threshold: parseFloat(document.getElementById("set-shift-threshold").value) || 0
        },
        pos: {
            auto_print: document.getElementById("set-auto-print").checked
        },
        print: {
            paper_width: parseInt(document.getElementById("set-print-width").value) || 76,
            header_font_size: parseInt(document.getElementById("set-print-header-size").value) || 14,
            body_font_size: parseInt(document.getElementById("set-print-body-size").value) || 12,
            footer_font_size: parseInt(document.getElementById("set-print-footer-size").value) || 10
        }
    };

    try {
        await fetch(`${API_URL}?file=settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        alert("Settings saved successfully!");
        renderHeader(); // Refresh title bar
    } catch (error) {
        console.error("Error saving settings:", error);
        alert("Failed to save settings.");
    }
}

/**
 * Helper to get settings for other modules
 */
export async function getSystemSettings() {
    try {
        const response = await fetch(`${API_URL}?file=settings`);
        const settings = await response.json();
        return settings || {
            store: { name: "LightPOS", logo: "", data: "" },
            tax: { rate: 12 },
            rewards: { ratio: 100 },
            shift: { threshold: 0 },
            pos: { auto_print: false },
            print: { paper_width: 76, header_font_size: 14, body_font_size: 12, footer_font_size: 10 }
        };
    } catch (e) {
        return {
            store: { name: "LightPOS", logo: "", data: "" },
            tax: { rate: 12 },
            rewards: { ratio: 100 },
            shift: { threshold: 0 },
            pos: { auto_print: false },
            print: { paper_width: 76, header_font_size: 14, body_font_size: 12, footer_font_size: 10 }
        };
    }
}

/**
 * Migration Logic (Moved from migrate.js)
 */
function setupMigrationEventListeners() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("import-file");
    const btnImport = document.getElementById("btn-start-import");
    const btnSampleJson = document.getElementById("btn-download-sample-json");
    const btnSampleCsv = document.getElementById("btn-download-sample-csv");
    const fileNameDisplay = document.getElementById("file-name");

    if (!dropZone) return;

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
            loadSettingsView(); // Reset view
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
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    const clean = (val) => val ? val.trim().replace(/^"|"$/g, '') : "";
    const headers = lines[0].split(delimiter).map(h => clean(h).toLowerCase());
    const items = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => clean(v));
        const row = {};
        headers.forEach((header, index) => { row[header] = values[index]; });
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
    const response = await fetch(`${API_URL}?file=items`);
    let currentItems = await response.json();
    if (!Array.isArray(currentItems)) currentItems = [];
    progressBar.style.width = "40%";
    progressText.textContent = "Processing data...";
    const newItems = items.map(item => ({
        id: generateUUID(),
        ...item,
        cost_price: parseFloat(item.cost_price) || 0,
        selling_price: parseFloat(item.selling_price) || 0,
        stock_level: parseFloat(item.stock_level) || 0,
        min_stock: parseFloat(item.min_stock) || 0,
        supplier_id: item.supplier_id || ""
    }));
    const updatedInventory = [...currentItems, ...newItems];
    progressBar.style.width = "70%";
    progressText.textContent = "Saving to server...";
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
        const [serverRes, localData] = await Promise.all([fetch(`${API_URL}?file=items`), db.items.toArray()]);
        let serverData = await serverRes.json();
        if (!Array.isArray(serverData)) serverData = [];
        document.getElementById("count-server").textContent = serverData.length;
        document.getElementById("count-local").textContent = localData.length;
        const serverMap = new Map(serverData.map(i => [i.id, i]));
        const localMap = new Map(localData.map(i => [i.id, i]));
        const onlyInServer = serverData.filter(i => !localMap.has(i.id));
        const onlyInLocal = localData.filter(i => !serverMap.has(i.id));
        const conflicts = serverData.filter(s => {
            const l = localMap.get(s.id);
            return l && JSON.stringify(s) !== JSON.stringify(l);
        });
        const statusEl = document.getElementById("sync-status-text");
        if (onlyInServer.length === 0 && onlyInLocal.length === 0 && conflicts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-green-600 font-bold bg-green-50">All databases are in sync!</td></tr>`;
            statusEl.textContent = "Synced";
            statusEl.className = "text-lg font-bold text-green-600";
        } else {
            statusEl.textContent = "Not Synced";
            statusEl.className = "text-lg font-bold text-red-600";
            tbody.innerHTML = "";
            const renderRow = (label, count, btnText, btnClass, actionFn) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td class="p-3 text-sm font-medium text-gray-900">${label}</td><td class="p-3 text-center text-sm text-gray-500">${count}</td><td class="p-3 text-right"><button type="button" class="text-xs px-3 py-1 rounded text-white font-bold ${btnClass} hover:opacity-90 transition">${btnText}</button></td>`;
                tr.querySelector("button").addEventListener("click", async (e) => {
                    e.target.disabled = true; e.target.textContent = "Processing...";
                    await actionFn(); analyzeSync();
                });
                tbody.appendChild(tr);
            };
            if (onlyInServer.length > 0) renderRow("Missing in Local DB", onlyInServer.length, "Download to Local", "bg-blue-500", async () => await db.items.bulkPut(onlyInServer));
            if (onlyInLocal.length > 0) renderRow("Missing in Server DB", onlyInLocal.length, "Upload to Server", "bg-green-500", async () => {
                const newServerList = [...serverData, ...onlyInLocal];
                await fetch(`${API_URL}?file=items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newServerList) });
            });
            if (conflicts.length > 0) renderRow("Data Mismatch / Conflicts", conflicts.length, "Overwrite Local (Trust Server)", "bg-orange-500", async () => await db.items.bulkPut(conflicts));
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-600">Error analyzing data. Check console.</td></tr>`;
    } finally {
        btnAnalyze.disabled = false; btnAnalyze.classList.remove("opacity-50");
    }
}

function downloadSample(type) {
    let content, filename, mimeType;
    if (type === "json") {
        content = JSON.stringify([{ "barcode": "1001", "name": "Sample Soda 330ml", "base_unit": "Can", "cost_price": 15.50, "selling_price": 25.00, "stock_level": 48, "min_stock": 12, "supplier_id": "" }], null, 2);
        filename = "surprised-potato-items-sample.json"; mimeType = "application/json";
    } else {
        content = '"barcode","name","category","cost_price","unit_price","reorder_level"\n"123465","Rubber Band","SCHOOL SUPPLIES","0.45","0.50","0.000"\n"42184676","Nivea Cool Kick 25ml","DEODORANT","54.00","59.00","2.000"\n"42187608","Nivea Silver P 25ml","DEODORANT","67.00","73.00","2.000"\n"42316688","Nivea Invisible 25ml","DEODORANT","62.00","68.00","2.000"\n"45687485","Royal Rice 1Kl","rice","35.00","43.00","2.000"';
        filename = "surprised-potato-items-sample.csv"; mimeType = "text/csv";
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}