import { checkPermission } from "../auth.js";
import { generateUUID } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { db } from "../db.js";

let itemsData = [];
let suppliersList = [];
let sortState = { key: 'name', dir: 'asc' };
let filterState = { search: '', lowStock: false };

export async function loadItemsView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("items", "write");
    
    content.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 md:mb-0">Items</h2>
            <div class="flex w-full md:w-auto gap-4 items-center">
                <input type="text" id="search-items" placeholder="Search items..." class="shadow appearance-none border rounded w-full md:w-64 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                <div class="flex items-center gap-2">
                    <label class="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Show:</label>
                    <input type="number" id="items-limit" value="50" min="1" class="w-16 border rounded p-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <label class="inline-flex items-center text-sm text-gray-600 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" id="filter-low-stock" class="form-checkbox h-4 w-4 text-blue-600">
                    <span class="ml-2">Low Stock Only</span>
                </label>
                <button id="btn-add-item" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 whitespace-nowrap ${canWrite ? '' : 'hidden'}">
                    + Add Item
                </button>
            </div>
        </div>

        <div class="bg-white shadow-md rounded my-6 overflow-x-auto">
            <table class="min-w-full table-auto">
                <thead>
                    <tr class="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-300 transition-colors" data-sort="barcode">Barcode</th>
                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-300 transition-colors" data-sort="name">Name</th>
                        <th class="py-3 px-6 text-left">Base Unit</th>
                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-300 transition-colors" data-sort="cost_price">Cost</th>
                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-300 transition-colors" data-sort="selling_price">Price</th>
                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-300 transition-colors" data-sort="stock_level">Stock</th>
                        <th class="py-3 px-6 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody id="items-table-body" class="text-gray-600 text-sm font-light">
                    <tr><td colspan="7" class="py-3 px-6 text-center">Loading...</td></tr>
                </tbody>
            </table>
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

    parentSearchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        parentIdInput.value = ""; // Reset ID on type
        const currentId = document.getElementById("item-id").value;
        const filtered = itemsData.filter(i => 
            i.id !== currentId && i.name.toLowerCase().includes(term)
        );
        renderParentOptions(filtered);
    });

    parentSearchInput.addEventListener("focus", () => {
        const currentId = document.getElementById("item-id").value;
        const filtered = itemsData.filter(i => i.id !== currentId);
        renderParentOptions(filtered);
    });

    document.addEventListener("click", (e) => {
        if (!parentSearchInput.contains(e.target) && !parentList.contains(e.target)) {
            parentList.classList.add("hidden");
        }
    });

    // Event Listeners
    const modal = document.getElementById("modal-add-item");
    if (canWrite) {
        document.getElementById("btn-add-item").addEventListener("click", () => {
        document.getElementById("form-add-item").reset();
        document.getElementById("item-id").value = ""; // Empty ID means new item
        document.getElementById("item-parent-id").value = "";
        document.getElementById("item-modal-title").textContent = "Add New Item";
        document.getElementById("item-stock").disabled = false;
        modal.classList.remove("hidden");
        populateSupplierDropdown();
        });
    }
    document.getElementById("btn-cancel-item").addEventListener("click", () => modal.classList.add("hidden"));

    // Search & Filter Listeners
    document.getElementById("search-items").addEventListener("input", (e) => {
        filterState.search = e.target.value;
        applyFiltersAndSort();
    });

    document.getElementById("filter-low-stock").addEventListener("change", (e) => {
        filterState.lowStock = e.target.checked;
        applyFiltersAndSort();
    });

    document.getElementById("items-limit").addEventListener("input", () => applyFiltersAndSort());

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
    document.getElementById("form-add-item").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const itemId = document.getElementById("item-id").value;
        const barcode = document.getElementById("item-barcode").value.trim();
        const name = document.getElementById("item-name").value.trim();
        
        const itemData = {
            name: name,
            barcode: barcode,
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
    await Promise.all([fetchItems(), fetchSuppliers()]);
}

function applyFiltersAndSort() {
    let filtered = [...itemsData];

    // Filter
    if (filterState.search) {
        const term = filterState.search.toLowerCase();
        filtered = filtered.filter(item => 
            (item.name || "").toLowerCase().includes(term) || 
            (item.barcode || "").toLowerCase().includes(term)
        );
    }
    if (filterState.lowStock) {
        filtered = filtered.filter(item => item.stock_level <= (item.min_stock || 10));
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
    const limit = parseInt(document.getElementById("items-limit")?.value) || 50;
    const totalCount = filtered.length;
    const limited = filtered.slice(0, limit);
    renderItems(limited, totalCount);
}

async function fetchSuppliers() {
    try {
        const data = await Repository.getAll('suppliers');
        suppliersList = Array.isArray(data) ? data : [];
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

async function fetchItems() {
    const tbody = document.getElementById("items-table-body");
    tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center">Loading...</td></tr>`;

    try {
        const data = await Repository.getAll('items');
        itemsData = Array.isArray(data) ? data : [];
        applyFiltersAndSort();
    } catch (error) {
        console.error("Error fetching items:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center text-red-500">Error loading items.</td></tr>`;
    }
}

function renderItems(items, totalCount) {
    const tbody = document.getElementById("items-table-body");
    const canWrite = checkPermission("items", "write");
    tbody.innerHTML = "";

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center">No items found.</td></tr>`;
        return;
    }

    items.forEach(item => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100" + (canWrite ? " cursor-pointer" : "");
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-mono text-xs">${item.barcode}</td>
            <td class="py-3 px-6 text-left font-medium">${item.name}</td>
            <td class="py-3 px-6 text-left">${item.base_unit || '-'}</td>
            <td class="py-3 px-6 text-right">${item.cost_price.toFixed(2)}</td>
            <td class="py-3 px-6 text-right font-bold text-green-600">${item.selling_price.toFixed(2)}</td>
            <td class="py-3 px-6 text-right ${item.stock_level <= item.min_stock ? 'text-red-600 font-bold' : ''}">${item.stock_level}</td>
            <td class="py-3 px-6 text-center">
                <button class="text-blue-500 hover:text-blue-700 edit-btn mr-2 ${canWrite ? '' : 'hidden'}" data-id="${item.id}">
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

        if (canWrite) {
            row.addEventListener("click", openEditModal);
        }

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

    if (totalCount > items.length) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="7" class="py-4 text-center text-gray-500 italic bg-gray-50">Showing top ${items.length} of ${totalCount} items. Refine search or increase limit to see more.</td>`;
        tbody.appendChild(row);
    }
}