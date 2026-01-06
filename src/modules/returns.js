import { checkPermission, requestManagerApproval } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { checkActiveShift, requireShift } from "./shift.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";

let selectedTransaction = null;
let returnedItems = [];
let exchangeItems = [];

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

export async function loadReturnsView() {
    const content = document.getElementById("main-content");
    content.innerHTML = ""; // Clear content while checking

    await checkActiveShift();

    requireShift(async () => {
        renderReturnsInterface(content);
    });
}

function renderReturnsInterface(content) {
    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Process Return</h2>
            
            <!-- Step A: Retrieval -->
            <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                <label class="block text-sm font-bold text-gray-700 mb-2">Find Original Transaction</label>
                <div class="flex gap-2">
                    <input type="text" id="return-search-id" placeholder="Enter Transaction ID or Customer Name..." 
                        class="flex-1 border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none">
                    <button id="btn-find-tx" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition">
                        Search
                    </button>
                </div>
                <div id="search-results" class="mt-4 hidden space-y-2"></div>
            </div>

            <!-- Step B: Selection & Details -->
            <div id="return-details-container" class="hidden grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Left: Original Transaction Items -->
                <div class="bg-white p-6 rounded-lg shadow-md border-t-4 border-blue-500">
                    <div class="mb-4">
                        <h3 class="font-bold text-lg text-gray-800" id="display-tx-id"></h3>
                        <p class="text-sm text-gray-500" id="display-tx-date"></p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr class="text-left text-gray-500 uppercase text-[10px] font-bold">
                                    <th class="p-2">Item</th>
                                    <th class="p-2 text-center">Qty</th>
                                    <th class="p-2 text-right">Price</th>
                                    <th class="p-2 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody id="original-items-body" class="divide-y"></tbody>
                        </table>
                    </div>
                </div>

                <!-- Right: Exchange Cart -->
                <div class="bg-white p-6 rounded-lg shadow-md border-t-4 border-green-500 flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-lg text-gray-800">Exchange Cart</h3>
                        <div class="relative">
                            <input type="text" id="exchange-barcode-input" placeholder="Scan barcode for exchange..." 
                                class="border rounded p-2 text-sm w-64 focus:ring-2 focus:ring-green-500 outline-none">
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto min-h-[300px] mb-6">
                        <!-- Returned Items Section -->
                        <div class="mb-4">
                            <h4 class="text-[10px] font-bold text-red-500 uppercase mb-2">Items to Return</h4>
                            <div id="cart-returned-list" class="space-y-2"></div>
                        </div>
                        <!-- New Items Section -->
                        <div>
                            <h4 class="text-[10px] font-bold text-green-600 uppercase mb-2">New Items (Exchange)</h4>
                            <div id="cart-exchange-list" class="space-y-2"></div>
                        </div>
                    </div>

                    <!-- Summary -->
                    <div class="border-t pt-4 space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Total Return Value:</span>
                            <span id="summary-return-total" class="font-bold text-red-600">₱0.00</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Total Exchange Value:</span>
                            <span id="summary-exchange-total" class="font-bold text-green-600">₱0.00</span>
                        </div>
                        <div class="flex justify-between items-center pt-2 border-t">
                            <span class="text-lg font-bold text-gray-800">Amount Due:</span>
                            <span id="summary-net-due" class="text-2xl font-bold text-blue-600">₱0.00</span>
                        </div>
                        <button id="btn-process-exchange" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg transition mt-4 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                            Complete Exchange
                        </button>
                        <p id="exchange-error-msg" class="text-[10px] text-red-500 text-center mt-2 hidden">Exchange value must be equal to or greater than return value.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById("btn-find-tx").addEventListener("click", findTransaction);
    document.getElementById("exchange-barcode-input")?.addEventListener("keydown", handleExchangeScan);
    document.getElementById("btn-process-exchange")?.addEventListener("click", processExchange);

    document.getElementById("return-search-id").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            findTransaction();
        }
    });
}

async function findTransaction() {
    const term = document.getElementById("return-search-id").value.trim();
    if (!term) return;

    const resultsDiv = document.getElementById("search-results");
    resultsDiv.innerHTML = "Searching...";
    resultsDiv.classList.remove("hidden");

    try {
        // Search by ID or Customer Name using Repository
        const allTxs = await Repository.getAll('transactions');
        const txs = allTxs
            .filter(t => t.id?.toString().includes(term) || t.customer_name?.toLowerCase().includes(term.toLowerCase()))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);

        if (txs.length === 0) {
            resultsDiv.innerHTML = `<p class="text-sm text-red-500 p-2">No transactions found.</p>`;
            return;
        }

        resultsDiv.innerHTML = txs.map(t => `
            <div class="p-3 border rounded hover:bg-blue-50 cursor-pointer transition flex justify-between items-center btn-select-tx" data-id="${t.id}">
                <div>
                    <div class="font-bold text-sm">#${t.id} - ${t.customer_name}</div>
                    <div class="text-xs text-gray-500">${new Date(t.timestamp).toLocaleString()}</div>
                </div>
                <div class="font-bold text-blue-600">₱${t.total_amount.toFixed(2)}</div>
            </div>
        `).join('');

        resultsDiv.querySelectorAll(".btn-select-tx").forEach(btn => {
            btn.addEventListener("click", () => displayTransaction(btn.dataset.id));
        });
    } catch (e) {
        console.error(e);
    }
}

async function displayTransaction(id) {
    const txId = isNaN(id) ? id : parseInt(id);
    selectedTransaction = await Repository.get('transactions', txId);
    if (!selectedTransaction || selectedTransaction.is_voided) {
        alert("Transaction not found or already voided.");
        return;
    }

    returnedItems = [];
    exchangeItems = [];

    document.getElementById("search-results").classList.add("hidden");
    document.getElementById("return-details-container").classList.remove("hidden");
    
    document.getElementById("display-tx-id").textContent = `Transaction #${selectedTransaction.id}`;
    document.getElementById("display-tx-date").textContent = new Date(selectedTransaction.timestamp).toLocaleString();

    renderOriginalItems();
    updateExchangeUI();
}

function renderOriginalItems() {
    const tbody = document.getElementById("original-items-body");
    tbody.innerHTML = selectedTransaction.items.map((item, idx) => {
        const returned = item.returned_qty || 0;
        const inCart = returnedItems.filter(ri => ri.originalIndex === idx).reduce((sum, ri) => sum + ri.qty, 0);
        const available = item.qty - returned - inCart;

        return `
            <tr>
                <td class="p-2 font-medium">${item.name}</td>
                <td class="p-2 text-center">${available}</td>
                <td class="p-2 text-right">₱${item.selling_price.toFixed(2)}</td>
                <td class="p-2 text-center">
                    ${available > 0 ? 
                        `<button class="text-blue-600 font-bold hover:underline btn-add-to-return" data-index="${idx}">Return</button>` : 
                        `<span class="text-gray-400 italic text-[10px]">N/A</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll(".btn-add-to-return").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            const item = selectedTransaction.items[idx];
            playBeep(880, 0.1); // Good beep
            returnedItems.push({ ...item, originalIndex: idx, qty: 1 });
            renderOriginalItems();
            updateExchangeUI();
        });
    });
}

async function handleExchangeScan(e) {
    if (e.key !== "Enter") return;
    const term = e.target.value.trim();
    if (!term) return;

    const items = await Repository.getAll('items');
    const item = items.find(i => i.barcode === term || i.name.toLowerCase().includes(term.toLowerCase()));

    if (item) {
        playBeep(880, 0.1); // Good beep
        exchangeItems.push({ ...item, qty: 1 });
        e.target.value = "";
        updateExchangeUI();
    } else {
        playBeep(220, 0.3, 'sawtooth'); // Bad beep
        alert("Item not found.");
    }
}

function updateExchangeUI() {
    const returnList = document.getElementById("cart-returned-list");
    const exchangeList = document.getElementById("cart-exchange-list");

    // Render Returned Items
    returnList.innerHTML = returnedItems.map((item, idx) => `
        <div class="flex justify-between items-center bg-red-50 p-2 rounded border border-red-100 text-xs">
            <div class="flex-1">
                <div class="font-bold">${item.name}</div>
                <div class="text-gray-500">₱${item.selling_price.toFixed(2)}</div>
            </div>
            <button class="text-red-500 font-bold px-2 btn-remove-return" data-index="${idx}">&times;</button>
        </div>
    `).join('');

    // Render Exchange Items
    exchangeList.innerHTML = exchangeItems.map((item, idx) => `
        <div class="flex justify-between items-center bg-green-50 p-2 rounded border border-green-100 text-xs">
            <div class="flex-1">
                <div class="font-bold">${item.name}</div>
                <div class="text-gray-500">₱${item.selling_price.toFixed(2)}</div>
            </div>
            <button class="text-green-600 font-bold px-2 btn-remove-exchange" data-index="${idx}">&times;</button>
        </div>
    `).join('');

    // Totals
    const returnTotal = returnedItems.reduce((sum, i) => sum + i.selling_price, 0);
    const exchangeTotal = exchangeItems.reduce((sum, i) => sum + i.selling_price, 0);
    const netDue = exchangeTotal - returnTotal;

    document.getElementById("summary-return-total").textContent = `₱${returnTotal.toFixed(2)}`;
    document.getElementById("summary-exchange-total").textContent = `₱${exchangeTotal.toFixed(2)}`;
    document.getElementById("summary-net-due").textContent = `₱${Math.max(0, netDue).toFixed(2)}`;

    const btnProcess = document.getElementById("btn-process-exchange");
    const errorMsg = document.getElementById("exchange-error-msg");

    const isValid = returnedItems.length > 0 && netDue >= 0;
    btnProcess.disabled = !isValid;
    if (returnedItems.length > 0 && netDue < 0) errorMsg.classList.remove("hidden");
    else errorMsg.classList.add("hidden");

    // Event Listeners for removal
    returnList.querySelectorAll(".btn-remove-return").forEach(btn => {
        btn.addEventListener("click", () => {
            returnedItems.splice(btn.dataset.index, 1);
            renderOriginalItems();
            updateExchangeUI();
        });
    });
    exchangeList.querySelectorAll(".btn-remove-exchange").forEach(btn => {
        btn.addEventListener("click", () => {
            exchangeItems.splice(btn.dataset.index, 1);
            updateExchangeUI();
        });
    });
}

async function processExchange() {
    if (!checkPermission("returns", "write")) return;
    if (!(await requestManagerApproval())) return;

    const user = JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown';
    const timestamp = new Date().toISOString();

    try {
        // 1. Update Original Transaction
        returnedItems.forEach(ri => {
            selectedTransaction.items[ri.originalIndex].returned_qty = (selectedTransaction.items[ri.originalIndex].returned_qty || 0) + ri.qty;
        });
        
        if (!selectedTransaction.exchanges) selectedTransaction.exchanges = [];
        selectedTransaction.exchanges.push({
            timestamp,
            processed_by: user,
            returned: returnedItems,
            taken: exchangeItems
        });

        await Repository.upsert('transactions', selectedTransaction);

        // 2. Update Inventory & Log Movements
        // Process Returns (Stock In)
        for (const ri of returnedItems) {
            const master = await Repository.get('items', ri.id);
            if (master) {
                master.stock_level += ri.qty;
                await Repository.upsert('items', master);
                await Repository.upsert('stock_movements', {
                    id: generateUUID(), item_id: ri.id, item_name: ri.name, timestamp,
                    type: 'Return', qty: ri.qty, user, transaction_id: selectedTransaction.id, reason: "Exchange Return"
                });
            }
        }

        // Process Exchanges (Stock Out)
        for (const ei of exchangeItems) {
            const master = await Repository.get('items', ei.id);
            if (master) {
                master.stock_level -= ei.qty;
                await Repository.upsert('items', master);
                await Repository.upsert('stock_movements', {
                    id: generateUUID(), item_id: ei.id, item_name: ei.name, timestamp,
                    type: 'Exchange', qty: -ei.qty, user, transaction_id: selectedTransaction.id, reason: "Exchange Taken"
                });
            }
        }

        SyncEngine.sync();
        await addNotification('Exchange', `Exchange processed for Tx #${selectedTransaction.id}. ${returnedItems.length} returned, ${exchangeItems.length} taken.`);
        
        alert("Exchange completed successfully.");
        loadReturnsView();
    } catch (e) {
        console.error(e);
        alert("Error processing exchange.");
    }
}