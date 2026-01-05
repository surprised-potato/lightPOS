import { checkPermission, requestManagerApproval } from "../auth.js";
import { generateUUID } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";

let customersData = [];

export async function loadCustomersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("customers", "write"); 

    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 md:mb-0">Customers</h2>
                <div class="flex w-full md:w-auto gap-2">
                    <input type="text" id="search-customers" placeholder="Search by name or phone..." class="shadow appearance-none border rounded w-full md:w-64 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <button id="btn-add-customer" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 whitespace-nowrap ${canWrite ? '' : 'hidden'}">
                        + Add Customer
                    </button>
                </div>
            </div>

            <div class="bg-white shadow-md rounded overflow-hidden">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Account #</th>
                            <th class="py-3 px-6 text-left">Name</th>
                            <th class="py-3 px-6 text-left">Phone</th>
                            <th class="py-3 px-6 text-left">Email</th>
                            <th class="py-3 px-6 text-right">Loyalty Points</th>
                            <th class="py-3 px-6 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="customers-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="6" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
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

        <!-- Customer History Modal -->
        <div id="modal-customer-history" class="fixed inset-0 bg-gray-900 bg-opacity-75 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                <div class="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 class="text-lg font-bold text-gray-800">Transaction History: <span id="history-cust-name" class="text-blue-600"></span></h3>
                    <button id="btn-close-history" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="p-0 overflow-y-auto flex-1">
                    <table class="min-w-full table-auto">
                        <thead class="bg-gray-100 sticky top-0">
                            <tr class="text-xs text-gray-500 uppercase text-left">
                                <th class="py-2 px-4">Date</th>
                                <th class="py-2 px-4">Items</th>
                                <th class="py-2 px-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody id="history-table-body" class="text-sm text-gray-600 divide-y divide-gray-100">
                            <!-- Rows -->
                        </tbody>
                    </table>
                </div>
                
                <div class="p-4 border-t bg-gray-50 rounded-b-lg text-right">
                    <span class="text-sm text-gray-500 mr-2">Total Spent:</span>
                    <span id="history-total-spent" class="font-bold text-lg text-green-600">₱0.00</span>
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
    
    document.getElementById("btn-close-history").addEventListener("click", () => {
        document.getElementById("modal-customer-history").classList.add("hidden");
    });

    document.getElementById("search-customers").addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = customersData.filter(c => 
            c.name.toLowerCase().includes(term) || 
            c.phone.includes(term) ||
            (c.account_number && c.account_number.toLowerCase().includes(term))
        );
        renderCustomers(filtered);
    });

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
        tbody.innerHTML = `<tr><td colspan="6" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

function renderCustomers(customers) {
    const tbody = document.getElementById("customers-table-body");
    const canWrite = checkPermission("pos", "write");
    tbody.innerHTML = "";

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-3 px-6 text-center">No customers found.</td></tr>`;
        return;
    }

    customers.forEach(cust => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-mono text-xs">${cust.account_number || '-'}</td>
            <td class="py-3 px-6 text-left font-medium">${cust.name}</td>
            <td class="py-3 px-6 text-left">${cust.phone}</td>
            <td class="py-3 px-6 text-left">${cust.email || '-'}</td>
            <td class="py-3 px-6 text-right font-bold text-blue-600">${cust.loyalty_points || 0}</td>
            <td class="py-3 px-6 text-center">
                <button class="text-blue-500 hover:text-blue-700 edit-btn mr-2 ${canWrite ? '' : 'hidden'}" data-id="${cust.id}">Edit</button>
                <button class="text-gray-500 hover:text-gray-700 history-btn text-xs border border-gray-300 rounded px-2 py-1" data-id="${cust.id}">History</button>
            </td>
        `;
        
        if (canWrite) {
            row.querySelector(".edit-btn").addEventListener("click", () => openEditModal(cust));
        }
        row.querySelector(".history-btn").addEventListener("click", () => viewCustomerHistory(cust));
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

async function handleSaveCustomer(e) {
    e.preventDefault();
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

async function viewCustomerHistory(customer) {
    const modal = document.getElementById("modal-customer-history");
    const tbody = document.getElementById("history-table-body");
    const nameEl = document.getElementById("history-cust-name");
    const totalEl = document.getElementById("history-total-spent");
    
    nameEl.textContent = customer.name;
    tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center">Loading history...</td></tr>`;
    modal.classList.remove("hidden");
    
    try {
        // Use Repository for offline-first history
        const transactions = await Repository.getAll('transactions');

        const custTx = transactions.filter(t => t.customer_id === customer.id);
        
        // Sort desc
        custTx.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        tbody.innerHTML = "";
        let grandTotal = 0;
        
        if (custTx.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-500">No transaction history found.</td></tr>`;
        } else {
            custTx.forEach(tx => {
                grandTotal += tx.total_amount || 0;
                const date = new Date(tx.timestamp).toLocaleString();
                const itemsSummary = tx.items.map(i => `${i.qty}x ${i.name}`).join(", ");
                
                tbody.innerHTML += `
                    <tr class="hover:bg-gray-50">
                        <td class="py-2 px-4 whitespace-nowrap">${date}</td>
                        <td class="py-2 px-4 truncate max-w-xs" title="${itemsSummary}">${itemsSummary}</td>
                        <td class="py-2 px-4 text-right font-medium">₱${(tx.total_amount || 0).toFixed(2)}</td>
                    </tr>
                `;
            });
        }
        totalEl.textContent = `₱${grandTotal.toFixed(2)}`;
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-500">Error loading history.</td></tr>`;
    }
}