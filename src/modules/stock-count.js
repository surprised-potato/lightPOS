import { checkPermission } from "../auth.js";

const API_URL = 'api/router.php';

let itemsData = [];
let selectedItem = null;

export async function loadStockCountView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="flex flex-col lg:flex-row gap-6 h-full">
            <!-- Left Side: Recent Adjustments History -->
            <div class="lg:w-1/3 order-2 lg:order-1">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Recent Adjustments</h3>
                <div class="bg-white shadow-md rounded overflow-hidden border border-gray-200">
                    <div class="overflow-x-auto">
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                    <th class="py-2 px-3 text-left">Item / Date</th>
                                    <th class="py-2 px-3 text-right">Diff</th>
                                </tr>
                            </thead>
                            <tbody id="adjustment-logs-table-body" class="text-gray-600 text-xs font-light">
                                <tr><td colspan="2" class="py-3 px-6 text-center">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Right Side: Stock Count (Audit) Form -->
            <div class="lg:w-2/3 order-1 lg:order-2">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Stock Count (Audit)</h2>
                
                <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-200">
                    <!-- Item Search & Sort -->
                    <div class="mb-6 flex flex-col sm:flex-row gap-4">
                        <div class="flex-1 relative">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Search Item to Audit</label>
                            <input type="text" id="audit-search" placeholder="Scan barcode or type name..." autocomplete="off" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div id="audit-results" class="hidden absolute z-10 bg-white border border-gray-300 mt-1 w-full rounded shadow-lg max-h-64 overflow-y-auto"></div>
                        </div>
                        <div class="sm:w-48">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Sort Results By</label>
                            <select id="audit-sort" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="name">Name (A-Z)</option>
                                <option value="stock_level">Quantity (Low-High)</option>
                                <option value="updatedAt">Last Modified</option>
                            </select>
                        </div>
                    </div>

                <!-- Selected Item Details -->
                <div id="audit-item-container" class="hidden mb-6 p-4 bg-yellow-50 rounded border border-yellow-200">
                    <h3 id="audit-name" class="font-bold text-lg text-yellow-800"></h3>
                    <p class="text-sm text-gray-600">Barcode: <span id="audit-barcode"></span></p>
                    <p class="text-sm text-gray-600">System Stock: <span id="audit-system-stock" class="font-bold text-lg"></span></p>
                </div>

                <!-- Adjustment Fields -->
                <div id="audit-form" class="hidden">
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Actual Physical Count</label>
                        <input type="number" id="audit-actual" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Reason for Adjustment</label>
                        <select id="audit-reason" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="Routine Audit">Routine Audit</option>
                            <option value="Spoilage/Damage">Spoilage / Damage</option>
                            <option value="Theft/Loss">Theft / Loss</option>
                            <option value="Correction">Data Entry Correction</option>
                        </select>
                    </div>

                    <div class="flex items-center justify-between">
                        <div id="audit-diff-display" class="text-sm font-bold text-gray-500">Difference: -</div>
                        <button id="btn-adjust" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
                            Confirm Adjustment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    await Promise.all([fetchItems(), fetchAdjustmentLogs()]);
    setupEventListeners();
}

async function fetchItems() {
    try {
        const response = await fetch(`${API_URL}?file=items`);
        itemsData = await response.json();
        if (!Array.isArray(itemsData)) itemsData = [];
    } catch (error) {
        console.error("Error fetching items:", error);
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById("audit-search");
    const resultsDiv = document.getElementById("audit-results");
    const sortSelect = document.getElementById("audit-sort");
    const actualInput = document.getElementById("audit-actual");
    const btnAdjust = document.getElementById("btn-adjust");
    const canWrite = checkPermission("stock-count", "write");

    // Search & Sort Logic
    const performSearch = () => {
        const term = searchInput.value.toLowerCase();
        const sortBy = sortSelect.value;
        
        resultsDiv.innerHTML = "";
        if (term.length < 1) {
            resultsDiv.classList.add("hidden");
            return;
        }

        let filtered = itemsData.filter(i => 
            i.name.toLowerCase().includes(term) || 
            (i.barcode && i.barcode.includes(term))
        );

        // Apply Sorting
        filtered.sort((a, b) => {
            if (sortBy === 'name') {
                return a.name.localeCompare(b.name);
            } else if (sortBy === 'stock_level') {
                return (a.stock_level || 0) - (b.stock_level || 0);
            } else if (sortBy === 'updatedAt') {
                return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
            }
            return 0;
        });

        if (filtered.length > 0) {
            resultsDiv.classList.remove("hidden");
            filtered.forEach(item => {
                const div = document.createElement("div");
                div.className = "p-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm flex justify-between items-center";
                div.innerHTML = `
                    <div>
                        <div class="font-bold">${item.name}</div>
                        <div class="text-xs text-gray-500">${item.barcode || 'No Barcode'}</div>
                    </div>
                    <div class="text-xs font-mono bg-gray-100 px-1 rounded">Qty: ${item.stock_level}</div>
                `;
                div.addEventListener("click", () => selectItem(item));
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.classList.add("hidden");
        }
    };

    searchInput.addEventListener("input", performSearch);
    sortSelect.addEventListener("change", performSearch);

    // Calculate Difference Live
    actualInput.addEventListener("input", () => {
        if (!selectedItem) return;
        const actual = parseInt(actualInput.value) || 0;
        const diff = actual - selectedItem.stock_level;
        const diffDisplay = document.getElementById("audit-diff-display");
        diffDisplay.textContent = `Difference: ${diff > 0 ? '+' : ''}${diff}`;
        diffDisplay.className = `text-sm font-bold ${diff === 0 ? 'text-gray-500' : (diff < 0 ? 'text-red-500' : 'text-green-500')}`;
    });

    // Submit
    btnAdjust.addEventListener("click", async () => {
        if (!canWrite) {
            alert("You do not have permission to adjust stock.");
            return;
        }

        if (!selectedItem) return;
        const actual = parseInt(actualInput.value);
        const reason = document.getElementById("audit-reason").value;
        
        if (isNaN(actual)) {
            alert("Please enter a valid count.");
            return;
        }

        if (actual === selectedItem.stock_level && !confirm("Count matches system stock. Log audit anyway?")) {
            return;
        }

        await processAdjustment(actual, reason);
    });
}

function selectItem(item) {
    selectedItem = item;
    document.getElementById("audit-search").value = item.name;
    document.getElementById("audit-results").classList.add("hidden");
    
    document.getElementById("audit-item-container").classList.remove("hidden");
    document.getElementById("audit-form").classList.remove("hidden");
    
    document.getElementById("audit-name").textContent = item.name;
    document.getElementById("audit-barcode").textContent = item.barcode;
    document.getElementById("audit-system-stock").textContent = item.stock_level;
    
    document.getElementById("audit-actual").value = "";
    document.getElementById("audit-diff-display").textContent = "Difference: -";

    if (!checkPermission("stock-count", "write")) {
        document.getElementById("btn-adjust").disabled = true;
        document.getElementById("btn-adjust").classList.add("opacity-50", "cursor-not-allowed");
    }
}

async function processAdjustment(newStock, reason) {
    try {
        const oldStock = selectedItem.stock_level;
        const difference = newStock - oldStock;
        const user = JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown';

        // 1. Fetch current items to ensure we have latest state
        const itemsResponse = await fetch(`${API_URL}?file=items`);
        let currentItems = await itemsResponse.json();
        if (!Array.isArray(currentItems)) currentItems = [];

        // 2. Update item stock
        const itemIndex = currentItems.findIndex(i => i.id === selectedItem.id);
        if (itemIndex !== -1) {
            currentItems[itemIndex].stock_level = newStock;
            currentItems[itemIndex].updatedAt = new Date().toISOString();
        }

        // 3. Save Items
        await fetch(`${API_URL}?file=items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentItems)
        });

        // 4. Log to adjustments
        const adjResponse = await fetch(`${API_URL}?file=adjustments`);
        let adjustments = await adjResponse.json();
        if (!Array.isArray(adjustments)) adjustments = [];

        adjustments.push({
            id: crypto.randomUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            old_stock: oldStock,
            new_stock: newStock,
            difference: difference,
            reason: reason,
            user: user,
            timestamp: new Date()
        });

        await fetch(`${API_URL}?file=adjustments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adjustments)
        });

        alert("Stock adjusted successfully.");
        
        // Reset
        document.getElementById("audit-search").value = "";
        document.getElementById("audit-item-container").classList.add("hidden");
        document.getElementById("audit-form").classList.add("hidden");
        selectedItem = null;
        
        await Promise.all([fetchItems(), fetchAdjustmentLogs()]);

    } catch (error) {
        console.error("Error adjusting stock:", error);
        alert("Failed to adjust stock.");
    }
}

async function fetchAdjustmentLogs() {
    const tbody = document.getElementById("adjustment-logs-table-body");
    try {
        const response = await fetch(`${API_URL}?file=adjustments`);
        let logs = await response.json();
        if (!Array.isArray(logs)) logs = [];

        // Sort by timestamp descending and take top 15 for the sidebar
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        logs = logs.slice(0, 15);
        
        tbody.innerHTML = "";
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="py-3 px-6 text-center">No history found.</td></tr>`;
            return;
        }

        logs.forEach(data => {
            const dateObj = new Date(data.timestamp);
            const dateStr = dateObj.toLocaleString();
            const diffClass = data.difference > 0 ? "text-green-600" : (data.difference < 0 ? "text-red-600" : "text-gray-600");
            const diffSign = data.difference > 0 ? "+" : "";
            
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-2 px-3 text-left">
                    <div class="font-medium text-gray-800">${data.item_name}</div>
                    <div class="text-[10px] text-gray-400">${dateStr}</div>
                </td>
                <td class="py-2 px-3 text-right font-bold ${diffClass}">${diffSign}${data.difference}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching logs:", error);
        tbody.innerHTML = `<tr><td colspan="2" class="py-3 px-6 text-center text-red-500">Error loading history.</td></tr>`;
    }
}