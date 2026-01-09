import { checkPermission, requestManagerApproval } from "../auth.js";
import { checkActiveShift, requireShift, showCloseShiftModal, recordRemittance } from "./shift.js";
import { addNotification } from "../services/notification-service.js";
import { getSystemSettings } from "./settings.js";
import { generateUUID } from "../utils.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";

let activeCartIndex = null;
let qtyBuffer = "";
let currentSuspendedId = null;

let audioCtx = null;
function playBeep(freq, dur, type = 'sine') {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
    } catch (e) { console.warn("Audio feedback failed", e); }
}

// Global shortcut listener for POS
document.addEventListener("keydown", (e) => {
    const searchInput = document.getElementById("pos-search");
    const custInput = document.getElementById("pos-customer-search");
    
    // Only run if POS elements are present
    if (!searchInput || !custInput) return;

    // Cart Navigation Mode (F3)
    if (activeCartIndex !== null && cart.length > 0) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeCartIndex = (activeCartIndex + 1) % cart.length;
            qtyBuffer = "";
            renderCart();
            return;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeCartIndex = (activeCartIndex - 1 + cart.length) % cart.length;
            qtyBuffer = "";
            renderCart();
            return;
        } else if (e.key >= "0" && e.key <= "9") {
            e.preventDefault();
            qtyBuffer += e.key;
            renderCart();
            return;
        } else if (e.key === "Backspace") {
            e.preventDefault();
            if (qtyBuffer.length > 0) {
                qtyBuffer = qtyBuffer.slice(0, -1);
                renderCart();
            } else {
                removeFromCart(activeCartIndex);
                activeCartIndex = null;
                renderCart();
                searchInput.focus();
            }
            return;
        } else if (e.key === "Delete") {
            e.preventDefault();
            removeFromCart(activeCartIndex);
            activeCartIndex = null;
            qtyBuffer = "";
            renderCart();
            searchInput.focus();
            return;
        } else if (e.key === "Escape" || e.key === "Enter") {
            e.preventDefault();
            if (e.key === "Enter" && qtyBuffer !== "") {
                updateQty(activeCartIndex, parseInt(qtyBuffer));
            }
            activeCartIndex = null;
            qtyBuffer = "";
            renderCart();
            searchInput.focus();
            return;
        }
    }

    if (e.key === "F1") {
        e.preventDefault();
        searchInput.value = "";
        filterItems("");
        searchInput.focus();

        // Visual highlight flash effect
        searchInput.classList.add("ring-4", "ring-blue-400", "bg-blue-50");
        setTimeout(() => {
            searchInput.classList.remove("ring-4", "ring-blue-400", "bg-blue-50");
        }, 300);
    } else if (e.key === "F2") {
        e.preventDefault();
        custInput.focus();

        // Visual highlight flash effect
        custInput.classList.add("ring-4", "ring-blue-400", "bg-blue-50");
        setTimeout(() => {
            custInput.classList.remove("ring-4", "ring-blue-400", "bg-blue-50");
        }, 300);
    } else if (e.key === "F3") {
        e.preventDefault();
        if (cart.length > 0) {
            activeCartIndex = 0;
            qtyBuffer = "";
            renderCart();
            // Scroll to top of cart
            document.getElementById("pos-cart-items").scrollTop = 0;
        }
    } else if (e.key === "F4") {
        e.preventDefault();
        const btnCheckout = document.getElementById("btn-checkout");
        if (btnCheckout && !btnCheckout.disabled) {
            btnCheckout.click();
        }
    } else if (e.key === "F8") {
        e.preventDefault();
        const btnPrint = document.getElementById("btn-print-last-receipt");
        if (btnPrint) btnPrint.click();
    } else if (e.key === "Escape") {
        e.preventDefault();
        document.getElementById("modal-suspended")?.classList.add("hidden");
        document.getElementById("modal-pos-history")?.classList.add("hidden");
    }
});

let isResizing = false;

/**
 * Resizing logic for the POS cart
 */
document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const cart = document.getElementById('pos-cart-container');
    const container = cart?.parentElement;
    if (!cart || !container) return;

    const containerRect = container.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    const minWidth = 320;
    const maxWidth = containerRect.width * 0.6;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
        const widthStr = `${newWidth}px`;
        cart.style.width = widthStr;
        localStorage.setItem('pos_cart_width', widthStr);
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('select-none');
    }
});

let allItems = [];
let barcodeMap = new Map(); // Fast lookup for scanner
let allCustomers = [];
let cart = [];
let lastTransactionData = null;
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
    const savedCartWidth = localStorage.getItem('pos_cart_width') || '33.33%';
    const savedCols = localStorage.getItem('pos_grid_cols') || '3';
    const savedCompact = localStorage.getItem('pos_compact_mode') || 'false';

    // Full height layout minus header padding
    content.innerHTML = `
        <div class="flex flex-col md:flex-row h-[calc(100vh-100px)] gap-0 overflow-hidden">
            <!-- Left Column: Item Grid -->
            <div id="pos-grid-container" class="flex-1 flex flex-col bg-white rounded-l-lg shadow-md overflow-hidden">
                <!-- Search Bar -->
                <div class="p-4 border-b bg-gray-50 flex gap-4 items-center">
                    <div class="relative flex-1">
                        <input type="text" id="pos-search" placeholder="Search items (F1)..." 
                            class="w-full pl-10 p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg transition-all duration-300"
                            autocomplete="off">
                        <svg class="w-6 h-6 absolute left-3 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <div class="flex items-center gap-2 shrink-0 ml-2">
                        <label class="text-[10px] font-bold text-gray-400 uppercase cursor-pointer select-none" for="pos-compact-mode">Compact:</label>
                        <input type="checkbox" id="pos-compact-mode" ${savedCompact === 'true' ? 'checked' : ''} class="form-checkbox h-4 w-4 text-blue-600 cursor-pointer">
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <label class="text-[10px] font-bold text-gray-400 uppercase">Cols:</label>
                        <select id="pos-grid-cols" class="border rounded p-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="1" ${savedCols === '1' ? 'selected' : ''}>1</option>
                            <option value="2" ${savedCols === '2' ? 'selected' : ''}>2</option>
                            <option value="3" ${savedCols === '3' ? 'selected' : ''}>3</option>
                            <option value="4" ${savedCols === '4' ? 'selected' : ''}>4</option>
                            <option value="5" ${savedCols === '5' ? 'selected' : ''}>5</option>
                        </select>
                    </div>
                </div>
                
                <!-- Grid -->
                <div id="pos-grid" class="flex-1 p-4 overflow-y-auto grid gap-2 content-start bg-gray-100">
                    <!-- Items injected here -->
                    <div class="col-span-full text-center text-gray-500 mt-10">Loading items from local database...</div>
                </div>
            </div>

            <!-- Resize Handle -->
            <div id="pos-resizer" class="hidden md:block w-1.5 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors z-10"></div>

            <!-- Right Column: Cart -->
            <div id="pos-cart-container" class="w-full md:flex flex-col bg-white rounded-r-lg shadow-md overflow-hidden border-l h-full" style="width: ${savedCartWidth}">
                <div class="p-2 bg-blue-700 text-white shadow-md flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <div class="flex flex-col">
                            <span class="text-[10px] uppercase font-bold opacity-75 leading-none">Total Amount</span>
                            <div id="cart-total" class="text-2xl font-black leading-tight">₱0.00</div>
                        </div>
                        <div class="flex gap-2 shrink-0">
                            <button id="btn-view-suspended" class="text-[9px] bg-yellow-600 hover:bg-yellow-700 px-1.5 py-1 rounded font-bold" title="Suspended Sales">SUSP</button>
                            <button id="btn-pos-history" class="text-[9px] bg-indigo-600 hover:bg-indigo-700 px-1.5 py-1 rounded font-bold" title="History">HIST</button>
                            <button id="btn-suspend-sale" class="text-[9px] bg-orange-500 hover:bg-orange-600 px-1.5 py-1 rounded font-bold" title="Hold">HOLD</button>
                            <button id="btn-pos-close-shift" class="text-[9px] bg-red-500 hover:bg-red-600 px-1.5 py-1 rounded font-bold" title="Close Shift">CLOSE</button>
                            <button id="btn-clear-cart" class="text-[9px] bg-blue-800 hover:bg-blue-900 px-1.5 py-1 rounded font-bold" title="Clear Cart">CLR</button>
                        </div>
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
                                class="w-full p-2 text-sm focus:outline-none rounded-md transition-all duration-300" autocomplete="off">
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
                <div id="last-transaction" class="hidden bg-green-50 border-b border-green-200 p-2 md:p-4">
                    <div class="text-center">
                        <div class="text-xs text-green-600 uppercase font-bold">Change Due</div>
                        <div id="last-change-amount" class="text-xl md:text-3xl font-bold text-green-700">₱0.00</div>
                    </div>
                    <div class="flex justify-between mt-1 md:mt-2 text-[10px] md:text-xs text-green-600 border-t border-green-200 pt-1 md:pt-2">
                        <div>Tot: <span id="last-total" class="font-bold"></span></div>
                        <div>Paid: <span id="last-tendered" class="font-bold"></span></div>
                    </div>
                    <button id="btn-print-last-receipt" class="w-full mt-3 bg-gray-800 text-white py-2 rounded font-bold text-sm flex items-center justify-center gap-2 hover:bg-black transition">Print Receipt (F8)</button>
                </div>

                <!-- Cart Items List -->
                <div id="pos-cart-items" class="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50">
                    <div class="flex flex-col items-center justify-center h-full text-gray-400">
                        <svg class="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        <p>Cart is empty</p>
                    </div>
                </div>

                <!-- Footer / Totals -->
                <div class="p-2 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
                    <button id="btn-checkout" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg text-lg shadow-lg transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2" disabled>
                        <span>PAY NOW (F4)</span>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    </button>

                    <!-- Shortcut Legend -->
                    <div class="mt-2 pt-2 border-t flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                        <span><b class="text-blue-500">F1</b> Search</span>
                        <span><b class="text-blue-500">F2</b> Cust</span>
                        <span><b class="text-blue-500">F3</b> Cart</span>
                        <span><b class="text-blue-500">F4</b> Pay</span>
                        <span><b class="text-blue-500">F8</b> Print</span>
                    </div>
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
                    <label class="block text-gray-700 text-sm font-bold mb-2">Payment Method</label>
                    <select id="select-payment-method" class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="Cash">Cash</option>
                        <option value="Points">Loyalty Points</option>
                        <option value="Card">Card</option>
                        <option value="E-Wallet">E-Wallet</option>
                    </select>
                    <div id="customer-points-info" class="hidden text-[10px] mt-1 font-bold text-blue-600">
                        Available Points: <span id="available-points-display">0</span>
                    </div>
                </div>
                <div class="mb-4" id="tendered-container">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Amount Tendered</label>
                    <input type="number" id="input-tendered" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl text-center" step="0.01">
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
                        <button id="btn-delete-all-suspended" class="text-red-600 hover:text-red-800 text-sm font-bold">Delete All</button>
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

        <!-- Transaction History Modal -->
        <div id="modal-pos-history" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">Recent Transactions</h3>
                    <button id="btn-close-history" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                <div class="overflow-y-auto max-h-96">
                    <table class="min-w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr class="border-b">
                                <th class="text-left p-2">Time</th>
                                <th class="text-left p-2">Customer</th>
                                <th class="text-right p-2">Total</th>
                                <th class="text-center p-2">Action</th>
                            </tr>
                        </thead>
                        <tbody id="pos-history-body"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Quick Customer Modal -->
        <div id="modal-quick-customer" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-[60]">
            <div class="bg-white rounded-lg shadow-lg p-6 w-96">
                <h3 class="text-xl font-bold mb-2 text-gray-800">Customer Details</h3>
                <p class="text-xs text-gray-600 mb-4">Provide customer information for this receipt.</p>
                
                <div class="mb-3 relative">
                    <label class="block text-gray-700 text-xs font-bold mb-1">Name</label>
                    <input type="text" id="quick-cust-name" placeholder="Search or enter name..." class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" autocomplete="off">
                    <div id="quick-cust-results" class="hidden absolute z-[70] w-full bg-white shadow-lg border rounded-b-md max-h-40 overflow-y-auto mt-1"></div>
                </div>
                <div class="mb-6">
                    <label class="block text-gray-700 text-xs font-bold mb-1">Phone Number</label>
                    <input type="text" id="quick-cust-phone" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" autocomplete="off">
                </div>

                <div class="flex gap-2">
                    <button id="btn-cancel-quick-customer" class="w-1/2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded shadow-md transition">Cancel</button>
                    <button id="btn-save-quick-customer" class="w-1/2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded shadow-md transition">Save & Print</button>
                </div>
            </div>
        </div>

        <!-- Remittance Modal -->
        <div id="modal-remittance" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
                <h3 class="text-xl font-bold mb-4 text-gray-800">Cash Remittance (Cashout)</h3>
                <div class="mb-4">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Amount to Remit</label>
                    <input type="number" id="remit-amount" class="w-full p-2 border rounded text-lg focus:ring-2 focus:ring-blue-500 outline-none" step="0.01" placeholder="0.00">
                </div>
                <div class="mb-4">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Reason / Reference</label>
                    <input type="text" id="remit-reason" class="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Mid-day turnover">
                </div>
                <div class="mb-4">
                    <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Remittance History</h4>
                    <div id="remittance-history-list" class="max-h-32 overflow-y-auto border rounded p-2 text-xs space-y-1 bg-gray-50"></div>
                </div>
                <div class="flex gap-2">
                    <button id="btn-cancel-remit" class="w-1/2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 rounded">Cancel</button>
                    <button id="btn-save-remit" class="w-1/2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded">Record Remittance</button>
                </div>
            </div>
        </div>

        <!-- Close Shift Modal -->
        <div id="modal-close-shift" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-5xl h-[85vh] flex flex-col">
                <div class="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                        <h3 class="text-2xl font-bold text-gray-800">End Shift</h3>
                        <p class="text-sm text-gray-500">Perform cash count and verify turnover.</p>
                    </div>
                    <button id="btn-cancel-close-shift-x" class="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
                </div>

                <div class="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <!-- Left Column: Cash Counter (7 cols) -->
                    <div class="lg:col-span-7 flex flex-col h-full overflow-hidden border-r pr-6">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-bold text-gray-700 uppercase text-xs tracking-wider">Cash Denominations</h4>
                            <span class="text-xs text-gray-400">Enter count for each</span>
                        </div>
                        
                        <div class="flex-1 overflow-y-auto bg-gray-50 rounded-lg border p-4">
                            <div class="grid grid-cols-3 gap-4 mb-3 font-bold text-xs text-gray-500 uppercase border-b pb-2">
                                <div>Denomination</div>
                                <div class="text-center">Count</div>
                                <div class="text-right">Subtotal</div>
                            </div>
                            <div class="space-y-2" id="cash-counter-grid">
                                <!-- Denominations injected here -->
                            </div>
                        </div>

                        <div class="mt-4 bg-blue-50 p-4 rounded-lg border border-blue-100 flex justify-between items-center shadow-sm">
                            <span class="font-bold text-blue-800 text-lg">Total Physical Cash</span>
                            <span id="cash-counter-total" class="text-3xl font-bold text-blue-700">₱0.00</span>
                        </div>
                    </div>

                    <!-- Right Column: Summary (5 cols) -->
                    <div class="lg:col-span-5 flex flex-col h-full overflow-y-auto">
                        <div class="space-y-6">
                            <!-- Other Cash -->
                            <div class="bg-gray-50 p-4 rounded-lg border">
                                <h4 class="font-bold text-gray-700 mb-3 uppercase text-xs tracking-wider border-b pb-1">Other Cash</h4>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-500 mb-1">Precounted Bills</label>
                                        <input type="number" id="precounted-bills" min="0" step="0.01" class="w-full border rounded p-2 text-right focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" placeholder="0.00">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-500 mb-1">Precounted Coins</label>
                                        <input type="number" id="precounted-coins" min="0" step="0.01" class="w-full border rounded p-2 text-right focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" placeholder="0.00">
                                    </div>
                                </div>
                            </div>

                            <!-- Cashout -->
                            <div class="bg-gray-50 p-4 rounded-lg border">
                                <h4 class="font-bold text-gray-700 mb-3 uppercase text-xs tracking-wider border-b pb-1">Remittance (Cashout)</h4>
                                <div class="flex items-center gap-2">
                                    <label class="text-sm text-gray-600 flex-1">Total Remitted:</label>
                                    <input type="number" id="shift-cashout" min="0" step="0.01" class="w-32 border rounded p-2 text-right bg-gray-100 font-bold text-gray-700 cursor-not-allowed text-sm" readonly placeholder="0.00">
                                </div>
                            </div>

                            <!-- Expenses -->
                            <div class="flex-1 flex flex-col bg-gray-50 p-4 rounded-lg border min-h-[150px]">
                                <div class="flex justify-between items-center mb-2 border-b pb-1">
                                    <h4 class="font-bold text-gray-700 uppercase text-xs tracking-wider">Expense Receipts</h4>
                                    <button id="btn-add-shift-receipt" class="text-[10px] bg-blue-100 text-blue-600 px-2 py-1 rounded font-bold hover:bg-blue-200 transition uppercase tracking-wide">+ Add Receipt</button>
                                </div>
                                <div class="flex-1 overflow-y-auto max-h-40 space-y-2" id="shift-receipts-list">
                                    <!-- Receipts injected here -->
                                </div>
                            </div>
                        </div>

                        <!-- Final Summary -->
                        <div class="mt-auto pt-6">
                            <div class="flex justify-between items-end mb-1">
                                <span class="text-gray-600 font-medium">Total Turnover</span>
                                <span id="shift-total-turnover" class="text-4xl font-bold text-gray-800 leading-none">₱0.00</span>
                            </div>
                            <p class="text-xs text-gray-400 text-right mb-6">Physical Cash + Receipts + Remittances</p>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <button id="btn-cancel-close-shift" class="w-full bg-white border border-gray-300 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                                <button id="btn-confirm-close-shift" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg shadow-lg transition transform hover:scale-105">Confirm Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load Items from Dexie
    await Promise.all([fetchItemsFromDexie(), fetchCustomersFromDexie(), SyncEngine.sync()]);
    
    // Render initial cart state (if persisting between views)
    renderCart();
    updateSuspendedCount();
    
    // Event Listeners
    const searchInput = document.getElementById("pos-search");
    let searchTimeout;

    searchInput.addEventListener("input", (e) => {
        activeCartIndex = null;
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const { term } = parseSearchTerm(e.target.value);
            filterItems(term);
        }, 150); // Debounce to handle rapid scanner input
    });

    searchInput.addEventListener("focus", () => {
        if (activeCartIndex !== null) {
            activeCartIndex = null;
            renderCart();
        }
    });

    searchInput.addEventListener("keydown", async (e) => {
        if (activeCartIndex !== null) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const firstCard = document.querySelector("#pos-grid > div[tabindex='0']");
            if (firstCard) firstCard.focus();
            return;
        }
        if (e.key === "Enter") {
            clearTimeout(searchTimeout);
            e.preventDefault();
            const { qty, term } = parseSearchTerm(e.target.value);
            if (!term.trim()) return;

            // 1. Exact Barcode
            let item = barcodeMap.get(term);
            // 2. Exact Name
            if (!item) item = allItems.find(i => (i.name || "").toLowerCase() === term.toLowerCase());
            // 3. Single result
            if (!item) {
                const lowerTerm = term.toLowerCase();
                const terms = lowerTerm.split(/\s+/).filter(t => t.length > 0);
                const filtered = allItems.filter(i => {
                    const name = (i.name || "").toLowerCase();
                    const barcode = (i.barcode || "").toLowerCase();
                    return terms.every(t => name.includes(t) || barcode.includes(t));
                });
                if (filtered.length === 1) item = filtered[0];
            }

            if (item) {
                await addToCart(item, qty);
                e.target.value = "";
                filterItems("");
                e.target.focus();
            } else {
                playBeep(220, 0.3, 'sawtooth'); // Bad beep
                showToast("Item not found", true);
            }
        }
    });
    
    document.getElementById("btn-print-last-receipt").addEventListener("click", async () => {
        if (lastTransactionData) {
            const isReprint = !!lastTransactionData.was_printed;
            await printReceipt(lastTransactionData, isReprint);
        }
    });

    document.getElementById("btn-clear-cart").addEventListener("click", () => {
        if (cart.length > 0 && confirm("Are you sure you want to clear the current sale?")) {
            cart = [];
            currentSuspendedId = null;
            renderCart();
        }
    });

    // Suspend Logic
    document.getElementById("btn-suspend-sale").addEventListener("click", suspendCurrentTransaction);
    document.getElementById("btn-view-suspended").addEventListener("click", openSuspendedModal);
    document.getElementById("btn-close-suspended").addEventListener("click", closeSuspendedModal);
    document.getElementById("btn-cancel-suspended").addEventListener("click", closeSuspendedModal);
    document.getElementById("btn-refresh-suspended").addEventListener("click", openSuspendedModal);

    // History Logic
    document.getElementById("btn-pos-history").addEventListener("click", openHistoryModal);
    document.getElementById("btn-close-history").addEventListener("click", () => document.getElementById("modal-pos-history").classList.add("hidden"));
    
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
        const filtered = term ? allCustomers.filter(c => 
            (c.name || "").toLowerCase().includes(term) || 
            (c.phone || "").includes(term)
        ) : allCustomers;
        renderCustomerDropdown(filtered);
    });

    custInput.addEventListener("focus", () => {
        if (activeCartIndex !== null) {
            activeCartIndex = null;
            renderCart();
        }
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
        if (activeCartIndex !== null) return;

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
        const filtered = allCustomers.filter(c => 
            (c.name || "").toLowerCase().includes(term) || 
            (c.phone || "").includes(term)
        );
        renderCustomerDropdown(filtered);
    });

    btnResetCust.addEventListener("click", () => {
        selectCustomer({ id: "Guest", name: "Guest" });
        custInput.value = "";
        custResults.classList.add("hidden");
    });

    const openCloseShiftModal = async () => {
        const modal = document.getElementById("modal-close-shift");
        const grid = document.getElementById("cash-counter-grid");
        const receiptsList = document.getElementById("shift-receipts-list");
        const denoms = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.01];
        const labels = ["1000", "500", "200", "100", "50", "20", "10", "5", "1", "Cents"];
        
        receiptsList.innerHTML = ""; // Clear receipts
        document.getElementById("precounted-bills").value = "";
        document.getElementById("precounted-coins").value = "";
        
        // Fetch active shift for remittance total
        let totalRemittance = 0;
        try {
            const user = JSON.parse(localStorage.getItem('pos_user'));
            if (user) {
                const shifts = await Repository.getAll('shifts');
                const activeShift = shifts.find(s => s.user_id === user.email && s.status === 'open');
                if (activeShift && activeShift.remittances) {
                    totalRemittance = activeShift.remittances.reduce((sum, r) => sum + (r.amount || 0), 0);
                }
            }
        } catch (e) { console.error(e); }

        const cashoutInput = document.getElementById("shift-cashout");
        cashoutInput.value = totalRemittance.toFixed(2);
        cashoutInput.readOnly = true;
        cashoutInput.classList.add("bg-gray-100", "cursor-not-allowed");
        
        grid.innerHTML = denoms.map((d, i) => `
            <div class="grid grid-cols-3 gap-4 items-center py-2 border-b border-gray-200 last:border-0 hover:bg-white transition px-2 rounded">
                <label class="text-sm font-bold text-gray-600">${labels[i]}</label>
                <input type="number" min="0" step="1" 
                    class="w-full border rounded p-2 text-sm text-center denom-input focus:ring-2 focus:ring-blue-500 outline-none font-mono" 
                    data-denom="${d}" 
                    value=""
                    placeholder="0"
                    ${i === 0 ? 'id="first-denom-input"' : ''}>
                <div class="text-right text-sm font-mono text-gray-800 font-bold denom-subtotal">₱0.00</div>
            </div>
        `).join('');

        const updateTotals = () => {
            let cashTotal = 0;
            grid.querySelectorAll(".denom-input").forEach(input => {
                const denom = parseFloat(input.dataset.denom);
                const count = parseInt(input.value) || 0;
                const subtotal = denom * count;
                cashTotal += subtotal;
                input.nextElementSibling.textContent = `₱${subtotal.toFixed(2)}`;
            });

            const preBills = parseFloat(document.getElementById("precounted-bills").value) || 0;
            const preCoins = parseFloat(document.getElementById("precounted-coins").value) || 0;
            cashTotal += preBills + preCoins;

            document.getElementById("cash-counter-total").textContent = `₱${cashTotal.toFixed(2)}`;
            
            let receiptTotal = 0;
            receiptsList.querySelectorAll(".receipt-row").forEach(row => {
                const amt = parseFloat(row.querySelector(".receipt-amount").value) || 0;
                receiptTotal += amt;
            });

            const cashout = parseFloat(document.getElementById("shift-cashout").value) || 0;
            const grandTotal = cashTotal + receiptTotal + cashout;

            document.getElementById("shift-total-turnover").textContent = `₱${grandTotal.toFixed(2)}`;
            modal.dataset.cashTotal = cashTotal;
            modal.dataset.cashout = cashout;
            modal.dataset.grandTotal = grandTotal;
        };

        // Add Receipt Logic
        document.getElementById("btn-add-shift-receipt").onclick = () => {
            const row = document.createElement("div");
            row.className = "flex gap-2 receipt-row";
            row.innerHTML = `
                <input type="text" placeholder="Description" class="flex-1 border rounded p-1 text-xs receipt-desc outline-none focus:ring-1 focus:ring-blue-500">
                <input type="number" placeholder="Amount" class="w-24 border rounded p-1 text-xs text-right receipt-amount outline-none focus:ring-1 focus:ring-blue-500" step="0.01">
                <button class="text-red-500 hover:text-red-700 btn-remove-receipt">&times;</button>
            `;
            row.querySelector(".btn-remove-receipt").onclick = () => {
                row.remove();
                updateTotals();
            };
            row.querySelector(".receipt-amount").oninput = updateTotals;
            receiptsList.appendChild(row);
            row.querySelector(".receipt-desc").focus();
        };

        document.getElementById("precounted-bills").addEventListener("input", updateTotals);
        document.getElementById("precounted-coins").addEventListener("input", updateTotals);

        grid.querySelectorAll(".denom-input").forEach(input => {
            input.addEventListener("input", updateTotals);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    const next = input.closest('.flex').nextElementSibling?.querySelector('input');
                    if (next) next.focus();
                    else document.getElementById("btn-confirm-close-shift").focus();
                }
            });
        });

        modal.classList.remove("hidden");
        setTimeout(() => document.getElementById("first-denom-input")?.focus(), 100);
        updateTotals();
    };

    document.getElementById("btn-pos-close-shift").addEventListener("click", openCloseShiftModal);
    document.getElementById("btn-cancel-close-shift").addEventListener("click", () => {
        document.getElementById("modal-close-shift").classList.add("hidden");
    });
    document.getElementById("btn-cancel-close-shift-x")?.addEventListener("click", () => {
        document.getElementById("modal-close-shift").classList.add("hidden");
    });

    document.getElementById("btn-confirm-close-shift").addEventListener("click", async () => {
        const modal = document.getElementById("modal-close-shift");
        const cashTotal = parseFloat(modal.dataset.cashTotal) || 0;
        const cashout = parseFloat(modal.dataset.cashout) || 0;
        const grandTotal = parseFloat(modal.dataset.grandTotal) || 0;
        
        const receipts = [];
        modal.querySelectorAll(".receipt-row").forEach(row => {
            const desc = row.querySelector(".receipt-desc").value.trim();
            const amt = parseFloat(row.querySelector(".receipt-amount").value) || 0;
            if (desc && amt > 0) receipts.push({ description: desc, amount: amt });
        });

        const user = JSON.parse(localStorage.getItem('pos_user'));
        if (!user) return;

        try {
            const shifts = await Repository.getAll('shifts');
            const activeShift = shifts.find(s => s.user_id === user.email && s.status === 'open');
            if (activeShift) {
                activeShift.status = 'closed';
                activeShift.end_time = new Date().toISOString();
                activeShift.closing_cash = cashTotal;
                activeShift.cashout = cashout;
                activeShift.closing_receipts = receipts;
                activeShift.total_closing_amount = grandTotal;
                activeShift.precounted_bills = parseFloat(document.getElementById("precounted-bills").value) || 0;
                activeShift.precounted_coins = parseFloat(document.getElementById("precounted-coins").value) || 0;
                
                await Repository.upsert('shifts', activeShift);
                await SyncEngine.sync();
                
                modal.classList.add("hidden");

                if (confirm("Shift closed successfully. Would you like to print the closing report?")) {
                    printShiftReport(activeShift);
                }

                loadPosView();
            }
        } catch (error) {
            console.error("Error closing shift:", error);
            showToast("Failed to close shift.", true);
        }
    });

    async function printShiftReport(shift) {
        const settings = await getSystemSettings();
        const store = settings.store || { name: "LightPOS", data: "" };
        
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        
        const receiptsHtml = (shift.closing_receipts || []).map(r => `
            <tr>
                <td style="font-size: 10px;">${r.description}</td>
                <td style="text-align: right;">${r.amount.toFixed(2)}</td>
            </tr>
        `).join('');

        const reportHtml = `
            <html>
            <head>
                <title>Shift Closing Report</title>
                <style>
                    @page { margin: 0; }
                    body { 
                        width: 76mm; 
                        font-family: 'Courier New', Courier, monospace; 
                        font-size: 12px; 
                        padding: 5mm;
                        margin: 0;
                        color: #000;
                    }
                    .text-center { text-align: center; }
                    .text-right { text-align: right; }
                    .bold { font-weight: bold; }
                    .hr { border-bottom: 1px dashed #000; margin: 5px 0; }
                    table { width: 100%; border-collapse: collapse; }
                </style>
            </head>
            <body onload="window.print(); window.close();">
                <div class="text-center">
                    <div class="bold" style="font-size: 16px;">SHIFT CLOSING REPORT</div>
                    <div class="bold">${store.name}</div>
                </div>
                <div class="hr"></div>
                <div style="font-size: 10px;">
                    User: ${shift.user_id}<br>
                    Opened: ${new Date(shift.start_time).toLocaleString()}<br>
                    Closed: ${new Date(shift.end_time).toLocaleString()}
                </div>
                <div class="hr"></div>
                <table>
                    <tr><td>Opening Cash</td><td class="text-right">₱${(shift.opening_cash || 0).toFixed(2)}</td></tr>
                    <tr><td>Expected Cash</td><td class="text-right">₱${(shift.expected_cash || 0).toFixed(2)}</td></tr>
                    <tr class="bold"><td>Physical Cash</td><td class="text-right">₱${(shift.closing_cash || 0).toFixed(2)}</td></tr>
                    ${shift.precounted_bills ? `
                        <tr><td style="font-size: 10px; padding-left: 10px;">- Precounted Bills</td><td class="text-right" style="font-size: 10px;">₱${shift.precounted_bills.toFixed(2)}</td></tr>
                    ` : ''}
                    ${shift.precounted_coins ? `
                        <tr><td style="font-size: 10px; padding-left: 10px;">- Precounted Coins</td><td class="text-right" style="font-size: 10px;">₱${shift.precounted_coins.toFixed(2)}</td></tr>
                    ` : ''}
                    ${shift.cashout ? `
                        <tr><td>Cashout</td><td class="text-right">₱${shift.cashout.toFixed(2)}</td></tr>
                    ` : ''}
                </table>
                ${receiptsHtml ? `
                    <div class="hr"></div>
                    <div class="bold" style="font-size: 10px;">EXPENSE RECEIPTS</div>
                    <table>${receiptsHtml}</table>
                ` : ''}
                <div class="hr"></div>
                <table>
                    <tr class="bold" style="font-size: 14px;">
                        <td>TOTAL TURNOVER</td>
                        <td class="text-right">₱${(shift.total_closing_amount || shift.closing_cash || 0).toFixed(2)}</td>
                    </tr>
                    <tr class="bold">
                        <td>VARIANCE</td>
                        <td class="text-right">₱${((shift.total_closing_amount || shift.closing_cash || 0) - (shift.expected_cash || 0)).toFixed(2)}</td>
                    </tr>
                </table>
                <div class="hr" style="margin-top: 20px;"></div>
                <div class="text-center" style="font-size: 10px; margin-top: 10px;">
                    End of Report
                </div>
            </body>
            </html>
        `;
        printWindow.document.write(reportHtml);
        printWindow.document.close();
    }

    // Checkout Logic
    document.getElementById("btn-checkout").addEventListener("click", openCheckout);
    document.getElementById("btn-cancel-checkout").addEventListener("click", closeCheckout);
    
    const selectPayment = document.getElementById("select-payment-method");
    selectPayment.addEventListener("change", (e) => {
        const method = e.target.value;
        const tenderedContainer = document.getElementById("tendered-container");
        const btnConfirm = document.getElementById("btn-confirm-pay");
        const total = parseFloat(document.getElementById("modal-checkout").dataset.total) || 0;

        if (method === "Points") {
            tenderedContainer.classList.add("hidden");
            const points = selectedCustomer.loyalty_points || 0;
            btnConfirm.disabled = points < total;
            if (points < total) {
                showToast("Insufficient loyalty points.", true);
            }
        } else {
            tenderedContainer.classList.remove("hidden");
            const tendered = parseFloat(document.getElementById("input-tendered").value) || 0;
            btnConfirm.disabled = tendered < total;
        }
    });

    const inputTendered = document.getElementById("input-tendered");
    inputTendered.addEventListener("input", (e) => {
        const tendered = parseFloat(e.target.value) || 0;
        const total = parseFloat(document.getElementById("modal-checkout").dataset.total) || 0;
        const change = tendered - total;
        const btnConfirm = document.getElementById("btn-confirm-pay");
        
        if (change >= 0) {
            btnConfirm.disabled = false;
        } else {
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
    initResizer();

    const gridColsSelect = document.getElementById("pos-grid-cols");
    gridColsSelect.addEventListener("change", (e) => {
        const cols = e.target.value;
        localStorage.setItem('pos_grid_cols', cols);
        updateGridColumns(cols);
    });
    
    const compactToggle = document.getElementById("pos-compact-mode");
    compactToggle.addEventListener("change", (e) => {
        localStorage.setItem('pos_compact_mode', e.target.checked);
        fetchItemsFromDexie(); // Re-render grid
    });

    updateGridColumns(savedCols);
}

function initResizer() {
    const resizer = document.getElementById('pos-resizer');
    if (!resizer) return;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.classList.add('select-none');
    });
}

function updateGridColumns(cols) {
    const grid = document.getElementById("pos-grid");
    if (!grid) return;
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}

async function fetchItemsFromDexie() {
    try {
        allItems = await Repository.getAll('items');
        // Rebuild barcode map for O(1) lookup
        barcodeMap.clear();
        allItems.forEach(item => {
            if (item.barcode) barcodeMap.set(item.barcode, item);
        });
        renderGrid(allItems);
    } catch (error) {
        console.error("Error loading items from Dexie:", error);
        document.getElementById("pos-grid").innerHTML = `<div class="col-span-full text-center text-red-500">Error loading local database. Please ensure sync is active.</div>`;
    }
}

async function fetchCustomersFromDexie() {
    try {
        allCustomers = await Repository.getAll('customers');
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
    const fragment = document.createDocumentFragment();
    grid.innerHTML = "";

    if (items.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 mt-10">No items found.</div>`;
        return;
    }

    // Limit rendering to top 100 items to maintain performance during rapid searches/scans
    const itemsToRender = items.slice(0, 100);
    const isCompact = localStorage.getItem('pos_compact_mode') === 'true';

    itemsToRender.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = isCompact 
            ? "bg-white border rounded p-1.5 shadow-sm hover:shadow-md cursor-pointer transition duration-150 flex flex-col justify-between h-16 hover:border-blue-400 active:bg-blue-50 select-none relative overflow-hidden group focus:outline-none focus:ring-1 focus:ring-blue-500"
            : "bg-white border rounded-lg p-3 shadow-sm hover:shadow-md cursor-pointer transition duration-150 flex flex-col justify-between h-24 hover:border-blue-400 active:bg-blue-50 select-none relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500";
        card.setAttribute("tabindex", "0");
        
        // Stock Indicator Color
        let stockColor = 'text-green-600';
        if (item.stock_level <= 0) {
            stockColor = 'text-red-600';
        } else if (item.stock_level <= (item.min_stock || 10)) {
            stockColor = 'text-yellow-600';
        }
        
        const titleClass = isCompact ? "font-bold text-gray-800 leading-tight line-clamp-1 text-[11px]" : "font-bold text-gray-800 leading-tight line-clamp-2 text-sm mb-1";
        const barcodeClass = isCompact ? "text-[9px] text-gray-400 font-mono" : "text-xs text-gray-400 font-mono";
        const footerClass = isCompact ? "flex justify-between items-center mt-1 border-t pt-1" : "flex justify-between items-end mt-2 border-t pt-2";
        const stockClass = isCompact ? "text-[9px] font-semibold" : "text-xs font-semibold";
        const priceClass = isCompact ? "font-bold text-blue-600 text-xs" : "font-bold text-blue-600";

        card.innerHTML = `
            <div>
                <div class="${titleClass}">${item.name || "Unnamed Item"}</div>
                <div class="${barcodeClass}">${item.barcode || "No Barcode"}</div>
            </div>
            <div class="${footerClass}">
                <div class="${stockClass} ${stockColor}">Stock: ${item.stock_level}</div>
                <div class="${priceClass}">₱${item.selling_price.toFixed(2)}</div>
            </div>
            <!-- Hover Effect Overlay -->
            <div class="absolute inset-0 bg-blue-600 bg-opacity-0 group-hover:bg-opacity-5 transition duration-150"></div>
        `;
        
        // Placeholder click
        card.addEventListener("click", async () => {
            await addToCart(item, 1);
            const searchInput = document.getElementById("pos-search");
            if (searchInput) {
                searchInput.value = "";
                filterItems("");
                searchInput.focus();
            }
        });

        card.addEventListener("keydown", async (e) => {
            if (activeCartIndex !== null) return;

            if (e.key === "Enter") {
                e.preventDefault();
                await addToCart(item, 1);
                const searchInput = document.getElementById("pos-search");
                if (searchInput) {
                    searchInput.value = "";
                    filterItems("");
                    searchInput.focus();
                }
            } else {
                handleGridNavigation(e, index, items.length);
            }
        });
        
        fragment.appendChild(card);
    });

    if (items.length > 100) {
        const moreInfo = document.createElement("div");
        moreInfo.className = "col-span-full text-center text-gray-400 text-xs py-4";
        moreInfo.textContent = `Showing 100 of ${items.length} items. Refine search to find more.`;
        fragment.appendChild(moreInfo);
    }

    requestAnimationFrame(() => {
        grid.appendChild(fragment);
    });
}

function filterItems(term) {
    term = term.toLowerCase();
    const terms = term.split(/\s+/).filter(t => t.length > 0);
    const filtered = allItems.filter(i => {
        const name = (i.name || "").toLowerCase();
        const barcode = (i.barcode || "").toLowerCase();
        return terms.every(t => name.includes(t) || barcode.includes(t));
    });
    renderGrid(filtered);
}

function handleGridNavigation(e, index, totalItems) {
    const cols = parseInt(localStorage.getItem('pos_grid_cols') || '3');
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
    playBeep(880, 0.1); // Good beep
    showToast(`Added ${item.name} to cart`);
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
            await Promise.all([Repository.upsert('items', parent), Repository.upsert('items', item)]);
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
    
    if (!cartContainer) return;
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
        const row = document.createElement("div");
        const isHighlighted = index === activeCartIndex;
        const displayQty = isHighlighted ? qtyBuffer : item.qty;
        const itemTotal = item.selling_price * (isHighlighted && qtyBuffer !== "" ? parseInt(qtyBuffer) || 0 : item.qty);
        
        total += itemTotal;

        row.className = `flex justify-between items-center bg-white p-2 rounded shadow-sm text-sm border-2 transition-all ${isHighlighted ? 'border-blue-500 bg-blue-50 scale-[1.02] z-10' : 'border-transparent'}`;
        row.innerHTML = ` 
            <div class="flex-1 overflow-hidden mr-2">
                <div class="font-bold truncate text-gray-800">${item.name}</div>
                <div class="text-gray-500 text-xs">₱${item.selling_price.toFixed(2)} x ${displayQty}</div>
            </div>
            <div class="flex items-center gap-2">
                <div class="font-bold text-blue-600 mr-2">₱${itemTotal.toFixed(2)}</div>
                <input type="number" min="1" class="w-16 border rounded text-center text-sm py-1 cart-qty-input" data-index="${index}" value="${displayQty}">
                <button class="text-red-400 hover:text-red-600 ml-1 btn-remove p-1" data-index="${index}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        `;
        
        const qtyInput = row.querySelector(".cart-qty-input");
        qtyInput.addEventListener("change", (e) => {
            updateQty(index, parseInt(e.target.value));
            const searchInput = document.getElementById("pos-search");
            if (searchInput) {
                searchInput.value = "";
                searchInput.focus();
            }
        });
        
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
        
        // Ensure highlighted item is visible
        if (isHighlighted) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    totalEl.textContent = `₱${total.toFixed(2)}`;
    btnCheckout.disabled = false;
}

function showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `${isError ? 'bg-red-600' : 'bg-green-600'} text-white px-4 py-2 rounded shadow-lg text-sm transition-all duration-300 opacity-0 transform translate-y-2`;
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
    const btnConfirm = document.getElementById("btn-confirm-pay");
    const pointsInfo = document.getElementById("customer-points-info");
    const pointsDisplay = document.getElementById("available-points-display");
    const selectPayment = document.getElementById("select-payment-method");

    modal.dataset.total = total;
    totalEl.textContent = `₱${total.toFixed(2)}`;
    inputTendered.value = "";
    btnConfirm.disabled = true;
    selectPayment.value = "Cash";
    document.getElementById("tendered-container").classList.remove("hidden");

    if (selectedCustomer.id !== "Guest") {
        pointsInfo.classList.remove("hidden");
        pointsDisplay.textContent = (selectedCustomer.loyalty_points || 0).toLocaleString();
    } else {
        pointsInfo.classList.add("hidden");
    }

    modal.classList.remove("hidden");
    setTimeout(() => inputTendered.focus(), 100);
}

function closeCheckout() {
    document.getElementById("modal-checkout").classList.add("hidden");
}

async function processTransaction() {
    const btnConfirm = document.getElementById("btn-confirm-pay");
    const inputTendered = document.getElementById("input-tendered");
    const paymentMethod = document.getElementById("select-payment-method").value;

    // Prevent double submission
    if (btnConfirm.hasAttribute("data-processing")) return;
    
    btnConfirm.setAttribute("data-processing", "true");
    btnConfirm.disabled = true;
    inputTendered.disabled = true;
    const originalText = btnConfirm.textContent;
    btnConfirm.textContent = "Processing...";

    const settings = await getSystemSettings();
    const total = parseFloat(document.getElementById("modal-checkout").dataset.total);
    const tendered = paymentMethod === "Points" ? total : (parseFloat(inputTendered.value) || 0);

    if (paymentMethod !== "Points" && tendered < total) {
        showToast("Amount tendered is insufficient.", true);
        btnConfirm.removeAttribute("data-processing");
        btnConfirm.disabled = false;
        inputTendered.disabled = false;
        btnConfirm.textContent = originalText;
        return;
    }

    const user = JSON.parse(localStorage.getItem('pos_user'));
    const taxRate = (settings.tax?.rate || 0) / 100;
    const taxAmount = total - (total / (1 + taxRate));

    const rewardRatio = settings.rewards?.ratio || 100;
    const pointsEarned = Math.floor(total / rewardRatio);
    
    const transaction = {
        id: generateUUID(),
        items: JSON.parse(JSON.stringify(cart)), // Deep copy
        total_amount: total,
        amount_tendered: tendered,
        change: tendered - total,
        tax_amount: taxAmount,
        payment_method: paymentMethod,
        user_email: user ? user.email : "Guest",
        user_name: user ? user.name : "Guest",
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        points_earned: pointsEarned,
        timestamp: new Date().toISOString(),
        is_voided: false
    };

    try {
        // 1. Save to Dexie (Offline First)
        await Repository.upsert('transactions', transaction);

        // 2. Update Local Dexie Items
        for (const item of transaction.items) {
            const current = await Repository.get('items', item.id);
            if (current) {
                await Repository.upsert('items', { ...current, stock_level: current.stock_level - item.qty });
                
                // Record Stock Movement
                await Repository.upsert('stock_movements', {
                    id: generateUUID(),
                    item_id: item.id,
                    item_name: item.name,
                    timestamp: transaction.timestamp,
                    type: 'Sale',
                    qty: -item.qty,
                    user: transaction.user_email,
                    transaction_id: transaction.id,
                    reason: "POS Sale"
                });
            }
        }

        // 3. Update Customer Points
        if (selectedCustomer.id !== "Guest") {
            const updatedCustomer = { ...selectedCustomer };
            updatedCustomer.loyalty_points = (updatedCustomer.loyalty_points || 0) + pointsEarned;
            if (paymentMethod === "Points") updatedCustomer.loyalty_points -= total;
            await Repository.upsert('customers', updatedCustomer);
        }

        // 4. Trigger Background Sync
        SyncEngine.sync();

        lastTransactionData = transaction;
        cart = [];
        currentSuspendedId = null;
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
        
        if (settings.pos?.auto_print) {
            printReceipt(lastTransactionData);
        }
        
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

async function openHistoryModal() {
    const modal = document.getElementById("modal-pos-history");
    const tbody = document.getElementById("pos-history-body");
    modal.classList.remove("hidden");
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center">Loading...</td></tr>`;

    try {
        const allTxs = await Repository.getAll('transactions');
        const txs = allTxs
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);
        tbody.innerHTML = txs.map(tx => `
            <tr class="border-b ${tx.is_voided ? 'bg-red-50 opacity-60' : ''}">
                <td class="p-2 text-xs">${new Date(tx.timestamp).toLocaleString()}</td>
                <td class="p-2 text-xs">${tx.customer_name}</td>
                <td class="p-2 text-right font-bold">₱${tx.total_amount.toFixed(2)}</td>
                <td class="p-2 text-center flex justify-center gap-2">
                    <button class="bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-1 rounded text-xs font-bold btn-print-tx" data-id="${tx.id}">Print</button>
                    ${tx.is_voided 
                        ? '<span class="text-red-600 font-bold text-xs uppercase">Voided</span>' 
                        : `<button class="bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded text-xs font-bold btn-void-tx" data-id="${tx.id}">Void</button>`
                    }
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll(".btn-void-tx").forEach(btn => {
            btn.addEventListener("click", () => voidTransaction(btn.dataset.id));
        });
        tbody.querySelectorAll(".btn-print-tx").forEach(btn => {
            btn.addEventListener("click", async () => {
                const tx = txs.find(t => t.id === btn.dataset.id);
                if (tx) await printReceipt(tx, true);
            });
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Error loading history.</td></tr>`;
    }
}

async function voidTransaction(id) {
    if (!checkPermission("pos", "write")) {
        showToast("Permission denied.", true);
        return;
    }

    if (!confirm("Are you sure you want to VOID this transaction? This will reverse stock levels.")) return;

    if (!(await requestManagerApproval())) return;

    const reason = prompt("Please enter the reason for voiding this transaction:");
    if (reason === null) return; // User cancelled

    try {
        const tx = await Repository.get('transactions', id);
        if (!tx) return;

        const user = JSON.parse(localStorage.getItem('pos_user'));

        // 1. Update Dexie Transaction
        await Repository.upsert('transactions', { 
            ...tx,
            is_voided: true, 
            voided_at: new Date().toISOString(),
            voided_by: user ? user.email : "System",
            void_reason: reason || "No reason provided"
        });

        // 2. Reverse Stock in Dexie
        for (const item of tx.items) {
            const current = await Repository.get('items', item.id);
            if (current) {
                await Repository.upsert('items', { ...current, stock_level: current.stock_level + item.qty });
            }
        }

        // 3. Trigger Background Sync
        SyncEngine.sync();

        showToast("Transaction voided and stock reversed.");
        await addNotification('Void', `Transaction ${id} was voided by ${user ? user.email : "System"}`);
        openHistoryModal(); // Refresh list
        fetchItemsFromDexie(); // Refresh grid
    } catch (error) {
        console.error("Void error:", error);
        showToast("Failed to void transaction.", true);
    }
}

async function suspendCurrentTransaction() {
    if (cart.length === 0) {
        showToast("Cart is empty.", true);
        return;
    }

    const user = JSON.parse(localStorage.getItem('pos_user'));
    const suspendedTx = {
        id: currentSuspendedId || generateUUID(),
        items: JSON.parse(JSON.stringify(cart)),
        customer: selectedCustomer,
        user_email: user ? user.email : "Guest",
        timestamp: new Date(),
        total: cart.reduce((sum, item) => sum + (item.selling_price * item.qty), 0),
    };

    try {
        // 1. Save locally first (Persistence across refreshes)
        await Repository.upsert('suspended_transactions', suspendedTx);
        
        cart = [];
        currentSuspendedId = null;
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
    container.innerHTML = `<div class="text-center p-4">Loading...</div>`;
    document.getElementById("modal-suspended").classList.remove("hidden");

    try {
        const suspended = await Repository.getAll('suspended_transactions');
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
                        <th class="text-left p-2">Cashier</th>
                        <th class="text-right p-2">Total</th>
                        <th class="text-center p-2">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${suspended.map(tx => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-2 text-xs">${new Date(tx.timestamp).toLocaleString()}</td>
                            <td class="p-2 font-medium">${tx.customer?.name || 'Guest'}</td>
                            <td class="p-2 text-[10px] text-gray-500">${tx.user_email || 'Unknown'}</td>
                            <td class="p-2 text-right font-bold">₱${tx.total.toFixed(2)}</td>
                            <td class="p-2 text-center flex justify-center gap-2">
                                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded btn-resume-suspended" data-id="${tx.id}">Resume</button>
                                <button class="bg-red-100 text-red-600 hover:bg-red-200 text-xs px-2 py-1 rounded btn-delete-suspended" data-id="${tx.id}">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.querySelectorAll(".btn-resume-suspended").forEach(btn => {
            btn.addEventListener("click", () => resumeTransaction(btn.dataset.id));
        });
        container.querySelectorAll(".btn-delete-suspended").forEach(btn => {
            btn.addEventListener("click", () => deleteSuspendedTransaction(btn.dataset.id));
        });
        document.getElementById("btn-delete-all-suspended").addEventListener("click", deleteAllSuspendedTransactions);
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
        let tx = await Repository.get('suspended_transactions', id);

        if (tx) {
            cart = tx.items;
            selectedCustomer = tx.customer || { id: "Guest", name: "Guest" };
            currentSuspendedId = id;
            await Repository.remove('suspended_transactions', id);
            
            renderCart();
            selectCustomer(selectedCustomer);
            closeSuspendedModal();
            showToast("Transaction resumed.");
            updateSuspendedCount();
        } else {
            showToast("Could not find transaction record.", true);
        }
    } catch (error) {
        console.error("Error resuming transaction:", error);
        showToast("Failed to resume transaction.", true);
    }
}

async function deleteSuspendedTransaction(id) {
    if (!confirm("Are you sure you want to permanently delete this suspended transaction?")) return;

    try {
        await Repository.remove('suspended_transactions', id);
        
        showToast("Transaction deleted.");
        openSuspendedModal(); // Refresh list
        updateSuspendedCount();
    } catch (error) {
        console.error("Error deleting suspended transaction:", error);
        showToast("Failed to delete transaction.", true);
    }
}

async function deleteAllSuspendedTransactions() {
    if (!confirm("Are you sure you want to delete ALL suspended transactions?")) return;

    try {
        const suspended = await Repository.getAll('suspended_transactions');
        await Promise.all(suspended.map(tx => Repository.remove('suspended_transactions', tx.id)));
        showToast("All suspended transactions deleted.");
        openSuspendedModal();
        updateSuspendedCount();
    } catch (error) {
        console.error("Error deleting all suspended transactions:", error);
        showToast("Failed to delete transactions.", true);
    }
}

async function updateSuspendedCount() {
    const count = (await Repository.getAll('suspended_transactions')).length;
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


async function requestQuickCustomer(tx) {
    return new Promise((resolve) => {
        const modal = document.getElementById("modal-quick-customer");
        const nameInput = document.getElementById("quick-cust-name");
        const resultsDiv = document.getElementById("quick-cust-results");
        const phoneInput = document.getElementById("quick-cust-phone");
        const btnSave = document.getElementById("btn-save-quick-customer");
        const btnCancel = document.getElementById("btn-cancel-quick-customer");
        let selectedId = null;

        if (!modal) {
            resolve(tx);
            return;
        }

        // Pre-populate if already assigned
        nameInput.value = tx.customer_id !== "Guest" ? tx.customer_name : "";
        phoneInput.value = "";
        selectedId = tx.customer_id !== "Guest" ? tx.customer_id : null;

        resultsDiv.innerHTML = "";
        resultsDiv.classList.add("hidden");
        modal.classList.remove("hidden");
        nameInput.focus();

        const cleanup = () => {
            modal.classList.add("hidden");
            btnSave.onclick = null;
            btnCancel.onclick = null;
            nameInput.oninput = null;
            nameInput.onkeydown = null;
            phoneInput.onkeydown = null;
        };

        btnCancel.onclick = () => {
            cleanup();
            resolve(null);
        };

        const updateTxAndResolve = async (customer) => {
            // 1. Update Local Dexie
            await Repository.upsert('transactions', {
                ...tx,
                customer_id: customer.id,
                customer_name: customer.name
            });
            
            tx.customer_id = customer.id;
            tx.customer_name = customer.name;

            cleanup();
            resolve(tx);
        };

        nameInput.onkeydown = (e) => {
            if (e.key === "ArrowDown") {
                const first = resultsDiv.querySelector("div[tabindex='0']");
                if (first) {
                    e.preventDefault();
                    first.focus();
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                phoneInput.focus();
            }
        };

        phoneInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                btnSave.click();
            }
        };

        nameInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            selectedId = null; // Reset if user types
            if (!term) {
                resultsDiv.classList.add("hidden");
                return;
            }
            const filtered = allCustomers.filter(c => 
                (c.name || "").toLowerCase().includes(term) || 
                (c.phone || "").includes(term)
            );
            resultsDiv.innerHTML = "";
            if (filtered.length > 0) {
                resultsDiv.classList.remove("hidden");
                filtered.slice(0, 5).forEach(c => {
                    const div = document.createElement("div");
                    div.className = "p-2 hover:bg-blue-50 cursor-pointer text-xs border-b last:border-0 focus:bg-blue-100 focus:outline-none";
                    div.setAttribute("tabindex", "0");
                    div.innerHTML = `<strong>${c.name}</strong> - ${c.phone}`;
                    
                    const selectAction = () => {
                        nameInput.value = c.name;
                        phoneInput.value = c.phone;
                        selectedId = c.id;
                        resultsDiv.classList.add("hidden");
                        phoneInput.focus();
                    };

                    div.onclick = selectAction;
                    div.onkeydown = (e) => {
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
                            else nameInput.focus();
                        }
                    };
                    resultsDiv.appendChild(div);
                });
            } else {
                resultsDiv.innerHTML = `<div class="p-2 text-xs text-gray-500">No matches</div>`;
                resultsDiv.classList.remove("hidden");
            }
        };

        btnSave.onclick = async () => {
            const name = nameInput.value.trim();
            const phone = phoneInput.value.trim();
            if (!name || !phone) {
                alert("Please enter both name and phone number or select an existing customer.");
                return;
            }

            // If they didn't change anything and it was already assigned, just proceed
            if (selectedId && name === tx.customer_name && tx.customer_id !== "Guest") {
                cleanup();
                resolve(tx);
                return;
            }

            if (selectedId) {
                await updateTxAndResolve({ id: selectedId, name });
                return;
            }

            try {
                const newCustomer = { id: generateUUID(), name, phone, email: "", loyalty_points: 0, timestamp: new Date() };
                await Repository.upsert('customers', newCustomer);
                fetchCustomersFromDexie();
                await updateTxAndResolve(newCustomer);
            } catch (error) {
                console.error("Error saving quick customer:", error);
                alert("Failed to save customer info.");
            }
        };
    });
}

async function printReceipt(tx, isReprint = false) {
    // Request customer info only if it's a Guest transaction
    if (tx.customer_id === "Guest") {
        const result = await requestQuickCustomer(tx);
        if (result) {
            tx = result;
        } else if (!isReprint) {
            // If it's the initial print and they cancel, abort the print
            return;
        }
    }
    const settings = await getSystemSettings();
    const store = settings.store || { name: "LightPOS", data: "" };
    const defaultPrint = {
        paper_width: 76, 
        show_dividers: true,
        header: { text: "", font_size: 14, font_family: "'Courier New', Courier, monospace", bold: true, italic: false },
        items: { font_size: 12, font_family: "'Courier New', Courier, monospace", bold: false, italic: false },
        body: { font_size: 12, font_family: "'Courier New', Courier, monospace", bold: false, italic: false },
        footer: { text: "Thank you for shopping!", font_size: 10, font_family: "'Courier New', Courier, monospace", bold: false, italic: true }
    };

    const p = {
        ...defaultPrint,
        ...(settings.print || {}),
        header: { ...defaultPrint.header, ...(settings.print?.header || {}) },
        items: { ...defaultPrint.items, ...(settings.print?.items || {}) },
        body: { ...defaultPrint.body, ...(settings.print?.body || {}) },
        footer: { ...defaultPrint.footer, ...(settings.print?.footer || {}) }
    };
    
    const pWidth = p.paper_width || 76;
    const showHR = p.show_dividers !== false;

    const getStyle = (s) => `
        font-size: ${s.font_size}px; 
        font-family: ${s.font_family}; 
        font-weight: ${s.bold ? 'bold' : 'normal'}; 
        font-style: ${s.italic ? 'italic' : 'normal'};
    `;

    const headerText = p.header?.text || `${store.name}\n${store.data}`;
    const footerText = p.footer?.text || "Thank you for shopping!";
    
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    const itemsStyle = p.items ? getStyle(p.items) : getStyle(p.body);
    const itemsHtml = tx.items.map(item => `
        <tr style="${itemsStyle}">
            <td colspan="2" style="padding-top: 5px;">${item.name}</td>
        </tr>
        <tr style="${itemsStyle}">
            <td style="font-size: 0.9em; opacity: 0.8;">${item.qty} x ${item.selling_price.toFixed(2)}</td>
            <td style="text-align: right;">${(item.qty * item.selling_price).toFixed(2)}</td>
        </tr>
    `).join('');

    const receiptHtml = `
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                @page { margin: 0; }
                body { 
                    width: ${pWidth}mm;
                    ${getStyle(p.body)}
                    padding: 5mm;
                    margin: 0;
                    color: #000;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .bold { font-weight: bold; }
                .hr { border-bottom: 1px dashed #000; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; }
                .header-sec { ${getStyle(p.header)} }
                .body-sec { ${getStyle(p.body)} }
                .footer-sec { margin-top: 20px; ${getStyle(p.footer)} }
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 40px;
                    color: rgba(0, 0, 0, 0.1);
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: -1;
                    font-weight: bold;
                }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${isReprint ? '<div class="watermark">REPRINT</div>' : ''}
            <div class="text-center header-sec">
                ${store.logo ? `<img src="${store.logo}" style="max-width: 40mm; max-height: 20mm; margin-bottom: 5px; filter: grayscale(1);"><br>` : ''}
                <div style="white-space: pre-wrap;">${headerText}</div>
            </div>
            ${showHR ? '<div class="hr"></div>' : ''}
            <div class="body-sec">
                Date: ${new Date(tx.timestamp).toLocaleString()}<br>
                Trans: #${tx.id.slice(-6)}<br>
                Cashier: ${tx.user_name || tx.user_email}<br>
                Customer: ${tx.customer_name}
            </div>
            ${showHR ? '<div class="hr"></div>' : ''}
            <table>
                ${itemsHtml}
            </table>
            ${showHR ? '<div class="hr"></div>' : ''}
            <table>
                <tr><td class="bold">TOTAL</td><td class="text-right bold">₱${tx.total_amount.toFixed(2)}</td></tr>
                <tr><td>Payment (${tx.payment_method})</td><td class="text-right">₱${tx.amount_tendered.toFixed(2)}</td></tr>
                <tr><td>Change</td><td class="text-right">₱${tx.change.toFixed(2)}</td></tr>
            </table>
            <div class="footer-sec text-center">
                <div style="white-space: pre-wrap;">${footerText}</div>
            </div>
        </body>
        </html>
    `;
    printWindow.document.write(receiptHtml);
    printWindow.document.close();

    // Mark transaction as printed to handle watermark on manual reprints
    tx.was_printed = true;
}