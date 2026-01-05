import { checkPermission, requestManagerApproval } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { checkActiveShift, requireShift } from "./shift.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";

let selectedTransaction = null;

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
        <div class="max-w-4xl mx-auto">
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
            <div id="return-details-container" class="hidden space-y-6">
                <div class="bg-white p-6 rounded-lg shadow-md border-t-4 border-blue-500">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h3 class="font-bold text-lg text-gray-800" id="display-tx-id"></h3>
                            <p class="text-sm text-gray-500" id="display-tx-date"></p>
                        </div>
                        <div class="text-right">
                            <div class="text-xs text-gray-400 uppercase font-bold">Original Total</div>
                            <div class="text-xl font-bold text-blue-600" id="display-tx-total"></div>
                        </div>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr class="text-left text-gray-500 uppercase text-xs">
                                    <th class="p-3">Item</th>
                                    <th class="p-3 text-center">Purchased</th>
                                    <th class="p-3 text-center">Returned</th>
                                    <th class="p-3 text-right">Price</th>
                                    <th class="p-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody id="return-items-body" class="divide-y"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Return Modal -->
        <div id="modal-process-return" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl p-6 w-96">
                <h3 class="text-xl font-bold mb-4 text-gray-800">Return Item</h3>
                <form id="form-return-item">
                    <input type="hidden" id="return-item-id">
                    <div class="mb-4">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Quantity to Return</label>
                        <input type="number" id="return-qty" min="1" class="w-full border rounded p-2 text-center text-lg font-bold" required>
                        <p id="return-max-hint" class="text-[10px] text-red-500 mt-1"></p>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Condition (Inventory Disposition)</label>
                        <select id="return-condition" class="w-full border rounded p-2" required>
                            <option value="restockable">Restockable (Good Condition)</option>
                            <option value="damaged">Damaged / Defective (Write-off)</option>
                        </select>
                    </div>
                    <div class="mb-6">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Reason Code</label>
                        <select id="return-reason" class="w-full border rounded p-2" required>
                            <option value="">-- Select Reason --</option>
                            <option value="Defective">Defective</option>
                            <option value="Wrong Item">Wrong Item</option>
                            <option value="Changed Mind">Changed Mind</option>
                            <option value="Expired">Expired</option>
                        </select>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="btn-close-return-modal" class="w-1/2 bg-gray-200 hover:bg-gray-300 font-bold py-2 rounded">Cancel</button>
                        <button type="submit" class="w-1/2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Process Refund</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById("btn-find-tx").addEventListener("click", findTransaction);
    document.getElementById("return-search-id").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            findTransaction();
        }
    });

    document.getElementById("btn-close-return-modal").addEventListener("click", () => document.getElementById("modal-process-return").classList.add("hidden"));
    document.getElementById("form-return-item").addEventListener("submit", handleReturnSubmit);
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
    if (!selectedTransaction) return;

    document.getElementById("search-results").classList.add("hidden");
    document.getElementById("return-details-container").classList.remove("hidden");
    
    document.getElementById("display-tx-id").textContent = `Transaction #${selectedTransaction.id}`;
    document.getElementById("display-tx-date").textContent = new Date(selectedTransaction.timestamp).toLocaleString();
    document.getElementById("display-tx-total").textContent = `₱${selectedTransaction.total_amount.toFixed(2)}`;

    const tbody = document.getElementById("return-items-body");
    tbody.innerHTML = selectedTransaction.items.map((item, idx) => {
        const returned = item.returned_qty || 0;
        const available = item.qty - returned;
        return `
            <tr>
                <td class="p-3 font-medium">${item.name}</td>
                <td class="p-3 text-center">${item.qty}</td>
                <td class="p-3 text-center text-red-600">${returned}</td>
                <td class="p-3 text-right">₱${item.selling_price.toFixed(2)}</td>
                <td class="p-3 text-center">
                    ${available > 0 ? 
                        `<button class="text-blue-600 font-bold hover:underline btn-open-return" data-index="${idx}">Return</button>` : 
                        `<span class="text-gray-400 italic">Fully Returned</span>`
                    }
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll(".btn-open-return").forEach(btn => {
        btn.addEventListener("click", () => openReturnModal(btn.dataset.index));
    });
}

function openReturnModal(index) {
    const item = selectedTransaction.items[index];
    const returned = item.returned_qty || 0;
    const max = item.qty - returned;

    document.getElementById("return-item-id").value = index;
    document.getElementById("return-qty").value = max;
    document.getElementById("return-qty").max = max;
    document.getElementById("return-max-hint").textContent = `Max returnable: ${max}`;
    document.getElementById("modal-process-return").classList.remove("hidden");
}

async function handleReturnSubmit(e) {
    e.preventDefault();
    if (!checkPermission("returns", "write")) {
        alert("Permission denied.");
        return;
    }

    const index = parseInt(document.getElementById("return-item-id").value);
    const qty = parseInt(document.getElementById("return-qty").value);
    const condition = document.getElementById("return-condition").value;
    const reason = document.getElementById("return-reason").value;
    const item = selectedTransaction.items[index];

    if (qty > (item.qty - (item.returned_qty || 0))) {
        alert("Cannot return more than purchased.");
        return;
    }

    if (!(await requestManagerApproval())) return;

    try {
        // 1. Update Transaction Record (track returned qty)
        const returnId = generateUUID();
        selectedTransaction.items[index].returned_qty = (selectedTransaction.items[index].returned_qty || 0) + qty;
        await Repository.upsert('transactions', selectedTransaction);

        // 2. Update Inventory if restockable
        let updatedMasterItem = null;
        if (condition === 'restockable') {
            updatedMasterItem = await Repository.get('items', item.id);
            if (updatedMasterItem) {
                updatedMasterItem.stock_level += qty;
                await Repository.upsert('items', updatedMasterItem);
            }
        }

        // 3. Log Return
        const returnRecord = {
            id: returnId,
            transaction_id: selectedTransaction.id,
            item_id: item.id,
            item_name: item.name,
            qty: qty,
            refund_amount: item.selling_price * qty,
            condition,
            reason,
            timestamp: new Date().toISOString(),
            processed_by: JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown'
        };
        await Repository.upsert('returns', returnRecord);

        // Record Stock Movement Locally
        await Repository.upsert('stock_movements', {
            id: generateUUID(),
            item_id: item.id,
            item_name: item.name,
            timestamp: returnRecord.timestamp,
            type: 'Return',
            qty: qty,
            user: returnRecord.processed_by,
            transaction_id: selectedTransaction.id,
            reason: `${reason} (${condition})`
        });

        if (condition === 'damaged') {
            // Record an additional movement for the loss to keep ledger balanced
            await Repository.upsert('stock_movements', {
                id: generateUUID(),
                item_id: item.id,
                item_name: item.name,
                timestamp: returnRecord.timestamp,
                type: 'Shrinkage',
                qty: -qty,
                user: returnRecord.processed_by,
                transaction_id: selectedTransaction.id,
                reason: `Return Write-off: ${reason}`
            });
            
            // Also log to adjustments so it shows in shrinkage reports
            await Repository.upsert('adjustments', {
                id: generateUUID(),
                item_id: item.id,
                item_name: item.name,
                old_stock: 0, 
                new_stock: 0,
                difference: -qty,
                reason: 'Spoilage/Damage',
                user: returnRecord.processed_by,
                timestamp: returnRecord.timestamp
            });
        }

        // 4. Trigger Sync
        SyncEngine.sync();

        await addNotification('Return', `Refund of ₱${returnRecord.refund_amount.toFixed(2)} processed for ${item.name} (${reason})`);
        
        alert(`Refund of ₱${returnRecord.refund_amount.toFixed(2)} processed via ${selectedTransaction.payment_method}.`);
        document.getElementById("modal-process-return").classList.add("hidden");
        displayTransaction(selectedTransaction.id);
    } catch (err) {
        console.error(err);
        alert("Failed to process return.");
    }
}