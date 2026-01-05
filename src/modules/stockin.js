import { checkPermission, getUserProfile } from "../auth.js";
import { generateUUID } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";

// Module-level state for the cart
let stockInCart = [];
let allItems = []; // Cache for item search
let suppliersList = [];
let historyCache = [];

export async function loadStockInView() {
    if (!checkPermission('stockin', 'read')) {
        document.getElementById('main-content').innerHTML = '<div class="p-4">Access Denied</div>';
        return;
    }
    await render();
    await Promise.all([loadAllItems(), fetchSuppliers()]);
    attachEventListeners();
    populateSupplierDropdown();
    await loadStockInHistory();
}

async function loadAllItems() {
    allItems = await Repository.getAll('items');
}

async function fetchSuppliers() {
    try {
        suppliersList = await Repository.getAll('suppliers');
        if (!Array.isArray(suppliersList)) suppliersList = [];
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        suppliersList = [];
    }
}

function populateSupplierDropdown() {
    const select = document.getElementById("stockin-supplier");
    if (!select) return;
    suppliersList.forEach(sup => {
        const option = document.createElement("option");
        option.value = sup.id;
        option.textContent = sup.name;
        select.appendChild(option);
    });
}

function render() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="p-4 md:p-6">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Stock In</h2>
            
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <!-- Left side: Item selection and cart -->
                <div class="lg:col-span-3">
                    <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                        <h3 class="text-lg font-semibold text-gray-700 mb-4">Add Item to Stock</h3>
                        <form id="stockin-form" class="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                            <div class="flex-grow w-full relative">
                                <label for="item-search" class="block text-sm font-medium text-gray-700">Search Item (Name or Barcode)</label>
                                <input type="text" id="item-search" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2" placeholder="e.g., 'Coffee' or '123456789'" autocomplete="off">
                                <div id="search-results" class="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto hidden"></div>
                                <input type="hidden" id="selected-item-id">
                            </div>
                            <div class="w-full sm:w-auto">
                                <label for="item-quantity" class="block text-sm font-medium text-gray-700">Quantity</label>
                                <input type="number" id="item-quantity" min="1" value="1" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2">
                            </div>
                            <button type="submit" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-sm">
                                Add to Cart
                            </button>
                        </form>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h3 class="text-lg font-semibold text-gray-700 mb-4">Stock In Cart</h3>
                        <div id="stock-in-cart-container">
                            <!-- Cart items will be rendered here -->
                        </div>
                        <div id="supplier-section" class="mt-4 border-t pt-4 hidden">
                            <label for="stockin-supplier" class="block text-sm font-medium text-gray-700">Optional: Set Supplier for items without one</label>
                            <select id="stockin-supplier" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                                <option value="">-- Select Supplier --</option>
                                <!-- Options populated by JS -->
                            </select>
                        </div>
                        <div id="cart-actions" class="mt-4 flex justify-end gap-2 hidden">
                             <button id="clear-cart-btn" class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md shadow-sm">
                                Clear Cart
                            </button>
                            <button id="save-stock-in-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md shadow-sm">
                                Save Stock In
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right side: Recent history -->
                <div class="lg:col-span-2">
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h3 class="text-lg font-semibold text-gray-700 mb-4">Recent Stock-In History</h3>
                        <div id="stockin-history-container" class="max-h-[28rem] overflow-y-auto">
                            <p class="text-gray-500">Loading history...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    renderStockInCart();
}

function attachEventListeners() {
    const searchInput = document.getElementById('item-search');
    const searchResults = document.getElementById('search-results');
    const stockinForm = document.getElementById('stockin-form');
    const cartContainer = document.getElementById('stock-in-cart-container');

    searchInput.addEventListener('input', handleSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const first = searchResults.querySelector('.search-result-item');
            if (first) first.focus();
        }
    });
    searchInput.addEventListener('blur', () => setTimeout(() => {
        if (!searchResults.contains(document.activeElement)) searchResults.classList.add('hidden');
    }, 200));
    stockinForm.addEventListener('submit', handleAddItemToCart);
    
    document.getElementById('save-stock-in-btn')?.addEventListener('click', saveStockIn);
    document.getElementById('clear-cart-btn')?.addEventListener('click', clearCart);

    cartContainer.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.classList.contains('cart-qty-input')) {
            updateCartQty(index, parseInt(e.target.value));
        } else if (e.target.classList.contains('cart-cost-input')) {
            updateCartCost(index, parseFloat(e.target.value));
        }
    });

    cartContainer.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT') {
            e.target.select();
        }
    });

    cartContainer.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            const target = e.target;
            if (target.tagName !== 'INPUT') return;

            const isQty = target.classList.contains('cart-qty-input');
            const selector = isQty ? '.cart-qty-input' : '.cart-cost-input';
            const inputs = Array.from(cartContainer.querySelectorAll(selector));
            const index = inputs.indexOf(target);

            if (e.key === 'ArrowUp' && index > 0) {
                e.preventDefault();
                inputs[index - 1].focus();
            } else if (e.key === 'ArrowDown' && index < inputs.length - 1) {
                e.preventDefault();
                inputs[index + 1].focus();
            }
        }
    });

    cartContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            const button = e.target.closest('.remove-item-btn');
            const itemId = button.dataset.itemId;
            removeFromCart(itemId);
        }
    });

    searchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-result-item')) {
            const itemId = e.target.dataset.id;
            const itemName = e.target.textContent;
            selectSearchItem(itemId, itemName);
        }
    });
}

function selectSearchItem(itemId, itemName) {
    document.getElementById('selected-item-id').value = itemId;
    document.getElementById('item-search').value = itemName;
    document.getElementById('search-results').classList.add('hidden');
    const qtyInput = document.getElementById('item-quantity');
    qtyInput.focus();
    qtyInput.select();
}

function addToCart(item, quantity) {
    const existingCartItem = stockInCart.find(cartItem => cartItem.id === item.id);

    if (existingCartItem) {
        existingCartItem.quantity += quantity;
    } else {
        stockInCart.push({
            id: item.id,
            name: item.name,
            quantity: quantity,
            cost_price: item.cost_price || 0
        });
    }
    renderStockInCart();
}

function handleSearch(e) {
    const query = e.target.value;
    const searchInput = e.target;
    const searchResults = document.getElementById('search-results');

    // Quick Add on exact barcode match
    const exactBarcodeMatch = allItems.find(item => item.barcode && item.barcode === query && query.length > 2);
    if (exactBarcodeMatch) {
        addToCart(exactBarcodeMatch, 1);
        searchInput.value = '';
        searchResults.classList.add('hidden');
        return;
    }

    const lowerQuery = query.toLowerCase();
    if (lowerQuery.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }

    const results = allItems.filter(item =>
        (item.name || "").toLowerCase().includes(lowerQuery) ||
        (item.barcode && item.barcode.includes(lowerQuery))
    ).slice(0, 10);

    searchResults.innerHTML = results.map(item => 
        `<div class="p-2 hover:bg-gray-100 cursor-pointer search-result-item focus:bg-blue-100 focus:outline-none" tabindex="0" data-id="${item.id}">${item.name}</div>`
    ).join('');
    searchResults.classList.remove('hidden');

    const items = searchResults.querySelectorAll('.search-result-item');
    items.forEach((div, index) => {
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                selectSearchItem(results[index].id, results[index].name);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                items[index + 1]?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (index > 0) items[index - 1].focus();
                else document.getElementById('item-search').focus();
            }
        });
    });
}

async function handleAddItemToCart(e) {
    e.preventDefault();
    const itemId = document.getElementById('selected-item-id').value;
    const quantityInput = document.getElementById('item-quantity');
    const quantity = parseInt(quantityInput.value, 10);

    if (!itemId || !quantity || quantity <= 0) {
        alert('Please select an item and enter a valid quantity.');
        return;
    }

    const item = allItems.find(i => i.id === itemId);
    if (!item) {
        alert('Item not found.');
        return;
    }

    addToCart(item, quantity);

    // Reset form
    document.getElementById('stockin-form').reset();
    document.getElementById('selected-item-id').value = '';
    quantityInput.value = 1;
    document.getElementById('item-search').focus();
}

function renderStockInCart() {
    const cartContainer = document.getElementById('stock-in-cart-container');
    const cartActions = document.getElementById('cart-actions');
    const supplierSection = document.getElementById('supplier-section');
    if (!cartContainer) return;

    if (stockInCart.length === 0) {
        cartContainer.innerHTML = '<p class="text-gray-500">Cart is empty.</p>';
        cartActions.classList.add('hidden');
        supplierSection.classList.add('hidden');
        return;
    }

    cartActions.classList.remove('hidden');
    supplierSection.classList.remove('hidden');
    
    let grandTotal = 0;
    const tableRows = stockInCart.map((item, index) => {
        const subtotal = item.quantity * item.cost_price;
        grandTotal += subtotal;
        return `
        <tr class="border-b">
            <td class="p-2">${item.name}</td>
            <td class="p-2 text-center">
                <input type="number" min="1" class="w-16 border rounded text-center py-1 cart-qty-input" data-index="${index}" value="${item.quantity}">
            </td>
            <td class="p-2 text-right">
                <div class="flex items-center justify-end">
                    <span class="mr-1 text-gray-400">₱</span>
                    <input type="number" step="0.01" min="0" class="w-24 border rounded text-right py-1 cart-cost-input" data-index="${index}" value="${item.cost_price.toFixed(2)}">
                </div>
            </td>
            <td class="p-2 text-right font-medium">₱${subtotal.toFixed(2)}</td>
            <td class="p-2 text-right">
                <button class="text-red-500 hover:text-red-700 remove-item-btn" data-item-id="${item.id}" title="Remove Item">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                </button>
            </td>
        </tr>
    `}).join('');

    cartContainer.innerHTML = `
        <table class="w-full text-sm">
            <thead class="bg-gray-50">
                <tr class="border-b">
                    <th class="text-left p-2 font-semibold">Item</th>
                    <th class="text-center p-2 font-semibold">Qty</th>
                    <th class="text-right p-2 font-semibold">Cost</th>
                    <th class="text-right p-2 font-semibold">Subtotal</th>
                    <th class="text-right p-2 font-semibold">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
            <tfoot>
                <tr class="font-bold text-blue-600">
                    <td colspan="3" class="p-2 text-right">Total Invoice Value:</td>
                    <td class="p-2 text-right">₱${grandTotal.toFixed(2)}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    `;
}

function removeFromCart(itemId) {
    stockInCart = stockInCart.filter(item => item.id !== itemId);
    renderStockInCart();
}

function updateCartQty(index, newQty) {
    if (isNaN(newQty) || newQty < 1) {
        renderStockInCart();
        return;
    }
    stockInCart[index].quantity = newQty;
    renderStockInCart();
}

function updateCartCost(index, newCost) {
    if (isNaN(newCost) || newCost < 0) {
        renderStockInCart();
        return;
    }
    stockInCart[index].cost_price = newCost;
    renderStockInCart();
}

function clearCart() {
    if (confirm('Are you sure you want to clear the cart?')) {
        stockInCart = [];
        renderStockInCart();
    }
}

async function saveStockIn() {
    if (stockInCart.length === 0) {
        alert('Cart is empty. Add items before saving.');
        return;
    }

    const saveBtn = document.getElementById('save-stock-in-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const user = getUserProfile();
    const supplierId = document.getElementById('stockin-supplier').value;

    try {
        // 1. Update local items DB
        for (const cartItem of stockInCart) {
            const item = await Repository.get('items', cartItem.id);
            if (item) {
                item.stock_level = (item.stock_level || 0) + cartItem.quantity;
                item.cost_price = cartItem.cost_price;
                if (supplierId && !item.supplier_id) {
                    item.supplier_id = supplierId;
                }
                await Repository.upsert('items', item);
            }
        }
        await loadAllItems();

        // 2. Create local history and movement records
        const historyRecord = {
            id: generateUUID(), // Use UUID for server
            user_id: user.email,
            username: user.name,
            items: stockInCart.map(item => ({
                item_id: item.id,
                name: item.name,
                quantity: item.quantity,
                cost_price: item.cost_price,
                movement_id: generateUUID()
            })),
            timestamp: new Date().toISOString(),
            item_count: stockInCart.reduce((sum, item) => sum + item.quantity, 0),
            supplier_id_override: supplierId || null
        };
        await Repository.upsert('stockins', historyRecord);

        const movements = [];
        for (const item of historyRecord.items) {
            const movement = {
                id: item.movement_id,
                item_id: item.item_id,
                item_name: item.name,
                timestamp: historyRecord.timestamp,
                type: 'Stock-In',
                qty: item.quantity,
                user: user.name || user.email,
                reason: 'Supplier Delivery'
            };
            await Repository.upsert('stock_movements', movement);
        }

        // 3. Trigger Background Sync
        SyncEngine.sync();

        alert('Stock-in successful! Data is saved locally and will sync with the server.');
        
        stockInCart = [];
        renderStockInCart();
        await loadStockInHistory();

    } catch (error) {
        console.error('Failed to save stock-in:', error);
        alert('An error occurred while saving the stock-in. Please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Stock In';
    }
}

async function loadStockInHistory() {
    const historyContainer = document.getElementById('stockin-history-container');
    historyContainer.innerHTML = '<p class="text-gray-500">Loading history...</p>';

    try {
        const history = await Repository.getAll('stockins');
        historyCache = history;

        // Sort by timestamp desc and limit
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const recentHistory = history.slice(0, 20);

        if (recentHistory.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-500">No recent stock-in history.</p>';
            return;
        }

        historyContainer.innerHTML = `
            <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead>
                        <tr class="border-b bg-gray-50">
                            <th class="text-left p-2 font-semibold">Date</th>
                            <th class="text-left p-2 font-semibold">User</th>
                            <th class="text-center p-2 font-semibold">Items</th>
                            <th class="text-right p-2 font-semibold">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${recentHistory.map(entry => `
                            <tr>
                                <td class="p-2 whitespace-nowrap text-xs">${new Date(entry.timestamp).toLocaleString()}</td>
                                <td class="p-2">${entry.username || 'N/A'}</td>
                                <td class="p-2 text-center">
                                    ${entry.item_count || (entry.items ? entry.items.reduce((sum, i) => sum + (i.quantity || i.qty || 0), 0) : 0)}
                                </td>
                                <td class="p-2 text-right">
                                    <button class="text-blue-600 hover:text-blue-800 view-details-btn font-medium" data-id="${entry.id}">
                                        View
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        historyContainer.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', () => showStockInDetails(btn.dataset.id));
        });
    } catch (error) {
        console.error('Failed to load stock-in history:', error);
        historyContainer.innerHTML = '<p class="text-red-500">Failed to load history.</p>';
    }
}

function showStockInDetails(id) {
    const entry = historyCache.find(e => e.id == id);
    if (!entry) return;

    let modal = document.getElementById('stockin-details-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stockin-details-modal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50';
        document.body.appendChild(modal);
    }

    const itemRows = entry.items.map(item => {
        const qty = item.quantity || item.qty || 0;
        const cost = item.cost_price || 0;
        return `
        <tr class="border-b">
            <td class="p-2">${item.name}</td>
            <td class="p-2 text-center">${qty}</td>
            <td class="p-2 text-right">₱${cost.toFixed(2)}</td>
            <td class="p-2 text-right">₱${(qty * cost).toFixed(2)}</td>
        </tr>
    `}).join('');

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl mx-4">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">Stock In Details</h3>
                <button class="text-gray-500 hover:text-gray-700 text-2xl close-modal">&times;</button>
            </div>
            <div class="mb-4 text-sm text-gray-600 grid grid-cols-2 gap-2">
                <div><strong>Date:</strong> ${new Date(entry.timestamp).toLocaleString()}</div>
                <div><strong>User:</strong> ${entry.username || 'N/A'}</div>
            </div>
            <div class="max-h-96 overflow-y-auto border rounded">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50">
                        <tr class="border-b">
                            <th class="text-left p-2 font-semibold">Item</th>
                            <th class="text-center p-2 font-semibold">Qty</th>
                            <th class="text-right p-2 font-semibold">Cost</th>
                            <th class="text-right p-2 font-semibold">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>
            <div class="mt-6 flex justify-end">
                <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow close-modal">Close</button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.add('hidden'));
    });
}