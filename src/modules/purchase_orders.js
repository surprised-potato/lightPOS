import { dbPromise, dbRepository as Repository } from '../db.js';
import { SyncEngine } from '../services/SyncEngine.js';

export async function loadPurchaseOrdersView() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold text-gray-800">Purchase Orders</h1>
            <div class="flex gap-2">
                <button id="btn-view-sales" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded shadow">
                    View Sales Data
                </button>
                <button id="btn-create-po" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow">
                    Create PO
                </button>
            </div>
        </div>
        
        <!-- Alerts Section -->
        <div id="po-alerts-section" class="mb-8 hidden">
            <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-lg font-bold text-red-700">Procurement Alerts (Below ROP)</h3>
                    <span id="alert-count" class="bg-red-200 text-red-800 py-1 px-3 rounded-full text-xs font-bold">0 Items</span>
                </div>
                <div class="overflow-x-auto max-h-60">
                    <table class="min-w-full text-sm">
                        <thead>
                            <tr class="text-left text-red-800 border-b border-red-200">
                                <th class="pb-2 pl-2">Item</th>
                                <th class="pb-2 text-right">Stock</th>
                                <th class="pb-2 text-right">ROP</th>
                                <th class="pb-2 text-right">EOQ</th>
                                <th class="pb-2 text-center pr-2">Action</th>
                            </tr>
                        </thead>
                        <tbody id="po-alerts-body"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO ID</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="po-list-body" class="bg-white divide-y divide-gray-200">
                        <!-- Rows will be injected here -->
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Create PO Modal -->
        <div id="po-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-[60]">
            <div class="relative top-10 mx-auto p-5 border w-11/12 md:w-4/5 shadow-lg rounded-md bg-white">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-900">New Purchase Order</h3>
                    <button id="btn-cancel-po" class="text-gray-500 hover:text-gray-700">
                        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                
                <div class="mb-4">
                    <input type="text" id="po-supplier-search" placeholder="Search suppliers..." class="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                </div>

                <div class="overflow-x-auto max-h-[60vh]">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cadence</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">OTB Budget</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Suggested Value</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody id="po-supplier-list-body" class="bg-white divide-y divide-gray-200"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- View PO Modal -->
        <div id="po-view-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-3/4 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg leading-6 font-medium text-gray-900" id="po-view-title">Purchase Order Details</h3>
                        <button id="btn-close-view-po" class="text-gray-500 hover:text-gray-700">
                            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                </tr>
                            </thead>
                            <tbody id="po-view-items" class="bg-white divide-y divide-gray-200"></tbody>
                            <tfoot class="bg-gray-50">
                                <tr>
                                    <td colspan="3" class="px-6 py-3 text-right font-bold">Total Amount:</td>
                                    <td class="px-6 py-3 text-right font-bold" id="po-view-total"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sales Data Modal -->
        <div id="sales-data-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div class="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 shadow-lg rounded-md bg-white">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium text-gray-900">Sales Data & Analysis</h3>
                    <button id="btn-close-sales" class="text-gray-500 hover:text-gray-700">
                        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="mb-4 border-b border-gray-200">
                    <nav class="-mb-px flex space-x-8">
                        <button id="tab-btn-sales-tx" class="sales-tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Recent Transactions</button>
                        <button id="tab-btn-sales-vel" class="sales-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Live Velocity Analysis</button>
                        <button id="tab-btn-sales-sup" class="sales-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Supplier Analysis</button>
                        <button id="tab-btn-sales-otb" class="sales-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">OTB Planner</button>
                        <button id="tab-btn-sales-abc" class="sales-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">ABC/XYZ Classifier</button>
                    </nav>
                </div>
                
                <div id="tab-content-sales-tx" class="sales-tab-content">
                    <div class="overflow-x-auto max-h-[60vh]">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                                </tr>
                            </thead>
                            <tbody id="sales-data-body" class="bg-white divide-y divide-gray-200"></tbody>
                        </table>
                    </div>
                </div>

                <div id="tab-content-sales-vel" class="sales-tab-content hidden">
                    <div class="overflow-x-auto max-h-[60vh]">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">First Sale</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lookback (Days)</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sold</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Velocity</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Proj. Monthly</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Proj. Next Deliv.</th>
                                </tr>
                            </thead>
                            <tbody id="sales-velocity-body" class="bg-white divide-y divide-gray-200"></tbody>
                        </table>
                    </div>
                </div>

                <div id="tab-content-sales-sup" class="sales-tab-content hidden">
                    <div class="overflow-x-auto max-h-[60vh]">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Proj. Procurement (Monthly)</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Proj. Procurement (Next Deliv.)</th>
                                </tr>
                            </thead>
                            <tbody id="sales-supplier-body" class="bg-white divide-y divide-gray-200"></tbody>
                        </table>
                    </div>
                </div>

                <div id="tab-content-sales-otb" class="sales-tab-content hidden">
                    <div class="overflow-x-auto max-h-[60vh]">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                                    <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cadence</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Planned Sales (w/ K)</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Target End Stock</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">OTB (Budget)</th>
                                </tr>
                            </thead>
                            <tbody id="sales-otb-body" class="bg-white divide-y divide-gray-200"></tbody>
                        </table>
                    </div>
                </div>

                <div id="tab-content-sales-abc" class="sales-tab-content hidden">
                    <div class="overflow-x-auto max-h-[60vh]">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Annual Usage Value</th>
                                    <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">ABC Class</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CV (Volatility)</th>
                                    <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">XYZ Class</th>
                                    <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Classification</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rec. Procurement</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sugg. Qty</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Frequency</th>
                                </tr>
                            </thead>
                            <tbody id="sales-abc-body" class="bg-white divide-y divide-gray-200"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-create-po').addEventListener('click', showCreatePOModal);
    document.getElementById('btn-view-sales').addEventListener('click', showSalesData);
    document.getElementById('btn-close-sales').addEventListener('click', () => document.getElementById('sales-data-modal').classList.add('hidden'));
    document.getElementById('btn-cancel-po').addEventListener('click', () => document.getElementById('po-modal').classList.add('hidden'));
    document.getElementById('btn-close-view-po').addEventListener('click', () => document.getElementById('po-view-modal').classList.add('hidden'));

    // Sales Tab Switching Logic
    const switchSalesTab = (tab) => {
        document.querySelectorAll('.sales-tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`tab-content-sales-${tab}`).classList.remove('hidden');
        document.querySelectorAll('.sales-tab-btn').forEach(el => {
            el.classList.remove('border-blue-500', 'text-blue-600');
            el.classList.add('border-transparent', 'text-gray-500');
        });
        const btn = document.getElementById(`tab-btn-sales-${tab}`);
        btn.classList.remove('border-transparent', 'text-gray-500');
        btn.classList.add('border-blue-500', 'text-blue-600');
    };
    document.getElementById('tab-btn-sales-tx').addEventListener('click', () => switchSalesTab('tx'));
    document.getElementById('tab-btn-sales-vel').addEventListener('click', () => switchSalesTab('vel'));
    document.getElementById('tab-btn-sales-sup').addEventListener('click', () => switchSalesTab('sup'));
    document.getElementById('tab-btn-sales-otb').addEventListener('click', () => switchSalesTab('otb'));
    document.getElementById('tab-btn-sales-abc').addEventListener('click', () => switchSalesTab('abc'));

    await renderPOList();
    await renderAlerts();
}

async function renderPOList() {
    const pos = await Repository.getAll('purchase_orders');
    const tbody = document.getElementById('po-list-body');
    
    if (pos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No purchase orders found.</td></tr>';
        return;
    }

    tbody.innerHTML = pos.map(po => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${po.id}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${po.supplier_id}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${po.status}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${po.total_amount || 0}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="window.viewPO('${po.id}')" class="text-blue-600 hover:text-blue-900 mr-2">View</button>
                ${po.status === 'draft' ? `<button onclick="window.approvePO('${po.id}')" class="text-indigo-600 hover:text-indigo-900">Approve</button>` : ''}
                ${po.status === 'approved' ? `<button onclick="window.receivePO('${po.id}')" class="text-green-600 hover:text-green-900">Receive</button>` : ''}
            </td>
        </tr>
    `).join('');
}

async function renderAlerts() {
    const items = await Repository.getAll('items');
    const metrics = await Repository.getAll('inventory_metrics');
    const alertsBody = document.getElementById('po-alerts-body');
    const alertsSection = document.getElementById('po-alerts-section');
    const alertCount = document.getElementById('alert-count');

    const alerts = [];
    items.forEach(item => {
        const m = metrics.find(x => x.sku_id === item.id);
        if (m && m.rop_trigger > 0 && item.stock_level <= m.rop_trigger) {
            alerts.push({ ...item, ...m });
        }
    });

    if (alerts.length > 0) {
        alertsSection.classList.remove('hidden');
        alertCount.textContent = `${alerts.length} Items`;
        alertsBody.innerHTML = alerts.map(a => `
            <tr class="border-b border-red-100 last:border-0">
                <td class="py-2 font-medium text-red-900 pl-2">${a.name}</td>
                <td class="py-2 text-right font-bold text-red-600">${a.stock_level}</td>
                <td class="py-2 text-right text-red-800">${a.rop_trigger}</td>
                <td class="py-2 text-right text-red-800">${a.eoq_qty}</td>
                <td class="py-2 text-center pr-2">
                    <button class="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded border border-red-300" onclick="window.createPoForItem('${a.id}')">Order</button>
                </td>
            </tr>
        `).join('');
    } else {
        alertsSection.classList.add('hidden');
    }
}

async function showSalesData() {
    const btn = document.getElementById('btn-view-sales');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Loading...";

    try {
        await SyncEngine.sync(); // Pull latest data
        const transactions = await Repository.getAll('transactions');
        const items = await Repository.getAll('items');
        const supplierConfigs = await Repository.getAll('supplier_config');
        const suppliers = await Repository.getAll('suppliers');
        const globalSettings = await Repository.get('settings', 'global');
        
        let kFactorSetting = (globalSettings && globalSettings.procurement && globalSettings.procurement.k_factor) ? parseFloat(globalSettings.procurement.k_factor) : 110;
        if (kFactorSetting < 100) kFactorSetting = 100;
        const multiplier = kFactorSetting / 100;
        const otbMode = (globalSettings && globalSettings.procurement && globalSettings.procurement.otb_mode) ? globalSettings.procurement.otb_mode : 'standard';
        const orderingCost = (globalSettings && globalSettings.procurement && globalSettings.procurement.ordering_cost) ? parseFloat(globalSettings.procurement.ordering_cost) : 50;
        const holdingCostRate = (globalSettings && globalSettings.procurement && globalSettings.procurement.holding_cost_rate) ? parseFloat(globalSettings.procurement.holding_cost_rate) : 20;

        // 1. Render Transactions Tab
        const sortedTxs = [...transactions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const recent = sortedTxs.slice(0, 50);

        const tbody = document.getElementById('sales-data-body');
        tbody.innerHTML = recent.map(t => {
            const items = Array.isArray(t.items) ? t.items : [];
            const itemSummary = items.map(i => `${i.qty}x ${i.name}`).join(', ');
            return `<tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${new Date(t.timestamp).toLocaleString()}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.id}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">₱${(t.total_amount || 0).toFixed(2)}</td>
                <td class="px-6 py-4 text-sm text-gray-500 truncate max-w-xs" title="${itemSummary}">${itemSummary}</td>
            </tr>`;
        }).join('');

        // 2. Compute Live Velocity
        const itemStats = {}; // { itemId: { firstSale: Date, totalQty: 0, dailySales: { date: qty } } }
        const now = new Date();
        const lookbackWindow = new Date(now);
        lookbackWindow.setDate(lookbackWindow.getDate() - 180);
        
        transactions.forEach(t => {
            if (t.is_voided || t._deleted) return;
            const txDate = new Date(t.timestamp);
            const dateStr = txDate.toISOString().split('T')[0];
            const txItems = Array.isArray(t.items) ? t.items : [];
            
            txItems.forEach(i => {
                if (!itemStats[i.id]) {
                    itemStats[i.id] = { firstSale: txDate, totalQty: 0, dailySales: {} };
                }
                
                // Track lifetime first sale for accurate age
                if (txDate < itemStats[i.id].firstSale) {
                    itemStats[i.id].firstSale = txDate;
                }

                // Only accumulate metrics for the lookback window
                if (txDate >= lookbackWindow) {
                    itemStats[i.id].totalQty += (i.qty || 0);
                    itemStats[i.id].dailySales[dateStr] = (itemStats[i.id].dailySales[dateStr] || 0) + (i.qty || 0);
                }
            });
        });

        const velocityBody = document.getElementById('sales-velocity-body');
        
        const velocityRows = Object.entries(itemStats).map(([id, stats]) => {
            const item = items.find(i => i.id === id);
            const name = item ? item.name : id;
            const cost = item ? (parseFloat(item.cost_price) || 0) : 0;
            const minStock = item ? (parseFloat(item.min_stock) || 0) : 0;
            const currentStock = item ? Math.max(0, parseFloat(item.stock_level) || 0) : 0;
            
            const daysSince = Math.max(1, Math.ceil((now - stats.firstSale) / (1000 * 60 * 60 * 24)));
            const effectiveDays = Math.min(180, daysSince);
            const velocity = stats.totalQty / effectiveDays;
            
            let cadenceDays = 7;
            if (item && item.supplier_id) {
                const config = supplierConfigs.find(c => c.supplier_id === item.supplier_id);
                if (config && config.delivery_cadence) {
                    const map = { 'weekly': 7, 'biweekly': 14, 'monthly': 30, 'on_order': 7 };
                    cadenceDays = map[config.delivery_cadence] || 7;
                }
            }

            // OTB Calculation Components
            const plannedSalesUnits = velocity * cadenceDays * multiplier;
            const plannedSalesCost = plannedSalesUnits * cost;
            const targetEndStockCost = minStock * cost;
            const currentStockCost = currentStock * cost;
            
            // Item-level OTB (cannot be negative for budget purposes)
            let itemOtb = 0;
            if (otbMode === 'replenishment') {
                itemOtb = plannedSalesCost;
            } else {
                itemOtb = Math.max(0, plannedSalesCost + targetEndStockCost - currentStockCost);
            }

            return {
                id,
                name,
                firstSale: stats.firstSale.toLocaleDateString(),
                effectiveDays,
                totalQty: stats.totalQty,
                velocity,
                projMonthly: velocity * 30,
                projNext: velocity * cadenceDays,
                projMonthlyCost: velocity * 30 * cost,
                projNextCost: velocity * cadenceDays * cost,
                
                plannedSalesCost,
                targetEndStockCost,
                currentStockCost,
                itemOtb,
                currentStock,

                cost,
                dailySales: stats.dailySales,
                supplier_id: item ? item.supplier_id : null
            };
        });
        
        // Sort by velocity desc
        velocityRows.sort((a, b) => b.velocity - a.velocity);

        velocityBody.innerHTML = velocityRows.map(row => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${row.firstSale}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.effectiveDays}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.totalQty}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold">${row.velocity.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.projMonthly.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.projNext.toFixed(2)}</td>
            </tr>
        `).join('');

        // 3. Compute Supplier Stats
        const supplierStats = {};
        velocityRows.forEach(row => {
            if (!row.supplier_id) return;
            if (!supplierStats[row.supplier_id]) {
                const s = suppliers.find(x => x.id === row.supplier_id);
                const conf = supplierConfigs.find(c => c.supplier_id === row.supplier_id);
                supplierStats[row.supplier_id] = {
                    name: s ? s.name : 'Unknown',
                    cadence: conf ? (conf.delivery_cadence || 'weekly') : 'weekly',
                    projMonthly: 0,
                    projNext: 0,
                    plannedSales: 0,
                    targetEndStock: 0,
                    currentStock: 0,
                    otb: 0,
                    itemCount: 0
                };
            }
            supplierStats[row.supplier_id].projMonthly += row.projMonthlyCost;
            supplierStats[row.supplier_id].projNext += row.projNextCost;
            supplierStats[row.supplier_id].plannedSales += row.plannedSalesCost;
            supplierStats[row.supplier_id].targetEndStock += row.targetEndStockCost;
            supplierStats[row.supplier_id].currentStock += row.currentStockCost;
            supplierStats[row.supplier_id].otb += row.itemOtb;
            supplierStats[row.supplier_id].itemCount++;
        });

        const supplierBody = document.getElementById('sales-supplier-body');
        supplierBody.innerHTML = Object.values(supplierStats).sort((a,b) => b.projMonthly - a.projMonthly).map(s => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${s.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${s.itemCount}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.projMonthly.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.projNext.toFixed(2)}</td>
            </tr>
        `).join('');

        const otbBody = document.getElementById('sales-otb-body');
        otbBody.innerHTML = Object.values(supplierStats).sort((a,b) => b.otb - a.otb).map(s => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${s.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 capitalize">${s.cadence}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.plannedSales.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.targetEndStock.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.currentStock.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600">₱${s.otb.toFixed(2)}</td>
            </tr>
        `).join('');

        // 4. Compute ABC/XYZ
        let totalAnnualUsage = 0;
        const abcData = velocityRows.map(row => {
            const annualUsage = row.velocity * 365 * row.cost;
            totalAnnualUsage += annualUsage;
            
            // Calculate CV (Coefficient of Variation) for XYZ
            // Variance = (Sum(x^2) / N) - (Mean)^2
            let sumX2 = 0;
            Object.values(row.dailySales).forEach(qty => {
                sumX2 += qty * qty;
            });
            // N = effectiveDays. Days with 0 sales add 0 to sumX2 but count towards N.
            const variance = (sumX2 / row.effectiveDays) - (row.velocity * row.velocity);
            const stdDev = Math.sqrt(Math.max(0, variance));
            const cv = row.velocity > 0 ? stdDev / row.velocity : 0;
            
            let xyz = 'Z';
            if (cv < 0.2) xyz = 'X';
            else if (cv <= 0.5) xyz = 'Y';

            // Calculate EOQ & ROP locally
            // 1. Get Supplier Config
            const config = supplierConfigs.find(c => c.supplier_id === row.supplier_id);
            const leadTime = (config && config.lead_time_days) ? parseFloat(config.lead_time_days) : 3;
            const cadence = (config && config.delivery_cadence) ? config.delivery_cadence : 'weekly';
            const cadenceMap = { 'weekly': 7, 'biweekly': 14, 'monthly': 30, 'on_order': 0 };
            const reviewPeriod = cadenceMap[cadence] !== undefined ? cadenceMap[cadence] : 7;

            // 2. Safety Stock (Z = 1.65 for 95% service level)
            const serviceLevelZ = 1.65;
            const riskPeriod = leadTime + reviewPeriod;
            const safetyStock = Math.ceil(serviceLevelZ * stdDev * Math.sqrt(riskPeriod));

            // 3. ROP
            const rop = Math.ceil((row.velocity * riskPeriod) + safetyStock);

            // 4. EOQ
            let eoq = 0;
            if (row.cost > 0) {
                const annualDemand = row.velocity * 365;
                const hCost = row.cost * (holdingCostRate / 100);
                if (hCost > 0) {
                    eoq = Math.sqrt((2 * annualDemand * orderingCost) / hCost);
                }
            }
            row.eoq = Math.ceil(eoq);
            row.rop = rop;

            return { ...row, annualUsage, cv, xyz };
        });

        // Sort by Annual Usage Value Descending for ABC
        abcData.sort((a, b) => b.annualUsage - a.annualUsage);

        let runningUsage = 0;
        abcData.forEach(row => {
            runningUsage += row.annualUsage;
            const cumulativePct = totalAnnualUsage > 0 ? (runningUsage / totalAnnualUsage) : 0;
            
            if (cumulativePct <= 0.80) row.abc = 'A';
            else if (cumulativePct <= 0.95) row.abc = 'B';
            else row.abc = 'C';
        });

        const abcBody = document.getElementById('sales-abc-body');
        abcBody.innerHTML = abcData.map(row => {
            const abcColor = row.abc === 'A' ? 'text-green-600 font-bold' : (row.abc === 'B' ? 'text-blue-600' : 'text-gray-500');
            const xyzColor = row.xyz === 'X' ? 'text-green-600 font-bold' : (row.xyz === 'Y' ? 'text-yellow-600' : 'text-red-600');
            
            const suggestQty = (row.currentStock <= row.rop) ? row.eoq : 0;
            const frequency = (row.velocity > 0 && row.eoq > 0) ? Math.round(row.eoq / row.velocity) + ' days' : '-';

            return `<tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${row.annualUsage.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-center ${abcColor}">${row.abc}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.cv.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-center ${xyzColor}">${row.xyz}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-center font-bold border-l">${row.abc}${row.xyz}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 text-xs">EOQ: ${row.eoq} / ROP: ${row.rop}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${suggestQty > 0 ? 'text-green-600' : 'text-gray-400'}">${suggestQty > 0 ? suggestQty : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${frequency}</td>
            </tr>`;
        }).join('');

        document.getElementById('sales-data-modal').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        alert("Failed to load sales data.");
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function showCreatePOModal() {
    const modal = document.getElementById('po-modal');
    const tbody = document.getElementById('po-supplier-list-body');
    const searchInput = document.getElementById('po-supplier-search');
    
    modal.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Calculating suggestions...</td></tr>';

    // Fetch Data
    const suppliers = await Repository.getAll('suppliers');
    const items = await Repository.getAll('items');
    const supplierConfigs = await Repository.getAll('supplier_config');
    const transactions = await Repository.getAll('transactions');
    const globalSettings = await Repository.get('settings', 'global');

    // Settings
    const orderingCost = (globalSettings?.procurement?.ordering_cost) ? parseFloat(globalSettings.procurement.ordering_cost) : 50;
    const holdingCostRate = (globalSettings?.procurement?.holding_cost_rate) ? parseFloat(globalSettings.procurement.holding_cost_rate) : 20;

    // Calculate Velocity & Suggestions
    const now = new Date();
    const lookbackWindow = new Date(now);
    lookbackWindow.setDate(lookbackWindow.getDate() - 180);
    
    const itemStats = {};
    transactions.forEach(t => {
        if (t.is_voided || t._deleted) return;
        const txDate = new Date(t.timestamp);
        if (txDate < lookbackWindow) return;
        
        (t.items || []).forEach(i => {
            if (!itemStats[i.id]) itemStats[i.id] = { qty: 0, firstSale: txDate };
            itemStats[i.id].qty += (i.qty || 0);
            if (txDate < itemStats[i.id].firstSale) itemStats[i.id].firstSale = txDate;
        });
    });

    const supplierData = suppliers.map(sup => {
        const config = supplierConfigs.find(c => c.supplier_id === sup.id) || {};
        const cadence = config.delivery_cadence || 'weekly';
        const leadTime = config.lead_time_days || 3;
        const otb = config.monthly_otb || 0;
        
        const cadenceMap = { 'weekly': 7, 'biweekly': 14, 'monthly': 30, 'on_order': 1 };
        const reviewPeriod = cadenceMap[cadence] || 7;

        let suggestedValue = 0;
        const suggestedItems = [];

        const supItems = items.filter(i => i.supplier_id === sup.id && !i._deleted);
        
        supItems.forEach(item => {
            const stats = itemStats[item.id] || { qty: 0, firstSale: new Date() };
            const daysActive = Math.max(1, Math.ceil((now - stats.firstSale) / (1000 * 60 * 60 * 24)));
            const velocity = stats.qty / Math.min(180, daysActive);
            const cost = item.cost_price || 0;
            const currentStock = item.stock_level || 0;

            // 1. EOQ Calculation
            let eoq = 0;
            if (cost > 0 && velocity > 0) {
                const annualDemand = velocity * 365;
                const hCost = cost * (holdingCostRate / 100);
                if (hCost > 0) eoq = Math.sqrt((2 * annualDemand * orderingCost) / hCost);
            }

            // 2. ROP & Target Level (Reconciliation Logic)
            // Target = Demand during (LeadTime + ReviewPeriod) + SafetyStock
            // Safety Stock simplified: 50% of lead time demand (or use min_stock)
            const safetyStock = item.min_stock || (velocity * leadTime * 0.5);
            const targetLevel = (velocity * (leadTime + reviewPeriod)) + safetyStock;
            
            const netRequirement = targetLevel - currentStock;
            
            // 3. Final Logic: Max(EOQ, NetRequirement) if NetRequirement > 0
            if (netRequirement > 0) {
                const orderQty = Math.ceil(Math.max(eoq, netRequirement));
                suggestedValue += (orderQty * cost);
                suggestedItems.push({ ...item, orderQty });
            }
        });

        return { ...sup, cadence, otb, suggestedValue, suggestedItems };
    });

    const renderTable = () => {
        const term = searchInput.value.toLowerCase();
        const filtered = supplierData.filter(s => s.name.toLowerCase().includes(term));
        
        tbody.innerHTML = filtered.map(s => {
            const isOverBudget = s.suggestedValue > s.otb;
            const statusColor = isOverBudget ? 'text-red-600' : 'text-green-600';
            const statusText = isOverBudget ? 'Over Budget' : 'Within Budget';
            
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${s.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 capitalize">${s.cadence}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.otb.toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600">₱${s.suggestedValue.toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-center font-bold ${statusColor}">${statusText}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <button onclick="window.createDraftPO('${s.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold shadow">
                            Create Draft
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    searchInput.oninput = renderTable;
    renderTable();
    
    // Store calculated items for creation
    window._poSuggestions = supplierData;
}

window.calculateOtb = async (supplierId) => {
    const res = await fetch(`api/procurement.php?action=calculate-otb&supplier_id=${supplierId}`);
    const data = await res.json();
    if (data.new_otb !== undefined) {
        alert(`OTB Recalculated: ${data.new_otb.toFixed(2)}`);
        SyncEngine.sync(); // Pull new config
        document.getElementById('metrics-modal').classList.add('hidden'); // Close to refresh or reload
        await showMetricsSummary(); // Refresh view
    }
};

window.createPoForItem = async (itemId) => {
    const item = await Repository.get('items', itemId);
    if (item && item.supplier_id) {
        await showCreatePOModal(); // Populate options
        const select = document.getElementById('po-supplier-select');
        if (select) select.value = item.supplier_id;
    } else {
        alert("Item has no supplier linked.");
    }
};

window.createDraftPO = async (supplierId) => {
    const supplierData = window._poSuggestions.find(s => s.id === supplierId);
    if (!supplierData) return;

    const items = supplierData.suggestedItems.map(i => ({
        item_id: i.id,
        name: i.name,
        qty: i.orderQty,
        cost: i.cost_price,
        total: i.orderQty * i.cost_price
    }));

    if (items.length === 0) {
        if (!confirm("No suggested items for this supplier. Create empty PO?")) return;
    }

    const po = {
        id: 'PO-' + Date.now(),
        supplier_id: supplierId,
        status: 'draft',
        created_at: new Date().toISOString(),
        items: items,
        total_amount: supplierData.suggestedValue,
        _version: 1,
        _updatedAt: Date.now(),
        _deleted: 0
    };
    await Repository.upsert('purchase_orders', po);
    document.getElementById('po-modal').classList.add('hidden');
    await renderPOList();
};

window.approvePO = async (poId) => {
    const po = await Repository.get('purchase_orders', poId);
    if (po) {
        po.status = 'approved';
        await Repository.upsert('purchase_orders', po);
        await renderPOList();
    }
};

window.viewPO = async (poId) => {
    const po = await Repository.get('purchase_orders', poId);
    if (!po) return;

    document.getElementById('po-view-title').textContent = `PO Details: ${po.id} (${po.status})`;
    const tbody = document.getElementById('po-view-items');
    const items = po.items || [];
    
    tbody.innerHTML = items.map(item => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${item.name || item.item_id}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${item.qty}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${(item.cost || 0).toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${(item.total || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('po-view-total').textContent = (po.total_amount || 0).toFixed(2);
    document.getElementById('po-view-modal').classList.remove('hidden');
};

window.receivePO = async (poId) => {
    if (!confirm("Receive all items in this PO? This will update stock levels.")) return;

    const po = await Repository.get('purchase_orders', poId);
    if (!po || po.status !== 'approved') return;

    const items = po.items || [];
    
    // 1. Create Stock In Record
    const stockIn = {
        id: 'SI-' + Date.now(),
        supplier_id: po.supplier_id,
        timestamp: new Date().toISOString(),
        items: items,
        total_amount: po.total_amount,
        po_id: poId,
        _version: 1, _updatedAt: Date.now(), _deleted: 0
    };
    await Repository.upsert('stockins', stockIn);

    // 2. Update Stock Levels & Log Movements
    for (const item of items) {
        const product = await Repository.get('items', item.item_id || item.id);
        if (product) {
            product.stock_level = (product.stock_level || 0) + item.qty;
            if (item.cost > 0) product.cost_price = item.cost; 
            await Repository.upsert('items', product);
        }
    }

    // 3. Update PO Status
    po.status = 'received';
    await Repository.upsert('purchase_orders', po);

    SyncEngine.sync();
    await renderPOList();
};