import { checkPermission, requestManagerApproval } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";
import { getSystemSettings } from "./settings.js";

let currentShift = null;

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

export async function calculateExpectedCash(shift = currentShift) {
    if (!shift) return 0;
    
    // Query local Dexie transactions for this user since shift start
    const startTime = new Date(shift.start_time);
    const endTime = shift.end_time ? new Date(shift.end_time) : new Date();
    const userEmail = shift.user_id;

    const allTransactions = await Repository.getAll('transactions');
    const transactions = allTransactions.filter(tx => {
        const txTime = new Date(tx.timestamp);
        return txTime >= startTime && txTime <= endTime && 
               tx.user_email === userEmail && !tx.is_voided;
    });

    let totalSales = 0;
    transactions.forEach(tx => {
        totalSales += tx.total_amount || 0;
    });

    return (shift.opening_cash || 0) + totalSales;
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
    try {
        const settings = await getSystemSettings();
        const threshold = parseFloat(settings?.shift?.threshold) || 0;
        
        if (Math.abs(closing - expected) > threshold) {
            await addNotification('Discrepancy', `Shift closed with a discrepancy of ₱${(closing - expected).toFixed(2)} (Threshold: ₱${threshold.toFixed(2)})`);
        }
    } catch (e) {
        console.error("Error checking discrepancy threshold:", e);
    }
    
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

    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">My Shifts</h2>
                <div id="shift-actions-container"></div>
            </div>
            
            <div class="bg-white p-4 rounded-lg shadow-sm mb-4 flex flex-wrap gap-4 items-end border border-gray-200">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Start Date</label>
                    <input type="date" id="shift-history-start" class="border rounded p-2 text-sm">
                </div>
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">End Date</label>
                    <input type="date" id="shift-history-end" class="border rounded p-2 text-sm">
                </div>
                <div class="w-24">
                    <label class="block text-sm font-bold text-gray-700 mb-1">Rows</label>
                    <input type="number" id="shift-history-limit" value="20" min="5" class="border rounded p-2 text-sm w-full">
                </div>
                <button id="btn-filter-shifts" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm">Filter</button>
            </div>

            <div class="bg-white shadow-md rounded overflow-hidden">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Start Time</th>
                            <th class="py-3 px-6 text-left">End Time</th>
                            <th class="py-3 px-6 text-right">Opening</th>
                            <th class="py-3 px-6 text-right">Closing</th>
                            <th class="py-3 px-6 text-right">Cashout</th>
                            <th class="py-3 px-6 text-right">Expected</th>
                            <th class="py-3 px-6 text-right">Diff</th>
                            <th class="py-3 px-6 text-center">Status</th>
                            <th class="py-3 px-6 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="shifts-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="9" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
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

    await fetchShifts();
}

async function fetchShifts() {
    const tbody = document.getElementById("shifts-table-body");
    const user = getCurrentUser();
    if (!user) {
         tbody.innerHTML = `<tr><td colspan="8" class="py-3 px-6 text-center">Please login to view shifts.</td></tr>`;
         return;
    }

    const actionsContainer = document.getElementById("shift-actions-container");
    if (actionsContainer) {
        actionsContainer.innerHTML = "";
        if (currentShift) {
            const xBtn = document.createElement("button");
            xBtn.className = "bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-sm transition shadow-sm";
            xBtn.textContent = "Generate X-Report";
            xBtn.onclick = () => showXReport();
            actionsContainer.appendChild(xBtn);
        }
    }

    try {
        const shifts = await Repository.getAll('shifts');
        
        const startStr = document.getElementById('shift-history-start').value;
        const endStr = document.getElementById('shift-history-end').value;
        const limit = parseInt(document.getElementById('shift-history-limit').value) || 20;

        // Filter by user and sort desc
        let userShifts = shifts
            .filter(s => s.user_id === user.email)
            .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

        if (startStr && endStr) {
            const startDate = new Date(startStr);
            const endDate = new Date(endStr);
            endDate.setHours(23, 59, 59, 999);
            userShifts = userShifts.filter(s => {
                const d = new Date(s.start_time);
                return d >= startDate && d <= endDate;
            });
        }

        userShifts = userShifts.slice(0, limit);

        tbody.innerHTML = "";

        if (userShifts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="py-3 px-6 text-center">No shifts found.</td></tr>`;
            return;
        }

        const canAdjust = checkPermission("shifts", "write");
        
        for (const data of userShifts) {
            const start = data.start_time ? new Date(data.start_time).toLocaleString() : "-";
            const end = data.end_time ? new Date(data.end_time).toLocaleString() : "-";
            
            const isClosed = data.status === 'closed';
            const expected = isClosed ? (data.expected_cash || 0) : await calculateExpectedCash(data);
            
            const cashout = data.cashout || 0;
            const receipts = data.closing_receipts || [];
            const totalExpenses = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
            const turnover = (data.closing_cash || 0) + totalExpenses + cashout;
            
            const variance = isClosed ? turnover - expected : 0;
            const diffClass = isClosed ? (variance < 0 ? "text-red-600" : (variance > 0 ? "text-green-600" : "")) : "";
            
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${start}</td>
                <td class="py-3 px-6 text-left whitespace-nowrap">${end}</td>
                <td class="py-3 px-6 text-right">₱${(data.opening_cash || 0).toFixed(2)}</td>
                <td class="py-3 px-6 text-right">₱${(data.closing_cash || 0).toFixed(2)}</td>
                <td class="py-3 px-6 text-right">₱${cashout.toFixed(2)}</td>
                <td class="py-3 px-6 text-right">₱${expected.toFixed(2)}</td>
                <td class="py-3 px-6 text-right font-bold ${diffClass}">${isClosed ? `₱${variance.toFixed(2)}` : '-'}</td>
                <td class="py-3 px-6 text-center">
                    <span class="${data.status === 'open' ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-700'} py-1 px-3 rounded-full text-xs uppercase">${data.status}</span>
                </td>
                <td class="py-3 px-6 text-center flex justify-center gap-3">
                    ${canAdjust ? `<button class="btn-adjust-shift text-blue-600 hover:text-blue-900 font-medium" title="Adjust Cash">Adjust</button>` : ''}
                    <button class="btn-view-remittances text-purple-600 hover:text-purple-900 font-medium" title="View Remittances">Remit</button>
                    <button class="btn-view-history text-gray-600 hover:text-gray-900 font-medium" title="View History">History</button>
                </td>
            `;
            tbody.appendChild(row);
            
            if (canAdjust) {
                row.querySelector(".btn-adjust-shift").addEventListener("click", () => {
                    showAdjustCashModal(data.id);
                });
            }

            row.querySelector(".btn-view-remittances").addEventListener("click", () => {
                showRemittanceHistoryModal(data.remittances || []);
            });

            row.querySelector(".btn-view-history").addEventListener("click", () => {
                showShiftHistoryModal(data.adjustments || []);
            });
        }
    } catch (error) {
        console.error("Error fetching shifts:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center text-red-500">Error loading shifts.</td></tr>`;
    }
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
                diffEl.className = `text-2xl font-bold ${summary.difference < 0 ? 'text-red-600' : (summary.difference > 0 ? 'text-green-600' : 'text-gray-800')}`;
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

export function showRemittanceHistoryModal(remittances) {
    let modal = document.getElementById("modal-remittance-history");
    if (modal) modal.remove();

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
}

export async function showXReport() {
    if (!currentShift) {
        alert("No active shift found.");
        return;
    }

    if (!(await requestManagerApproval())) return;

    const expected = await calculateExpectedCash();
    
    const div = document.createElement("div");
    div.id = "modal-x-report";
    div.className = "fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50";
    div.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl p-8 w-96">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 text-center">X-Report (Mid-Shift)</h2>
            <div class="space-y-4">
                <div class="flex justify-between border-b pb-2">
                    <span class="text-gray-600">Start Time:</span>
                    <span class="font-medium">${new Date(currentShift.start_time).toLocaleString()}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="text-gray-600">Opening Cash:</span>
                    <span class="font-medium">₱${(currentShift.opening_cash || 0).toFixed(2)}</span>
                </div>
                <div class="flex justify-between border-b pb-2">
                    <span class="text-gray-600">Expected Cash:</span>
                    <span class="font-bold text-blue-600">₱${expected.toFixed(2)}</span>
                </div>
            </div>
            <button id="close-x-report" class="w-full mt-6 bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-4 rounded">
                Close
            </button>
        </div>
    `;
    document.body.appendChild(div);
    document.getElementById("close-x-report").addEventListener("click", () => div.remove());
}