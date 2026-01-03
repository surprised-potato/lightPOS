import { db as firestore } from "../firebase-config.js";
import { db } from "../db.js";
import { checkPermission } from "../auth.js";
import { updateDoc, doc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let itemsData = [];
let selectedItem = null;

export async function loadStockInView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Stock In (Receive Inventory)</h2>
            
            <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                <!-- Item Search -->
                <div class="mb-6 relative">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Search Item</label>
                    <input type="text" id="stockin-search" placeholder="Scan barcode or type name..." autocomplete="off" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <div id="stockin-results" class="hidden absolute z-10 bg-white border border-gray-300 mt-1 w-full rounded shadow-lg max-h-48 overflow-y-auto"></div>
                </div>

                <!-- Selected Item Details -->
                <div id="selected-item-container" class="hidden mb-6 p-4 bg-blue-50 rounded border border-blue-200">
                    <h3 id="display-name" class="font-bold text-lg text-blue-800"></h3>
                    <p class="text-sm text-gray-600">Barcode: <span id="display-barcode"></span></p>
                    <p class="text-sm text-gray-600">Current Stock: <span id="display-stock" class="font-bold"></span></p>
                    <p class="text-sm text-gray-600">Current Cost: <span id="display-cost"></span></p>
                </div>

                <!-- Entry Fields -->
                <div class="flex flex-wrap -mx-3 mb-6">
                    <div class="w-full md:w-1/2 px-3 mb-6 md:mb-0">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Quantity to Add</label>
                        <input type="number" id="input-qty" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" min="1">
                    </div>
                    <div class="w-full md:w-1/2 px-3">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Cost Per Unit</label>
                        <input type="number" id="input-cost" step="0.01" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>

                <div class="flex items-center justify-end">
                    <button id="btn-receive" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                        Receive Stock
                    </button>
                </div>
            </div>
        </div>

        <!-- Price Discrepancy Modal -->
        <div id="modal-price-alert" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div class="relative mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3 text-center">
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
                        <svg class="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mt-2">Price Discrepancy</h3>
                    <div class="mt-2 px-7 py-3">
                        <p class="text-sm text-gray-500">
                            The entered cost (<span id="alert-new-cost" class="font-bold"></span>) differs from the master cost (<span id="alert-old-cost" class="font-bold"></span>).
                        </p>
                        <p class="text-sm text-gray-500 mt-2">Do you want to update the master cost price?</p>
                    </div>
                    <div class="flex flex-col gap-2 mt-4">
                        <button id="btn-update-cost" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none w-full">
                            Yes, Update Master Cost
                        </button>
                        <button id="btn-keep-cost" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none w-full">
                            No, Keep Old Cost
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Stock In History -->
        <div class="max-w-4xl mx-auto mt-8">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Recent Stock In History</h3>
            <div class="bg-white shadow-md rounded overflow-x-auto">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Date</th>
                            <th class="py-3 px-6 text-left">Item</th>
                            <th class="py-3 px-6 text-right">Qty</th>
                            <th class="py-3 px-6 text-right">Cost</th>
                        </tr>
                    </thead>
                    <tbody id="stock-logs-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="4" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Initialize
    await Promise.all([fetchItems(), fetchStockLogs()]);
    setupEventListeners();
}

async function fetchItems() {
    try {
        itemsData = await db.items.toArray();
    } catch (error) {
        console.error("Error fetching items:", error);
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById("stockin-search");
    const resultsDiv = document.getElementById("stockin-results");
    const btnReceive = document.getElementById("btn-receive");
    const modal = document.getElementById("modal-price-alert");
    const canWrite = checkPermission("stockin", "write");

    // Search Logic
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

    // Receive Button Logic
    btnReceive.addEventListener("click", () => {
        if (!canWrite) {
            alert("You do not have permission to perform Stock In.");
            return;
        }

        const qty = parseInt(document.getElementById("input-qty").value);
        const newCost = parseFloat(document.getElementById("input-cost").value);

        if (!qty || qty <= 0 || isNaN(newCost)) {
            alert("Please enter valid quantity and cost.");
            return;
        }

        if (newCost !== selectedItem.cost_price) {
            document.getElementById("alert-new-cost").textContent = newCost.toFixed(2);
            document.getElementById("alert-old-cost").textContent = selectedItem.cost_price.toFixed(2);
            modal.classList.remove("hidden");
        } else {
            processStockIn(qty, newCost, false);
        }
    });

    document.getElementById("btn-update-cost").addEventListener("click", () => processStockIn(parseInt(document.getElementById("input-qty").value), parseFloat(document.getElementById("input-cost").value), true));
    document.getElementById("btn-keep-cost").addEventListener("click", () => processStockIn(parseInt(document.getElementById("input-qty").value), parseFloat(document.getElementById("input-cost").value), false));
}

function selectItem(item) {
    selectedItem = item;
    document.getElementById("stockin-search").value = item.name;
    document.getElementById("stockin-results").classList.add("hidden");
    document.getElementById("selected-item-container").classList.remove("hidden");
    document.getElementById("display-name").textContent = item.name;
    document.getElementById("display-barcode").textContent = item.barcode;
    document.getElementById("display-stock").textContent = item.stock_level;
    document.getElementById("display-cost").textContent = item.cost_price.toFixed(2);
    document.getElementById("input-cost").value = item.cost_price;
    document.getElementById("btn-receive").disabled = false;
    if (!checkPermission("stockin", "write")) document.getElementById("btn-receive").disabled = true;
}

async function processStockIn(qty, cost, updateMasterCost) {
    try {
        const updateData = {
            stock_level: increment(qty)
        };
        if (updateMasterCost) {
            updateData.cost_price = cost;
        }

        await updateDoc(doc(firestore, "items", selectedItem.id), updateData);
        
        // Update local cache immediately to reflect new stock level
        await db.items.update(selectedItem.id, {
            stock_level: selectedItem.stock_level + qty,
            ...(updateMasterCost ? { cost_price: cost } : {})
        });

        // Log the transaction locally first
        await db.stock_logs.add({
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            barcode: selectedItem.barcode,
            qty_added: qty,
            cost_price: cost,
            timestamp: new Date(),
            sync_status: 0
        });

        document.getElementById("modal-price-alert").classList.add("hidden");
        alert(`Successfully added ${qty} units to ${selectedItem.name}.`);
        
        // Reset Form
        document.getElementById("stockin-search").value = "";
        document.getElementById("selected-item-container").classList.add("hidden");
        document.getElementById("input-qty").value = "";
        document.getElementById("input-cost").value = "";
        document.getElementById("btn-receive").disabled = true;
        selectedItem = null;
        
        // Refresh local data
        fetchItems();
        fetchStockLogs();
    } catch (error) {
        console.error("Error updating stock:", error);
        alert("Failed to update stock.");
    }
}

async function fetchStockLogs() {
    const tbody = document.getElementById("stock-logs-table-body");
    try {
        const logs = await db.stock_logs.orderBy("timestamp").reverse().limit(10).toArray();
        
        tbody.innerHTML = "";
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No history found.</td></tr>`;
            return;
        }

        logs.forEach(data => {
            const dateObj = new Date(data.timestamp);
            const dateStr = dateObj.toLocaleString();
            
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${dateStr}</td>
                <td class="py-3 px-6 text-left">
                    <div class="font-medium">${data.item_name}</div>
                    <div class="text-xs text-gray-500">${data.barcode}</div>
                </td>
                <td class="py-3 px-6 text-right font-bold text-green-600">+${data.qty_added}</td>
                <td class="py-3 px-6 text-right">${parseFloat(data.cost_price).toFixed(2)}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching logs:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center text-red-500">Error loading history.</td></tr>`;
    }
}