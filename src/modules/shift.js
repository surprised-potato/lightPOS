import { db as firestore, auth } from "../firebase-config.js";
import { db } from "../db.js";
import { checkPermission } from "../auth.js";
import { collection, addDoc, query, where, getDocs, getDoc, limit, updateDoc, doc, orderBy, arrayUnion, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentShift = null;
let shiftsListener = null;

export async function checkActiveShift() {
    if (!auth.currentUser) return null;

    try {
        const q = query(
            collection(firestore, "shifts"),
            where("user_id", "==", auth.currentUser.email),
            where("status", "==", "open"),
            limit(1)
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            currentShift = { id: docSnap.id, ...docSnap.data() };
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
    if (!auth.currentUser) return;

    // Prevent duplicate creation if a shift is already active
    const active = await checkActiveShift();
    if (active) return active;

    const shiftData = {
        user_id: auth.currentUser.email,
        start_time: new Date(),
        end_time: null,
        opening_cash: parseFloat(openingCash),
        closing_cash: 0,
        expected_cash: parseFloat(openingCash),
        status: "open"
    };

    const docRef = await addDoc(collection(firestore, "shifts"), shiftData);
    currentShift = { id: docRef.id, ...shiftData };
    return currentShift;
}

export function requireShift(callback) {
    if (currentShift) {
        callback();
    } else {
        showOpenShiftModal(callback);
    }
}

export async function calculateExpectedCash() {
    if (!currentShift) return 0;
    
    // Query local Dexie transactions for this user since shift start
    const startTime = currentShift.start_time instanceof Date ? currentShift.start_time : currentShift.start_time.toDate();
    const transactions = await db.transactions
        .where('timestamp').aboveOrEqual(startTime)
        .filter(tx => tx.user_email === auth.currentUser.email)
        .toArray();

    let totalSales = 0;
    transactions.forEach(tx => {
        totalSales += tx.total_amount || 0;
    });
    
    let totalAdjustments = 0;
    if (currentShift.adjustments && Array.isArray(currentShift.adjustments)) {
        currentShift.adjustments.forEach(adj => totalAdjustments += (adj.amount || 0));
    }
    
    return currentShift.opening_cash + totalSales + totalAdjustments;
}

export async function closeShift(closingCash) {
    if (!currentShift) return;
    
    const expected = await calculateExpectedCash();
    const closing = parseFloat(closingCash);
    
    await updateDoc(doc(firestore, "shifts", currentShift.id), {
        end_time: new Date(),
        closing_cash: closing,
        expected_cash: expected,
        status: "closed"
    });
    
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
            <h2 class="text-2xl font-bold text-gray-800 mb-6">My Shifts</h2>
            <div class="bg-white shadow-md rounded overflow-hidden">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Start Time</th>
                            <th class="py-3 px-6 text-left">End Time</th>
                            <th class="py-3 px-6 text-right">Opening</th>
                            <th class="py-3 px-6 text-right">Closing</th>
                            <th class="py-3 px-6 text-right">Expected</th>
                            <th class="py-3 px-6 text-right">Diff</th>
                            <th class="py-3 px-6 text-center">Status</th>
                            <th class="py-3 px-6 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="shifts-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="7" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    await fetchShifts();
}

async function fetchShifts() {
    const tbody = document.getElementById("shifts-table-body");
    if (!auth.currentUser) {
         tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center">Please login to view shifts.</td></tr>`;
         return;
    }

    // Unsubscribe from previous listener if it exists to prevent memory leaks
    if (shiftsListener) shiftsListener();

    try {
        const q = query(
            collection(firestore, "shifts"),
            where("user_id", "==", auth.currentUser.email),
            orderBy("start_time", "desc"),
            limit(20)
        );
        
        // Set up real-time listener
        shiftsListener = onSnapshot(q, (snapshot) => {
            tbody.innerHTML = "";

            if (snapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center">No shifts found.</td></tr>`;
                return;
            }

            const canAdjust = checkPermission("shifts", "write");
            snapshot.forEach(doc => {
                const data = doc.data();
                const start = data.start_time ? data.start_time.toDate().toLocaleString() : "-";
                const end = data.end_time ? data.end_time.toDate().toLocaleString() : "-";
                
                const isClosed = data.status === 'closed';
                const diff = isClosed ? (data.closing_cash || 0) - (data.expected_cash || 0) : 0;
                const diffClass = isClosed ? (diff < 0 ? "text-red-600" : (diff > 0 ? "text-green-600" : "")) : "";
                
                const row = document.createElement("tr");
                row.className = "border-b border-gray-200 hover:bg-gray-100";
                row.innerHTML = `
                    <td class="py-3 px-6 text-left whitespace-nowrap">${start}</td>
                    <td class="py-3 px-6 text-left whitespace-nowrap">${end}</td>
                    <td class="py-3 px-6 text-right">₱${(data.opening_cash || 0).toFixed(2)}</td>
                    <td class="py-3 px-6 text-right">₱${(data.closing_cash || 0).toFixed(2)}</td>
                    <td class="py-3 px-6 text-right">${isClosed ? `₱${(data.expected_cash || 0).toFixed(2)}` : '-'}</td>
                    <td class="py-3 px-6 text-right font-bold ${diffClass}">${isClosed ? `₱${diff.toFixed(2)}` : '-'}</td>
                    <td class="py-3 px-6 text-center">
                        <span class="${data.status === 'open' ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-700'} py-1 px-3 rounded-full text-xs uppercase">${data.status}</span>
                    </td>
                    <td class="py-3 px-6 text-center flex justify-center gap-3">
                        ${canAdjust ? `<button class="btn-adjust-shift text-blue-600 hover:text-blue-900 font-medium" title="Adjust Cash">Adjust</button>` : ''}
                        <button class="btn-view-history text-gray-600 hover:text-gray-900 font-medium" title="View History">History</button>
                    </td>
                `;
                tbody.appendChild(row);
                
                if (canAdjust) {
                    row.querySelector(".btn-adjust-shift").addEventListener("click", () => {
                        showAdjustCashModal(doc.id);
                    });
                }

                row.querySelector(".btn-view-history").addEventListener("click", () => {
                    showShiftHistoryModal(data.adjustments || []);
                });
            });
        }, (error) => {
            console.error("Error fetching shifts:", error);
            if (error.message.includes("requires an index")) {
                tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center text-red-500">Missing Index. Please check the browser console and click the link to create it.</td></tr>`;
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center text-red-500">Error loading shifts.</td></tr>`;
            }
        });
    } catch (error) {
        console.error("Setup error for shifts listener:", error);
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
                if (error.message.includes("requires an index")) {
                    alert("Database configuration error: A composite index is required. Please check the browser console for the setup link and create the index.");
                } else {
                    alert("Failed to close shift. Please try again.");
                }
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
    
    const adjustment = {
        amount: parseFloat(amount),
        reason: reason,
        timestamp: new Date(),
        user: auth.currentUser.email
    };
    
    const shiftRef = doc(firestore, "shifts", shiftId);
    const shiftSnap = await getDoc(shiftRef);
    const isClosed = shiftSnap.exists() && shiftSnap.data().status === 'closed';

    const updateData = {
        adjustments: arrayUnion(adjustment)
    };

    // If closed, we adjust the physical count (closing_cash). 
    // If open, we adjust the target (expected_cash).
    if (isClosed) {
        updateData.closing_cash = increment(adjustment.amount);
    } else {
        updateData.expected_cash = increment(adjustment.amount);
    }

    await updateDoc(shiftRef, updateData);
    
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
            const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
            const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
            return tB - tA;
        });

        rows = sorted.map(adj => {
            const date = adj.timestamp?.toDate ? adj.timestamp.toDate().toLocaleString() : new Date(adj.timestamp).toLocaleString();
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