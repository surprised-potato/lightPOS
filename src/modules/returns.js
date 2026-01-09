import { checkPermission } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { checkActiveShift, requireShift } from "./shift.js";
import { dbRepository as Repository } from "../db.js";
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
                        <div class="relative w-64">
                            <input type="text" id="exchange-search-input" placeholder="Search item to exchange..." 
                                class="border rounded p-2 text-sm w-full focus:ring-2 focus:ring-green-500 outline-none" autocomplete="off">
                            <div id="exchange-search-results" class="hidden absolute z-50 w-full bg-white shadow-lg border rounded-b-md max-h-48 overflow-y-auto mt-1"></div>
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
    
    const searchInput = document.getElementById("exchange-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", handleExchangeSearch);
        document.addEventListener("click", (e) => {
            const resultsDiv = document.getElementById("exchange-search-results");
            if (resultsDiv && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
                resultsDiv.classList.add("hidden");
            }
        });
    }

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
            .filter(t => (t.id?.toString().includes(term) || t.customer_name?.toLowerCase().includes(term.toLowerCase())))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);

        if (txs.length === 0) {
            resultsDiv.innerHTML = `<p class="text-sm text-red-500 p-2">No transactions found.</p>`;
            return;
        }

        resultsDiv.innerHTML = txs.map(t => `
            <div class="p-3 border rounded hover:bg-blue-50 cursor-pointer transition flex justify-between items-center btn-select-tx ${t.is_voided ? 'opacity-60 bg-gray-50' : ''}" data-id="${t.id}">
                <div class="${t.is_voided ? 'line-through text-gray-500' : ''}">
                    <div class="font-bold text-sm">#${t.id} - ${t.customer_name} ${t.is_voided ? '(VOID)' : ''}</div>
                    <div class="text-xs text-gray-500">${new Date(t.timestamp).toLocaleString()}</div>
                </div>
                <div class="font-bold ${t.is_voided ? 'text-gray-400 line-through' : 'text-blue-600'}">₱${t.total_amount.toFixed(2)}</div>
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
            returnedItems.push({ ...item, originalIndex: idx, qty: 1, disposition: 'Restock' });
            renderOriginalItems();
            updateExchangeUI();
        });
    });
}

async function handleExchangeSearch(e) {
    const term = e.target.value.trim().toLowerCase();
    const resultsDiv = document.getElementById("exchange-search-results");
    
    if (!term) {
        resultsDiv.classList.add("hidden");
        return;
    }

    const items = await Repository.getAll('items');
    const filtered = items.filter(i => 
        (i.name || "").toLowerCase().includes(term) || 
        (i.barcode || "").toLowerCase().includes(term)
    ).slice(0, 5);

    resultsDiv.innerHTML = "";
    if (filtered.length > 0) {
        resultsDiv.classList.remove("hidden");
        filtered.forEach(item => {
            const div = document.createElement("div");
            div.className = "p-2 hover:bg-green-50 cursor-pointer text-xs border-b last:border-0";
            div.innerHTML = `
                <div class="font-bold">${item.name}</div>
                <div class="flex justify-between text-gray-500">
                    <span>${item.barcode}</span>
                    <span>₱${item.selling_price.toFixed(2)}</span>
                </div>
            `;
            div.addEventListener("click", () => {
                playBeep(880, 0.1);
                const existing = exchangeItems.find(i => i.id === item.id);
                if (existing) {
                    existing.qty = (existing.qty || 0) + 1;
                } else {
                    exchangeItems.push({ ...item, qty: 1 });
                }
                document.getElementById("exchange-search-input").value = "";
                resultsDiv.classList.add("hidden");
                updateExchangeUI();
            });
            resultsDiv.appendChild(div);
        });
    } else {
        resultsDiv.innerHTML = `<div class="p-2 text-xs text-gray-500 text-center">No items found</div>`;
        resultsDiv.classList.remove("hidden");
    }
}

function updateExchangeUI() {
    const returnList = document.getElementById("cart-returned-list");
    const exchangeList = document.getElementById("cart-exchange-list");

    // Render Returned Items
    returnList.innerHTML = returnedItems.map((item, idx) => `
        <div class="flex flex-col bg-red-50 p-2 rounded border border-red-100 text-xs gap-2">
            <div class="flex justify-between items-center">
                <div class="flex-1">
                    <div class="font-bold">${item.name}</div>
                    <div class="text-gray-500">₱${item.selling_price.toFixed(2)}</div>
                </div>
                <button class="text-red-500 font-bold px-2 btn-remove-return" data-index="${idx}">&times;</button>
            </div>
            <select class="w-full border rounded p-1 text-[10px] disposition-select focus:ring-1 focus:ring-red-500 outline-none" data-index="${idx}">
                <option value="Restock" ${item.disposition === 'Restock' ? 'selected' : ''}>Restock (Add to Inventory)</option>
                <option value="Defective" ${item.disposition === 'Defective' ? 'selected' : ''}>Defective (Discard)</option>
                <option value="Spoiled" ${item.disposition === 'Spoiled' ? 'selected' : ''}>Spoiled (Discard)</option>
                <option value="Expired" ${item.disposition === 'Expired' ? 'selected' : ''}>Expired (Discard)</option>
            </select>
        </div>
    `).join('');

    // Render Exchange Items
    exchangeList.innerHTML = exchangeItems.map((item, idx) => `
        <div class="flex justify-between items-center bg-green-50 p-2 rounded border border-green-100 text-xs">
            <div class="flex-1">
                <div class="font-bold">${item.name}</div>
                <div class="text-gray-500">₱${item.selling_price.toFixed(2)}</div>
            </div>
            <div class="flex items-center gap-2">
                <input type="number" min="1" class="w-12 border rounded text-center p-1 exchange-qty-input" data-index="${idx}" value="${item.qty}">
                <button class="text-green-600 font-bold px-2 btn-remove-exchange" data-index="${idx}">&times;</button>
            </div>
        </div>
    `).join('');

    // Totals
    const returnTotal = returnedItems.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
    const exchangeTotal = exchangeItems.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
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
    returnList.querySelectorAll(".disposition-select").forEach(sel => {
        sel.addEventListener("change", (e) => {
            returnedItems[e.target.dataset.index].disposition = e.target.value;
        });
    });
    exchangeList.querySelectorAll(".exchange-qty-input").forEach(input => {
        input.addEventListener("change", (e) => {
            const newQty = parseInt(e.target.value);
            if (newQty > 0) {
                exchangeItems[e.target.dataset.index].qty = newQty;
                updateExchangeUI();
            }
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

    const user = JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown';
    const timestamp = new Date().toISOString();
    
    const returnTotal = returnedItems.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
    const exchangeTotal = exchangeItems.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
    const netDue = exchangeTotal - returnTotal;

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
                // Only add back to stock if disposition is Restock
                if (ri.disposition === 'Restock') {
                    master.stock_level += ri.qty;
                    await Repository.upsert('items', master);
                    await Repository.upsert('stock_movements', {
                        id: generateUUID(), item_id: ri.id, item_name: ri.name, timestamp,
                        type: 'Return', qty: ri.qty, user, transaction_id: selectedTransaction.id, reason: `Exchange Return (${ri.disposition})`
                    });
                }

                // Log to Returns table for reporting
                await Repository.upsert('returns', {
                    id: generateUUID(),
                    transaction_id: selectedTransaction.id,
                    item_id: ri.id,
                    item_name: ri.name,
                    qty: ri.qty,
                    refund_amount: ri.selling_price * ri.qty,
                    reason: "Exchange",
                    condition: ri.disposition,
                    processed_by: user,
                    timestamp: timestamp
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

        // 3. Update Shift Expected Cash
        if (netDue !== 0) {
            const shifts = await Repository.getAll('shifts');
            const activeShift = shifts.find(s => s.user_id === user && s.status === 'open');
            if (activeShift) {
                activeShift.expected_cash = (activeShift.expected_cash || 0) + netDue;
                await Repository.upsert('shifts', activeShift);
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