import { checkPermission } from "../auth.js";

const API_URL = 'api/router.php';

let itemsData = [];
let selectedItem = null;

export async function loadStockCountView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Stock Count (Audit)</h2>
            
            <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                <!-- Item Search -->
                <div class="mb-6 relative">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Search Item to Audit</label>
                    <input type="text" id="audit-search" placeholder="Scan barcode or type name..." autocomplete="off" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <div id="audit-results" class="hidden absolute z-10 bg-white border border-gray-300 mt-1 w-full rounded shadow-lg max-h-48 overflow-y-auto"></div>
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

        <!-- Recent Adjustments History -->
        <div class="max-w-4xl mx-auto mt-8">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Recent Adjustments History</h3>
            <div class="bg-white shadow-md rounded overflow-x-auto">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Date</th>
                            <th class="py-3 px-6 text-left">Item</th>
                            <th class="py-3 px-6 text-left">Reason</th>
                            <th class="py-3 px-6 text-right">Diff</th>
                            <th class="py-3 px-6 text-left">User</th>
                        </tr>
                    </thead>
                    <tbody id="adjustment-logs-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="5" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
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
    const actualInput = document.getElementById("audit-actual");
    const btnAdjust = document.getElementById("btn-adjust");
    const canWrite = checkPermission("stock-count", "write");

    // Search
    searchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        resultsDiv.innerHTML = "";
        if (term.length < 1) {
            resultsDiv.classList.add("hidden");
            return;
        }
        const filtered = itemsData.filter(i => i.name.toLowerCase().includes(term) || i.barcode.includes(term));
        if (filtered.length > 0) {
            resultsDiv.classList.remove("hidden");
            filtered.forEach(item => {
                const div = document.createElement("div");
                div.className = "p-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm";
                div.textContent = `${item.name} (${item.barcode})`;
                div.addEventListener("click", () => selectItem(item));
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.classList.add("hidden");
        }
    });

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

        // Sort by timestamp descending and take top 10
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        logs = logs.slice(0, 10);
        
        tbody.innerHTML = "";
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No history found.</td></tr>`;
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
                <td class="py-3 px-6 text-left whitespace-nowrap">${dateStr}</td>
                <td class="py-3 px-6 text-left">
                    <div class="font-medium">${data.item_name}</div>
                </td>
                <td class="py-3 px-6 text-left">${data.reason}</td>
                <td class="py-3 px-6 text-right font-bold ${diffClass}">${diffSign}${data.difference}</td>
                <td class="py-3 px-6 text-left text-xs">${data.user}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching logs:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center text-red-500">Error loading history.</td></tr>`;
    }
}