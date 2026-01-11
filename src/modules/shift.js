import { checkPermission, requestManagerApproval } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";
import { getSystemSettings, checkShiftDiscrepancy } from "./settings.js";

let currentShift = null;
let selectedShiftId = null;
let shiftList = [];

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('pos_user'));
}

export async function checkActiveShift() {
    const user = getCurrentUser();
    if (!user) return null;

    try {
        // Ensure we have latest data from server
        await SyncEngine.sync();

        const shifts = await Repository.getAll('shifts');
        // Find open shift for this user
        const active = shifts.find(s => s.user_id === user.email && s.status === "open");

        if (active) {
            // Check if shift was opened on a previous day
            const startDate = new Date(active.start_time);
            const now = new Date();
            const isSameDay = startDate.getDate() === now.getDate() &&
                startDate.getMonth() === now.getMonth() &&
                startDate.getFullYear() === now.getFullYear();

            if (!isSameDay && startDate < now) {
                // Force close stale shift
                const expected = await calculateExpectedCash(active);
                const closedShift = {
                    ...active,
                    end_time: new Date().toISOString(),
                    status: 'closed',
                    closing_cash: 0, // Zero turnover as requested
                    total_closing_amount: (active.cashout || 0) + (active.closing_receipts?.reduce((s, r) => s + r.amount, 0) || 0),
                    expected_cash: expected,
                    variance: ((active.cashout || 0) + (active.closing_receipts?.reduce((s, r) => s + r.amount, 0) || 0)) - expected,
                    forced_closed: true
                };

                await Repository.upsert('shifts', closedShift);
                await SyncEngine.sync();

                alert(`Your previous shift from ${startDate.toLocaleDateString()} was automatically closed with 0 turnover.`);
                currentShift = null;
                return null;
            }

            currentShift = active;
            return currentShift;
        } else {
            currentShift = null;
        }
    } catch (error) {
        console.error("Error checking shift status:", error);
    }
    return null;
}

export async function startShift(openingCash) {
    const user = getCurrentUser();
    if (!user) return;

    // Prevent duplicate creation if a shift is already active
    const active = await checkActiveShift();
    if (active) return active;

    const shiftData = {
        id: generateUUID(),
        user_id: user.email,
        start_time: new Date(),
        end_time: null,
        opening_cash: parseFloat(openingCash),
        closing_cash: 0,
        cashout: 0,
        expected_cash: parseFloat(openingCash),
        status: "open",
        adjustments: [],
        remittances: []
    };

    try {
        // Save locally and queue for sync
        await Repository.upsert('shifts', shiftData);
        SyncEngine.sync(); // Background sync

        currentShift = shiftData;
        window.dispatchEvent(new CustomEvent('shift-updated'));
        return currentShift;
    } catch (error) {
        console.error("Error starting shift:", error);
        throw error;
    }
}

export function requireShift(callback) {
    if (currentShift) {
        callback();
    } else {
        showOpenShiftModal(callback);
    }
}

export async function calculateExpectedCash(shift = currentShift, txList = null) {
    if (!shift) return 0;

    // Query local Dexie transactions for this user since shift start
    const startTime = new Date(shift.start_time);
    const endTime = shift.end_time ? new Date(shift.end_time) : new Date();
    const userEmail = shift.user_id;

    const allTransactions = txList || await Repository.getAll('transactions');
    const transactions = allTransactions.filter(tx => {
        const txTime = new Date(tx.timestamp);
        return txTime >= startTime && txTime <= endTime &&
            tx.user_email === userEmail && !tx.is_voided &&
            tx.payment_method === 'Cash';
    });

    let totalSales = 0;
    transactions.forEach(tx => {
        totalSales += tx.total_amount || 0;
    });

    // Add adjustments
    const adjustments = shift.adjustments || [];
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);

    // Calculate returns/exchanges impact
    let totalExchangeCash = 0;
    allTransactions.forEach(tx => {
        if (tx.exchanges && Array.isArray(tx.exchanges)) {
            tx.exchanges.forEach(exch => {
                const exchTime = new Date(exch.timestamp);
                // Check if exchange happened during this shift by this user
                if (exchTime >= startTime && exchTime <= endTime && exch.processed_by === userEmail) {
                    const returnedTotal = (exch.returned || []).reduce((sum, item) => sum + (item.selling_price * (item.qty || 1)), 0);
                    const takenTotal = (exch.taken || []).reduce((sum, item) => sum + (item.selling_price * (item.qty || 1)), 0);
                    const net = takenTotal - returnedTotal;
                    totalExchangeCash += net;
                }
            });
        }
    });

    return (shift.opening_cash || 0) + totalSales + totalAdjustments + totalExchangeCash;
}

export async function recordRemittance(amount, reason) {
    const user = getCurrentUser();
    if (!user) return;

    const active = await checkActiveShift();
    if (!active) throw new Error("No active shift");

    const remittance = {
        id: generateUUID(),
        amount: parseFloat(amount),
        reason: reason,
        timestamp: new Date().toISOString(),
        user: user.email
    };

    if (!active.remittances) active.remittances = [];
    active.remittances.push(remittance);

    active.cashout = (active.cashout || 0) + remittance.amount;

    await Repository.upsert('shifts', active);
    currentShift = active;
    SyncEngine.sync();

    await addNotification('Remittance', `Cash remittance of ₱${remittance.amount.toFixed(2)} recorded by ${user.email}`);

    return remittance;
}

export async function closeShift(closingCash) {
    if (!currentShift) return;

    const expected = await calculateExpectedCash();
    const closing = parseFloat(closingCash);

    const updatedShift = {
        ...currentShift,
        end_time: new Date(),
        closing_cash: closing,
        expected_cash: expected,
        status: "closed"
    };

    await Repository.upsert('shifts', updatedShift);
    SyncEngine.sync();

    window.dispatchEvent(new CustomEvent('shift-updated'));

    // Check for discrepancy notification threshold
    await checkShiftDiscrepancy(expected, closing);

    const summary = {
        expected: expected,
        actual: closing,
        difference: closing - expected
    };

    currentShift = null;
    return summary;
}

export async function loadShiftsView() {
    const content = document.getElementById("main-content");
    if (!checkPermission("shifts", "read")) {
        content.innerHTML = `<div class="p-6 text-center text-red-600 font-bold">You do not have permission to view shifts.</div>`;
        return;
    }

    // Layout similar to suppliers.js: Left List, Right Details
    content.innerHTML = `
        <div class="max-w-6xl mx-auto h-[calc(100vh-140px)] flex flex-col">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                <!-- Left Column: Shifts List -->
                <div class="flex flex-col h-full min-h-[400px] lg:min-h-0">
                    <div class="flex flex-col gap-2 mb-4 flex-shrink-0">
                        <h2 class="text-2xl font-bold text-gray-800">My Shifts</h2>
                        <div class="flex flex-wrap gap-2 items-end bg-white p-2 rounded border shadow-sm">
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-gray-700 mb-1">Start</label>
                                <input type="date" id="shift-history-start" class="border rounded p-1 text-xs w-full">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-gray-700 mb-1">End</label>
                                <input type="date" id="shift-history-end" class="border rounded p-1 text-xs w-full">
                            </div>
                            <div class="w-16">
                                <label class="block text-xs font-bold text-gray-700 mb-1">Limit</label>
                                <input type="number" id="shift-history-limit" value="20" min="5" class="border rounded p-1 text-xs w-full">
                            </div>
                            <button id="btn-filter-shifts" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs h-7">Filter</button>
                        </div>
                    </div>

                    <div class="bg-white shadow-md rounded overflow-y-auto flex-1 border">
                        <table class="min-w-full table-auto">
                            <thead class="sticky top-0 z-10 bg-gray-100">
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-4 text-left">Start Time</th>
                                    <th class="py-3 px-4 text-center">Status</th>
                                    <th class="py-3 px-4 text-right">Variance</th>
                                </tr>
                            </thead>
                            <tbody id="shifts-table-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="3" class="py-3 px-6 text-center">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right Column: Shift Details -->
                <div id="shift-details-panel" class="hidden flex flex-col h-full min-h-[400px] lg:min-h-0 bg-white shadow-md rounded border overflow-hidden">
                    <div class="p-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-gray-800">Shift Details</h3>
                        <div id="shift-details-status"></div>
                    </div>
                    <div id="shift-details-content" class="p-6 overflow-y-auto flex-1">
                        <!-- Details injected here -->
                    </div>
                </div>
            </div>
        </div>
    `;

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    document.getElementById('shift-history-start').value = lastMonth.toISOString().split('T')[0];
    document.getElementById('shift-history-end').value = today;

    document.getElementById('btn-filter-shifts').addEventListener('click', fetchShifts);
    selectedShiftId = null;

    await fetchShifts();
}

async function fetchShifts() {
    const tbody = document.getElementById("shifts-table-body");
    const user = getCurrentUser();
    if (!user) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">Please login to view shifts.</td></tr>`;
        return;
    }

    try {
        const shifts = await Repository.getAll('shifts');
        const allTransactions = await Repository.getAll('transactions');

        const startStr = document.getElementById('shift-history-start').value;
        const endStr = document.getElementById('shift-history-end').value;
        const limit = parseInt(document.getElementById('shift-history-limit').value) || 20;

        // Filter by user and sort desc (newest first)
        shiftList = shifts
            .filter(s => s.user_id === user.email)
            .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

        if (startStr && endStr) {
            const startDate = new Date(startStr);
            const endDate = new Date(endStr);
            endDate.setHours(23, 59, 59, 999);
            shiftList = shiftList.filter(s => {
                const d = new Date(s.start_time);
                // ALWAYS include open shift for current user
                if (s.status === 'open' && s.user_id === user.email) return true;
                return d >= startDate && d <= endDate;
            });
        }

        // Force active shift to top if exists
        const openShiftIndex = shiftList.findIndex(s => s.status === 'open');
        if (openShiftIndex > -1) {
            const openShift = shiftList.splice(openShiftIndex, 1)[0];
            shiftList.unshift(openShift);
        }

        shiftList = shiftList.slice(0, limit);

        tbody.innerHTML = "";

        if (shiftList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No shifts found.</td></tr>`;
            return;
        }

        for (const data of shiftList) {
            const start = data.start_time ? new Date(data.start_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-";

            const isClosed = data.status === 'closed';
            const expected = await calculateExpectedCash(data, allTransactions);

            const cashout = data.cashout || 0;
            const receipts = data.closing_receipts || [];
            const totalExpenses = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
            const turnover = (data.closing_cash || 0) + totalExpenses + cashout;

            const variance = isClosed ? turnover - expected : 0;
            const diffClass = isClosed ? (variance < 0 ? "text-red-600" : (variance > 0 ? "text-green-600" : "")) : "";

            // Store calculated values for detail view
            data._calculated = { expected, variance, turnover };

            const row = document.createElement("tr");
            row.className = `border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${selectedShiftId === data.id ? 'bg-blue-50' : ''}`;
            row.innerHTML = `
                <td class="py-3 px-4 text-left whitespace-nowrap font-medium">
                    ${start}
                    ${data.forced_closed ? '<span class="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200" title="Automatically closed by system">FORCED</span>' : ''}
                </td>
                <td class="py-3 px-4 text-center">
                    <span class="${data.status === 'open' ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-700'} py-1 px-3 rounded-full text-xs uppercase">${data.status}</span>
                </td>
                <td class="py-3 px-4 text-right font-bold ${diffClass}">${isClosed ? `₱${variance.toFixed(2)}` : '-'}</td>
            `;

            row.addEventListener("click", () => selectShift(data));
            tbody.appendChild(row);
        }
    } catch (error) {
        console.error("Error fetching shifts:", error);
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading shifts.</td></tr>`;
    }
}

async function selectShift(shift) {
    selectedShiftId = shift.id;

    // Highlight row
    document.querySelectorAll("#shifts-table-body tr").forEach(row => row.classList.remove("bg-blue-50"));
    // Re-render list to apply highlight class (or just find the row, but re-rendering is safe if list is small)
    // For simplicity, we'll just re-fetch or rely on the click handler adding the class if we didn't rebuild.
    // Since we built the rows in the loop, let's just re-render the details.

    // Actually, let's just highlight the clicked row if we passed the event, but here we passed data.
    // Let's just re-render the table to ensure consistency or find by index if we had it.
    // A simple way is to re-run fetchShifts but that's expensive.
    // Let's just render details.

    const panel = document.getElementById("shift-details-panel");
    const content = document.getElementById("shift-details-content");
    const statusHeader = document.getElementById("shift-details-status");

    panel.classList.remove("hidden");

    const isClosed = shift.status === 'closed';
    // Always recalculate to ensure accuracy against transactions
    const expected = await calculateExpectedCash(shift);

    let variance = 0;
    if (isClosed) {
        const cashout = shift.cashout || 0;
        const receipts = shift.closing_receipts || [];
        const totalExpenses = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
        const turnover = (shift.closing_cash || 0) + totalExpenses + cashout;
        variance = turnover - expected;
    }

    const varianceClass = variance < 0 ? "text-red-600 bg-red-50" : (variance > 0 ? "text-green-600 bg-green-50" : "text-gray-600 bg-gray-50");

    statusHeader.innerHTML = `
        <span class="${shift.status === 'open' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'} px-3 py-1 rounded-full text-xs uppercase font-bold tracking-wide">${shift.status}</span>
        ${shift.forced_closed ? '<span class="ml-2 bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs uppercase font-bold border border-red-200">Forced</span>' : ''}
    `;

    const canAdjust = checkPermission("shifts", "write");

    content.innerHTML = `
        <div class="mb-6">
            <div class="text-sm text-gray-500">Start Time</div>
            <div class="font-medium text-gray-800">${new Date(shift.start_time).toLocaleString()}</div>
            <div class="text-sm text-gray-500 mt-2">End Time</div>
            <div class="font-medium text-gray-800">${shift.end_time ? new Date(shift.end_time).toLocaleString() : 'Active'}</div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="p-3 bg-gray-50 rounded border">
                <div class="text-[10px] text-gray-500 uppercase font-bold">Opening Cash</div>
                <div class="text-lg font-bold text-gray-800">₱${(shift.opening_cash || 0).toFixed(2)}</div>
            </div>${shift.status === 'open' ? '' : `
            <div class="p-3 bg-gray-50 rounded border">
                <div class="text-[10px] text-gray-500 uppercase font-bold">Expected Cash</div>
                <div class="text-lg font-bold text-blue-600">₱${expected.toFixed(2)}</div>
            </div>`}
            <div class="p-3 bg-gray-50 rounded border">
                <div class="text-[10px] text-gray-500 uppercase font-bold">Cashout/Remit</div>
                <div class="text-lg font-bold text-purple-600">₱${(shift.cashout || 0).toFixed(2)}</div>
            </div>
            <div class="p-3 bg-gray-50 rounded border">
                <div class="text-[10px] text-gray-500 uppercase font-bold">Closing Cash</div>
                <div class="text-lg font-bold text-gray-800">₱${(shift.closing_cash || 0).toFixed(2)}</div>
            </div>
        </div>

        <div class="mb-6 p-4 ${varianceClass} rounded border border-opacity-20 flex justify-between items-center">
            <span class="font-bold text-sm uppercase">Variance</span>
            <span class="text-2xl font-bold">${isClosed ? `₱${variance.toFixed(2)}` : '-'}</span>
        </div>

        <div class="flex flex-col gap-3">
            <h4 class="font-bold text-gray-700 border-b pb-2 mb-2">Actions</h4>
            <div class="grid grid-cols-2 gap-3">
                ${canAdjust ? `<button id="btn-detail-adjust" class="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 py-2 rounded font-bold text-sm transition">Adjust Cash</button>` : ''}
                <button id="btn-detail-remit" class="bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 py-2 rounded font-bold text-sm transition">Remit Cash</button>
                <button id="btn-detail-history" class="bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 py-2 rounded font-bold text-sm transition">View History</button>
                <button id="btn-detail-transactions" class="bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 py-2 rounded font-bold text-sm transition">Transactions</button>
                ${shift.status === 'open' ? `<button id="btn-detail-xreport" class="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 py-2 rounded font-bold text-sm transition">X-Report</button>` : ''}
            </div>
        </div>
    `;

    // Bind Actions
    if (canAdjust) {
        document.getElementById("btn-detail-adjust")?.addEventListener("click", () => showAdjustCashModal(shift.id, async () => {
            const updated = await Repository.get('shifts', shift.id);
            selectShift(updated);
        }));
    }
    document.getElementById("btn-detail-remit")?.addEventListener("click", () => showRemittanceHistoryModal(shift));
    document.getElementById("btn-detail-history")?.addEventListener("click", () => showShiftHistoryModal(shift.adjustments || []));
    document.getElementById("btn-detail-transactions")?.addEventListener("click", () => showShiftTransactions(shift));
    document.getElementById("btn-detail-xreport")?.addEventListener("click", () => showXReport());
}

function showOpenShiftModal(onSuccess) {
    let modal = document.getElementById("modal-open-shift");

    if (!modal) {
        const div = document.createElement("div");
        div.innerHTML = `
            <div id="modal-open-shift" class="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-8 w-96">
                    <div class="text-center mb-6">
                        <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
                            <svg class="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <h2 class="text-2xl font-bold text-gray-800">Start Shift</h2>
                        <p class="text-gray-600 text-sm mt-2">Please enter the opening petty cash amount to begin.</p>
                    </div>
                    
                    <form id="form-open-shift">
                        <div class="mb-6">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Opening Cash (PHP)</label>
                            <input type="number" id="shift-opening-cash" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl text-center" step="0.01" required min="0">
                        </div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150">
                            Open Register
                        </button>
                    </form>
                    <div class="mt-4 text-center">
                        <a href="#dashboard" id="btn-cancel-open-shift" class="text-sm text-gray-500 hover:text-gray-700">Cancel and go to Dashboard</a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById("modal-open-shift");

        document.getElementById("btn-cancel-open-shift").addEventListener("click", () => modal.remove());

        document.getElementById("form-open-shift").addEventListener("submit", async (e) => {
            e.preventDefault();

            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = "Opening...";

            const amount = document.getElementById("shift-opening-cash").value;
            try {
                await startShift(amount);
                modal.remove();
                if (onSuccess) onSuccess();
            } catch (error) {
                console.error("Error starting shift:", error);
                alert("Failed to start shift. Please try again.");
                submitBtn.disabled = false;
                submitBtn.textContent = "Open Register";
            }
        });
    } else {
        modal.classList.remove("hidden");
    }
}

export function showCloseShiftModal(onSuccess) {
    let modal = document.getElementById("modal-close-shift");

    if (!modal) {
        const div = document.createElement("div");
        div.innerHTML = `
            <div id="modal-close-shift" class="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-8 w-96">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">End Shift</h2>
                    
                    <div id="shift-summary-view" class="hidden text-center">
                        <div class="mb-4">
                            <div class="text-sm text-gray-500">Expected Cash</div>
                            <div id="summary-expected" class="text-xl font-bold"></div>
                        </div>
                        <div class="mb-4">
                            <div class="text-sm text-gray-500">Actual Count</div>
                            <div id="summary-actual" class="text-xl font-bold"></div>
                        </div>
                        <div class="mb-6">
                            <div class="text-sm text-gray-500">Difference</div>
                            <div id="summary-diff" class="text-2xl font-bold"></div>
                        </div>
                        <button id="btn-finish-shift" class="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-4 rounded">
                            Finish
                        </button>
                    </div>

                    <form id="form-close-shift">
                        <p class="text-gray-600 text-sm mb-6 text-center">Please count the cash in the drawer.</p>
                        <div class="mb-6">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Closing Cash Count (PHP)</label>
                            <input type="number" id="shift-closing-cash" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl text-center" step="0.01" required min="0">
                        </div>
                        <div class="flex gap-2">
                            <button type="button" id="btn-cancel-close-shift" class="w-1/2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded">Cancel</button>
                            <button type="submit" class="w-1/2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded">Close Shift</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById("modal-close-shift");

        document.getElementById("btn-cancel-close-shift").addEventListener("click", () => modal.remove());

        document.getElementById("form-close-shift").addEventListener("submit", async (e) => {
            e.preventDefault();
            const amount = document.getElementById("shift-closing-cash").value;
            try {
                const summary = await closeShift(amount);
                document.getElementById("form-close-shift").classList.add("hidden");
                document.getElementById("shift-summary-view").classList.remove("hidden");
                document.getElementById("summary-expected").textContent = `₱${summary.expected.toFixed(2)}`;
                document.getElementById("summary-actual").textContent = `₱${summary.actual.toFixed(2)}`;
                const diffEl = document.getElementById("summary-diff");
                diffEl.textContent = `₱${summary.difference.toFixed(2)}`;
                diffEl.className = `text-3xl font-bold ${summary.difference < 0 ? 'text-red-600' : (summary.difference > 0 ? 'text-green-600' : 'text-gray-800')}`;
            } catch (error) {
                console.error("Error closing shift:", error);
                alert("Failed to close shift. Please try again.");
            }
        });

        document.getElementById("btn-finish-shift").addEventListener("click", () => { modal.remove(); if (onSuccess) onSuccess(); });
    } else { modal.classList.remove("hidden"); }
}

export function showAdjustCashModal(shiftId, onSuccess) {
    let modal = document.getElementById("modal-adjust-cash");

    if (!modal) {
        const div = document.createElement("div");
        div.innerHTML = `
            <div id="modal-adjust-cash" class="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-8 w-96">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Adjust Cash</h2>
                    <p class="text-gray-600 text-sm mb-6 text-center">Enter amount to add (positive) or remove (negative).</p>
                    
                    <form id="form-adjust-cash">
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Amount (PHP)</label>
                            <input type="number" id="adjust-amount" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl text-center" step="0.01" required>
                        </div>
                        <div class="mb-6">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Reason</label>
                            <input type="text" id="adjust-reason" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required placeholder="e.g. Petty Cash Replenish">
                        </div>
                        <div class="flex gap-2">
                            <button type="button" id="btn-cancel-adjust" class="w-1/2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded">Cancel</button>
                            <button type="submit" class="w-1/2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById("modal-adjust-cash");

        document.getElementById("btn-cancel-adjust").addEventListener("click", () => modal.remove());

        document.getElementById("form-adjust-cash").addEventListener("submit", async (e) => {
            e.preventDefault();
            const amount = document.getElementById("adjust-amount").value;
            const reason = document.getElementById("adjust-reason").value;
            try {
                await adjustCash(shiftId, amount, reason);
                modal.remove();
                if (onSuccess) onSuccess();
            } catch (error) {
                console.error("Error adjusting cash:", error);
                alert("Failed to adjust cash.");
            }
        });
    } else {
        modal.classList.remove("hidden");
    }
}

async function adjustCash(shiftId, amount, reason) {
    if (!checkPermission("shifts", "write")) {
        alert("You do not have permission to adjust shift cash.");
        return;
    }

    if (!(await requestManagerApproval())) return;

    const user = getCurrentUser();

    const adjustment = {
        amount: parseFloat(amount),
        reason: reason,
        timestamp: new Date(),
        user: user ? user.email : 'unknown'
    };

    // Optimistic update: Update local DB first
    const shift = await Repository.get('shifts', shiftId);
    if (shift) {
        if (!shift.adjustments) shift.adjustments = [];
        shift.adjustments.push(adjustment);

        if (shift.status === 'closed') {
            shift.closing_cash = (shift.closing_cash || 0) + adjustment.amount;
        } else {
            shift.expected_cash = (shift.expected_cash || 0) + adjustment.amount;
        }

        await Repository.upsert('shifts', shift);
        SyncEngine.sync();
    }

    await addNotification('Adjustment', `Cash adjustment of ₱${adjustment.amount} for shift ${shiftId} by ${user ? user.email : 'unknown'}`);

    if (currentShift && currentShift.id === shiftId) {
        if (!currentShift.adjustments) currentShift.adjustments = [];
        currentShift.adjustments.push(adjustment);
        currentShift.expected_cash = (currentShift.expected_cash || 0) + adjustment.amount;
    }
}

export function showShiftHistoryModal(adjustments) {
    let modal = document.getElementById("modal-shift-history");
    if (modal) modal.remove();

    const div = document.createElement("div");
    div.id = "modal-shift-history";
    div.className = "fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50";

    let rows = "";
    if (!adjustments || adjustments.length === 0) {
        rows = `<tr><td colspan="4" class="py-8 text-center text-gray-500 italic">No adjustments recorded for this shift.</td></tr>`;
    } else {
        // Sort by timestamp desc
        const sorted = [...adjustments].sort((a, b) => {
            const tA = new Date(a.timestamp);
            const tB = new Date(b.timestamp);
            return tB - tA;
        });

        rows = sorted.map(adj => {
            const date = new Date(adj.timestamp).toLocaleString();
            const amtClass = adj.amount >= 0 ? 'text-green-600' : 'text-red-600';
            const sign = adj.amount >= 0 ? '+' : '-';
            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td class="py-3 px-4 text-xs text-gray-500">${date}</td>
                    <td class="py-3 px-4 text-sm font-medium text-gray-700">${adj.user || 'System'}</td>
                    <td class="py-3 px-4 text-sm text-gray-600">${adj.reason}</td>
                    <td class="py-3 px-4 text-right font-bold ${amtClass}">${sign}₱${Math.abs(adj.amount).toFixed(2)}</td>
                </tr>
            `;
        }).join("");
    }

    div.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl transform transition-all">
            <div class="flex justify-between items-center mb-6 border-b pb-4">
                <h2 class="text-xl font-bold text-gray-800">Shift Adjustment History</h2>
                <button id="close-history-modal-x" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div class="overflow-x-auto max-h-[60vh] rounded-lg border border-gray-200">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-50">
                        <tr class="text-xs uppercase text-gray-500 font-bold tracking-wider">
                            <th class="py-3 px-4 text-left">Date & Time</th>
                            <th class="py-3 px-4 text-left">User</th>
                            <th class="py-3 px-4 text-left">Reason</th>
                            <th class="py-3 px-4 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div class="mt-8 flex justify-end">
                <button id="btn-close-history" class="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold transition shadow-md">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);

    const closeModal = () => div.remove();
    document.getElementById("close-history-modal-x").addEventListener("click", closeModal);
    document.getElementById("btn-close-history").addEventListener("click", closeModal);
}

export function showRemittanceHistoryModal(shift) {
    let modal = document.getElementById("modal-remittance-history");
    if (modal) modal.remove();

    const remittances = shift.remittances || [];
    const div = document.createElement("div");
    div.id = "modal-remittance-history";
    div.className = "fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50";

    let rows = remittances && remittances.length > 0
        ? remittances.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(r => `
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                <td class="py-3 px-4 text-xs text-gray-500">${new Date(r.timestamp).toLocaleString()}</td>
                <td class="py-3 px-4 text-sm font-medium text-gray-700">${r.user || 'System'}</td>
                <td class="py-3 px-4 text-sm text-gray-600">${r.reason}</td>
                <td class="py-3 px-4 text-right font-bold text-purple-600">₱${r.amount.toFixed(2)}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="4" class="py-8 text-center text-gray-500 italic">No remittances recorded for this shift.</td></tr>`;

    div.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl">
            <div class="flex justify-between items-center mb-6 border-b pb-4">
                <h2 class="text-xl font-bold text-gray-800">Shift Remittance History</h2>
                ${shift.status === 'open' ? `<button id="btn-add-remit-modal" class="bg-purple-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-purple-700">+ Add Remittance</button>` : ''}
                <button id="close-remit-modal-x" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div class="overflow-x-auto max-h-[60vh] rounded-lg border border-gray-200">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-50">
                        <tr class="text-xs uppercase text-gray-500 font-bold tracking-wider">
                            <th class="py-3 px-4 text-left">Date & Time</th>
                            <th class="py-3 px-4 text-left">User</th>
                            <th class="py-3 px-4 text-left">Reason</th>
                            <th class="py-3 px-4 text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div class="mt-8 flex justify-end">
                <button id="btn-close-remit-history" class="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold transition shadow-md">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    const closeModal = () => div.remove();
    document.getElementById("close-remit-modal-x").addEventListener("click", closeModal);
    document.getElementById("btn-close-remit-history").addEventListener("click", closeModal);
    if (shift.status === 'open') {
        document.getElementById("btn-add-remit-modal").addEventListener("click", () => showAddRemittanceModal(closeModal));
    }
}

export async function showXReport() {
    if (!currentShift) {
        alert("No active shift found.");
        return;
    }

    // Calculate live metrics
    const txs = await Repository.getAll('transactions');
    const shiftTxs = txs.filter(t => {
        const d = new Date(t.timestamp);
        const start = new Date(currentShift.start_time);
        return d >= start && t.user_email === currentShift.user_id && !t.is_voided;
    });

    // Sales by Payment Method
    const payments = {};
    let totalSales = 0;
    shiftTxs.forEach(tx => {
        const method = tx.payment_method || 'Cash';
        payments[method] = (payments[method] || 0) + tx.total_amount;
        totalSales += tx.total_amount;
    });

    const expected = await calculateExpectedCash();
    const settings = await getSystemSettings();
    const store = settings.store || { name: "LightPOS", data: "" };

    // Printer Styles
    const defaultPrint = {
        paper_width: 76,
        header: { font_size: 14, font_family: "monospace", bold: true },
        body: { font_size: 12, font_family: "monospace" }
    };
    const p = { ...defaultPrint, ...(settings.print || {}) };
    const getStyle = (s) => `font-size: ${s.font_size}px; font-family: ${s.font_family}; font-weight: ${s.bold ? 'bold' : 'normal'};`;

    // Construct Report HTML
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <style>
                @page { margin: 0; }
                body { width: ${p.paper_width}mm; padding: 5mm; margin: 0; ${getStyle(p.body)} color: #000; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .bold { font-weight: bold; }
                .hr { border-bottom: 1px dashed #000; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; }
                .header-sec { ${getStyle(p.header)} }
            </style>
        </head>
        <body onload="window.print();window.close();">
            <div class="text-center header-sec">
                ${store.logo ? `<img src="${store.logo}" style="max-width:40mm;max-height:20mm;filter:grayscale(1)"><br>` : ''}
                ${store.name}<br>X-REPORT (Mid-Shift)
            </div>
            <div class="hr"></div>
            <div>
                User: ${currentShift.user_id}<br>
                Start: ${new Date(currentShift.start_time).toLocaleString()}<br>
                Generated: ${new Date().toLocaleString()}
            </div>
            <div class="hr"></div>
            <div class="bold">Opening Cash: <span style="float:right">${(currentShift.opening_cash || 0).toFixed(2)}</span></div>
            <div class="hr"></div>
            <div class="bold">Sales Summary</div>
            <table>
                ${Object.entries(payments).map(([m, a]) => `<tr><td>${m}</td><td class="text-right">${a.toFixed(2)}</td></tr>`).join('')}
            </table>
            <div class="hr"></div>
            <div class="bold" style="font-size:1.1em">Total Sales: <span style="float:right">${totalSales.toFixed(2)}</span></div>
            <div class="bold" style="font-size:1.1em">Expected Cash: <span style="float:right">${expected.toFixed(2)}</span></div>
            <div class="hr"></div>
            <div class="text-center italic">-- End of Report --</div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function showAddRemittanceModal(onSuccess) {
    const div = document.createElement("div");
    div.className = "fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-[60]";
    div.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl p-8 w-96">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">Add Remittance</h2>
            <form id="form-add-remit">
                <div class="mb-4">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Amount (PHP)</label>
                    <input type="number" id="new-remit-amount" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500 text-xl text-center" step="0.01" required min="0">
                </div>
                <div class="mb-6">
                    <label class="block text-gray-700 text-sm font-bold mb-2">Reason / Reference</label>
                    <input type="text" id="new-remit-reason" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-500" required placeholder="e.g. Safe Drop">
                </div>
                <div class="flex gap-2">
                    <button type="button" id="btn-cancel-new-remit" class="w-1/2 bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded">Cancel</button>
                    <button type="submit" class="w-1/2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded">Save</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(div);

    document.getElementById("btn-cancel-new-remit").addEventListener("click", () => div.remove());
    document.getElementById("form-add-remit").addEventListener("submit", async (e) => {
        e.preventDefault();
        const amount = document.getElementById("new-remit-amount").value;
        const reason = document.getElementById("new-remit-reason").value;
        try {
            await recordRemittance(amount, reason);
            div.remove();
            if (onSuccess) onSuccess();
            // Refresh shift details
            if (selectedShiftId) {
                const updatedShift = await Repository.get('shifts', selectedShiftId);
                selectShift(updatedShift);
            }
        } catch (error) {
            console.error("Error adding remittance:", error);
            alert("Failed to add remittance: " + error.message);
        }
    });
}

async function showShiftTransactions(shift) {
    const div = document.createElement("div");
    div.className = "fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50";
    div.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl p-6 w-full max-w-4xl h-[80vh] flex flex-col">
            <div class="flex justify-between items-center mb-4 border-b pb-4 shrink-0">
                <h2 class="text-xl font-bold text-gray-800">Transactions for Shift</h2>
                <button id="close-tx-modal" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div class="overflow-y-auto flex-1">
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-50 sticky top-0">
                        <tr class="text-xs uppercase text-gray-500 font-bold tracking-wider">
                            <th class="py-3 px-4 text-left">Time</th>
                            <th class="py-3 px-4 text-left">ID</th>
                            <th class="py-3 px-4 text-left">Customer</th>
                            <th class="py-3 px-4 text-right">Total</th>
                            <th class="py-3 px-4 text-center">Status</th>
                            <th class="py-3 px-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="shift-tx-body" class="divide-y divide-gray-100">
                        <tr><td colspan="6" class="text-center py-4">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    document.getElementById("close-tx-modal").addEventListener("click", () => div.remove());

    const tbody = document.getElementById("shift-tx-body");

    try {
        const allTxs = await Repository.getAll('transactions');
        const start = new Date(shift.start_time);
        const end = shift.end_time ? new Date(shift.end_time) : new Date();

        const entries = [];

        allTxs.forEach(tx => {
            const txDate = new Date(tx.timestamp);
            // 1. Original Sale
            if (txDate >= start && txDate <= end && tx.user_email === shift.user_id) {
                entries.push({ type: 'Sale', data: tx, timestamp: txDate, id: tx.id, total: tx.total_amount, is_voided: tx.is_voided });
            }
            // 2. Exchanges
            if (tx.exchanges && Array.isArray(tx.exchanges)) {
                tx.exchanges.forEach((ex, idx) => {
                    const exDate = new Date(ex.timestamp);
                    if (exDate >= start && exDate <= end && ex.processed_by === shift.user_id) {
                        const returnedTotal = ex.returned.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
                        const takenTotal = ex.taken.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
                        entries.push({
                            type: 'Exchange',
                            data: tx,
                            timestamp: exDate,
                            id: `${tx.id}-EX${idx + 1}`,
                            total: takenTotal - returnedTotal,
                            is_voided: false,
                            is_exchange: true
                        });
                    }
                });
            }
        });

        const sortedEntries = entries.sort((a, b) => b.timestamp - a.timestamp);

        if (sortedEntries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500 italic">No transactions found for this shift.</td></tr>`;
            return;
        }

        tbody.innerHTML = sortedEntries.map(entry => {
            const tx = entry.data;
            const isExchange = entry.is_exchange;
            const statusColor = entry.is_voided ? 'text-red-600' : (isExchange ? 'text-blue-600' : 'text-green-600');
            const statusText = entry.is_voided ? 'Voided' : (isExchange ? 'Exchange' : 'Valid');

            return `
            <tr class="hover:bg-gray-50 transition ${entry.is_voided ? 'bg-red-50 opacity-75' : ''}">
                <td class="py-2 px-4 text-xs text-gray-600">${entry.timestamp.toLocaleTimeString()}</td>
                <td class="py-2 px-4 text-xs font-mono text-gray-500">${entry.id.slice(-12)}</td>
                <td class="py-2 px-4 text-sm text-gray-800">${tx.customer_name || 'Guest'}</td>
                <td class="py-2 px-4 text-right font-bold text-gray-800">₱${entry.total.toFixed(2)}</td>
                <td class="py-2 px-4 text-center text-xs font-bold uppercase ${statusColor}">${statusText}</td>
                <td class="py-2 px-4 text-center flex justify-center gap-2">
                    ${!isExchange ? `<button class="bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded text-xs font-bold btn-print-tx" data-id="${tx.id}">Print</button>` : ''}
                    ${!entry.is_voided && !isExchange ? `<button class="bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded text-xs font-bold btn-void-tx" data-id="${tx.id}">Void</button>` : ''}
                </td>
            </tr>
            `;
        }).join('');

        tbody.querySelectorAll(".btn-print-tx").forEach(btn => {
            btn.addEventListener("click", async () => {
                const tx = allTxs.find(t => t.id === btn.dataset.id);
                if (tx) await printTransaction(tx, true);
            });
        });

        tbody.querySelectorAll(".btn-void-tx").forEach(btn => {
            btn.addEventListener("click", async () => {
                await voidShiftTransaction(btn.dataset.id, shift.id);
                div.remove(); // Close to refresh
                const updatedShift = await Repository.get('shifts', shift.id);
                showShiftTransactions(updatedShift); // Reopen
            });
        });

    } catch (error) {
        console.error("Error loading transactions:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red-500">Error loading data.</td></tr>`;
    }
}

async function voidShiftTransaction(txId, shiftId) {
    if (!confirm("Are you sure you want to VOID this transaction?")) return;
    if (!(await requestManagerApproval())) return;

    const reason = prompt("Enter reason for voiding:");
    if (reason === null) return;

    try {
        const tx = await Repository.get('transactions', txId);
        if (!tx) return;

        const user = getCurrentUser();

        await Repository.upsert('transactions', {
            ...tx,
            is_voided: true,
            voided_at: new Date().toISOString(),
            voided_by: user ? user.email : "Manager",
            void_reason: reason || "Voided from Shift View"
        });

        for (const item of tx.items) {
            const current = await Repository.get('items', item.id);
            if (current) {
                await Repository.upsert('items', { ...current, stock_level: current.stock_level + item.qty });
            }
        }

        await SyncEngine.sync();
        await addNotification('Void', `Transaction ${txId} was voided by ${user ? user.email : "Manager"}`);
        alert("Transaction voided.");

        // Refresh shift details
        const updatedShift = await Repository.get('shifts', shiftId);
        selectShift(updatedShift);
    } catch (e) {
        console.error(e);
        alert("Error voiding transaction.");
    }
}

async function printTransaction(tx, isReprint = false) {
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

    // Simplified print logic for history
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

    printWindow.document.write(`<html>
    <head>
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
        </style>
    </head>
    <body onload="window.print();window.close();">
        <div class="text-center header-sec">
            ${store.logo ? `<img src="${store.logo}" style="max-width: 40mm; max-height: 20mm; margin-bottom: 5px; filter: grayscale(1);"><br>` : ''}
            <div style="white-space: pre-wrap;">${headerText}</div>
        </div>
        ${showHR ? '<div class="hr"></div>' : ''}
        <div class="body-sec">
            Tx: ${tx.id.slice(-6)}<br>
            ${isReprint ? '*** REPRINT ***<br>' : ''}
        </div>
        ${showHR ? '<div class="hr"></div>' : ''}
        <table>${itemsHtml}</table>
        ${showHR ? '<div class="hr"></div>' : ''}
        <div style="text-align:right;font-weight:bold;">Total: ${tx.total_amount.toFixed(2)}</div>
    </body></html>`);
    printWindow.document.close();
}