import { db } from "../db.js";
import { checkPermission } from "../auth.js";
import { checkActiveShift, requireShift, showCloseShiftModal } from "./shift.js";

const API_URL = 'api/router.php';

// Global shortcut listener for POS
document.addEventListener("keydown", (e) => {
    const searchInput = document.getElementById("pos-search");
    const custInput = document.getElementById("pos-customer-search");
    
    // Only run if POS elements are present
    if (!searchInput || !custInput) return;

    if (e.key === "F1") {
        e.preventDefault();
        searchInput.focus();
    } else if (e.key === "F2") {
        e.preventDefault();
        custInput.focus();
    } else if (e.key === "F3") {
        e.preventDefault();
        // Focus on the first quantity input in the cart
        const firstQtyInput = document.querySelector("#pos-cart-items .cart-qty-input");
        if (firstQtyInput) {
            firstQtyInput.focus();
            firstQtyInput.select();
        }
    } else if (e.key === "F4") {
        e.preventDefault();
        const btnCheckout = document.getElementById("btn-checkout");
        if (btnCheckout && !btnCheckout.disabled) {
            btnCheckout.click();
        }
    }
});

let allItems = [];
let allCustomers = [];
let cart = [];
let selectedCustomer = { id: "Guest", name: "Guest" };

export async function loadPosView() {
    const content = document.getElementById("main-content");
    content.innerHTML = ""; // Clear content while checking
    
    await checkActiveShift();

    requireShift(async () => {
        renderPosInterface(content);
    });
}

async function renderPosInterface(content) {
    // Full height layout minus header padding
    content.innerHTML = `
        <div class="flex flex-col md:flex-row h-[calc(100vh-140px)] gap-4">
            <!-- Left Column: Item Grid -->
            <div class="w-full md:w-2/3 flex flex-col bg-white rounded-lg shadow-md overflow-hidden">
                <!-- Search Bar -->
                <div class="p-4 border-b bg-gray-50">
                    <div class="relative">
                        <input type="text" id="pos-search" placeholder="Search items (F1)..." 
                            class="w-full pl-10 p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                            autocomplete="off">
                        <svg class="w-6 h-6 absolute left-3 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                </div>
                
                <!-- Grid -->
                <div id="pos-grid" class="flex-1 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 content-start bg-gray-100">
                    <!-- Items injected here -->
                    <div class="col-span-full text-center text-gray-500 mt-10">Loading items from local database...</div>
                </div>
            </div>

            <!-- Right Column: Cart -->
            <div class="w-full md:w-1/3 flex flex-col bg-white rounded-lg shadow-md overflow-hidden border-l h-full">
                <div class="p-4 bg-blue-700 text-white shadow-md flex justify-between items-center">
                    <h2 class="text-xl font-bold tracking-wide">Current Sale <span class="text-xs font-normal opacity-75 ml-1">(F3: Qty)</span></h2>
                    <div class="grid grid-cols-2 gap-1 shrink-0">
                        <button id="btn-view-suspended" class="text-[10px] bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded transition w-24 h-8 flex items-center justify-center" title="View Suspended Sales">Suspended</button>
                        <button id="btn-suspend-sale" class="text-[10px] bg-orange-500 hover:bg-orange-600 px-2 py-1 rounded transition w-24 h-8 flex items-center justify-center" title="Suspend Current Sale">Suspend</button>
                        <button id="btn-pos-close-shift" class="text-[10px] bg-red-500 hover:bg-red-600 px-2 py-1 rounded transition w-24 h-8 flex items-center justify-center">Close Shift</button>
                        <button id="btn-clear-cart" class="text-[10px] bg-blue-800 hover:bg-blue-900 px-2 py-1 rounded transition w-24 h-8 flex items-center justify-center">Clear</button>
                    </div>
                </div>
                
                <!-- Customer Selection -->
                <div class="p-3 bg-blue-50 border-b border-blue-100 relative">
                    <div class="relative">
                        <div class="flex items-center bg-white border rounded-md shadow-sm">
                            <div class="pl-3 text-gray-500">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            </div>
                            <input type="text" id="pos-customer-search" placeholder="Customer (F2)..." 
                                class="w-full p-2 text-sm focus:outline-none rounded-md" autocomplete="off">
                            <button id="btn-reset-customer" class="p-2 text-gray-400 hover:text-red-500 hidden" title="Reset to Guest">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div id="pos-customer-results" class="hidden absolute z-20 w-full bg-white shadow-lg border rounded-b-md max-h-48 overflow-y-auto mt-1"></div>
                    </div>
                    <div id="selected-customer-display" class="text-xs text-blue-800 mt-1 font-semibold px-1">
                        Customer: Guest
                    </div>
                </div>
                
                <!-- Last Transaction Summary -->
                <div id="last-transaction" class="hidden bg-green-50 border-b border-green-200 p-4">
                    <div class="text-center">
                        <div class="text-xs text-green-600 uppercase font-bold">Change Due</div>
                        <div id="last-change-amount" class="text-3xl font-bold text-green-700">₱0.00</div>
                    </div>
                    <div class="flex justify-between mt-2 text-xs text-green-600 border-t border-green-200 pt-2">
                        <div>Total: <span id="last-total" class="font-bold"></span></div>
                        <div>Paid: <span id="last-tendered" class="font-bold"></span></div>
                    </div>
                </div>

                <!-- Cart Items List -->
                <div id="pos-cart-items" class="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50">
                    <div class="flex flex-col items-center justify-center h-full text-gray-400">
                        <svg class="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        <p>Cart is empty</p>
                    </div>
                </div>

                <!-- Footer / Totals -->
                <div class="p-4 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
                    <div class="flex justify-between items-center mb-2 text-sm">
                        <span class="text-gray-600">Subtotal</span>
                        <span class="font-bold">₱0.00</span>
                    </div>
                    <div class="flex justify-between items-center mb-4 text-3xl">
                        <span class="font-bold text-gray-800">Total</span>
                        <span id="cart-total" class="font-bold text-blue-600">₱0.00</span>
                    </div>
                    <button id="btn-checkout" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg text-xl shadow-lg transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2" disabled>
                        <span>PAY NOW (F4)</span>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    </button>
                </div>
            </div>
        </div>

        <!-- Toast Container -->
        <div id="toast-container" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>

        <!-- Checkout Modal -->
        <div id="modal-checkout" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-lg p-6 w-96">
                <h3 class="text-xl font-bold mb-4 text-gray-800">Checkout</h3>
                <div class="mb-4 text-center">
                    <div class="text-sm text-gray-600">Total Amount</div>
                    <div id="checkout-total" class="text-3xl font-bold text-blue-600">₱0.00</div>
                </div>
                <div class="mb-4">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Amount Tendered</label>
                    <input type="number" id="input-tendered" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl text-center" step="0.01">
                </div>
                <div class="mb-6 text-center">
                    <div class="text-sm text-gray-600">Change</div>
                    <div id="checkout-change" class="text-xl font-bold text-green-600">₱0.00</div>
                </div>
                <div class="flex justify-between gap-2">
                    <button id="btn-cancel-checkout" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded w-1/2">Cancel</button>
                    <button id="btn-confirm-pay" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded w-1/2 disabled:opacity-50 disabled:cursor-not-allowed" disabled>Confirm Pay</button>
                </div>
            </div>
        </div>

        <!-- Suspended Transactions Modal -->
        <div id="modal-suspended" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">Suspended Transactions</h3>
                    <div class="flex gap-2">
                        <button id="btn-refresh-suspended" class="text-blue-600 hover:text-blue-800 text-sm font-bold">Refresh</button>
                        <button id="btn-close-suspended" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                    </div>
                </div>
                <div id="suspended-list-container" class="max-h-96 overflow-y-auto">
                    <!-- List injected here -->
                </div>
                <div class="mt-6 flex justify-end">
                    <button id="btn-cancel-suspended" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded">Close</button>
                </div>
            </div>
        </div>
    `;

    // Load Items from Dexie
    await Promise.all([fetchItemsFromDexie(), fetchCustomersFromDexie(), syncSuspendedFromServer()]);
    
    // Render initial cart state (if persisting between views)
    renderCart();
    updateSuspendedCount();
    
    // Event Listeners
    const searchInput = document.getElementById("pos-search");
    searchInput.addEventListener("input", (e) => {
        const { term } = parseSearchTerm(e.target.value);
        filterItems(term);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const firstCard = document.querySelector("#pos-grid > div[tabindex='0']");
            if (firstCard) firstCard.focus();
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            const { qty, term } = parseSearchTerm(e.target.value);
            if (!term.trim()) return;

            // 1. Exact Barcode
            let item = allItems.find(i => i.barcode === term);
            // 2. Exact Name
            if (!item) item = allItems.find(i => i.name.toLowerCase() === term.toLowerCase());
            // 3. Single result
            if (!item) {
                const lowerTerm = term.toLowerCase();
                const terms = lowerTerm.split(/\s+/).filter(t => t.length > 0);
                const filtered = allItems.filter(i => {
                    const name = i.name.toLowerCase();
                    const barcode = (i.barcode || "").toLowerCase();
                    return terms.every(t => name.includes(t) || barcode.includes(t));
                });
                if (filtered.length === 1) item = filtered[0];
            }

            if (item) {
                addToCart(item, qty);
                e.target.value = "";
                filterItems("");
            }
        }
    });
    
    document.getElementById("btn-clear-cart").addEventListener("click", () => {
        if (cart.length > 0 && confirm("Are you sure you want to clear the current sale?")) {
            cart = [];
            renderCart();
        }
    });

    // Suspend Logic
    document.getElementById("btn-suspend-sale").addEventListener("click", suspendCurrentTransaction);
    document.getElementById("btn-view-suspended").addEventListener("click", openSuspendedModal);
    document.getElementById("btn-close-suspended").addEventListener("click", closeSuspendedModal);
    document.getElementById("btn-cancel-suspended").addEventListener("click", closeSuspendedModal);
    document.getElementById("btn-refresh-suspended").addEventListener("click", openSuspendedModal);
    
    // Customer Search Logic
    const custInput = document.getElementById("pos-customer-search");
    const custResults = document.getElementById("pos-customer-results");
    const btnResetCust = document.getElementById("btn-reset-customer");

    const renderCustomerDropdown = (list) => {
        custResults.innerHTML = "";
        const limit = 50; // Limit results for performance
        const displayList = list.slice(0, limit);
        
        if (displayList.length > 0) {
            custResults.classList.remove("hidden");
            displayList.forEach(c => {
                const div = document.createElement("div");
                div.className = "p-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0 focus:bg-blue-100 focus:outline-none";
                div.setAttribute("tabindex", "0");
                div.innerHTML = `<div class="font-bold text-gray-700">${c.name}</div><div class="text-xs text-gray-500">${c.phone}</div>`;
                
                const selectAction = () => selectCustomer(c);
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
                        else custInput.focus();
                    }
                });
                
                custResults.appendChild(div);
            });
            if (list.length > limit) {
                const moreDiv = document.createElement("div");
                moreDiv.className = "p-2 text-xs text-gray-500 text-center italic";
                moreDiv.textContent = `Showing ${limit} of ${list.length} customers...`;
                custResults.appendChild(moreDiv);
            }
        } else {
            custResults.innerHTML = `<div class="p-2 text-sm text-gray-500 text-center">No customers found</div>`;
            custResults.classList.remove("hidden");
        }
    };
    
    custInput.addEventListener("focus", async () => {
        await fetchCustomersFromDexie();
        const term = custInput.value.toLowerCase();
        const filtered = term ? allCustomers.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term)) : allCustomers;
        renderCustomerDropdown(filtered);
    });

    custInput.addEventListener("blur", () => {
        // Delay hiding to allow click event to register
        setTimeout(() => {
            if (!custResults.contains(document.activeElement)) {
                custResults.classList.add("hidden");
            }
        }, 200);
    });

    custInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            const first = custResults.querySelector("div[tabindex='0']");
            if (first) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    custInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allCustomers.filter(c => c.name.toLowerCase().includes(term) || c.phone.includes(term));
        renderCustomerDropdown(filtered);
    });

    btnResetCust.addEventListener("click", () => {
        selectCustomer({ id: "Guest", name: "Guest" });
        custInput.value = "";
        custResults.classList.add("hidden");
    });

    document.getElementById("btn-pos-close-shift").addEventListener("click", () => {
        showCloseShiftModal(() => {
            loadPosView();
        });
    });

    // Checkout Logic
    document.getElementById("btn-checkout").addEventListener("click", openCheckout);
    document.getElementById("btn-cancel-checkout").addEventListener("click", closeCheckout);
    
    const inputTendered = document.getElementById("input-tendered");
    inputTendered.addEventListener("input", (e) => {
        const tendered = parseFloat(e.target.value) || 0;
        const total = parseFloat(document.getElementById("modal-checkout").dataset.total) || 0;
        const change = tendered - total;
        
        const changeEl = document.getElementById("checkout-change");
        const btnConfirm = document.getElementById("btn-confirm-pay");
        
        changeEl.textContent = `₱${change.toFixed(2)}`;
        if (change >= 0) {
            changeEl.classList.remove("text-red-600");
            changeEl.classList.add("text-green-600");
            btnConfirm.disabled = false;
        } else {
            changeEl.classList.add("text-red-600");
            changeEl.classList.remove("text-green-600");
            btnConfirm.disabled = true;
        }
    });
    
    inputTendered.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const btnConfirm = document.getElementById("btn-confirm-pay");
            if (!btnConfirm.disabled) {
                processTransaction();
            }
        }
    });

    document.getElementById("btn-confirm-pay").addEventListener("click", processTransaction);
    
    // Auto-focus search on load
    setTimeout(() => searchInput.focus(), 100);
}

async function fetchItemsFromDexie() {
    try {
        allItems = await db.items.toArray();
        renderGrid(allItems);
    } catch (error) {
        console.error("Error loading items from Dexie:", error);
        document.getElementById("pos-grid").innerHTML = `<div class="col-span-full text-center text-red-500">Error loading local database. Please ensure sync is active.</div>`;
    }
}

async function fetchCustomersFromDexie() {
    try {
        allCustomers = await db.customers.toArray();
    } catch (error) {
        console.error("Error loading customers:", error);
    }
}

function selectCustomer(customer) {
    selectedCustomer = customer;
    const display = document.getElementById("selected-customer-display");
    const btnReset = document.getElementById("btn-reset-customer");
    const input = document.getElementById("pos-customer-search");
    
    display.textContent = `Customer: ${customer.name}`;
    document.getElementById("pos-customer-results").classList.add("hidden");
    
    if (customer.id !== "Guest") {
        input.value = customer.name;
        btnReset.classList.remove("hidden");
    } else {
        btnReset.classList.add("hidden");
    }

    // Focus back to item search
    document.getElementById("pos-search")?.focus();
}

function renderGrid(items) {
    const grid = document.getElementById("pos-grid");
    grid.innerHTML = "";

    if (items.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 mt-10">No items found.</div>`;
        return;
    }

    items.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "bg-white border rounded-lg p-3 shadow-sm hover:shadow-md cursor-pointer transition duration-150 flex flex-col justify-between h-36 hover:border-blue-400 active:bg-blue-50 select-none relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500";
        card.setAttribute("tabindex", "0");
        
        // Stock Indicator Color
        const stockColor = item.stock_level <= (item.min_stock || 10) ? 'text-red-600' : 'text-gray-500';
        
        card.innerHTML = `
            <div>
                <div class="font-bold text-gray-800 leading-tight line-clamp-2 text-sm mb-1">${item.name}</div>
                <div class="text-xs text-gray-400 font-mono">${item.barcode}</div>
            </div>
            <div class="flex justify-between items-end mt-2 border-t pt-2">
                <div class="text-xs font-semibold ${stockColor}">Stock: ${item.stock_level}</div>
                <div class="font-bold text-blue-600">₱${item.selling_price.toFixed(2)}</div>
            </div>
            <!-- Hover Effect Overlay -->
            <div class="absolute inset-0 bg-blue-600 bg-opacity-0 group-hover:bg-opacity-5 transition duration-150"></div>
        `;
        
        // Placeholder click
        card.addEventListener("click", () => {
            addToCart(item, 1);
        });

        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addToCart(item, 1);
            } else {
                handleGridNavigation(e, index, items.length);
            }
        });
        
        grid.appendChild(card);
    });
}

function filterItems(term) {
    term = term.toLowerCase();
    const terms = term.split(/\s+/).filter(t => t.length > 0);
    const filtered = allItems.filter(i => {
        const name = i.name.toLowerCase();
        const barcode = (i.barcode || "").toLowerCase();
        return terms.every(t => name.includes(t) || barcode.includes(t));
    });
    renderGrid(filtered);
}

function handleGridNavigation(e, index, totalItems) {
    const cols = window.innerWidth >= 1024 ? 4 : (window.innerWidth >= 640 ? 3 : 2);
    let nextIndex = index;

    if (e.key === "ArrowRight") nextIndex++;
    else if (e.key === "ArrowLeft") nextIndex--;
    else if (e.key === "ArrowDown") nextIndex += cols;
    else if (e.key === "ArrowUp") nextIndex -= cols;
    else return;

    const cards = document.querySelectorAll("#pos-grid > div[tabindex='0']");
    
    if (nextIndex >= 0 && nextIndex < totalItems) {
        e.preventDefault();
        cards[nextIndex]?.focus();
    } else if (e.key === "ArrowUp" && nextIndex < 0) {
        e.preventDefault();
        document.getElementById("pos-search").focus();
    }
}

function parseSearchTerm(val) {
    const regex = /^(\d+)\*(.*)$/;
    const match = val.match(regex);
    if (match) {
        return { qty: parseInt(match[1], 10), term: match[2] };
    }
    return { qty: 1, term: val };
}

async function addToCart(item, qty = 1) {
    // Hide last transaction summary when starting a new sale
    document.getElementById("last-transaction").classList.add("hidden");

    // Auto-Breakdown Logic: Still useful to keep inventory accurate where possible
    if (item.stock_level < qty && item.parent_id) {
        const parent = allItems.find(p => p.id === item.parent_id);
        if (parent && parent.stock_level > 0) {
            const factor = item.conv_factor || 1;
            parent.stock_level -= 1;
            item.stock_level += factor;

            // Persist to Dexie immediately so state is saved
            await db.items.bulkPut([parent, item]);
            showToast(`Auto-converted 1 ${parent.name} to ${factor} ${item.name}`);
            
            // Refresh Grid to show new stock levels
            filterItems(document.getElementById("pos-search").value);
        }
    }

    const existingItem = cart.find(i => i.id === item.id);
    if (existingItem) {
        existingItem.qty += qty;
    } else {
        cart.push({ ...item, qty: qty });
    }
    renderCart();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function updateQty(index, newQty) {
    if (newQty > 0) {
        cart[index].qty = newQty;
    } else {
        removeFromCart(index);
        return;
    }
    renderCart();
}

function renderCart() {
    const cartContainer = document.getElementById("pos-cart-items");
    const totalEl = document.getElementById("cart-total");
    const btnCheckout = document.getElementById("btn-checkout");
    
    cartContainer.innerHTML = "";
    let total = 0;

    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <svg class="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                <p>Cart is empty</p>
            </div>`;
        totalEl.textContent = "₱0.00";
        btnCheckout.disabled = true;
        return;
    }

    cart.forEach((item, index) => {
        const itemTotal = item.selling_price * item.qty;
        total += itemTotal;

        const row = document.createElement("div");
        row.className = "flex justify-between items-center bg-white p-2 rounded shadow-sm text-sm border-b last:border-b-0";
        row.innerHTML = `
            <div class="flex-1 overflow-hidden mr-2">
                <div class="font-bold truncate text-gray-800">${item.name}</div>
                <div class="text-gray-500 text-xs">₱${item.selling_price.toFixed(2)} x ${item.qty}</div>
            </div>
            <div class="flex items-center gap-2">
                <div class="font-bold text-blue-600 mr-2">₱${itemTotal.toFixed(2)}</div>
                <input type="number" min="1" class="w-16 border rounded text-center text-sm py-1 cart-qty-input" data-index="${index}" value="${item.qty}">
                <button class="text-red-400 hover:text-red-600 ml-1 btn-remove p-1" data-index="${index}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        `;
        
        const qtyInput = row.querySelector(".cart-qty-input");
        qtyInput.addEventListener("change", (e) => updateQty(index, parseInt(e.target.value)));
        
        // Select all text on focus for quick editing
        qtyInput.addEventListener("focus", e => e.target.select());

        // Add arrow key navigation for cart quantities
        qtyInput.addEventListener("keydown", e => {
            const inputs = Array.from(document.querySelectorAll("#pos-cart-items .cart-qty-input"));
            const currentIndex = inputs.indexOf(e.target);

            if (e.key === "ArrowUp") {
                e.preventDefault();
                const prevInput = inputs[currentIndex - 1];
                if (prevInput) prevInput.focus();
                else inputs[inputs.length - 1]?.focus(); // Loop to bottom
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const nextInput = inputs[currentIndex + 1];
                if (nextInput) nextInput.focus();
                else inputs[0]?.focus(); // Loop to top
            }
        });

        row.querySelector(".btn-remove").addEventListener("click", () => removeFromCart(index));

        cartContainer.appendChild(row);
    });

    totalEl.textContent = `₱${total.toFixed(2)}`;
    btnCheckout.disabled = false;
}

function showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `${isError ? 'bg-red-600' : 'bg-gray-800'} text-white px-4 py-2 rounded shadow-lg text-sm transition-all duration-300 opacity-0 transform translate-y-2`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove("opacity-0", "translate-y-2");
    });
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y-2");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openCheckout() {
    if (!checkPermission("pos", "write")) {
        showToast("You do not have permission to process sales.", true);
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.selling_price * item.qty), 0);
    if (total === 0) return;

    const modal = document.getElementById("modal-checkout");
    const totalEl = document.getElementById("checkout-total");
    const inputTendered = document.getElementById("input-tendered");
    const changeEl = document.getElementById("checkout-change");
    const btnConfirm = document.getElementById("btn-confirm-pay");

    modal.dataset.total = total;
    totalEl.textContent = `₱${total.toFixed(2)}`;
    inputTendered.value = "";
    changeEl.textContent = "₱0.00";
    btnConfirm.disabled = true;
    
    modal.classList.remove("hidden");
    setTimeout(() => inputTendered.focus(), 100);
}

function closeCheckout() {
    document.getElementById("modal-checkout").classList.add("hidden");
}

async function processTransaction() {
    const btnConfirm = document.getElementById("btn-confirm-pay");
    const inputTendered = document.getElementById("input-tendered");

    // Prevent double submission
    if (btnConfirm.hasAttribute("data-processing")) return;
    
    btnConfirm.setAttribute("data-processing", "true");
    btnConfirm.disabled = true;
    inputTendered.disabled = true;
    const originalText = btnConfirm.textContent;
    btnConfirm.textContent = "Processing...";

    const total = parseFloat(document.getElementById("modal-checkout").dataset.total);
    const tendered = parseFloat(inputTendered.value);

    if (isNaN(tendered) || tendered < total) {
        showToast("Amount tendered must be equal to or greater than the total amount.", true);
        btnConfirm.removeAttribute("data-processing");
        btnConfirm.disabled = false;
        inputTendered.disabled = false;
        btnConfirm.textContent = originalText;
        return;
    }

    const user = JSON.parse(localStorage.getItem('pos_user'));
    
    const transaction = {
        items: JSON.parse(JSON.stringify(cart)), // Deep copy
        total_amount: total,
        amount_tendered: tendered,
        change: tendered - total,
        user_email: user ? user.email : "Guest",
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        timestamp: new Date(),
        sync_status: 0 // 0 = Unsynced
    };

    try {
        // 1. Save to Dexie (Offline First)
        const txId = await db.transactions.add(transaction);

        // 2. Update Local Dexie Items
        for (const item of transaction.items) {
            const current = await db.items.get(item.id);
            if (current) {
                await db.items.update(item.id, { stock_level: current.stock_level - item.qty });
            }
        }

        // 3. Try Online Sync (Best Effort)
        try {
            // Fetch Items
            const itemsRes = await fetch(`${API_URL}?file=items`);
            let serverItems = await itemsRes.json();
            if (!Array.isArray(serverItems)) serverItems = [];

            // Update Server Items
            transaction.items.forEach(txItem => {
                const idx = serverItems.findIndex(i => i.id === txItem.id);
                if (idx !== -1) {
                    serverItems[idx].stock_level -= txItem.qty;
                }
            });

            // Save Items
            await fetch(`${API_URL}?file=items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverItems)
            });

            // Fetch & Update Transactions
            const txRes = await fetch(`${API_URL}?file=transactions`);
            let serverTxs = await txRes.json();
            if (!Array.isArray(serverTxs)) serverTxs = [];
            
            // Add to server transactions
            serverTxs.push({ ...transaction, id: crypto.randomUUID(), sync_status: 1 });

            await fetch(`${API_URL}?file=transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverTxs)
            });

            // Mark Local as Synced
            await db.transactions.update(txId, { sync_status: 1 });

        } catch (serverError) {
            console.warn("Server sync failed (Offline mode active):", serverError);
            // Do not alert user, just log. Transaction is safe in Dexie with sync_status=0.
        }

        cart = [];
        renderCart();
        closeCheckout();
        
        // Reset Customer to Guest
        selectCustomer({ id: "Guest", name: "Guest" });
        document.getElementById("pos-customer-search").value = "";
        
        showToast("Transaction saved successfully!");
        
        // Show Last Transaction Summary
        const lastTxDiv = document.getElementById("last-transaction");
        document.getElementById("last-change-amount").textContent = `₱${transaction.change.toFixed(2)}`;
        document.getElementById("last-total").textContent = `₱${transaction.total_amount.toFixed(2)}`;
        document.getElementById("last-tendered").textContent = `₱${transaction.amount_tendered.toFixed(2)}`;
        lastTxDiv.classList.remove("hidden");
        
        // Focus back on search input for next sale
        document.getElementById("pos-search").focus();
    } catch (error) {
        console.error("Error saving transaction:", error);
        showToast("Failed to save transaction.", true);
        btnConfirm.disabled = false;
    } finally {
        btnConfirm.removeAttribute("data-processing");
        inputTendered.disabled = false;
        btnConfirm.textContent = originalText;
    }
}

async function suspendCurrentTransaction() {
    if (cart.length === 0) {
        showToast("Cart is empty.", true);
        return;
    }

    const user = JSON.parse(localStorage.getItem('pos_user'));
    const suspendedTx = {
        id: (self.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2)),
        items: JSON.parse(JSON.stringify(cart)),
        customer: selectedCustomer,
        user_email: user ? user.email : "Guest",
        timestamp: new Date(),
        total: cart.reduce((sum, item) => sum + (item.selling_price * item.qty), 0),
        sync_status: 0 // 0 = Unsynced
    };

    try {
        // 1. Save locally first (Persistence across refreshes)
        await db.suspended_transactions.add(suspendedTx);
        
        // 2. Trigger background sync (Persistence across devices/sessions)
        syncSuspendedFromServer();

        cart = [];
        selectedCustomer = { id: "Guest", name: "Guest" };
        renderCart();
        selectCustomer(selectedCustomer);
        showToast(`Transaction for ${suspendedTx.customer.name} suspended.`);
        updateSuspendedCount();
    } catch (error) {
        console.error("Error suspending transaction:", error);
        showToast("Failed to suspend transaction.", true);
    }
}

async function openSuspendedModal() {
    const container = document.getElementById("suspended-list-container");
    container.innerHTML = `<div class="text-center p-4">Syncing with server...</div>`;
    document.getElementById("modal-suspended").classList.remove("hidden");

    // Sync before showing to ensure cross-device persistence
    await syncSuspendedFromServer();
    updateSuspendedCount();

    try {
        const user = JSON.parse(localStorage.getItem('pos_user'));
        const suspended = await db.suspended_transactions
            .where('user_email').equals(user ? user.email : "Guest")
            .filter(tx => tx.sync_status !== 2).toArray();
        if (suspended.length === 0) {
            container.innerHTML = `<div class="text-center p-4 text-gray-500">No suspended transactions.</div>`;
            return;
        }

        container.innerHTML = `
            <table class="w-full text-sm">
                <thead class="bg-gray-50">
                    <tr class="border-b">
                        <th class="text-left p-2">Time</th>
                        <th class="text-left p-2">Customer</th>
                        <th class="text-right p-2">Total</th>
                        <th class="text-center p-2">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${suspended.map(tx => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-2 text-xs">${new Date(tx.timestamp).toLocaleString()}</td>
                            <td class="p-2 font-medium">${tx.customer?.name || 'Guest'}</td>
                            <td class="p-2 text-right font-bold">₱${tx.total.toFixed(2)}</td>
                            <td class="p-2 text-center">
                                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded btn-resume-suspended" data-id="${tx.id}">Resume</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.querySelectorAll(".btn-resume-suspended").forEach(btn => {
            btn.addEventListener("click", () => resumeTransaction(btn.dataset.id));
        });
    } catch (error) {
        console.error("Error loading suspended transactions:", error);
        container.innerHTML = `<div class="text-center p-4 text-red-500">Error loading data.</div>`;
    }
}

function closeSuspendedModal() {
    document.getElementById("modal-suspended").classList.add("hidden");
}

async function resumeTransaction(id) {
    if (cart.length > 0 && !confirm("Current cart is not empty. Overwrite with suspended transaction?")) {
        return;
    }

    try {
        const tx = await db.suspended_transactions.get(id);
        if (tx) {
            cart = tx.items;
            selectedCustomer = tx.customer || { id: "Guest", name: "Guest" };
            
            // Mark for deletion locally (status 2) and trigger background sync
            await db.suspended_transactions.update(id, { sync_status: 2 });
            
            renderCart();
            selectCustomer(selectedCustomer);
            closeSuspendedModal();
            showToast("Transaction resumed.");
            syncSuspendedFromServer().then(() => updateSuspendedCount());
        }
    } catch (error) {
        console.error("Error resuming transaction:", error);
        showToast("Failed to resume transaction.", true);
    }
}

async function updateSuspendedCount() {
    const user = JSON.parse(localStorage.getItem('pos_user'));
    const count = await db.suspended_transactions
        .where('user_email').equals(user ? user.email : "Guest")
        .and(tx => tx.sync_status !== 2).count();
    const btn = document.getElementById("btn-view-suspended");
    if (!btn) return;
    
    const existingBadge = btn.querySelector(".suspended-badge");
    if (existingBadge) existingBadge.remove();
    
    if (count > 0) {
        const badge = document.createElement("span");
        badge.className = "suspended-badge ml-1 bg-white text-yellow-700 px-1.5 py-0.5 rounded-full font-bold text-[9px]";
        badge.textContent = count;
        btn.appendChild(badge);
    }
}

async function syncSuspendedFromServer() {
    const user = JSON.parse(localStorage.getItem('pos_user'));
    const userEmail = user ? user.email : "Guest";

    if (!navigator.onLine) return;

    // 1. Push local changes (New and Deleted) to server
    try {
        const unsynced = await db.suspended_transactions.where('sync_status').equals(0).toArray();
        const toDelete = await db.suspended_transactions.where('sync_status').equals(2).toArray();

        if (unsynced.length > 0 || toDelete.length > 0) {
            const res = await fetch(`${API_URL}?file=suspended_transactions`);
            let serverList = await res.json();
            if (!Array.isArray(serverList)) serverList = [];
            
            let changed = false;

            // Add new ones
            for (const tx of unsynced) {
                if (!serverList.find(s => s.id === tx.id)) {
                    serverList.push(tx);
                    changed = true;
                }
            }

            // Remove deleted ones
            if (toDelete.length > 0) {
                const idsToDelete = new Set(toDelete.map(t => t.id));
                const originalLength = serverList.length;
                serverList = serverList.filter(s => !idsToDelete.has(s.id));
                if (serverList.length !== originalLength) changed = true;
            }
            
            if (changed) {
                await fetch(`${API_URL}?file=suspended_transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serverList)
                });
            }
            
            // Update local status
            for (const tx of unsynced) await db.suspended_transactions.update(tx.id, { sync_status: 1 });
            for (const tx of toDelete) await db.suspended_transactions.delete(tx.id);
        }
    } catch (e) {
        console.warn("Could not push unsynced suspended transactions:", e);
    }

    // 2. Pull from server and merge deletions/updates
    try {
        const response = await fetch(`${API_URL}?file=suspended_transactions`);
        if (response.ok) {
            const serverSuspended = await response.json();
            if (Array.isArray(serverSuspended)) {
                const serverIds = new Set(serverSuspended.map(s => s.id));
                const localPendingDelete = await db.suspended_transactions
                    .where('sync_status').equals(2)
                    .toArray();
                const localPendingDeleteIds = new Set(localPendingDelete.map(t => t.id));
                
                // Remove local ones that were resumed/deleted elsewhere (only if they were previously synced)
                const localSyncedForUser = await db.suspended_transactions
                    .where('user_email').equals(userEmail)
                    .filter(tx => tx.sync_status === 1)
                    .toArray();
                
                for (const local of localSyncedForUser) {
                    if (!serverIds.has(local.id)) {
                        await db.suspended_transactions.delete(local.id);
                    }
                }

                // Add/Update from server
                const toPut = serverSuspended
                    .filter(s => !localPendingDeleteIds.has(s.id)) // Don't pull back what we just resumed
                    .map(s => ({ ...s, sync_status: 1 }));
                await db.suspended_transactions.bulkPut(toPut);
            }
        }
    } catch (e) {
        console.warn("Could not sync suspended transactions from server:", e);
    }
    
    updateSuspendedCount();
}

// Auto-sync when coming back online
window.addEventListener('online', () => {
    if (window.location.hash === '#pos') {
        syncSuspendedFromServer();
    }
});