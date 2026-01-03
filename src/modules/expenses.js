import { checkPermission } from "../auth.js";

const API_URL = 'api/router.php';

let suppliersList = [];

export async function loadExpensesView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("expenses", "write");
    
    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Expense Management</h2>
                <button id="btn-add-expense" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${canWrite ? '' : 'hidden'}">
                    + Add Expense
                </button>
            </div>

            <!-- Expenses Table -->
            <div class="bg-white shadow-md rounded overflow-hidden">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Date</th>
                            <th class="py-3 px-6 text-left">Description</th>
                            <th class="py-3 px-6 text-left">Category</th>
                            <th class="py-3 px-6 text-left">Supplier</th>
                            <th class="py-3 px-6 text-right">Amount</th>
                            <th class="py-3 px-6 text-left">User</th>
                            <th class="py-3 px-6 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="expenses-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="7" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add Expense Modal -->
        <div id="modal-add-expense" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 text-center mb-4">Record Expense</h3>
                    <form id="form-add-expense">
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Description</label>
                            <input type="text" id="exp-desc" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-red-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Amount (PHP)</label>
                            <input type="number" step="0.01" id="exp-amount" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-red-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Category</label>
                            <select id="exp-category" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-red-500">
                                <option value="Procurement">Procurement (Stock)</option>
                                <option value="Utilities">Utilities</option>
                                <option value="Rent">Rent</option>
                                <option value="Salary">Salary</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Supplier (Optional)</label>
                            <select id="exp-supplier" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-red-500">
                                <option value="">None</option>
                            </select>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Date</label>
                            <input type="date" id="exp-date" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-red-500" required>
                        </div>
                        
                        <div class="flex items-center justify-between mt-6">
                            <button type="button" id="btn-cancel-expense" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none">Cancel</button>
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Set default date
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    document.getElementById("exp-date").value = `${year}-${month}-${day}`;

    // Event Listeners
    const modal = document.getElementById("modal-add-expense");
    if (canWrite) {
        document.getElementById("btn-add-expense").addEventListener("click", () => modal.classList.remove("hidden"));
    }
    document.getElementById("btn-cancel-expense").addEventListener("click", () => modal.classList.add("hidden"));

    document.getElementById("form-add-expense").addEventListener("submit", async (e) => {
        e.preventDefault();
        await saveExpense();
    });

    await Promise.all([fetchSuppliers(), fetchExpenses()]);
}

async function fetchSuppliers() {
    try {
        const response = await fetch(`${API_URL}?file=suppliers`);
        const data = await response.json();
        suppliersList = Array.isArray(data) ? data : [];

        const select = document.getElementById("exp-supplier");
        select.innerHTML = '<option value="">None</option>';
        
        suppliersList.forEach(sup => {
            const option = document.createElement("option");
            option.value = sup.id;
            option.textContent = sup.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading suppliers:", error);
    }
}

async function saveExpense() {
    const desc = document.getElementById("exp-desc").value;
    const amount = parseFloat(document.getElementById("exp-amount").value);
    const category = document.getElementById("exp-category").value;
    const supplierId = document.getElementById("exp-supplier").value;
    const dateVal = document.getElementById("exp-date").value;
    
    const supplierName = supplierId ? suppliersList.find(s => s.id === supplierId)?.name : null;
    const user = JSON.parse(localStorage.getItem('pos_user'))?.email || "Unknown";

    try {
        const response = await fetch(`${API_URL}?file=expenses`);
        let expenses = await response.json();
        if (!Array.isArray(expenses)) expenses = [];

        expenses.push({
            id: crypto.randomUUID(),
            description: desc,
            amount: amount,
            category: category,
            supplier_id: supplierId,
            supplier_name: supplierName,
            date: new Date(dateVal),
            user_id: user,
            created_at: new Date()
        });

        await fetch(`${API_URL}?file=expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenses)
        });
        
        document.getElementById("modal-add-expense").classList.add("hidden");
        document.getElementById("form-add-expense").reset();
        
        // Reset date
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        document.getElementById("exp-date").value = `${year}-${month}-${day}`;

        fetchExpenses();
    } catch (error) {
        console.error("Error saving expense:", error);
        alert("Failed to save expense.");
    }
}

async function fetchExpenses() {
    const tbody = document.getElementById("expenses-table-body");
    const canWrite = checkPermission("expenses", "write");
    tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center">Loading...</td></tr>`;

    try {
        const response = await fetch(`${API_URL}?file=expenses`);
        let expenses = await response.json();
        if (!Array.isArray(expenses)) expenses = [];

        // Sort by date desc and limit to 50
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        expenses = expenses.slice(0, 50);
        
        tbody.innerHTML = "";

        if (expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center">No expenses recorded.</td></tr>`;
            return;
        }

        expenses.forEach(data => {
            const dateStr = new Date(data.date).toLocaleDateString();
            
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${dateStr}</td>
                <td class="py-3 px-6 text-left font-medium">${data.description}</td>
                <td class="py-3 px-6 text-left"><span class="bg-gray-200 text-gray-700 py-1 px-3 rounded-full text-xs">${data.category}</span></td>
                <td class="py-3 px-6 text-left">${data.supplier_name || '-'}</td>
                <td class="py-3 px-6 text-right font-bold text-red-600">₱${data.amount.toFixed(2)}</td>
                <td class="py-3 px-6 text-left text-xs text-gray-500">${data.user_id}</td>
                <td class="py-3 px-6 text-center">
                    <button class="text-red-500 hover:text-red-700 delete-btn ${canWrite ? '' : 'hidden'}" data-id="${data.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </td>
            `;
            
            row.querySelector(".delete-btn").addEventListener("click", async (e) => {
                if (confirm("Delete this expense record?")) {
                    const id = e.currentTarget.getAttribute("data-id");
                    
                    const res = await fetch(`${API_URL}?file=expenses`);
                    let current = await res.json();
                    const updated = current.filter(ex => ex.id !== id);
                    
                    await fetch(`${API_URL}?file=expenses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updated)
                    });

                    fetchExpenses();
                }
            });

            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching expenses:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}