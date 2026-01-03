import { db } from "../db.js";

export async function loadReportsView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Advanced Reports</h2>
            
            <!-- Controls -->
            <div class="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap gap-4 items-end">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Start Date</label>
                    <input type="date" id="report-start" class="border rounded p-2 text-sm">
                </div>
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">End Date</label>
                    <input type="date" id="report-end" class="border rounded p-2 text-sm">
                </div>
                <button id="btn-generate-report" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition">
                    Generate Report
                </button>
            </div>

            <!-- Financial Summary -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                    <div class="text-gray-500 text-sm font-bold uppercase mb-1">Gross Sales</div>
                    <div class="text-3xl font-bold text-gray-800" id="report-gross-sales">₱0.00</div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-500">
                    <div class="text-gray-500 text-sm font-bold uppercase mb-1">Cost of Goods</div>
                    <div class="text-3xl font-bold text-gray-800" id="report-cogs">₱0.00</div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
                    <div class="text-gray-500 text-sm font-bold uppercase mb-1">Gross Profit</div>
                    <div class="text-3xl font-bold text-gray-800" id="report-profit">₱0.00</div>
                </div>
            </div>

            <!-- Sales by User -->
            <div class="bg-white shadow-md rounded overflow-hidden mb-8">
                <div class="px-6 py-4 border-b bg-gray-50">
                    <h3 class="font-bold text-gray-800">Sales by User</h3>
                </div>
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">User</th>
                            <th class="py-3 px-6 text-center">Transactions</th>
                            <th class="py-3 px-6 text-right">Total Sales</th>
                        </tr>
                    </thead>
                    <tbody id="report-users-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="3" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Set default dates (Today - Local Time)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    document.getElementById("report-start").value = today;
    document.getElementById("report-end").value = today;

    document.getElementById("btn-generate-report").addEventListener("click", generateReport);
}

async function generateReport() {
    const startVal = document.getElementById("report-start").value;
    const endVal = document.getElementById("report-end").value;
    const usersBody = document.getElementById("report-users-body");

    if (!startVal || !endVal) {
        alert("Please select a date range.");
        return;
    }

    usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">Loading data from cloud...</td></tr>`;

    try {
        // Create Date objects for query
        const [sy, sm, sd] = startVal.split('-').map(Number);
        const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        
        const [ey, em, ed] = endVal.split('-').map(Number);
        const endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);

        // Query Dexie instead of Firestore
        const transactions = await db.transactions
            .where('timestamp')
            .between(startDate, endDate, true, true)
            .toArray();
        
        let grossSales = 0;
        let cogs = 0;
        const userStats = {};

        if (transactions.length === 0) {
            usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No transactions found for this period.</td></tr>`;
            updateFinancials(0, 0);
            return;
        }

        transactions.forEach(data => {
            // Financials
            grossSales += data.total_amount || 0;
            
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach(item => {
                    const cost = item.cost_price || 0;
                    cogs += cost * (item.qty || 0);
                });
            }

            // User Stats
            const user = data.user_email || "Unknown";
            if (!userStats[user]) {
                userStats[user] = { count: 0, total: 0 };
            }
            userStats[user].count++;
            userStats[user].total += data.total_amount || 0;
        });

        updateFinancials(grossSales, cogs);
        renderUserStats(userStats);

    } catch (error) {
        console.error("Error generating report:", error);
        usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading report data.</td></tr>`;
    }
}

function updateFinancials(sales, cost) {
    document.getElementById("report-gross-sales").textContent = `₱${sales.toFixed(2)}`;
    document.getElementById("report-cogs").textContent = `₱${cost.toFixed(2)}`;
    document.getElementById("report-profit").textContent = `₱${(sales - cost).toFixed(2)}`;
}

function renderUserStats(stats) {
    const tbody = document.getElementById("report-users-body");
    tbody.innerHTML = "";

    Object.keys(stats).forEach(user => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${user}</td>
            <td class="py-3 px-6 text-center">${stats[user].count}</td>
            <td class="py-3 px-6 text-right font-bold">₱${stats[user].total.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}