import { checkPermission } from "../auth.js";
import { generateUUID } from "../utils.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";
import { dbPromise } from "../db.js";

let selectedSupplierId = null;
let supplierProducts = [];
let supplierProductStats = {};
let productSortState = { key: 'name', dir: 'asc' };
let productFilterTerm = '';
let supplierFilterTerm = '';
let supplierCategoryFilter = '';

export async function loadSuppliersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("suppliers", "write"); 

    content.innerHTML = `
        <div class="max-w-6xl mx-auto lg:h-[calc(100vh-140px)] flex flex-col">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                <!-- Left Column: Suppliers List -->
                <div class="flex flex-col h-full min-h-[400px] lg:min-h-0">
                    <div class="flex justify-between items-center mb-4 flex-shrink-0">
                        <div class="flex items-center gap-4">
                            <h2 class="text-2xl font-bold text-gray-800">Suppliers</h2>
                            <input type="text" id="search-suppliers" placeholder="Search..." class="shadow border rounded py-1 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-28 md:w-36">
                            <select id="filter-supplier-category" class="shadow border rounded py-1 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-28 md:w-36">
                                <option value="">All Categories</option>
                            </select>
                        </div>
                        <button id="btn-add-supplier" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${canWrite ? '' : 'hidden'}">
                            + Add
                        </button>
                    </div>

                    <div class="bg-white shadow-md rounded overflow-y-auto flex-1 border">
                        <table class="min-w-full table-auto">
                            <thead class="sticky top-0 z-10 bg-gray-100">
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-4 text-left">Name</th>
                                    <th class="py-3 px-4 text-left">Contact</th>
                                    <th class="py-3 px-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="suppliers-table-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="3" class="py-3 px-6 text-center">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right Column: Supplier Products -->
                <div id="supplier-products-panel" class="hidden flex flex-col h-full min-h-[400px] lg:min-h-0">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 flex-shrink-0">
                        <h2 class="text-2xl font-bold text-gray-800 truncate">Products: <span id="selected-supplier-name" class="text-blue-600"></span></h2>
                        <input type="text" id="search-supplier-products" placeholder="Search products..." class="shadow border rounded py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48">
                    </div>

                    <div class="bg-white shadow-md rounded flex flex-col flex-1 border min-h-0">
                        <div class="overflow-y-auto flex-1">
                            <table class="min-w-full table-auto">
                            <thead class="sticky top-0 z-10 bg-gray-100">
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-4 text-left cursor-pointer hover:bg-gray-200 transition-colors" data-sort="name">Product Name</th>
                                    <th class="py-3 px-4 text-right cursor-pointer hover:bg-gray-200 transition-colors" data-sort="stock_level">In Stock</th>
                                    <th class="py-3 px-4 text-right">Rec. Order</th>
                                </tr>
                            </thead>
                            <tbody id="supplier-products-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="2" class="py-3 px-6 text-center italic text-gray-400">Select a supplier to view products</td></tr>
                            </tbody>
                        </table>
                        </div>
                        <div class="p-2 bg-gray-50 flex justify-between items-center border-t">
                            <div id="supplier-products-info" class="text-[10px] text-gray-400 italic"></div>
                            <button id="btn-show-all-products" class="hidden text-[10px] font-bold text-blue-600 hover:underline">Show All</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Supplier Modal -->
        <div id="modal-add-supplier" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 id="supplier-modal-title" class="text-lg leading-6 font-medium text-gray-900 text-center mb-4">Add New Supplier</h3>
                    <form id="form-add-supplier">
                        <input type="hidden" id="sup-id">
                        <input type="hidden" id="supplier-modal-version" value="2">
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Supplier Name</label>
                            <input type="text" id="sup-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Contact Person</label>
                            <input type="text" id="sup-contact" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Email or Phone</label>
                            <input type="text" id="sup-email" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>

                        <div class="border-t mt-6 pt-4">
                            <h4 class="text-sm font-bold text-gray-500 uppercase mb-3">Procurement Settings</h4>
                            <div class="grid grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Delivery Cadence</label>
                                    <input type="number" id="sup-config-cadence" class="w-full border rounded p-2 text-sm" placeholder="e.g., 7">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Lead Time</label>
                                    <input type="number" id="sup-config-leadtime" class="w-full border rounded p-2 text-sm" placeholder="e.g., 3">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Budget (OTB)</label>
                                    <input type="number" id="sup-config-otb" class="w-full border rounded p-2 text-sm" placeholder="e.g., 50000">
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center justify-between mt-6">
                            <button type="button" id="btn-cancel-supplier" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none">Cancel</button>
                            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Show All Products Modal -->
        <div id="modal-show-all-products" class="fixed inset-0 bg-gray-900 bg-opacity-75 hidden overflow-y-auto h-full w-full z-[60]">
            <div class="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-2xl rounded-xl bg-white">
                <div class="flex justify-between items-center mb-6 px-4">
                    <h3 class="text-2xl font-bold text-gray-800">All Products: <span id="modal-supplier-name" class="text-blue-600"></span></h3>
                    <button id="btn-close-all-products" class="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full table-auto">
                        <thead>
                            <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                <th class="py-3 px-4 text-left">Product Name</th>
                                <th class="py-3 px-4 text-left">Barcode</th>
                                <th class="py-3 px-4 text-left">Category</th>
                                <th class="py-3 px-4 text-right">Stock Level</th>
                                <th class="py-3 px-4 text-right">Rec. Order</th>
                                <th class="py-3 px-4 text-right">Selling Price</th>
                            </tr>
                        </thead>
                        <tbody id="modal-all-products-body" class="text-gray-600 text-sm font-light">
                            <!-- Rows injected here -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    if (canWrite) {
        document.getElementById("btn-add-supplier").addEventListener("click", () => {
            document.getElementById("supplier-modal-title").textContent = "Add New Supplier";
            document.getElementById("sup-id").value = "";
            document.getElementById("form-add-supplier").reset();
            document.getElementById("modal-add-supplier").classList.remove("hidden");
        });
    }

    document.getElementById("btn-cancel-supplier").addEventListener("click", () => {
        document.getElementById("modal-add-supplier").classList.add("hidden");
    });

    document.getElementById("btn-show-all-products")?.addEventListener("click", openAllProductsModal);
    document.getElementById("btn-close-all-products")?.addEventListener("click", () => {
        document.getElementById("modal-show-all-products").classList.add("hidden");
    });

    document.getElementById("form-add-supplier").addEventListener("submit", handleAddSupplier);

    // Product Table Listeners
    document.getElementById("search-supplier-products")?.addEventListener("input", (e) => {
        productFilterTerm = e.target.value.toLowerCase();
        renderSupplierProducts();
    });

    document.getElementById("search-suppliers")?.addEventListener("input", (e) => {
        supplierFilterTerm = e.target.value.toLowerCase();
        fetchSuppliers();
    });

    document.getElementById("filter-supplier-category")?.addEventListener("change", (e) => {
        supplierCategoryFilter = e.target.value;
        fetchSuppliers();
    });

    document.querySelector("#supplier-products-panel thead")?.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-sort]");
        if (th) {
            const key = th.dataset.sort;
            if (productSortState.key === key) {
                productSortState.dir = productSortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                productSortState.key = key;
                productSortState.dir = 'asc';
            }
            renderSupplierProducts();
        }
    });

    // Reset state on view load
    selectedSupplierId = null;
    supplierFilterTerm = '';
    supplierCategoryFilter = '';
    await populateCategoryDropdown();
    await fetchSuppliers();
}

async function fetchSuppliers() {
    const tbody = document.getElementById("suppliers-table-body");
    const canWrite = checkPermission("suppliers", "write");

    try {
        const suppliers = await Repository.getAll('suppliers');
        let filteredSuppliers = suppliers.filter(s => 
            s.name.toLowerCase().includes(supplierFilterTerm) || 
            (s.contact || "").toLowerCase().includes(supplierFilterTerm) ||
            (s.email || "").toLowerCase().includes(supplierFilterTerm)
        );

        if (supplierCategoryFilter) {
            const allItems = await Repository.getAll('items');
            const supplierIdsWithCategory = new Set(
                allItems.filter(i => i.category === supplierCategoryFilter && !i._deleted)
                       .map(i => i.supplier_id)
            );
            filteredSuppliers = filteredSuppliers.filter(s => supplierIdsWithCategory.has(s.id));
        }

        const sortedSuppliers = filteredSuppliers.sort((a, b) => a.name.localeCompare(b.name));

        tbody.innerHTML = "";

        if (sortedSuppliers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No suppliers found.</td></tr>`;
            return;
        }

        sortedSuppliers.forEach((sup) => {
            const row = document.createElement("tr");
            row.className = `border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${selectedSupplierId === sup.id ? 'bg-blue-50' : ''}`;
            row.innerHTML = `
                <td class="py-3 px-4 text-left whitespace-nowrap font-medium">${sup.name}</td>
                <td class="py-3 px-4 text-left text-xs">${sup.contact || sup.email || '-'}</td>
                <td class="py-3 px-4 text-center">
                    <button class="text-blue-500 hover:text-blue-700 edit-btn ${canWrite ? '' : 'hidden'}" data-id="${sup.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button class="text-red-500 hover:text-red-700 delete-btn ${canWrite ? '' : 'hidden'}" data-id="${sup.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </td>
            `;
            
            row.addEventListener("click", (e) => {
                if (e.target.closest("button")) return;
                selectSupplier(sup);
            });

            if (canWrite) {
                row.querySelector(".edit-btn").addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const db = await dbPromise;
                    const config = await db.supplier_config.get(sup.id);

                    document.getElementById("supplier-modal-title").textContent = "Edit Supplier";
                    document.getElementById("sup-id").value = sup.id;
                    document.getElementById("sup-name").value = sup.name;
                    document.getElementById("sup-contact").value = sup.contact || "";
                    document.getElementById("sup-email").value = sup.email || "";
                    
                    document.getElementById("sup-config-cadence").value = config?.delivery_cadence || "";
                    document.getElementById("sup-config-leadtime").value = config?.lead_time_days || "";
                    document.getElementById("sup-config-otb").value = config?.monthly_otb || "";

                    document.getElementById("modal-add-supplier").classList.remove("hidden");
                });
                row.querySelector(".delete-btn").addEventListener("click", () => deleteSupplier(sup.id));
            }
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

async function selectSupplier(sup) {
    selectedSupplierId = sup.id;
    document.getElementById("selected-supplier-name").textContent = sup.name;
    document.getElementById("supplier-products-panel").classList.remove("hidden");
    
    // Highlight selected row
    document.querySelectorAll("#suppliers-table-body tr").forEach(row => {
        row.classList.remove("bg-blue-50");
    });
    const targetRow = Array.from(document.querySelectorAll("#suppliers-table-body tr")).find(row => 
        row.querySelector(`.delete-btn[data-id="${sup.id}"]`)
    );
    if (targetRow) targetRow.classList.add("bg-blue-50");

    await fetchSupplierProducts();
}

async function fetchSupplierProducts() {
    const db = await dbPromise;
    try {
        const allItems = await Repository.getAll('items');
        supplierProducts = allItems.filter(item => item.supplier_id === selectedSupplierId && !item._deleted);

        // Calculate Recommended Purchase Stats
        const itemIds = supplierProducts.map(p => p.id);
        const chartDays = 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - chartDays);
        const startStr = startDate.toISOString();

        const [txs, movements] = await Promise.all([
            db.transactions.where('timestamp').aboveOrEqual(startStr).and(t => !t._deleted && !t.is_voided).toArray(),
            db.stock_movements.where('item_id').anyOf(itemIds).toArray()
        ]);

        supplierProductStats = {};
        supplierProducts.forEach(p => {
            // 1. Avg Daily Sales
            const itemSales = txs.filter(t => t.items.some(it => it.id === p.id));
            const totalQty = itemSales.reduce((sum, t) => sum + t.items.find(it => it.id === p.id).qty, 0);
            const avgDaily = totalQty / chartDays;

            // 2. Stock-in Frequency (Lead Time)
            const itemMovements = movements.filter(m => m.item_id === p.id && (m.type === 'Stock-In' || m.type === 'Initial Stock'))
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            let avgInterval = 14; // Default 2 weeks
            if (itemMovements.length > 1) {
                const first = new Date(itemMovements[0].timestamp);
                const last = new Date(itemMovements[itemMovements.length - 1].timestamp);
                const daysDiff = (last - first) / (1000 * 60 * 60 * 24);
                if (daysDiff > 0) {
                    avgInterval = daysDiff / (itemMovements.length - 1);
                }
            }

            // 3. Recommended Quantity
            supplierProductStats[p.id] = Math.ceil(avgDaily * Math.max(7, avgInterval));
        });

        renderSupplierProducts();
    } catch (error) {
        console.error("Error fetching supplier products:", error);
    }
}

function renderSupplierProducts() {
    const tbody = document.getElementById("supplier-products-body");
    const infoDiv = document.getElementById("supplier-products-info");
    const showAllBtn = document.getElementById("btn-show-all-products");
    if (!tbody) return;

    let filtered = supplierProducts.filter(p => p.name.toLowerCase().includes(productFilterTerm));
    const totalCount = filtered.length;

    filtered.sort((a, b) => {
        let valA = a[productSortState.key];
        let valB = b[productSortState.key];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return productSortState.dir === 'asc' ? -1 : 1;
        if (valA > valB) return productSortState.dir === 'asc' ? 1 : -1;
        return 0;
    });

    const limited = filtered.slice(0, 15);
    tbody.innerHTML = limited.map(p => {
        const isOutOfStock = p.stock_level <= 0;
        const isLowStock = p.stock_level <= (p.min_stock || 0);
        const colorClass = isOutOfStock ? 'text-red-600 font-bold' : (isLowStock ? 'text-orange-500 font-bold' : 'text-green-600');
        const recQty = supplierProductStats[p.id] || 0;
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="py-3 px-4 text-left font-medium">${p.name}</td>
                <td class="py-3 px-4 text-right ${colorClass}">${p.stock_level}</td>
                <td class="py-3 px-4 text-right font-bold text-blue-600">${recQty > 0 ? recQty : '-'}</td>
            </tr>
        `;
    }).join('');

    if (infoDiv) {
        infoDiv.textContent = totalCount > 0 ? `Showing ${limited.length} out of ${totalCount} items` : "";
    }

    if (showAllBtn) {
        showAllBtn.classList.toggle("hidden", totalCount <= 15);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="py-4 text-center text-gray-400 italic">No products found for this supplier.</td></tr>`;
    }
}

function openAllProductsModal() {
    const modal = document.getElementById("modal-show-all-products");
    const tbody = document.getElementById("modal-all-products-body");
    const supplierNameSpan = document.getElementById("modal-supplier-name");
    const selectedSupName = document.getElementById("selected-supplier-name").textContent;

    supplierNameSpan.textContent = selectedSupName;
    tbody.innerHTML = [...supplierProducts].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
        const isOutOfStock = p.stock_level <= 0;
        const isLowStock = p.stock_level <= (p.min_stock || 0);
        const colorClass = isOutOfStock ? 'text-red-600 font-bold' : (isLowStock ? 'text-orange-500 font-bold' : 'text-green-600');
        const recQty = supplierProductStats[p.id] || 0;
        
        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="py-3 px-4 text-left font-medium">${p.name}</td>
                <td class="py-3 px-4 text-left font-mono text-xs">${p.barcode || '-'}</td>
                <td class="py-3 px-4 text-left text-xs">${p.category || '-'}</td>
                <td class="py-3 px-4 text-right ${colorClass}">${p.stock_level}</td>
                <td class="py-3 px-4 text-right font-bold text-blue-600">${recQty > 0 ? recQty : '-'}</td>
                <td class="py-3 px-4 text-right font-bold">₱${(p.selling_price || 0).toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    modal.classList.remove("hidden");
}

async function populateCategoryDropdown() {
    const select = document.getElementById("filter-supplier-category");
    if (!select) return;
    
    try {
        const items = await Repository.getAll('items');
        const categories = [...new Set(items.map(i => i.category).filter(c => c && c !== 'NULL'))].sort();
        
        select.innerHTML = '<option value="">All Categories</option>';
        categories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error("Error populating categories:", error);
    }
}

async function handleAddSupplier(e) {
    e.preventDefault();
    const id = document.getElementById("sup-id").value;
    const name = document.getElementById("sup-name").value;
    const contact = document.getElementById("sup-contact").value;
    const email = document.getElementById("sup-email").value;

    const supplierId = id || generateUUID();

    const supplierData = {
        id: supplierId,
        name,
        contact,
        email
    };

    const configData = {
        supplier_id: supplierId,
        delivery_cadence: parseInt(document.getElementById("sup-config-cadence").value) || null,
        lead_time_days: parseInt(document.getElementById("sup-config-leadtime").value) || null,
        monthly_otb: parseFloat(document.getElementById("sup-config-otb").value) || null,
        _version: 1,
        _updatedAt: Date.now(),
        _deleted: 0
    };

    try {
        await Repository.upsert('suppliers', supplierData);
        await Repository.upsert('supplier_config', configData);
        SyncEngine.sync();

        document.getElementById("modal-add-supplier").classList.add("hidden");
        document.getElementById("form-add-supplier").reset();
        document.getElementById("sup-id").value = "";
        fetchSuppliers();
    } catch (error) {
        console.error("Error saving supplier:", error);
        alert("Failed to save supplier.");
    }
}

async function deleteSupplier(id) {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    try {
        await Repository.remove('suppliers', id);
        SyncEngine.sync();
        fetchSuppliers();
    } catch (error) {
        console.error("Error deleting supplier:", error);
        alert("Failed to delete supplier.");
    }
}