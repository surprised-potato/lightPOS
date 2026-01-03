import { db } from "../db.js";

export async function loadDashboardView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>
            
            <!-- KPIs -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                    <div class="text-gray-500 text-sm font-bold uppercase mb-1">Total Sales</div>
                    <div class="text-3xl font-bold text-gray-800" id="dash-total-sales">₱0.00</div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
                    <div class="text-gray-500 text-sm font-bold uppercase mb-1">Total Profit</div>
                    <div class="text-3xl font-bold text-gray-800" id="dash-total-profit">₱0.00</div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-purple-500">
                    <div class="text-gray-500 text-sm font-bold uppercase mb-1">Transactions</div>
                    <div class="text-3xl font-bold text-gray-800" id="dash-total-count">0</div>
                </div>
            </div>

            <!-- Charts & Alerts Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <!-- Sales Trend Chart -->
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <h3 class="font-bold text-gray-800 mb-4">Sales Trend (Last 7 Days)</h3>
                    <div class="relative h-64 w-full">
                        <canvas id="salesChart"></canvas>
                    </div>
                </div>

                <!-- Low Stock Alerts -->
                <div class="bg-white p-4 rounded-lg shadow-md overflow-hidden">
                    <h3 class="font-bold text-gray-800 mb-4 text-red-600">Low Stock Alerts</h3>
                    <div class="overflow-y-auto h-64">
                        <table class="min-w-full text-sm">
                            <tbody id="dash-low-stock-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Recent Transactions -->
            <div class="bg-white shadow-md rounded overflow-hidden mb-8">
                <div class="px-6 py-4 border-b flex justify-between items-center">
                    <h3 class="font-bold text-gray-800">Recent Transactions</h3>
                    <button id="btn-refresh-dash" class="text-sm text-blue-600 hover:text-blue-800">Refresh</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full table-auto">
                        <thead>
                            <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                                <th class="py-3 px-6 text-left">Time</th>
                                <th class="py-3 px-6 text-left">Items</th>
                                <th class="py-3 px-6 text-right">Total</th>
                                <th class="py-3 px-6 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody id="dash-tx-body" class="text-gray-600 text-sm font-light">
                            <tr><td colspan="4" class="py-3 px-6 text-center">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.getElementById("btn-refresh-dash").addEventListener("click", renderRecentTransactions);
    await renderRecentTransactions();
}

let salesChartInstance = null;

async function renderRecentTransactions() {
    const tbody = document.getElementById("dash-tx-body");
    const lowStockBody = document.getElementById("dash-low-stock-body");
    const totalSalesEl = document.getElementById("dash-total-sales");
    const totalProfitEl = document.getElementById("dash-total-profit");
    const totalCountEl = document.getElementById("dash-total-count");

    try {
        // 1. Fetch Data
        const allTxs = await db.transactions.toArray();
        const allItems = await db.items.toArray();

        // 2. Calculate KPIs
        let totalSales = 0;
        let totalProfit = 0;
        const salesByDate = {};

        allTxs.forEach(tx => {
            totalSales += tx.total_amount;
            
            // Calculate Profit
            tx.items.forEach(item => {
                const cost = item.cost_price || 0;
                const price = item.selling_price || 0;
                totalProfit += (price - cost) * item.qty;
            });

            // Group for Chart (YYYY-MM-DD)
            const dateObj = new Date(tx.timestamp);
            const dateKey = dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD
            salesByDate[dateKey] = (salesByDate[dateKey] || 0) + tx.total_amount;
        });
        
        totalSalesEl.textContent = `₱${totalSales.toFixed(2)}`;
        totalProfitEl.textContent = `₱${totalProfit.toFixed(2)}`;
        totalCountEl.textContent = allTxs.length;

        // 3. Render Chart
        renderChart(salesByDate);

        // 4. Render Low Stock
        const lowStockItems = allItems.filter(i => i.stock_level <= (i.min_stock || 10));
        lowStockBody.innerHTML = lowStockItems.length ? "" : "<tr><td class='p-2 text-gray-500'>No low stock items.</td></tr>";
        
        lowStockItems.forEach(item => {
            const row = document.createElement("tr");
            row.className = "border-b last:border-0";
            row.innerHTML = `
                <td class="py-2 text-gray-800 font-medium">${item.name}</td>
                <td class="py-2 text-right text-red-600 font-bold">${item.stock_level}</td>
            `;
            lowStockBody.appendChild(row);
        });

        // 5. Render Recent Transactions Table
        const transactions = await db.transactions.orderBy("timestamp").reverse().limit(20).toArray();
        tbody.innerHTML = "";
        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No transactions found.</td></tr>`;
            return;
        }

        transactions.forEach(tx => {
            const dateObj = new Date(tx.timestamp);
            const timeStr = dateObj.toLocaleString();
            const itemCount = tx.items.reduce((acc, i) => acc + i.qty, 0);
            
            // Status: 0 = Unsynced, 1 = Synced
            const statusBadge = tx.sync_status === 1 
                ? `<span class="bg-green-200 text-green-700 py-1 px-3 rounded-full text-xs">Synced</span>`
                : `<span class="bg-yellow-200 text-yellow-700 py-1 px-3 rounded-full text-xs">Pending</span>`;

            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap">${timeStr}</td>
                <td class="py-3 px-6 text-left">${itemCount} items</td>
                <td class="py-3 px-6 text-right font-bold">₱${tx.total_amount.toFixed(2)}</td>
                <td class="py-3 px-6 text-center">${statusBadge}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

function renderChart(salesByDate) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    
    // Get last 7 days labels
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString('en-CA');
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        data.push(salesByDate[dateKey] || 0);
    }

    if (salesChartInstance) {
        salesChartInstance.destroy();
    }

    salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales (₱)',
                data: data,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}