import { checkPermission, requestManagerApproval } from "../auth.js";
import { generateUUID } from "../utils.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";
import { dbPromise } from "../db.js";
import { printTransactionReceipt } from "./reports.js";

let customersData = [];
let selectedCustomerId = null;
let customerTransactions = [];

export async function loadCustomersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("customers", "write"); 

    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <!-- Left Column: Customers List (5/12) -->
                <div class="lg:col-span-5">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 md:mb-0">Customers</h2>
                        <div class="flex w-full md:w-auto gap-2">
                            <input type="text" id="search-customers" placeholder="Search..." class="shadow appearance-none border rounded w-full py-2 px-3 text-xs text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <button id="btn-add-customer" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 whitespace-nowrap text-xs ${canWrite ? '' : 'hidden'}">
                                + Add
                            </button>
                        </div>
                    </div>

                    <div class="bg-white shadow-md rounded overflow-hidden">
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                    <th class="py-3 px-4 text-left">Name</th>
                                    <th class="py-3 px-4 text-left">Phone</th>
                                    <th class="py-3 px-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="customers-table-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="3" class="py-3 px-6 text-center">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right Column: Customer Insights (7/12) -->
                <div id="customer-insights-panel" class="lg:col-span-7 hidden space-y-6 sticky top-6 self-start">
                    <!-- Table 1: Stats -->
                    <div class="bg-white shadow-md rounded p-4 border-t-4 border-blue-500">
                        <h3 class="text-sm font-bold text-gray-500 uppercase mb-3">Customer Statistics</h3>
                        <table class="min-w-full text-sm">
                            <tbody id="customer-stats-body" class="divide-y divide-gray-100">
                                <!-- Stats Rows -->
                            </tbody>
                        </table>
                    </div>

                    <!-- Table 2: Transaction History -->
                    <div class="bg-white shadow-md rounded overflow-hidden">
                        <div class="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                            <h3 class="text-xs font-bold text-gray-500 uppercase">Transaction History</h3>
                        </div>
                        <div class="max-h-60 overflow-y-auto">
                            <table class="min-w-full table-auto">
                                <thead class="bg-gray-100 sticky top-0">
                                    <tr class="text-[10px] text-gray-500 uppercase">
                                        <th class="py-2 px-4 text-left">Date</th>
                                        <th class="py-2 px-4 text-right">Total</th>
                                        <th class="py-2 px-4 text-center">Print</th>
                                    </tr>
                                </thead>
                                <tbody id="customer-history-body" class="text-xs text-gray-600">
                                    <!-- History Rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Table 3: Top Items -->
                    <div class="bg-white shadow-md rounded overflow-hidden">
                        <div class="bg-gray-50 px-4 py-2 border-b">
                            <h3 class="text-xs font-bold text-gray-500 uppercase">Top 10 Purchased Items</h3>
                        </div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="text-[10px] text-gray-500 uppercase bg-gray-100">
                                    <th class="py-2 px-4 text-left">Item Name</th>
                                    <th class="py-2 px-4 text-right">Qty</th>
                                </tr>
                            </thead>
                            <tbody id="customer-top-items-body" class="text-xs text-gray-600">
                                <!-- Top Items Rows -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Customer Modal -->
        <div id="modal-add-customer" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 text-center mb-4">Customer Details</h3>
                    <form id="form-add-customer">
                        <input type="hidden" id="cust-id">
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Account Number</label>
                            <input type="text" id="cust-account" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Full Name</label>
                            <input type="text" id="cust-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Phone Number</label>
                            <input type="text" id="cust-phone" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Email (Optional)</label>
                            <input type="email" id="cust-email" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Loyalty Points</label>
                            <input type="number" id="cust-points" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" value="0">
                        </div>
                        <div class="flex items-center justify-between mt-6">
                            <button type="button" id="btn-cancel-customer" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none">Cancel</button>
                            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    if (canWrite) {
        document.getElementById("btn-add-customer").addEventListener("click", () => {
            document.getElementById("form-add-customer").reset();
            document.getElementById("cust-id").value = "";
            document.getElementById("modal-add-customer").classList.remove("hidden");
        });
    }

    document.getElementById("btn-cancel-customer").addEventListener("click", () => {
        document.getElementById("modal-add-customer").classList.add("hidden");
    });

    document.getElementById("form-add-customer").addEventListener("submit", handleSaveCustomer);
    
    document.getElementById("search-customers").addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = customersData.filter(c => 
            c.name.toLowerCase().includes(term) || 
            c.phone.includes(term) ||
            (c.account_number && c.account_number.toLowerCase().includes(term))
        );
        renderCustomers(filtered);
    });

    selectedCustomerId = null;
    await fetchCustomers();
}

async function fetchCustomers() {
    const tbody = document.getElementById("customers-table-body");
    try {
        // Fetch from Dexie for immediate display and offline support
        customersData = await Repository.getAll('customers');
        renderCustomers(customersData);
        // sync-service.js handles background synchronization from server
    } catch (error) {
        console.error("Error fetching customers:", error);
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

function renderCustomers(customers) {
    const tbody = document.getElementById("customers-table-body");
    const canWrite = checkPermission("pos", "write");
    tbody.innerHTML = "";

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No customers found.</td></tr>`;
        return;
    }

    customers.forEach(cust => {
        const row = document.createElement("tr");
        row.className = `border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${selectedCustomerId === cust.id ? 'bg-blue-50' : ''}`;
        row.innerHTML = `
            <td class="py-3 px-4 text-left font-medium">${cust.name}</td>
            <td class="py-3 px-4 text-left text-xs">${cust.phone}</td>
            <td class="py-3 px-4 text-center">
                <button class="text-blue-500 hover:text-blue-700 edit-btn ${canWrite ? '' : 'hidden'}" data-id="${cust.id}">Edit</button>
            </td>
        `;
        
        row.addEventListener("click", (e) => {
            if (e.target.closest(".edit-btn")) return;
            selectCustomer(cust);
        });

        if (canWrite) {
            row.querySelector(".edit-btn").addEventListener("click", () => openEditModal(cust));
        }
        tbody.appendChild(row);
    });
}

function openEditModal(cust) {
    document.getElementById("cust-id").value = cust.id;
    document.getElementById("cust-account").value = cust.account_number || "";
    document.getElementById("cust-name").value = cust.name;
    document.getElementById("cust-phone").value = cust.phone;
    document.getElementById("cust-email").value = cust.email || "";
    document.getElementById("cust-points").value = cust.loyalty_points || 0;
    document.getElementById("modal-add-customer").classList.remove("hidden");
}

async function selectCustomer(cust) {
    const db = await dbPromise;
    selectedCustomerId = cust.id;
    document.getElementById("customer-insights-panel").classList.remove("hidden");
    
    // Highlight selected row
    document.querySelectorAll("#customers-table-body tr").forEach(row => {
        row.classList.remove("bg-blue-50");
    });
    const rows = document.querySelectorAll("#customers-table-body tr");
    const idx = customersData.findIndex(c => c.id === cust.id);
    if (idx !== -1 && rows[idx]) rows[idx].classList.add("bg-blue-50");

    // Fetch Transactions
    customerTransactions = await db.transactions
        .where('customer_id').equals(cust.id)
        .and(t => !t._deleted && !t.is_voided)
        .toArray();
    
    customerTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    renderCustomerStats(cust);
    renderCustomerHistory();
    renderCustomerTopItems();
}

function renderCustomerStats(cust) {
    const tbody = document.getElementById("customer-stats-body");
    const totalSpent = customerTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
    const avgSpend = customerTransactions.length > 0 ? totalSpent / customerTransactions.length : 0;
    
    let frequency = "N/A";
    if (customerTransactions.length > 1) {
        const dates = customerTransactions.map(t => new Date(t.timestamp)).sort((a, b) => a - b);
        const diffDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
        frequency = `Every ${(diffDays / (customerTransactions.length - 1)).toFixed(1)} days`;
    }

    const stats = [
        { label: "Total Visits", value: customerTransactions.length },
        { label: "Total Spent", value: `₱${totalSpent.toFixed(2)}` },
        { label: "Avg. Transaction", value: `₱${avgSpend.toFixed(2)}` },
        { label: "Visit Frequency", value: frequency },
        { label: "Loyalty Points", value: cust.loyalty_points || 0 }
    ];

    tbody.innerHTML = stats.map(s => `
        <tr>
            <td class="py-2 text-gray-500 font-medium">${s.label}</td>
            <td class="py-2 text-right font-bold text-gray-800">${s.value}</td>
        </tr>
    `).join('');
}

function renderCustomerHistory() {
    const tbody = document.getElementById("customer-history-body");
    
    tbody.innerHTML = customerTransactions.map(tx => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-2 px-4">${new Date(tx.timestamp).toLocaleDateString()}</td>
            <td class="py-2 px-4 text-right font-bold">₱${tx.total_amount.toFixed(2)}</td>
            <td class="py-2 px-4 text-center">
                <button class="text-blue-600 hover:text-blue-800 btn-quick-print" data-id="${tx.id}">
                    🖨️
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll(".btn-quick-print").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const tx = customerTransactions.find(t => t.id == btn.dataset.id);
            if (tx) printTransactionReceipt(tx);
        });
    });

    if (customerTransactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-gray-400 italic">No transactions found.</td></tr>`;
    }
}

function renderCustomerTopItems() {
    const tbody = document.getElementById("customer-top-items-body");
    const itemMap = {};
    
    customerTransactions.forEach(tx => {
        tx.items.forEach(item => {
            itemMap[item.name] = (itemMap[item.name] || 0) + item.qty;
        });
    });

    const topItems = Object.entries(itemMap)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

    tbody.innerHTML = topItems.map(i => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-2 px-4 font-medium">${i.name}</td>
            <td class="py-2 px-4 text-right font-bold text-blue-600">${i.qty}</td>
        </tr>
    `).join('');

    if (topItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="py-4 text-center text-gray-400 italic">No items purchased yet.</td></tr>`;
    }
}

async function handleSaveCustomer(e) {
    e.preventDefault();
    const db = await dbPromise;
    const id = document.getElementById("cust-id").value;
    const newPoints = parseInt(document.getElementById("cust-points").value) || 0;

    // Require manager approval if loyalty points are being changed or set initially
    if (id) {
        const existing = await Repository.get('customers', id);
        if (existing && existing.loyalty_points !== newPoints) {
            const approved = await requestManagerApproval();
            if (!approved) return;
        }
    } else if (newPoints !== 0) {
        // New customer with non-zero points
        const approved = await requestManagerApproval();
        if (!approved) return;
    }

    const customerData = {
        id: id || generateUUID(),
        account_number: document.getElementById("cust-account").value,
        name: document.getElementById("cust-name").value,
        phone: document.getElementById("cust-phone").value,
        email: document.getElementById("cust-email").value,
        loyalty_points: newPoints,
        timestamp: new Date(),
        sync_status: 0
    };

    // 1. Save to Repository (Offline First + Outbox)
    await Repository.upsert('customers', customerData);

    // 2. Trigger Sync
    SyncEngine.sync();

    document.getElementById("modal-add-customer").classList.add("hidden");
    fetchCustomers();
}