import { checkPermission } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";

let itemsData = [];
let selectedItem = null;

export async function loadStockCountView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Side: Search and Audit Form -->
            <div class="lg:col-span-2">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Stock Count (Audit)</h2>
                
                <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-200">
                    <!-- Item Search & Sort -->
                    <div class="mb-6 flex flex-col sm:flex-row gap-4">
                        <div class="flex-1 relative">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Search Item to Audit</label>
                            <input type="text" id="audit-search" placeholder="Scan barcode or type name..." autocomplete="off" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div id="audit-results" class="hidden absolute z-10 bg-white border border-gray-300 mt-1 w-full rounded shadow-lg max-h-64 overflow-y-auto"></div>
                            <div class="mt-2">
                                <label class="inline-flex items-center text-sm text-gray-600 cursor-pointer">
                                    <input type="checkbox" id="audit-low-stock-only" class="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out">
                                    <span class="ml-2">Show Low Stock Only</span>
                                </label>
                            </div>
                        </div>
                        <div class="sm:w-48">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Sort By</label>
                            <select id="audit-sort" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="name">Name</option>
                                <option value="stock_level">Quantity</option>
                                <option value="_updatedAt">Modify Date</option>
                            </select>
                        </div>
                        <div class="sm:w-32">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Order</label>
                            <select id="audit-order" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="asc">Ascending</option>
                                <option value="desc">Descending</option>
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

            <!-- Right Side: Recent Adjustments History -->
            <div class="lg:col-span-1">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Recent Adjustments</h3>
                <div class="bg-white shadow-md rounded overflow-hidden border border-gray-200">
                    <div class="overflow-x-auto">
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                    <th class="py-2 px-3 text-left">Item</th>
                                    <th class="py-2 px-3 text-left">Mod. Date</th>
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
        </div>
    `;

    await Promise.all([fetchItems(), fetchAdjustmentLogs()]);
    setupEventListeners();
    // Auto-focus search on load
    setTimeout(() => document.getElementById("audit-search")?.focus(), 100);
}

async function fetchItems() {
    try {
        itemsData = await Repository.getAll('items');
        if (!Array.isArray(itemsData)) itemsData = [];
    } catch (error) {
        console.error("Error fetching items:", error);
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById("audit-search");
    const resultsDiv = document.getElementById("audit-results");
    const sortSelect = document.getElementById("audit-sort");
    const orderSelect = document.getElementById("audit-order");
    const lowStockCheck = document.getElementById("audit-low-stock-only");
    const actualInput = document.getElementById("audit-actual");
    const btnAdjust = document.getElementById("btn-adjust");
    const canWrite = checkPermission("stock-count", "write");

    // Search & Sort Logic
    const performSearch = () => {
        const term = searchInput.value.toLowerCase();
        const sortBy = sortSelect.value;
        const order = orderSelect.value;
        const lowStockOnly = lowStockCheck.checked;
        
        resultsDiv.innerHTML = "";
        if (term.length < 1 && !lowStockOnly) {
            resultsDiv.classList.add("hidden");
            return;
        }

        let filtered = itemsData.filter(i => {
            const matchesTerm = term.length === 0 || 
                               (i.name || "").toLowerCase().includes(term) || 
                               (i.barcode && i.barcode.includes(term));
            const matchesLowStock = !lowStockOnly || (i.stock_level <= (i.min_stock || 10));
            return matchesTerm && matchesLowStock;
        });

        // Apply Sorting
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'stock_level') {
                comparison = (a.stock_level || 0) - (b.stock_level || 0);
            } else if (sortBy === '_updatedAt') {
                comparison = (a._updatedAt || 0) - (b._updatedAt || 0);
            }
            return order === 'asc' ? comparison : -comparison;
        });

        if (filtered.length > 0) {
            resultsDiv.classList.remove("hidden");
            filtered.forEach((item, index) => {
                const div = document.createElement("div");
                div.className = "p-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm flex justify-between items-center focus:bg-blue-100 focus:outline-none";
                div.setAttribute("tabindex", "0");
                div.innerHTML = `
                    <div>
                        <div class="font-bold">${item.name}</div>
                        <div class="text-xs text-gray-500">${item.barcode || 'No Barcode'}</div>
                    </div>
                    <div class="text-xs font-mono bg-gray-100 px-1 rounded">Qty: ${item.stock_level}</div>
                `;
                
                const selectAction = () => selectItem(item);
                div.addEventListener("click", selectAction);
                
                div.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        selectAction();
                    } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        const next = div.nextElementSibling;
                        if (next && next.getAttribute("tabindex")) next.focus();
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        const prev = div.previousElementSibling;
                        if (prev && prev.getAttribute("tabindex")) prev.focus();
                        else searchInput.focus();
                    }
                });
                
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.classList.add("hidden");
        }
    };

    searchInput.addEventListener("input", performSearch);
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            const first = resultsDiv.querySelector("div[tabindex='0']");
            if (first) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    searchInput.addEventListener("blur", () => setTimeout(() => {
        if (!resultsDiv.contains(document.activeElement)) resultsDiv.classList.add("hidden");
    }, 200));

    sortSelect.addEventListener("change", performSearch);
    orderSelect.addEventListener("change", performSearch);
    lowStockCheck.addEventListener("change", performSearch);

    // Calculate Difference Live
    actualInput.addEventListener("input", () => {
        if (!selectedItem) return;
        const actual = parseInt(actualInput.value) || 0;
        const diff = actual - selectedItem.stock_level;
        const diffDisplay = document.getElementById("audit-diff-display");
        diffDisplay.textContent = `Difference: ${diff > 0 ? '+' : ''}${diff}`;
        diffDisplay.className = `text-sm font-bold ${diff === 0 ? 'text-gray-500' : (diff < 0 ? 'text-red-500' : 'text-green-500')}`;
    });

    // Confirm on Enter
    actualInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            btnAdjust.click();
        }
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
    document.getElementById("audit-actual").focus();

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

        // 1. Update local item stock
        selectedItem.stock_level = newStock;
        await Repository.upsert('items', selectedItem);

        // 2. Log to adjustments locally
        const adjustment = {
            id: generateUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            old_stock: oldStock,
            new_stock: newStock,
            difference: difference,
            reason: reason,
            user: user,
            timestamp: new Date().toISOString()
        };
        await Repository.upsert('adjustments', adjustment);

        // 3. Record Stock Movement Locally
        const movement = {
            id: generateUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            timestamp: new Date().toISOString(),
            type: 'Adjustment',
            qty: difference,
            user: user,
            reason: reason
        };
        await Repository.upsert('stock_movements', movement);

        // 4. Sync with Server
        SyncEngine.sync();

        await addNotification('Stock Count', `Stock adjustment for ${selectedItem.name}: ${difference > 0 ? '+' : ''}${difference} units by ${user}`);

        alert("Stock adjusted successfully.");
        
        // Reset
        const searchInput = document.getElementById("audit-search");
        searchInput.value = "";
        document.getElementById("audit-item-container").classList.add("hidden");
        document.getElementById("audit-form").classList.add("hidden");
        selectedItem = null;
        
        await Promise.all([fetchItems(), fetchAdjustmentLogs()]);
        searchInput.focus();

    } catch (error) {
        console.error("Error adjusting stock:", error);
        alert("Failed to adjust stock.");
    }
}

async function fetchAdjustmentLogs() {
    const tbody = document.getElementById("adjustment-logs-table-body");
    try {
        let logs = await Repository.getAll('adjustments');

        // Sort by timestamp descending and take top 15 for the sidebar
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        logs = logs.slice(0, 15);
        
        tbody.innerHTML = "";
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No history found.</td></tr>`;
            return;
        }

        logs.forEach(data => {
            const dateObj = new Date(data.timestamp);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const diffClass = data.difference > 0 ? "text-green-600" : (data.difference < 0 ? "text-red-600" : "text-gray-600");
            const diffSign = data.difference > 0 ? "+" : "";
            
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-2 px-3 text-left font-medium text-gray-800 truncate max-w-[100px]" title="${data.item_name}">${data.item_name}</td>
                <td class="py-2 px-3 text-left text-[10px] text-gray-400">
                    <div>${dateStr}</div>
                    <div class="text-[9px] opacity-75">${timeStr}</div>
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