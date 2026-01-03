import { checkPermission, getUserProfile } from "../auth.js";
import { db } from "../db.js";
import { syncManager } from "../sync-manager.js";

const API_URL = 'api/router.php';

// Module-level state for the cart
let stockInCart = [];
let allItems = []; // Cache for item search

export async function loadStockInView() {
    if (!checkPermission('stockin', 'read')) {
        document.getElementById('main-content').innerHTML = '<div class="p-4">Access Denied</div>';
        return;
    }
    await render();
    await loadAllItems();
    attachEventListeners();
    await loadStockInHistory();
}

async function loadAllItems() {
    allItems = await db.items.toArray();
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
                                <input type="text" id="item-search" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="e.g., 'Coffee' or '123456789'" autocomplete="off">
                                <div id="search-results" class="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto hidden"></div>
                                <input type="hidden" id="selected-item-id">
                            </div>
                            <div class="w-full sm:w-auto">
                                <label for="item-quantity" class="block text-sm font-medium text-gray-700">Quantity</label>
                                <input type="number" id="item-quantity" min="1" value="1" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
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

    searchInput.addEventListener('keyup', handleSearch);
    searchInput.addEventListener('blur', () => setTimeout(() => searchResults.classList.add('hidden'), 200));
    stockinForm.addEventListener('submit', handleAddItemToCart);
    
    document.getElementById('save-stock-in-btn')?.addEventListener('click', saveStockIn);
    document.getElementById('clear-cart-btn')?.addEventListener('click', clearCart);

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
            document.getElementById('selected-item-id').value = itemId;
            searchInput.value = itemName;
            searchResults.classList.add('hidden');
        }
    });
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const searchResults = document.getElementById('search-results');
    if (query.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }

    const results = allItems.filter(item => 
        item.name.toLowerCase().includes(query) || 
        (item.barcode && item.barcode.includes(query))
    ).slice(0, 10);

    searchResults.innerHTML = results.map(item => 
        `<div class="p-2 hover:bg-gray-100 cursor-pointer search-result-item" data-id="${item.id}">${item.name}</div>`
    ).join('');
    searchResults.classList.remove('hidden');
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

    const existingCartItem = stockInCart.find(cartItem => cartItem.id === itemId);

    if (existingCartItem) {
        existingCartItem.quantity += quantity;
    } else {
        stockInCart.push({
            id: item.id,
            name: item.name,
            quantity: quantity
        });
    }

    renderStockInCart();

    // Reset form
    document.getElementById('stockin-form').reset();
    document.getElementById('selected-item-id').value = '';
    quantityInput.value = 1;
}

function renderStockInCart() {
    const cartContainer = document.getElementById('stock-in-cart-container');
    const cartActions = document.getElementById('cart-actions');
    if (!cartContainer) return;

    if (stockInCart.length === 0) {
        cartContainer.innerHTML = '<p class="text-gray-500">Cart is empty.</p>';
        cartActions.classList.add('hidden');
        return;
    }

    cartActions.classList.remove('hidden');
    const tableRows = stockInCart.map(item => `
        <tr class="border-b">
            <td class="p-2">${item.name}</td>
            <td class="p-2 text-center">${item.quantity}</td>
            <td class="p-2 text-right">
                <button class="text-red-500 hover:text-red-700 remove-item-btn" data-item-id="${item.id}" title="Remove Item">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                </button>
            </td>
        </tr>
    `).join('');

    cartContainer.innerHTML = `
        <table class="w-full text-sm">
            <thead>
                <tr class="border-b">
                    <th class="text-left p-2 font-semibold">Item</th>
                    <th class="text-center p-2 font-semibold">Quantity</th>
                    <th class="text-right p-2 font-semibold">Action</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

function removeFromCart(itemId) {
    stockInCart = stockInCart.filter(item => item.id !== itemId);
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
    const stockInData = {
        user_id: user.email,
        username: user.name,
        items: stockInCart.map(item => ({ item_id: item.id, quantity: item.quantity, name: item.name }))
    };

    try {
        // Optimistically update local database
        const itemIds = stockInCart.map(item => item.id);
        const itemsToUpdate = await db.items.bulkGet(itemIds);

        itemsToUpdate.forEach(item => {
            const cartItem = stockInCart.find(ci => ci.id === item.id);
            if (cartItem) {
                item.stock_level = (item.stock_level || 0) + cartItem.quantity;
            }
        });

        await db.items.bulkPut(itemsToUpdate);

        // Add to local history immediately
        const historyRecord = {
            id: `local_${Date.now()}`,
            user_id: user.email,
            username: user.name,
            items: stockInCart,
            timestamp: new Date().toISOString(),
            item_count: stockInCart.reduce((sum, item) => sum + item.quantity, 0)
        };
        await db.stockins.add(historyRecord);

        // Queue the stock-in operation for server sync
        await syncManager.enqueue({
            action: 'batch_stock_in',
            data: historyRecord, // Send the whole record
            timestamp: historyRecord.timestamp
        });

        alert('Stock-in successful! Data is saved locally and will sync with the server.');
        
        stockInCart = [];
        renderStockInCart();
        await loadStockInHistory(); // Refresh history view

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
        // Fetch from Server for complete history
        const response = await fetch(`${API_URL}?file=stock_in_history`);
        let history = [];
        
        if (response.ok) {
            history = await response.json();
        }
        
        if (!Array.isArray(history)) history = [];

        // Sort by timestamp desc and limit
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const recentHistory = history.slice(0, 20);

        if (recentHistory.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-500">No recent stock-in history.</p>';
            return;
        }

        historyContainer.innerHTML = `
            <div class="divide-y divide-gray-200">
                ${recentHistory.map(entry => `
                    <div class="p-3">
                        <div class="flex justify-between items-center">
                            <p class="text-sm font-medium text-gray-800">${entry.username || 'N/A'}</p>
                            <p class="text-xs text-gray-500">${new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                        <p class="text-sm text-gray-600">Items: ${entry.item_count}</p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Failed to load stock-in history:', error);
        historyContainer.innerHTML = '<p class="text-red-500">Failed to load history.</p>';
    }
}