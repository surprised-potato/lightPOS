import { db } from "../db.js";
import { getUserProfile } from "../auth.js";
import { checkActiveShift, calculateExpectedCash } from "./shift.js";

export async function loadDashboardView() {
    const user = getUserProfile();
    const content = document.getElementById("main-content");
    
    if (user.role === 'cashier') {
        await renderCashierDashboard(content, user);
        return;
    }

    renderManagerDashboard(content);
    
    const refreshBtn = document.getElementById("btn-refresh-dash");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", refreshDashboard);
    }

    await refreshDashboard();
}

let velocityChartInstance = null;
let tenderChartInstance = null;

async function renderCashierDashboard(content, user) {
    const todayStr = new Date().toLocaleDateString('en-CA');
    
    // Sync shifts first for accurate count
    await checkActiveShift();

    const [todayTxs, allShifts] = await Promise.all([
        db.transactions
            .filter(tx => new Date(tx.timestamp).toLocaleDateString('en-CA') === todayStr && !tx.is_voided)
            .toArray(),
        db.shifts.toArray()
    ]);
    
    const openShiftsCount = allShifts.filter(s => s.status === 'open').length;
    
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-6">
            <div class="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md border border-blue-50 w-full">
                <div class="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span class="text-4xl">👋</span>
                </div>
                <h2 class="text-3xl font-black text-gray-800 mb-2">Hello, ${user.name || 'Cashier'}!</h2>
                <p class="text-gray-500 mb-8 font-medium">Ready for another productive shift?</p>
                
                <div class="grid grid-cols-2 gap-4 mb-8">
                    <div class="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-inner text-white">
                        <div class="text-blue-100 text-[10px] font-bold uppercase tracking-widest mb-1">Transactions</div>
                        <div class="text-4xl font-black">${todayTxs.length}</div>
                    </div>
                    <div class="bg-gradient-to-br from-purple-600 to-indigo-700 p-6 rounded-2xl shadow-inner text-white">
                        <div class="text-purple-100 text-[10px] font-bold uppercase tracking-widest mb-1">Open Shifts</div>
                        <div class="text-4xl font-black">${openShiftsCount}</div>
                    </div>
                </div>
                
                <button onclick="location.hash='#pos'" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transition transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    Open POS Terminal
                </button>
            </div>
        </div>
    `;
}

function renderManagerDashboard(content) {
    content.innerHTML = `
        <div class="p-6 max-w-7xl mx-auto">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">Business Overview</h2>
                    <p class="text-sm text-gray-500">Real-time performance and operational alerts.</p>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex flex-col items-end">
                        <span class="text-[10px] font-bold text-gray-400 uppercase">Store Location</span>
                        <select id="store-selector" class="text-sm border-none font-bold text-blue-600 bg-transparent focus:ring-0 p-0 cursor-pointer">
                            <option value="main">Main Branch</option>
                        </select>
                    </div>
                    <div class="h-8 w-px bg-gray-200 mx-2"></div>
                    <button id="btn-refresh-dash" class="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        Refresh
                    </button>
                </div>
            </div>
            
            <!-- Pulse Strip: Real-Time KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Net Sales (Today)</div>
                        <span class="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </span>
                    </div>
                    <div class="text-2xl font-black text-gray-800" id="dash-net-sales">₱0.00</div>
                    <div class="flex items-center gap-1 mt-1">
                        <span id="dash-sales-compare-icon"></span>
                        <span class="text-[10px] font-bold" id="dash-sales-compare">--% vs last week</span>
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Gross Margin</div>
                        <span class="bg-green-100 text-green-600 p-1.5 rounded-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        </span>
                    </div>
                    <div class="text-2xl font-black text-gray-800" id="dash-margin">0.00%</div>
                    <div class="text-[10px] text-gray-400 mt-1 font-medium">Revenue vs COGS</div>
                </div>

                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Transactions</div>
                        <span class="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                        </span>
                    </div>
                    <div class="text-2xl font-black text-gray-800" id="dash-tx-count">0</div>
                    <div class="text-[10px] text-gray-400 mt-1 font-medium" id="dash-atv">ATV: ₱0.00</div>
                </div>

                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-start mb-2">
                        <div class="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Open Shifts</div>
                        <span class="bg-purple-100 text-purple-600 p-1.5 rounded-lg">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        </span>
                    </div>
                    <div class="text-2xl font-black text-gray-800" id="dash-open-shifts">0</div>
                    <div class="text-[10px] text-gray-400 mt-1 font-medium">Active register sessions</div>
                </div>
            </div>

            <!-- Main Content Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <!-- Left: Sales Velocity -->
                <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div class="flex justify-between items-center mb-6">
                        <div>
                            <h3 class="font-bold text-gray-800">Sales Velocity</h3>
                            <p class="text-xs text-gray-400">Hourly revenue: Today vs Yesterday</p>
                        </div>
                    </div>
                    <div class="h-72">
                        <canvas id="velocityChart"></canvas>
                    </div>
                </div>

                <!-- Right: Action Center -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 class="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        Action Center
                        <span class="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full" id="total-alerts-badge">0</span>
                    </h3>
                    
                    <!-- Recent Transactions -->
                    <div class="mb-6">
                        <div class="text-[10px] font-bold text-gray-400 uppercase mb-3">Recent Sales</div>
                        <div id="recent-tx-list" class="space-y-3">
                            <div class="text-[10px] text-gray-400 italic">Loading...</div>
                        </div>
                    </div>
                    <div class="h-px bg-gray-100 mb-6"></div>

                    <div class="space-y-4 flex-1 overflow-y-auto pr-2">
                        <!-- Low Stock -->
                        <div class="group cursor-pointer p-3 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100 transition">
                            <div class="flex justify-between items-start">
                                <div class="flex gap-3">
                                    <div class="bg-red-200 p-2 rounded-lg text-red-700">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                                    </div>
                                    <div>
                                        <div class="text-sm font-bold text-red-900" id="alert-low-stock-count">0 Items Low Stock</div>
                                        <div class="text-[10px] text-red-700">Requires immediate reorder</div>
                                    </div>
                                </div>
                                <svg class="w-4 h-4 text-red-400 group-hover:translate-x-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </div>
                        </div>

                        <!-- Overdue POs -->
                        <div class="group cursor-pointer p-3 rounded-lg bg-orange-50 border border-orange-100 hover:bg-orange-100 transition">
                            <div class="flex justify-between items-start">
                                <div class="flex gap-3">
                                    <div class="bg-orange-200 p-2 rounded-lg text-orange-700">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    </div>
                                    <div>
                                        <div class="text-sm font-bold text-orange-900" id="alert-po-count">0 POs Overdue</div>
                                        <div class="text-[10px] text-orange-700">Supplier shipments delayed</div>
                                    </div>
                                </div>
                                <svg class="w-4 h-4 text-orange-400 group-hover:translate-x-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </div>
                        </div>

                        <!-- Security Alerts -->
                        <div class="group cursor-pointer p-3 rounded-lg bg-yellow-50 border border-yellow-100 hover:bg-yellow-100 transition">
                            <div class="flex justify-between items-start">
                                <div class="flex gap-3">
                                    <div class="bg-yellow-200 p-2 rounded-lg text-yellow-700">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    </div>
                                    <div>
                                        <div class="text-sm font-bold text-yellow-900" id="alert-security-count">0 Security Alerts</div>
                                        <div class="text-[10px] text-yellow-700" id="alert-security-detail">Voids/Returns today</div>
                                    </div>
                                </div>
                                <svg class="w-4 h-4 text-yellow-400 group-hover:translate-x-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom Row -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Top Sellers -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4">Top 5 Sellers</h3>
                    <div id="top-sellers-list" class="space-y-4">
                        <!-- Items injected here -->
                    </div>
                </div>

                <!-- Tender Split -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4">Tender Split</h3>
                    <div class="h-48">
                        <canvas id="tenderChart"></canvas>
                    </div>
                </div>

                <!-- Financials / Cash Control -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4">Financials</h3>
                    <div class="space-y-5">
                        <div>
                            <div class="text-xs text-gray-500 font-bold uppercase mb-1">Expected Cash in Drawer</div>
                            <div class="text-xl font-black text-gray-800" id="dash-expected-cash">₱0.00</div>
                        </div>
                        <div class="pt-4 border-t border-gray-50">
                            <div class="text-xs text-gray-500 font-bold uppercase mb-1">Accounts Payable (7d)</div>
                            <div class="text-lg font-bold text-red-600">₱0.00</div>
                        </div>
                    </div>
                </div>

                <!-- Relationships -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4">Relationships</h3>
                    <div class="space-y-5">
                        <div class="flex items-center justify-between">
                            <span class="text-xs text-gray-500 font-bold uppercase">New Signups</span>
                            <span class="text-lg font-black text-gray-800" id="dash-new-customers">0</span>
                        </div>
                        <div class="pt-4 border-t border-gray-50">
                            <div class="text-xs text-gray-500 font-bold uppercase mb-2">Active Staff</div>
                            <div id="active-staff-list" class="flex flex-col gap-2">
                                <div class="text-[10px] text-gray-400 italic">No active shifts</div>
                            </div>
                        </div>
                        <div class="pt-4 border-t border-gray-50">
                            <div class="text-xs text-gray-500 font-bold uppercase mb-2">Vendor Performance</div>
                            <div id="vendor-flags" class="flex flex-col gap-2">
                                <div class="flex items-center gap-2 text-[10px] font-bold text-green-600">
                                    <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                    All vendors healthy
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function refreshDashboard() {
    try {
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA');
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');

        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const lastWeekStr = lastWeek.toLocaleDateString('en-CA');

        // Sync shifts from server to local DB for accurate "Active Staff" count
        await checkActiveShift();

        // 1. Fetch Data
        const [allTxs, allItems, allReturns, allShifts, allCustomers, allUsers] = await Promise.all([
            db.transactions.toArray(),
            db.items.toArray(),
            db.returns.toArray(),
            db.shifts.toArray(),
            db.customers.toArray(),
            fetch('api/router.php?file=users').then(r => r.json()).catch(() => [])
        ]);

        // 2. Filter Data
        const todayTxs = allTxs.filter(tx => new Date(tx.timestamp).toLocaleDateString('en-CA') === todayStr && !tx.is_voided);
        const yesterdayTxs = allTxs.filter(tx => new Date(tx.timestamp).toLocaleDateString('en-CA') === yesterdayStr && !tx.is_voided);
        const lastWeekTxs = allTxs.filter(tx => new Date(tx.timestamp).toLocaleDateString('en-CA') === lastWeekStr && !tx.is_voided);
        const todayReturns = allReturns.filter(r => new Date(r.timestamp).toLocaleDateString('en-CA') === todayStr);
        const todayVoids = allTxs.filter(tx => new Date(tx.timestamp).toLocaleDateString('en-CA') === todayStr && tx.is_voided);

        // 3. Calculate KPIs
        let netSalesToday = 0;
        let totalCogsToday = 0;
        const tenderSplit = { Cash: 0, Card: 0, 'E-Wallet': 0 };
        const hourlySalesToday = new Array(24).fill(0);
        const hourlySalesYesterday = new Array(24).fill(0);
        const itemSales = {};

        todayTxs.forEach(tx => {
            netSalesToday += tx.total_amount;
            tenderSplit[tx.payment_method] = (tenderSplit[tx.payment_method] || 0) + tx.total_amount;
            
            const hour = new Date(tx.timestamp).getHours();
            hourlySalesToday[hour] += tx.total_amount;

            tx.items.forEach(item => {
                totalCogsToday += (item.cost_price || 0) * item.qty;
                itemSales[item.id] = (itemSales[item.id] || 0) + item.qty;
            });
        });

        yesterdayTxs.forEach(tx => {
            const hour = new Date(tx.timestamp).getHours();
            hourlySalesYesterday[hour] += tx.total_amount;
        });

        const netSalesLastWeek = lastWeekTxs.reduce((sum, tx) => sum + tx.total_amount, 0);
        const salesDiff = netSalesLastWeek > 0 ? ((netSalesToday - netSalesLastWeek) / netSalesLastWeek * 100).toFixed(1) : 0;
        
        const margin = netSalesToday > 0 ? ((netSalesToday - totalCogsToday) / netSalesToday * 100).toFixed(2) : 0;
        const atv = todayTxs.length > 0 ? (netSalesToday / todayTxs.length).toFixed(2) : 0;
        const openShiftsCount = allShifts.filter(s => s.status === 'open').length;

        // Update KPI DOM (Guard against navigation during async fetch)
        const netSalesEl = document.getElementById("dash-net-sales");
        if (!netSalesEl) return;

        netSalesEl.textContent = `₱${netSalesToday.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        const compareEl = document.getElementById("dash-sales-compare");
        const compareIcon = document.getElementById("dash-sales-compare-icon");
        
        compareEl.textContent = `${salesDiff >= 0 ? '+' : ''}${salesDiff}% vs last week`;
        compareEl.className = `text-[10px] font-bold ${salesDiff >= 0 ? 'text-green-600' : 'text-red-600'}`;
        compareIcon.innerHTML = salesDiff >= 0 
            ? `<svg class="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"></path></svg>`
            : `<svg class="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 112 0v7.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>`;
        
        document.getElementById("dash-margin").textContent = `${margin}%`;
        document.getElementById("dash-tx-count").textContent = todayTxs.length;
        document.getElementById("dash-atv").textContent = `ATV: ₱${atv}`;
        document.getElementById("dash-open-shifts").textContent = openShiftsCount;

        // 4. Visuals
        renderVelocityChart(hourlySalesToday, hourlySalesYesterday);
        renderTenderChart(tenderSplit);
        renderTopSellers(itemSales, allItems);
        renderRecentTransactions(allTxs);

        // 5. Action Center
        const lowStockItems = allItems.filter(i => i.stock_level <= (i.min_stock || 10));
        document.getElementById("alert-low-stock-count").textContent = `${lowStockItems.length} Items Low Stock`;
        
        // Security Alerts
        const securityCount = todayVoids.length + todayReturns.length;
        document.getElementById("alert-security-count").textContent = `${securityCount} Security Alerts`;
        document.getElementById("alert-security-detail").textContent = `${todayVoids.length} Voids, ${todayReturns.length} Returns today`;
        
        document.getElementById("total-alerts-badge").textContent = lowStockItems.length + securityCount;

        // 6. Relationships
        const newCustToday = allCustomers.filter(c => c.id !== 'Guest' && c.timestamp && new Date(c.timestamp).toLocaleDateString('en-CA') === todayStr).length;
        document.getElementById("dash-new-customers").textContent = newCustToday;
        
        // Calculate Expected Cash for Today (Per Open Shift)
        const openShifts = allShifts.filter(s => s.status === 'open');
        const expectedCashContainer = document.getElementById("dash-expected-cash");
        
        if (openShifts.length === 0) {
            expectedCashContainer.innerHTML = `₱0.00`;
        } else {
            let html = "";
            for (const s of openShifts) {
                const expected = await calculateExpectedCash(s);
                const staff = Array.isArray(allUsers) ? allUsers.find(u => u.email === s.user_id) : null;
                const displayName = staff ? staff.name : s.user_id.split('@')[0];
                html += `
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-[10px] text-gray-400 font-bold truncate mr-2">${displayName}</span>
                        <span class="text-sm font-black text-gray-800">₱${expected.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                `;
            }
            expectedCashContainer.innerHTML = html;
        }

        // Update Active Staff List
        const activeStaffList = document.getElementById("active-staff-list");
        if (openShifts.length === 0) {
            activeStaffList.innerHTML = `<div class="text-[10px] text-gray-400 italic">No active shifts</div>`;
        } else {
            activeStaffList.innerHTML = openShifts.map(s => {
                const staff = Array.isArray(allUsers) ? allUsers.find(u => u.email === s.user_id) : null;
                const displayName = staff ? staff.name : s.user_id;
                return `
                <div class="flex items-center gap-2 text-[10px] font-bold text-gray-700">
                    <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    ${displayName}
                </div>
            `}).join('');
        }

    } catch (error) {
        console.error("Dashboard refresh error:", error);
    }
}

function renderVelocityChart(today, yesterday) {
    const canvas = document.getElementById('velocityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (velocityChartInstance) velocityChartInstance.destroy();

    velocityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [
                {
                    label: 'Today',
                    data: today,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Yesterday',
                    data: yesterday,
                    borderColor: '#e5e7eb',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { color: '#f9fafb' },
                    ticks: { 
                        callback: value => '₱' + value,
                        font: { size: 10 }
                    } 
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, maxRotation: 0 }
                }
            },
            plugins: {
                legend: { 
                    position: 'top', 
                    align: 'end',
                    labels: { boxWidth: 10, font: { size: 11, weight: 'bold' } } 
                },
                tooltip: {
                    backgroundColor: '#1f2937',
                    padding: 12,
                    titleFont: { size: 12 },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: (context) => ` ${context.dataset.label}: ₱${context.raw.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function renderRecentTransactions(allTxs) {
    const list = document.getElementById("recent-tx-list");
    if (!list) return;

    const recent = [...allTxs]
        .filter(tx => !tx.is_voided)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);

    if (recent.length === 0) {
        list.innerHTML = '<div class="text-[10px] text-gray-400 italic">No recent sales</div>';
        return;
    }

    list.innerHTML = recent.map(tx => `
        <div class="flex justify-between items-center text-xs">
            <div class="flex flex-col">
                <span class="font-bold text-gray-700">₱${tx.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span class="text-[9px] text-gray-400">${new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${tx.customer_name}</span>
            </div>
            <span class="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">${tx.payment_method}</span>
        </div>
    `).join('');
}

function renderTenderChart(data) {
    const canvas = document.getElementById('tenderChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (tenderChartInstance) tenderChartInstance.destroy();

    const values = Object.values(data);
    const hasData = values.some(v => v > 0);

    tenderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: hasData ? values : [1],
                backgroundColor: hasData ? ['#3b82f6', '#10b981', '#f59e0b'] : ['#f3f4f6'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        boxWidth: 8, 
                        usePointStyle: true,
                        font: { size: 10, weight: 'bold' },
                        padding: 15
                    } 
                },
                tooltip: {
                    enabled: hasData,
                    callbacks: {
                        label: (context) => ` ₱${context.raw.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function renderTopSellers(salesMap, allItems) {
    const list = document.getElementById("top-sellers-list");
    if (!list) return;
    list.innerHTML = "";

    const sorted = Object.entries(salesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (sorted.length === 0) {
        list.innerHTML = '<p class="text-xs text-gray-500 italic">No sales recorded today.</p>';
        return;
    }

    sorted.forEach(([id, qty]) => {
        const item = allItems.find(i => i.id === id);
        if (!item) return;

        const div = document.createElement("div");
        div.className = "flex justify-between items-center group";
        div.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-sm font-bold text-blue-600 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
                    ${item.name.charAt(0)}
                </div>
                <div class="flex flex-col overflow-hidden">
                    <div class="truncate text-sm font-bold text-gray-700">${item.name}</div>
                    <div class="text-[10px] text-gray-400 font-medium">${item.category || 'General'}</div>
                </div>
            </div>
            <div class="text-right shrink-0">
                <div class="text-sm font-black text-gray-800">${qty}</div>
                <div class="text-[9px] text-gray-400 uppercase font-bold tracking-tighter">Units</div>
            </div>
        `;
        list.appendChild(div);
    });
}