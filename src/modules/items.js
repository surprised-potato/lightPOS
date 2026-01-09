import { checkPermission } from "../auth.js";
import { generateUUID } from "../utils.js";
import { dbRepository as Repository } from "../db.js";
import { dbPromise } from "../db.js";

let itemsData = [];
let suppliersList = [];
let sortState = { key: 'name', dir: 'asc' };
let filterState = { search: '', lowStock: false, category: '', supplierId: '' };
let selectedItemId = null;
let itemSalesChart = null;
let chartDays = 30;
let compareMode = false;
let selectedForCompare = [];
let comparisonCharts = [];

export async function loadItemsView() {
    const db = await dbPromise;
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("items", "write");
    
    content.innerHTML = `
        <div class="max-w-7xl mx-auto lg:h-[calc(100vh-140px)] flex flex-col">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                <!-- Left Column: Items List (5/12) -->
                <div class="lg:col-span-5 flex flex-col h-full min-h-[400px] lg:min-h-0">
                    <div class="flex flex-col mb-4 flex-shrink-0">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-2xl font-bold text-gray-800">Items</h2>
                            <div class="flex gap-2">
                            <button id="btn-compare-mode" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded transition duration-150 whitespace-nowrap text-xs">
                                Compare
                            </button>
                            <button id="btn-add-item" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 whitespace-nowrap text-xs ${canWrite ? '' : 'hidden'}">
                                + Add
                            </button>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input type="text" id="search-items" placeholder="Search..." class="shadow appearance-none border rounded w-full py-2 px-3 text-xs text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <select id="filter-items-category" class="shadow border rounded w-full py-2 px-3 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">All Categories</option>
                            </select>
                            <select id="filter-items-supplier" class="shadow border rounded w-full py-2 px-3 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">All Suppliers</option>
                            </select>
                        </div>
                    </div>

                    <div class="bg-white shadow-md rounded flex flex-col flex-1 border min-h-0">
                        <div class="overflow-y-auto flex-1">
                            <table class="min-w-full table-auto">
                                <thead class="sticky top-0 z-10 bg-gray-100">
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                        <th class="py-3 px-4 text-left cursor-pointer" data-sort="name">Name</th>
                                        <th class="py-3 px-4 text-right cursor-pointer" data-sort="stock_level">Stock</th>
                                        <th class="py-3 px-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="items-table-body" class="text-gray-600 text-sm font-light">
                                    <tr><td colspan="3" class="py-3 px-6 text-center">Loading...</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="items-pagination-info" class="p-2 bg-gray-50 text-[10px] text-center text-gray-400 italic border-t"></div>
                    </div>
                </div>

                <!-- Right Column: Item Insights (7/12) -->
                <div id="item-insights-panel" class="lg:col-span-7 hidden flex flex-col h-full min-h-[400px] lg:min-h-0 overflow-y-auto space-y-6 pr-2">
                    <!-- Header & Quadrant -->
                    <div class="bg-white shadow-md rounded p-6 border-t-4 border-blue-500 flex-shrink-0">
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 id="insight-item-name" class="text-xl font-bold text-gray-800"></h3>
                                <p id="insight-item-barcode" class="text-xs font-mono text-gray-500"></p>
                            </div>
                            <div id="item-quadrant-badge" class="px-3 py-1 rounded-full text-[10px] font-bold uppercase"></div>
                        </div>

                        <!-- Sales Chart -->
                        <div class="mt-6">
                            <div class="flex justify-between items-center mb-2">
                                <h4 class="text-xs font-bold text-gray-400 uppercase">Daily Sales Trend</h4>
                                <div class="flex gap-1">
                                    <button class="btn-chart-range text-[10px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" data-days="7">7D</button>
                                    <button class="btn-chart-range text-[10px] px-2 py-1 rounded bg-blue-600 text-white" data-days="30">30D</button>
                                </div>
                            </div>
                            <div class="h-48">
                                <canvas id="item-sales-chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Inventory Stats -->
                    <div class="bg-white shadow-md rounded p-4 flex-shrink-0">
                        <h4 class="text-xs font-bold text-gray-400 uppercase mb-3">Inventory Intelligence</h4>
                        <table class="min-w-full text-sm">
                            <tbody id="item-stats-body" class="divide-y divide-gray-100">
                                <!-- Stats Rows -->
                            </tbody>
                        </table>
                    </div>

                    <!-- Affinity -->
                    <div class="bg-white shadow-md rounded overflow-hidden flex-shrink-0">
                        <div class="bg-gray-50 px-4 py-2 border-b">
                            <h4 class="text-xs font-bold text-gray-500 uppercase">Frequently Bought Together</h4>
                        </div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="text-[10px] text-gray-500 uppercase bg-gray-100">
                                    <th class="py-2 px-4 text-left">Related Item</th>
                                    <th class="py-2 px-4 text-right">Attach Rate</th>
                                </tr>
                            </thead>
                            <tbody id="item-affinity-body" class="text-xs text-gray-600">
                                <!-- Affinity Rows -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Comparison Modal -->
        <div id="modal-compare-items" class="fixed inset-0 bg-gray-900 bg-opacity-75 hidden overflow-y-auto h-full w-full z-[60]">
            <div class="relative top-5 mx-auto p-5 border w-full max-w-6xl shadow-2xl rounded-xl bg-gray-50">
                <div class="flex justify-between items-center mb-6 px-4">
                    <h3 class="text-2xl font-bold text-gray-800">Product Comparison</h3>
                    <button id="btn-close-compare" class="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6" id="comparison-container">
                    <!-- Columns injected here -->
                </div>
                <div class="mt-8 flex justify-center">
                    <button class="bg-gray-800 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-black transition close-compare-btn">Close Comparison</button>
                </div>
            </div>
        </div>

        <!-- Add Item Modal -->
        <div id="modal-add-item" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-10 mx-auto p-5 border w-96 md:w-[500px] shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 id="item-modal-title" class="text-lg leading-6 font-medium text-gray-900 text-center mb-4">Add New Item</h3>
                    <form id="form-add-item">
                        <input type="hidden" id="item-id">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="mb-4 col-span-2">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Item Name</label>
                                <input type="text" id="item-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Barcode</label>
                                <input type="text" id="item-barcode" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Category</label>
                                <input type="text" id="item-category" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Beverages">
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Supplier</label>
                                <select id="item-supplier" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Select Supplier</option>
                                </select>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Cost Price</label>
                                <input type="number" step="0.01" id="item-cost" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Selling Price</label>
                                <input type="number" step="0.01" id="item-price" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Initial Stock</label>
                                <input type="number" id="item-stock" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" value="0">
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Min Stock Alert</label>
                                <input type="number" id="item-min-stock" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" value="10">
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Base Unit (e.g. Can)</label>
                                <input type="text" id="item-unit" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Parent Item (Bulk)</label>
                                <input type="text" id="item-parent-search" placeholder="Search parent item..." autocomplete="off" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <input type="hidden" id="item-parent-id">
                                <div id="parent-dropdown-list" class="hidden absolute z-50 bg-white border border-gray-300 mt-1 w-full rounded shadow-lg max-h-48 overflow-y-auto"></div>
                            </div>
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Conversion Factor</label>
                                <input type="number" id="item-conv" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 12">
                            </div>
                        </div>
                        
                        <div class="flex items-center justify-between mt-6">
                            <button type="button" id="btn-cancel-item" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none">Cancel</button>
                            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none">Save Item</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Parent Search Logic
    const parentSearchInput = document.getElementById("item-parent-search");
    const parentIdInput = document.getElementById("item-parent-id");
    const parentList = document.getElementById("parent-dropdown-list");

    const renderParentOptions = (items) => {
        parentList.innerHTML = "";
        if (items.length === 0) {
            parentList.classList.add("hidden");
            return;
        }
        parentList.classList.remove("hidden");
        items.forEach(item => {
            const div = document.createElement("div");
            div.className = "p-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm";
            div.textContent = item.name;
            div.addEventListener("click", () => {
                parentSearchInput.value = item.name;
                parentIdInput.value = item.id;
                parentList.classList.add("hidden");
            });
            parentList.appendChild(div);
        });
    };

    parentSearchInput?.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        parentIdInput.value = ""; // Reset ID on type
        const currentId = document.getElementById("item-id")?.value;
        const filtered = itemsData.filter(i => 
            i.id !== currentId && i.name.toLowerCase().includes(term)
        );
        renderParentOptions(filtered);
    });

    parentSearchInput?.addEventListener("focus", () => {
        const currentId = document.getElementById("item-id").value;
        const filtered = itemsData.filter(i => i.id !== currentId);
        renderParentOptions(filtered);
    });

    document.addEventListener("click", (e) => {
        if (parentSearchInput && parentList && !parentSearchInput.contains(e.target) && !parentList.contains(e.target)) {
            parentList.classList.add("hidden");
        }
    });

    // Event Listeners
    const modal = document.getElementById("modal-add-item");
    if (canWrite) {
        document.getElementById("btn-add-item")?.addEventListener("click", () => {
            document.getElementById("form-add-item")?.reset();
            const itemIdEl = document.getElementById("item-id");
            if (itemIdEl) itemIdEl.value = ""; // Empty ID means new item
            const parentIdEl = document.getElementById("item-parent-id");
            if (parentIdEl) parentIdEl.value = "";
            const titleEl = document.getElementById("item-modal-title");
            if (titleEl) titleEl.textContent = "Add New Item";
            const stockEl = document.getElementById("item-stock");
            if (stockEl) stockEl.disabled = false;
            modal?.classList.remove("hidden");
            populateSupplierDropdown();
        });
    }
    document.getElementById("btn-cancel-item")?.addEventListener("click", () => modal?.classList.add("hidden"));

    // Search & Filter Listeners
    document.getElementById("search-items")?.addEventListener("input", (e) => {
        filterState.search = e.target.value;
        applyFiltersAndSort();
    });

    document.getElementById("filter-items-category")?.addEventListener("change", (e) => {
        filterState.category = e.target.value;
        applyFiltersAndSort();
    });

    document.getElementById("filter-items-supplier")?.addEventListener("change", (e) => {
        filterState.supplierId = e.target.value;
        applyFiltersAndSort();
    });

    document.getElementById("btn-compare-mode")?.addEventListener("click", (e) => {
        compareMode = !compareMode;
        selectedForCompare = [];
        const btn = e.target;
        if (compareMode) {
            btn.textContent = "Select 2 items...";
            btn.className = "bg-blue-100 text-blue-700 font-bold py-2 px-4 rounded border border-blue-300 animate-pulse text-xs";
        } else {
            btn.textContent = "Compare";
            btn.className = "bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded transition duration-150 text-xs";
            fetchItems(); // Refresh to clear highlights
        }
    });

    document.getElementById("btn-close-compare")?.addEventListener("click", closeComparison);
    document.querySelector(".close-compare-btn")?.addEventListener("click", closeComparison);

    // Chart Range Toggles
    content.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-chart-range");
        if (btn) {
            chartDays = parseInt(btn.dataset.days);
            content.querySelectorAll(".btn-chart-range").forEach(b => b.className = "text-[10px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200");
            btn.className = "text-[10px] px-2 py-1 rounded bg-blue-600 text-white";
            refreshItemInsights();
        }
    });

    // Sorting Listener
    content.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-sort]");
        if (th) {
            const key = th.dataset.sort;
            if (sortState.key === key) {
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.key = key;
                sortState.dir = 'asc';
            }
            applyFiltersAndSort();
        }
    });

    // Form Submit
    document.getElementById("form-add-item")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const db = await dbPromise;
        
        const itemId = document.getElementById("item-id").value;
        const barcode = document.getElementById("item-barcode").value.trim();
        const name = document.getElementById("item-name").value.trim();
        const category = document.getElementById("item-category").value.trim();
        
        const itemData = {
            name: name,
            barcode: barcode,
            category: category,
            supplier_id: document.getElementById("item-supplier").value,
            cost_price: parseFloat(document.getElementById("item-cost").value),
            selling_price: parseFloat(document.getElementById("item-price").value),
            stock_level: parseInt(document.getElementById("item-stock").value),
            min_stock: parseInt(document.getElementById("item-min-stock").value),
            base_unit: document.getElementById("item-unit").value,
            parent_id: document.getElementById("item-parent-id").value || null,
            conv_factor: document.getElementById("item-conv").value ? parseFloat(document.getElementById("item-conv").value) : 1
        };

        // 1. Check for duplicate/deleted barcodes
        const existingBarcode = await db.items.where('barcode').equals(barcode).first();
        if (existingBarcode && existingBarcode.id !== itemId) {
            if (existingBarcode._deleted) {
                if (confirm(`An item with barcode "${barcode}" ("${existingBarcode.name}") was previously deleted. Would you like to restore it with these new details?`)) {
                    await Repository.upsert('items', { ...itemData, id: existingBarcode.id, _deleted: false });
                    modal.classList.add("hidden");
                    fetchItems();
                }
                return;
            } else {
                alert(`Validation Error: Barcode "${barcode}" is already assigned to "${existingBarcode.name}".`);
                return;
            }
        }

        // 2. Check for duplicate/deleted names (case-insensitive)
        const existingName = await db.items.where('name').equalsIgnoreCase(name).first();
        if (existingName && existingName.id !== itemId) {
            if (existingName._deleted) {
                if (confirm(`An item named "${name}" was previously deleted. Would you like to restore it?`)) {
                    await Repository.upsert('items', { ...itemData, id: existingName.id, _deleted: false });
                    modal.classList.add("hidden");
                    fetchItems();
                }
                return;
            } else {
                alert(`Validation Error: An item named "${name}" already exists.`);
                return;
            }
        }

        try {
            const finalData = itemId ? { ...itemData, id: itemId } : { ...itemData, id: generateUUID() };
            
            // Use Repository for versioned, offline-first write
            await Repository.upsert('items', finalData);

            // Record Initial Stock Movement if new item
            if (!itemId && finalData.stock_level > 0) {
                const movement = {
                    id: generateUUID(),
                    item_id: finalData.id,
                    item_name: finalData.name,
                    timestamp: Math.floor(Date.now() / 1000),
                    type: 'Initial Stock',
                    qty: finalData.stock_level,
                    user: JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown',
                    reason: 'Initial Inventory'
                };
                await Repository.upsert('stock_movements', movement);
            }

            modal.classList.add("hidden");
            e.target.reset();
            document.getElementById("item-id").value = "";
            fetchItems();
        } catch (error) {
            console.error("Error saving item:", error);
            alert("Failed to save item.");
        }
    });

    // Initial Load
    selectedItemId = null;
    await Promise.all([fetchItems(), fetchSuppliers()]);
}

function applyFiltersAndSort() {
    let filtered = [...itemsData];

    // Filter
    if (filterState.search) {
        const term = filterState.search.toLowerCase();
        filtered = filtered.filter(item => 
            (item.name || "").toLowerCase().includes(term) || 
            (item.barcode || "").toLowerCase().includes(term) ||
            (item.category || "").toLowerCase().includes(term)
        );
    }
    if (filterState.lowStock) {
        filtered = filtered.filter(item => item.stock_level <= (item.min_stock || 10));
    }
    if (filterState.category) {
        filtered = filtered.filter(item => item.category === filterState.category);
    }
    if (filterState.supplierId) {
        filtered = filtered.filter(item => item.supplier_id === filterState.supplierId);
    }

    // Sort
    filtered.sort((a, b) => {
        let valA = a[sortState.key];
        let valB = b[sortState.key];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortState.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Limit items for performance
    const limit = 50;
    const totalCount = filtered.length;
    const limited = filtered.slice(0, limit);
    renderItems(limited, totalCount);

    const pagInfo = document.getElementById("items-pagination-info");
    if (pagInfo) pagInfo.textContent = `Showing ${limited.length} of ${totalCount} items`;
}

async function fetchSuppliers() {
    try {
        const data = await Repository.getAll('suppliers');
        suppliersList = Array.isArray(data) ? data : [];
        populateFilterDropdowns();
    } catch (error) {
        console.error("Error loading suppliers:", error);
        suppliersList = [];
    }
}

function populateSupplierDropdown() {
    const select = document.getElementById("item-supplier");
    select.innerHTML = '<option value="">Select Supplier</option>';
    suppliersList.forEach(sup => {
        const option = document.createElement("option");
        option.value = sup.id;
        option.textContent = sup.name;
        select.appendChild(option);
    });
}

function populateFilterDropdowns() {
    // Category Filter
    const catSelect = document.getElementById("filter-items-category");
    if (catSelect) {
        const categories = [...new Set(itemsData.map(i => i.category).filter(c => c))].sort();
        const currentVal = catSelect.value;
        catSelect.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            catSelect.appendChild(opt);
        });
        catSelect.value = currentVal || filterState.category;
    }

    // Supplier Filter
    const supSelect = document.getElementById("filter-items-supplier");
    if (supSelect) {
        const currentVal = supSelect.value;
        supSelect.innerHTML = '<option value="">All Suppliers</option>';
        suppliersList.forEach(sup => {
            const opt = document.createElement("option");
            opt.value = sup.id;
            opt.textContent = sup.name;
            supSelect.appendChild(opt);
        });
        supSelect.value = currentVal || filterState.supplierId;
    }
}

async function fetchItems() {
    const tbody = document.getElementById("items-table-body");
    tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">Loading...</td></tr>`;
    try {
        const data = await Repository.getAll('items');
        itemsData = Array.isArray(data) ? data : [];
        populateFilterDropdowns();
        applyFiltersAndSort();
    } catch (error) {
        console.error("Error fetching items:", error);
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading items.</td></tr>`;
    }
}

function renderItems(items, totalCount) {
    const tbody = document.getElementById("items-table-body");
    if (!tbody) return;
    const canWrite = checkPermission("items", "write");
    tbody.innerHTML = "";

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No items found.</td></tr>`;
        return;
    }

    items.forEach(item => {
        const row = document.createElement("tr");
        row.className = `border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${selectedItemId === item.id ? 'bg-blue-50' : ''}`;
        row.innerHTML = `
            <td class="py-3 px-4 text-left font-medium">${item.name}</td>
            <td class="py-3 px-4 text-right ${item.stock_level <= item.min_stock ? 'text-red-600 font-bold' : ''}">${item.stock_level}</td>
            <td class="py-3 px-4 text-center">
                <button class="text-blue-500 hover:text-blue-700 edit-btn ${canWrite ? '' : 'hidden'}" data-id="${item.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button class="text-red-500 hover:text-red-700 delete-btn ${canWrite ? '' : 'hidden'}" data-id="${item.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </td>
        `;
        
        const openEditModal = () => {
            if (!canWrite) return;
            document.getElementById("item-modal-title").textContent = "Edit Item";
            document.getElementById("item-stock").disabled = true;
            document.getElementById("item-id").value = item.id;
            document.getElementById("item-name").value = item.name;
            document.getElementById("item-barcode").value = item.barcode;
            document.getElementById("item-category").value = item.category || "";
            document.getElementById("item-cost").value = item.cost_price;
            document.getElementById("item-price").value = item.selling_price;
            document.getElementById("item-stock").value = item.stock_level;
            document.getElementById("item-min-stock").value = item.min_stock;
            document.getElementById("item-unit").value = item.base_unit || "";
            document.getElementById("item-conv").value = item.conv_factor || "";
            
            populateSupplierDropdown();
            
            document.getElementById("item-supplier").value = item.supplier_id || "";
            
            // Populate Parent Search
            const parentItem = itemsData.find(p => p.id === item.parent_id);
            document.getElementById("item-parent-search").value = parentItem ? parentItem.name : "";
            document.getElementById("item-parent-id").value = item.parent_id || "";
            
            document.getElementById("modal-add-item").classList.remove("hidden");
        };

        row.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            if (compareMode) {
                const idx = selectedForCompare.findIndex(i => i.id === item.id);
                if (idx > -1) {
                    selectedForCompare.splice(idx, 1);
                    row.classList.remove("bg-blue-100", "ring-2", "ring-blue-500");
                } else if (selectedForCompare.length < 2) {
                    selectedForCompare.push(item);
                    row.classList.add("bg-blue-100", "ring-2", "ring-blue-500");
                    if (selectedForCompare.length === 2) openComparisonModal();
                }
            } else {
                selectItem(item);
            }
        });

        row.querySelector(".edit-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            openEditModal();
        });

        row.querySelector(".delete-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            if (confirm(`Delete item "${item.name}"?`)) {
                const id = e.currentTarget.getAttribute("data-id");
                try {
                    await Repository.remove('items', id);
                    await fetchItems();
                } catch (error) {
                    console.error("Error deleting item:", error);
                    alert("Failed to delete item.");
                }
            }
        });

        tbody.appendChild(row);
    });
}

async function selectItem(item) {
    selectedItemId = item.id;
    document.getElementById("item-insights-panel").classList.remove("hidden");
    document.getElementById("insight-item-name").textContent = item.name;
    document.getElementById("insight-item-barcode").textContent = item.barcode;

    // Highlight selected row
    document.querySelectorAll("#items-table-body tr").forEach(row => row.classList.remove("bg-blue-50"));
    const rows = document.querySelectorAll("#items-table-body tr");
    const idx = itemsData.findIndex(i => i.id === item.id);
    if (idx !== -1 && rows[idx]) rows[idx].classList.add("bg-blue-50");

    await refreshItemInsights();
}

async function refreshItemInsights() {
    const db = await dbPromise;
    const item = itemsData.find(i => i.id === selectedItemId);
    if (!item) return;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - chartDays);
    const startStr = startDate.toISOString();

    // 1. Fetch Transactions for this item
    // Using timestamp index as item_ids is not indexed in the schema
    const itemSales = await db.transactions
        .where('timestamp').aboveOrEqual(startStr)
        .filter(t => !t._deleted && !t.is_voided && t.items.some(it => it.id === item.id))
        .toArray();

    // 1b. Fetch Total Sold All Time & First Sale Date
    let totalSoldAllTime = 0;
    let firstSaleDate = null;

    await db.transactions
        .filter(t => !t._deleted && !t.is_voided && t.items.some(it => it.id === item.id))
        .each(t => {
            const entry = t.items.find(it => it.id === item.id);
            if (entry) {
                totalSoldAllTime += entry.qty;
                const tDate = new Date(t.timestamp);
                if (!firstSaleDate || tDate < firstSaleDate) {
                    firstSaleDate = tDate;
                }
            }
        });
    
    // 2. Render Chart
    renderItemSalesChart(itemSales, item.id, chartDays);

    // 3. Calculate Stats
    const totalQty = itemSales.reduce((sum, t) => sum + (t.items.find(i => i.id === item.id)?.qty || 0), 0);
    
    let effectiveDays = chartDays;
    if (firstSaleDate) {
        const now = new Date();
        const daysSinceFirstSale = (now - firstSaleDate) / (1000 * 60 * 60 * 24);
        if (daysSinceFirstSale < chartDays) {
            effectiveDays = Math.max(1, Math.ceil(daysSinceFirstSale));
        }
    }

    const avgDaily = totalQty / effectiveDays;
    const duration = avgDaily > 0 ? Math.floor(item.stock_level / avgDaily) : Infinity;

    // Forecasted Monthly Sales
    const forecastedMonthly = Math.ceil(avgDaily * 30);

    // Last Stock Count
    const lastAudit = await db.adjustments.where('item_id').equals(item.id).last();

    // Quadrant Classification (Simplified logic from reports.js)
    const revenue = itemSales.reduce((sum, t) => {
        const entry = t.items.find(i => i.id === item.id);
        return sum + (entry ? (entry.selling_price * entry.qty) : 0);
    }, 0);
    const marginPct = ((item.selling_price - item.cost_price) / item.selling_price) * 100;
    
    const badge = document.getElementById("item-quadrant-badge");
    if (revenue > 1000 && marginPct > 30) {
        badge.textContent = "Winner"; badge.className = "px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700";
    } else if (revenue > 1000) {
        badge.textContent = "Cash Cow"; badge.className = "px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700";
    } else if (marginPct > 30) {
        badge.textContent = "Sleeper"; badge.className = "px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-700";
    } else {
        badge.textContent = "Dog"; badge.className = "px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-700";
    }

    document.getElementById("item-stats-body").innerHTML = `
        <tr><td class="py-2 text-gray-500">Total Sold (All Time)</td><td class="py-2 text-right font-bold">${totalSoldAllTime} units</td></tr>
        <tr><td class="py-2 text-gray-500">Avg. Daily Sales</td><td class="py-2 text-right font-bold">${avgDaily.toFixed(2)} units</td></tr>
        <tr><td class="py-2 text-gray-500">Stock Duration</td><td class="py-2 text-right font-bold ${duration < 7 ? 'text-red-600' : ''}">${duration === Infinity ? 'N/A' : duration + ' days'}</td></tr>
        <tr><td class="py-2 text-gray-500">Forecasted Monthly Sales</td><td class="py-2 text-right font-bold text-blue-600">${forecastedMonthly} units</td></tr>
        <tr><td class="py-2 text-gray-500">Last Stock Count</td><td class="py-2 text-right font-bold">${lastAudit ? new Date(lastAudit.timestamp).toLocaleDateString() : 'Never'}</td></tr>
    `;

    // 4. Affinity
    const itemMap = {};
    itemSales.forEach(t => {
        t.items.forEach(i => {
            if (i.id !== item.id) itemMap[i.name] = (itemMap[i.name] || 0) + 1;
        });
    });
    const topAffinity = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    document.getElementById("item-affinity-body").innerHTML = topAffinity.map(([name, count]) => `
        <tr class="border-b"><td class="py-2 px-4">${name}</td><td class="py-2 px-4 text-right font-bold text-blue-600">${((count / itemSales.length) * 100).toFixed(1)}%</td></tr>
    `).join('') || '<tr><td colspan="2" class="py-4 text-center text-gray-400 italic">No data</td></tr>';
}

function renderItemSalesChart(transactions, itemId, days) {
    const ctx = document.getElementById('item-sales-chart').getContext('2d');
    if (itemSalesChart) itemSalesChart.destroy();

    const dailyData = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day local time

    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyData[key] = 0;
    }

    transactions.forEach(t => {
        const day = t.timestamp.split('T')[0];
        if (dailyData[day] !== undefined) {
            dailyData[day] += t.items.find(i => i.id === itemId)?.qty || 0;
        }
    });

    const labels = Object.keys(dailyData).reverse();
    const values = Object.values(dailyData).reverse();

    itemSalesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Units Sold',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                x: { ticks: { font: { size: 8 }, maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

async function openComparisonModal() {
    const modal = document.getElementById("modal-compare-items");
    const container = document.getElementById("comparison-container");
    container.innerHTML = `<div class="col-span-2 text-center py-20 text-gray-500 italic">Analyzing data...</div>`;
    modal.classList.remove("hidden");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - chartDays);
    const startStr = startDate.toISOString();

    const db = await dbPromise;
    const [txs, allMovements, allAdjustments] = await Promise.all([
        db.transactions.where('timestamp').aboveOrEqual(startStr).and(t => !t._deleted && !t.is_voided).toArray(),
        db.stock_movements.toArray(),
        db.adjustments.toArray()
    ]);

    // Calculate global averages for quadrant logic
    const allItemStats = {};
    txs.forEach(t => {
        t.items.forEach(i => {
            if (!allItemStats[i.id]) allItemStats[i.id] = { revenue: 0, marginPct: 0, count: 0 };
            allItemStats[i.id].revenue += (i.selling_price * i.qty);
            const margin = i.selling_price - (i.cost_price || 0);
            allItemStats[i.id].marginPct += i.selling_price > 0 ? (margin / i.selling_price * 100) : 0;
            allItemStats[i.id].count++;
        });
    });
    const statsArray = Object.values(allItemStats);
    const avgRev = statsArray.reduce((sum, s) => sum + s.revenue, 0) / (statsArray.length || 1);
    const avgMargin = statsArray.reduce((sum, s) => sum + (s.marginPct / s.count), 0) / (statsArray.length || 1);

    container.innerHTML = "";
    comparisonCharts.forEach(c => c.destroy());
    comparisonCharts = [];

    for (let i = 0; i < 2; i++) {
        const item = selectedForCompare[i];
        const itemSales = txs.filter(t => t.items.some(it => it.id === item.id));
        const myStats = allItemStats[item.id] || { revenue: 0, marginPct: 0, count: 1 };
        const itemRevenue = myStats.revenue;
        const itemMarginPct = myStats.marginPct / myStats.count;

        let quadrant = "Dog", badgeClass = "bg-gray-100 text-gray-700", borderClass = "border-gray-500";
        if (itemRevenue >= avgRev && itemMarginPct >= avgMargin) {
            quadrant = "Winner"; badgeClass = "bg-green-100 text-green-700"; borderClass = "border-green-500";
        } else if (itemRevenue >= avgRev) {
            quadrant = "Cash Cow"; badgeClass = "bg-blue-100 text-blue-700"; borderClass = "border-blue-500";
        } else if (itemMarginPct >= avgMargin) {
            quadrant = "Sleeper"; badgeClass = "bg-orange-100 text-orange-700"; borderClass = "border-orange-500";
        }

        const totalQty = itemSales.reduce((sum, t) => sum + t.items.find(it => it.id === item.id).qty, 0);
        const avgDaily = totalQty / chartDays;
        const duration = avgDaily > 0 ? Math.floor(item.stock_level / avgDaily) : Infinity;

        const col = document.createElement("div");
        col.className = `bg-white shadow-xl rounded-xl p-6 border-t-8 ${borderClass} space-y-6`;
        col.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="text-xl font-bold text-gray-800">${item.name}</h4>
                    <p class="text-xs font-mono text-gray-400">${item.barcode}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${badgeClass}">${quadrant}</span>
            </div>
            <div class="h-40"><canvas id="compare-chart-${i}"></canvas></div>
            <div class="bg-gray-50 rounded-lg p-4">
                <table class="w-full text-sm">
                    <tr class="border-b border-gray-200"><td class="py-2 text-gray-500">Avg Daily Sales</td><td class="py-2 text-right font-bold">${avgDaily.toFixed(2)}</td></tr>
                    <tr class="border-b border-gray-200"><td class="py-2 text-gray-500">Stock Duration</td><td class="py-2 text-right font-bold">${duration === Infinity ? 'N/A' : duration + ' days'}</td></tr>
                    <tr class="border-b border-gray-200"><td class="py-2 text-gray-500">Current Stock</td><td class="py-2 text-right font-bold">${item.stock_level}</td></tr>
                    <tr><td class="py-2 text-gray-500">Selling Price</td><td class="py-2 text-right font-bold text-green-600">₱${item.selling_price.toFixed(2)}</td></tr>
                </table>
            </div>
        `;
        container.appendChild(col);
        
        // Render Chart
        const ctx = document.getElementById(`compare-chart-${i}`).getContext('2d');
        const dailyData = {};
        for (let j = 0; j < chartDays; j++) {
            const d = new Date(); d.setDate(d.getDate() - j);
            dailyData[d.toISOString().split('T')[0]] = 0;
        }
        itemSales.forEach(t => {
            const day = t.timestamp.split('T')[0];
            if (dailyData[day] !== undefined) dailyData[day] += t.items.find(it => it.id === item.id).qty;
        });
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Object.keys(dailyData).reverse(),
                datasets: [{
                    data: Object.values(dailyData).reverse(),
                    borderColor: i === 0 ? '#3b82f6' : '#8b5cf6',
                    backgroundColor: i === 0 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                    fill: true, tension: 0.4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { font: { size: 8 } } }, x: { ticks: { display: false } } }
            }
        });
        comparisonCharts.push(chart);
    }
}

function closeComparison() {
    document.getElementById("modal-compare-items").classList.add("hidden");
    compareMode = false;
    selectedForCompare = [];
    const btn = document.getElementById("btn-compare-mode");
    if (btn) {
        btn.textContent = "Compare";
        btn.className = "bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 px-4 rounded transition duration-150 text-xs";
    }
    fetchItems();
}