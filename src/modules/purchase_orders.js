import { dbPromise, dbRepository as Repository } from '../db.js';
import { SyncEngine } from '../services/SyncEngine.js';
import { generateUUID } from '../utils.js';
import { getUserProfile } from '../auth.js';

let procurementData = null; // Module-level cache for persistence
let poSortState = { key: 'created_at', dir: 'desc' };
let poSearchTerm = '';
let selectedPoId = null;

export async function loadPurchaseOrdersView() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="max-w-full mx-auto h-[calc(100vh-100px)] flex flex-col p-4">
            <div class="flex justify-between items-center mb-4">
                <h1 class="text-2xl font-bold text-gray-800">Purchase Orders</h1>
                <button id="btn-view-sales" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded shadow text-sm" disabled>
                    View Sales Data
                </button>
            </div>
        
        <!-- Alerts Section -->
        <div id="po-alerts-section" class="mb-4 hidden flex-shrink-0">
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

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            <!-- Left Column: PO List -->
            <div class="lg:col-span-5 flex flex-col h-full bg-white shadow-md rounded-lg border overflow-hidden">
                <div class="p-4 border-b bg-gray-50 flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                        <h2 class="font-bold text-gray-700">Orders</h2>
                        <button id="btn-create-po" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm shadow" disabled>
                            + New PO
                        </button>
                    </div>
                    <div class="relative">
                        <input type="text" id="po-list-search" placeholder="Search POs..." class="w-full border rounded p-2 pl-8 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                        <svg class="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                </div>
                <div class="overflow-y-auto flex-1">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" data-sort="created_at">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" data-sort="supplier_id">Supplier</th>
                            </tr>
                        </thead>
                        <tbody id="po-list-body" class="bg-white divide-y divide-gray-200 text-sm"></tbody>
                    </table>
                </div>
            </div>

            <!-- Right Column: PO Details -->
            <div id="po-details-panel" class="lg:col-span-7 flex flex-col h-full bg-white shadow-md rounded-lg border overflow-hidden hidden">
                <!-- Details Header -->
                <div class="p-4 border-b bg-gray-50 flex justify-between items-start flex-shrink-0">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800" id="po-detail-title"></h3>
                        <div class="text-sm text-gray-500 mt-1" id="po-detail-meta"></div>
                    </div>
                    <div class="flex gap-2" id="po-detail-actions"></div>
                </div>
                
                <!-- Items Toolbar -->
                <div class="p-2 border-b bg-white flex justify-between items-center gap-2 flex-shrink-0">
                     <input type="text" id="po-view-search" placeholder="Filter items..." class="border rounded p-1 text-sm w-48 focus:ring-1 focus:ring-blue-500 outline-none">
                     <button id="btn-add-po-item" class="hidden bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-xs flex items-center gap-1">
                        + Add Item
                     </button>
                </div>

                <!-- Items Table -->
                <div class="flex-1 overflow-y-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50 sticky top-0">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody id="po-view-items" class="bg-white divide-y divide-gray-200 text-sm"></tbody>
                    </table>
                </div>

                <!-- Footer -->
                <div class="p-4 border-t bg-gray-50 flex-shrink-0">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-gray-600">Ordered Amount:</span>
                        <span class="font-bold text-gray-800" id="po-view-total">₱0.00</span>
                    </div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-gray-600">Actual Amount:</span>
                        <span class="font-bold text-gray-800" id="po-detail-actual">-</span>
                    </div>
                    <div class="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span class="text-sm font-bold text-gray-700">Variance:</span>
                        <span class="font-bold text-lg" id="po-detail-variance">-</span>
                    </div>
                </div>
            </div>
            
            <!-- Empty State for Right Column -->
            <div id="po-details-empty" class="lg:col-span-7 flex flex-col h-full bg-white shadow-md rounded-lg border items-center justify-center text-gray-400">
                <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p>Select a Purchase Order to view details</p>
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

        <!-- Receive PO Modal -->
        <div id="po-receive-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-[60]">
            <div class="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 shadow-lg rounded-md bg-white">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-900" id="po-receive-title">Receive Purchase Order</h3>
                    <button id="btn-cancel-receive-po" class="text-gray-500 hover:text-gray-700">
                        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="mb-4">
                    <input type="text" id="po-receive-search" placeholder="Search items..." class="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                </div>
                <div class="overflow-x-auto max-h-[60vh]">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ordered</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Received Qty</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason for Discrepancy</th>
                            </tr>
                        </thead>
                        <tbody id="po-receive-items-body" class="bg-white divide-y divide-gray-200"></tbody>
                    </table>
                </div>
                <div class="mt-6 flex justify-end gap-2">
                    <button id="btn-cancel-receive-po-footer" class="bg-gray-500 text-white px-4 py-2 rounded">Cancel</button>
                    <button id="btn-confirm-receive-po" class="bg-green-600 text-white px-4 py-2 rounded">Confirm & Receive Stock</button>
                </div>
            </div>
        </div>

        <!-- Add Item to PO Modal -->
        <div id="po-add-item-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-[70]">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 class="text-lg font-bold mb-4">Add Item to PO</h3>
                <div class="mb-4 relative">
                    <label class="block text-sm font-bold mb-2">Search Item</label>
                    <input type="text" id="po-add-item-search" class="w-full border rounded p-2" placeholder="Item name..." autocomplete="off">
                    <div id="po-add-item-results" class="hidden absolute bg-white border mt-1 w-full max-h-40 overflow-y-auto z-10 shadow-lg"></div>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-bold mb-2">Quantity</label>
                    <input type="number" id="po-add-item-qty" class="w-full border rounded p-2" value="1" min="1">
                </div>
                <div class="flex justify-end gap-2">
                    <button id="btn-cancel-add-po-item" class="bg-gray-500 text-white px-4 py-2 rounded">Cancel</button>
                    <button id="btn-confirm-add-po-item" class="bg-blue-600 text-white px-4 py-2 rounded">Add</button>
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

    document.getElementById('btn-cancel-receive-po').addEventListener('click', () => document.getElementById('po-receive-modal').classList.add('hidden'));
    document.getElementById('btn-cancel-receive-po-footer').addEventListener('click', () => document.getElementById('po-receive-modal').classList.add('hidden'));
    document.getElementById('btn-confirm-receive-po').addEventListener('click', () => window.confirmReceivePO());

    // Receive PO Search
    document.getElementById('po-receive-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#po-receive-items-body tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });

    // PO View Search
    document.getElementById('po-view-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#po-view-items tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });

    document.getElementById('btn-add-po-item').addEventListener('click', (e) => {
        const poId = e.currentTarget.dataset.id;
        if (poId) window.showAddItemModal(poId);
    });

    // Add Item Modal Listeners
    document.getElementById('btn-cancel-add-po-item').addEventListener('click', () => {
        document.getElementById('po-add-item-modal').classList.add('hidden');
    });
    document.getElementById('po-add-item-search').addEventListener('input', async (e) => {
        const term = e.target.value.toLowerCase();
        const resultsDiv = document.getElementById('po-add-item-results');
        if (term.length < 2) {
            resultsDiv.classList.add('hidden');
            return;
        }
        const items = await Repository.getAll('items');
        const filtered = items.filter(i => i.name.toLowerCase().includes(term) && !i._deleted).slice(0, 10);
        
        resultsDiv.innerHTML = filtered.map(i => `
            <div class="p-2 hover:bg-gray-100 cursor-pointer border-b" onclick="window.selectItemForPo('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.cost_price})">
                <div class="font-bold text-sm">${i.name}</div>
                <div class="text-xs text-gray-500">Stock: ${i.stock_level} | Cost: ${i.cost_price}</div>
            </div>
        `).join('');
        resultsDiv.classList.remove('hidden');
    });
    document.getElementById('btn-confirm-add-po-item').addEventListener('click', () => window.addItemToPo());



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

    document.getElementById('po-list-search').addEventListener('input', (e) => {
        poSearchTerm = e.target.value.toLowerCase();
        renderPOList();
    });

    content.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (poSortState.key === key) {
                poSortState.dir = poSortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                poSortState.key = key;
                poSortState.dir = 'asc';
            }
            renderPOList();
        });
    });

    await renderPOList();
    // Reset selection
    selectedPoId = null;
    
    // Calculate metrics immediately on load
    await refreshProcurementData();
    
    await renderAlerts();
}

async function refreshProcurementData() {
    const btnView = document.getElementById('btn-view-sales');
    const btnCreate = document.getElementById('btn-create-po');
    if (btnView) {
        btnView.disabled = true;
        btnView.textContent = "Calculating...";
    }
    if (btnCreate) {
        btnCreate.disabled = true;
        btnCreate.textContent = "Calculating...";
    }

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
        const serviceLevelZ = (globalSettings && globalSettings.procurement && globalSettings.procurement.service_level) ? parseFloat(globalSettings.procurement.service_level) : 1.65;
        const defaultLeadTime = (globalSettings && globalSettings.procurement && globalSettings.procurement.default_lead_time !== undefined) ? parseFloat(globalSettings.procurement.default_lead_time) : 7;
        const assumedStockEnabled = (globalSettings && globalSettings.procurement && globalSettings.procurement.assumed_stock_new_store) || false;

        // 1. Compute Live Velocity
        const itemStats = {}; // { itemId: { firstSale: Date, totalQty: 0, dailySales: { date: qty } } }
        const now = new Date();
        const lookbackWindow = new Date(now);
        lookbackWindow.setDate(lookbackWindow.getDate() - 180);
        let globalFirstSale = new Date(); // Track oldest transaction for store age
        
        transactions.forEach(t => {
            if (t.is_voided || t._deleted) return;
            const txDate = new Date(t.timestamp);
            const dateStr = txDate.toISOString().split('T')[0];
            const txItems = Array.isArray(t.items) ? t.items : [];
            
            // Check for global store age
            if (txDate < globalFirstSale) globalFirstSale = txDate;

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

        const storeAgeDays = (now - globalFirstSale) / (1000 * 60 * 60 * 24);
        const isYoungStore = storeAgeDays <= 30;

        const velocityRows = Object.entries(itemStats).map(([id, stats]) => {
            const item = items.find(i => i.id === id);
            const name = item ? item.name : id;
            const cost = item ? (parseFloat(item.cost_price) || 0) : 0;
            const minStock = item ? (parseFloat(item.min_stock) || 0) : 0;
            const maxStock = item ? (parseFloat(item.max_stock) || 0) : 0;
            
            const daysSince = Math.max(1, Math.ceil((now - stats.firstSale) / (1000 * 60 * 60 * 24)));
            const effectiveDays = Math.min(180, daysSince);
            const velocity = stats.totalQty / effectiveDays;
            
            let cadenceDays = 7;
            let leadTime = defaultLeadTime;
            let reviewPeriod = 7;
            
            if (item && item.supplier_id) {
                const config = supplierConfigs.find(c => c.supplier_id === item.supplier_id);
                if (config) {
                    if (config.delivery_cadence) {
                        const map = { 'weekly': 7, 'biweekly': 14, 'monthly': 30, 'on_order': 7, 'every_2_days': 2, 'twice_a_week': 3.5 };
                        cadenceDays = map[config.delivery_cadence] || 7;
                        // For ROP calculation
                        const ropMap = { 'weekly': 7, 'biweekly': 14, 'monthly': 30, 'on_order': 0, 'every_2_days': 2, 'twice_a_week': 3.5 };
                        reviewPeriod = ropMap[config.delivery_cadence] || 7;
                    }
                    if (config.lead_time_days) {
                        leadTime = parseFloat(config.lead_time_days);
                    }
                }
            }

            // Calculate Current Stock (with Assumed Stock logic for new stores)
            const rawStock = item ? (parseFloat(item.stock_level) || 0) : 0;
            let currentStock = Math.max(0, rawStock);

            if (assumedStockEnabled && isYoungStore) {
                currentStock = Math.max(currentStock, 0.5 * velocity * cadenceDays);
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

            // ABC/XYZ & EOQ/ROP
            let sumX2 = 0;
            Object.values(stats.dailySales).forEach(qty => {
                sumX2 += qty * qty;
            });
            const variance = (sumX2 / effectiveDays) - (velocity * velocity);
            const stdDev = Math.sqrt(Math.max(0, variance));
            const cv = velocity > 0 ? stdDev / velocity : 0;
            
            let xyz = 'Z';
            if (cv < 0.2) xyz = 'X';
            else if (cv <= 0.5) xyz = 'Y';

            const annualUsage = velocity * 365 * cost;

            // EOQ
            let eoq = 0;
            if (cost > 0 && velocity > 0) {
                const annualDemand = velocity * 365;
                const hCost = cost * (holdingCostRate / 100);
                if (hCost > 0) {
                    eoq = Math.sqrt((2 * annualDemand * orderingCost) / hCost);
                }
            }
            eoq = Math.ceil(eoq);

            // ROP (Trigger Level) - Based on Lead Time
            const riskPeriod = leadTime + reviewPeriod;
            const safetyStock = Math.ceil(serviceLevelZ * stdDev * Math.sqrt(riskPeriod));
            let rop = Math.ceil((velocity * leadTime) + safetyStock);
            if (minStock > rop) rop = minStock;

            // Target Level (Order-Up-To)
            let targetLevel;
            if (maxStock > 0) {
                targetLevel = maxStock;
            } else {
                targetLevel = Math.ceil(velocity * cadenceDays);
            }
            
            const netRequirement = targetLevel - currentStock;
            let suggestedQty = 0;
            if (netRequirement > 0) {
                suggestedQty = Math.ceil(netRequirement);
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
                supplier_id: item ? item.supplier_id : null,
                
                annualUsage,
                cv,
                xyz,
                eoq,
                rop,
                netRequirement,
                suggestedQty
            };
        });

        // --- Demand Roll-up Logic ---
        // If a Child item needs stock, convert that need to the Parent item (if exists)
        // This ensures we order Cases (Parent) instead of Units (Child)
        const rowMap = new Map(velocityRows.map(r => [r.id, r]));
        
        velocityRows.forEach(child => {
            const childItem = items.find(i => i.id === child.id);
            if (childItem && childItem.parent_id) {
                const parentRow = rowMap.get(childItem.parent_id);
                if (parentRow) {
                    const factor = parseFloat(childItem.conv_factor) || 1;
                    
                    // If Child has a net requirement (deficit), transfer it to Parent
                    if (child.netRequirement > 0) {
                        const neededParentUnits = child.netRequirement / factor;
                        parentRow.netRequirement += neededParentUnits;
                        
                        // Re-calculate Parent's suggested quantity based on new requirement
                        parentRow.suggestedQty = Math.ceil(Math.max(parentRow.eoq, parentRow.netRequirement));
                        
                        // Zero out Child suggestion so we don't double order
                        child.suggestedQty = 0;
                        child.itemOtb = 0; // Remove from budget calculation
                    }
                }
            }
        });
        // ----------------------------

        // ABC Classification
        let totalAnnualUsage = 0;
        velocityRows.forEach(r => totalAnnualUsage += r.annualUsage);
        velocityRows.sort((a, b) => b.annualUsage - a.annualUsage);
        
        let runningUsage = 0;
        velocityRows.forEach(row => {
            runningUsage += row.annualUsage;
            const cumulativePct = totalAnnualUsage > 0 ? (runningUsage / totalAnnualUsage) : 0;
            if (cumulativePct <= 0.80) row.abc = 'A';
            else if (cumulativePct <= 0.95) row.abc = 'B';
            else row.abc = 'C';
        });

        // 3. Compute Supplier Stats
        const supplierStats = {};
        velocityRows.forEach(row => {
            if (!row.supplier_id) return;
            if (!supplierStats[row.supplier_id]) {
                const s = suppliers.find(x => x.id === row.supplier_id);
                const conf = supplierConfigs.find(c => c.supplier_id === row.supplier_id);
                supplierStats[row.supplier_id] = {
                    id: row.supplier_id,
                    name: s ? s.name : 'Unknown',
                    cadence: conf ? (conf.delivery_cadence || 'weekly') : 'weekly',
                    projMonthly: 0,
                    projNext: 0,
                    plannedSales: 0,
                    targetEndStock: 0,
                    currentStock: 0,
                    otb: 0,
                    itemCount: 0,
                    suggestedValue: 0,
                    suggestedItems: []
                };
            }
            supplierStats[row.supplier_id].projMonthly += row.projMonthlyCost;
            supplierStats[row.supplier_id].projNext += row.projNextCost;
            supplierStats[row.supplier_id].plannedSales += row.plannedSalesCost;
            supplierStats[row.supplier_id].targetEndStock += row.targetEndStockCost;
            supplierStats[row.supplier_id].currentStock += row.currentStockCost;
            supplierStats[row.supplier_id].otb += row.itemOtb;
            supplierStats[row.supplier_id].itemCount++;
            
            if (row.suggestedQty > 0) {
                // supplierStats[row.supplier_id].suggestedValue += (row.suggestedQty * row.cost); // Calculated after filtering
                supplierStats[row.supplier_id].suggestedItems.push({
                    id: row.id,
                    name: row.name,
                    netRequirement: row.netRequirement,
                    eoq: row.eoq,
                    orderQty: row.suggestedQty,
                    cost_price: row.cost,
                    abc: row.abc
                });
            }
        });

        // 4. Apply OTB "Triple Filter" Logic
        Object.values(supplierStats).forEach(sup => {
            let totalValue = 0;
            sup.suggestedItems.forEach(i => totalValue += i.orderQty * i.cost_price);

            // If over budget, apply filters
            if (totalValue > sup.otb) {
                const itemsA = sup.suggestedItems.filter(i => i.abc === 'A');
                const itemsB = sup.suggestedItems.filter(i => i.abc === 'B');
                // Items C are dropped immediately if over budget per PRD Priority 3

                const costA = itemsA.reduce((sum, i) => sum + (i.orderQty * i.cost_price), 0);
                
                let finalItems = [];
                
                // Priority 1: Keep Class A items at 100% (unless they exceed budget themselves)
                if (costA > sup.otb) {
                    // Strict Budget Mode: Scale down Class A items to fit budget
                    const ratio = sup.otb / costA;
                    finalItems = itemsA.map(i => {
                        const newQty = Math.floor(i.orderQty * ratio);
                        return { ...i, orderQty: newQty };
                    }).filter(i => i.orderQty > 0);
                    // No budget left for B or C
                } else {
                    finalItems = [...itemsA];
                    
                    let remainingOtb = sup.otb - costA;

                    if (remainingOtb > 0) {
                        const costB = itemsB.reduce((sum, i) => sum + (i.orderQty * i.cost_price), 0);
                        
                        if (costB <= remainingOtb) {
                            // Priority 2: Fit all B if possible
                            finalItems = [...finalItems, ...itemsB];
                        } else {
                            // Priority 2: Reduce Class B quantities to fit budget
                            const ratio = remainingOtb / costB;
                            const reducedB = itemsB.map(i => {
                                const newQty = Math.floor(i.orderQty * ratio);
                                return { ...i, orderQty: newQty };
                            }).filter(i => i.orderQty > 0);
                            finalItems = [...finalItems, ...reducedB];
                        }
                    }
                }
                // Priority 3: Remove Class C items entirely (implicit by not adding them)
                
                sup.suggestedItems = finalItems;
            }

            // Recalculate final value
            sup.suggestedValue = sup.suggestedItems.reduce((sum, i) => sum + (i.orderQty * i.cost_price), 0);
        });

        procurementData = {
            items: velocityRows,
            suppliers: supplierStats,
            raw: { transactions, items, suppliers, supplierConfigs }
        };

    } catch (e) {
        console.error("Error calculating metrics:", e);
    } finally {
        if (btnView) {
            btnView.disabled = false;
            btnView.textContent = "View Sales Data";
        }
        if (btnCreate) {
            btnCreate.disabled = false;
            btnCreate.textContent = "Create PO";
        }
    }
}

async function renderPOList() {
    const pos = await Repository.getAll('purchase_orders');
    const suppliers = await Repository.getAll('suppliers');
    const stockIns = await Repository.getAll('stockins');
    const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
    const tbody = document.getElementById('po-list-body');

    // Filter
    let filtered = pos.filter(po => {
        if (po._deleted) return false;
        const supplierName = supplierMap.get(po.supplier_id) || po.supplier_id || '';
        const term = poSearchTerm;
        return po.id.toLowerCase().includes(term) || 
               supplierName.toLowerCase().includes(term) || 
               po.status.toLowerCase().includes(term);
    });

    // Sort
    filtered.sort((a, b) => {
        let valA, valB;
        const getActual = (p) => {
            const related = stockIns.filter(si => si.po_id === p.id && !si._deleted);
            return related.reduce((sum, si) => sum + (si.total_amount || 0), 0);
        };

        switch (poSortState.key) {
            case 'supplier_id':
                valA = supplierMap.get(a.supplier_id) || a.supplier_id;
                valB = supplierMap.get(b.supplier_id) || b.supplier_id;
                break;
            case 'actual_amount':
                valA = getActual(a);
                valB = getActual(b);
                break;
            default:
                valA = a[poSortState.key];
                valB = b[poSortState.key];
        }

        if (valA < valB) return poSortState.dir === 'asc' ? -1 : 1;
        if (valA > valB) return poSortState.dir === 'asc' ? 1 : -1;
        return 0;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No purchase orders found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(po => {
        const dateStr = new Date(po.created_at).toLocaleDateString();
        let statusColor = 'border-gray-300';
        if (po.status === 'approved') statusColor = 'border-indigo-500';
        else if (po.status === 'received') statusColor = 'border-green-500';
        else if (po.status === 'partially_received') statusColor = 'border-yellow-500';
        else if (po.status === 'cancelled') statusColor = 'border-red-500';

        const isSelected = selectedPoId === po.id;
        const rowClass = isSelected ? 'bg-blue-50' : 'hover:bg-gray-50 transition-colors';

        return `
        <tr class="${rowClass} cursor-pointer" onclick="window.selectPO('${po.id}')">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 border-l-4 ${statusColor}">
                <div class="font-bold text-gray-700">${dateStr}</div>
                <div class="text-xs text-gray-400">${po.id}</div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-medium">
                ${supplierMap.get(po.supplier_id) || po.supplier_id}
            </td>
        </tr>
    `}).join('');
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
                <td class="py-2 text-right font-bold text-red-600">${a.stock_level.toLocaleString()}</td>
                <td class="py-2 text-right text-red-800">${a.rop_trigger.toLocaleString()}</td>
                <td class="py-2 text-right text-red-800">${a.eoq_qty.toLocaleString()}</td>
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
    if (!procurementData) await refreshProcurementData();
    
    const { items: velocityRows, suppliers: supplierStats, raw } = procurementData;
    const { transactions } = raw;

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
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">₱${(t.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 text-sm text-gray-500 truncate max-w-xs" title="${itemSummary}">${itemSummary}</td>
        </tr>`;
    }).join('');

    // 2. Render Velocity Analysis
    const velocityBody = document.getElementById('sales-velocity-body');
    // Sort by velocity desc
    const sortedVelocity = [...velocityRows].sort((a, b) => b.velocity - a.velocity);

    velocityBody.innerHTML = sortedVelocity.map(row => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${row.firstSale}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.effectiveDays}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.totalQty.toLocaleString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold">${row.velocity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.projMonthly.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.projNext.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
    `).join('');

    // 3. Render Supplier Analysis
    const supplierBody = document.getElementById('sales-supplier-body');
    supplierBody.innerHTML = Object.values(supplierStats).sort((a,b) => b.projMonthly - a.projMonthly).map(s => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${s.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${s.itemCount}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.projMonthly.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.projNext.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
    `).join('');

    // 4. Render OTB Planner
    const otbBody = document.getElementById('sales-otb-body');
    otbBody.innerHTML = Object.values(supplierStats).sort((a,b) => b.otb - a.otb).map(s => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${s.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 capitalize">${s.cadence}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.plannedSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.targetEndStock.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.currentStock.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600">₱${s.otb.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
    `).join('');

    // 5. Render ABC/XYZ
    const abcBody = document.getElementById('sales-abc-body');
    // Sort by Annual Usage Value Descending for ABC
    const sortedAbc = [...velocityRows].sort((a, b) => b.annualUsage - a.annualUsage);

    abcBody.innerHTML = sortedAbc.map(row => {
        const abcColor = row.abc === 'A' ? 'text-green-600 font-bold' : (row.abc === 'B' ? 'text-blue-600' : 'text-gray-500');
        const xyzColor = row.xyz === 'X' ? 'text-green-600 font-bold' : (row.xyz === 'Y' ? 'text-yellow-600' : 'text-red-600');
        
        const frequency = (row.velocity > 0 && row.eoq > 0) ? Math.round(row.eoq / row.velocity) + ' days' : '-';

        return `<tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${row.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${row.annualUsage.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-center ${abcColor}">${row.abc}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${row.cv.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-center ${xyzColor}">${row.xyz}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-center font-bold border-l">${row.abc}${row.xyz}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 text-xs">EOQ: ${row.eoq} / ROP: ${row.rop}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${row.suggestedQty > 0 ? 'text-green-600' : 'text-gray-400'}">${row.suggestedQty > 0 ? row.suggestedQty : '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">${frequency}</td>
        </tr>`;
    }).join('');

    document.getElementById('sales-data-modal').classList.remove('hidden');
}

async function showCreatePOModal() {
    if (!procurementData) await refreshProcurementData();

    const modal = document.getElementById('po-modal');
    const tbody = document.getElementById('po-supplier-list-body');
    const searchInput = document.getElementById('po-supplier-search');
    
    modal.classList.remove('hidden');
    
    const supplierData = Object.values(procurementData.suppliers);

    const renderTable = () => {
        const term = searchInput.value.toLowerCase();
        const filtered = supplierData.filter(s => s.name.toLowerCase().includes(term));
        
        tbody.innerHTML = filtered.map(s => {
            const isOverBudget = s.suggestedValue > s.otb;
            const statusColor = isOverBudget ? 'text-red-600' : 'text-green-600';
            const statusText = isOverBudget ? 'Over Budget' : 'Within Budget';
            
            const detailsHtml = s.suggestedItems.map(i => `
                <tr class="border-b border-gray-200 last:border-0 text-xs">
                    <td class="py-1 pl-4 text-gray-600">${i.name}</td>
                    <td class="py-1 text-center font-bold ${i.abc === 'A' ? 'text-green-600' : (i.abc === 'B' ? 'text-blue-600' : 'text-gray-400')}">${i.abc || '-'}</td>
                    <td class="py-1 text-right text-gray-500">${Math.ceil(i.netRequirement)}</td>
                    <td class="py-1 text-right text-gray-500">${i.eoq}</td>
                    <td class="py-1 text-right font-bold text-blue-600">${i.orderQty}</td>
                    <td class="py-1 text-right text-gray-500">₱${i.cost_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="py-1 text-right pr-4 font-medium">₱${(i.orderQty * i.cost_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
            `).join('');

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${s.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-500 capitalize">
                        <select onchange="window.quickEditCadence('${s.id}', this.value)" class="border rounded p-1 text-xs bg-transparent hover:bg-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                            <option value="weekly" ${s.cadence === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="biweekly" ${s.cadence === 'biweekly' ? 'selected' : ''}>Biweekly</option>
                            <option value="monthly" ${s.cadence === 'monthly' ? 'selected' : ''}>Monthly</option>
                            <option value="on_order" ${s.cadence === 'on_order' ? 'selected' : ''}>On Order</option>
                            <option value="every_2_days" ${s.cadence === 'every_2_days' ? 'selected' : ''}>Every 2 Days</option>
                            <option value="twice_a_week" ${s.cadence === 'twice_a_week' ? 'selected' : ''}>Twice a Week</option>
                        </select>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">₱${s.otb.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600">₱${s.suggestedValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-center font-bold ${statusColor}">${statusText}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <button onclick="window.togglePoDetails('${s.id}')" class="text-xs text-gray-500 hover:text-blue-600 underline mr-3">Details</button>
                        <button onclick="window.createDraftPO('${s.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold shadow">
                            Create Draft
                        </button>
                    </td>
                </tr>
                <tr id="po-details-${s.id}" class="hidden bg-gray-50 shadow-inner">
                    <td colspan="6" class="p-3">
                        <div class="bg-white rounded border border-gray-200 overflow-hidden">
                            <table class="min-w-full">
                                <thead class="bg-gray-100 text-xs text-gray-500 font-bold uppercase">
                                    <tr>
                                        <th class="py-1 pl-4 text-left">Item</th>
                                        <th class="py-1 text-center">Class</th>
                                        <th class="py-1 text-right">Net Need</th>
                                        <th class="py-1 text-right">EOQ</th>
                                        <th class="py-1 text-right">Sugg Qty</th>
                                        <th class="py-1 text-right">Unit Cost</th>
                                        <th class="py-1 pr-4 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>${detailsHtml}</tbody>
                            </table>
                        </div>
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

window.quickEditCadence = async (supplierId, newCadence) => {
    if (newCadence) {
        const valid = ['weekly', 'biweekly', 'monthly', 'on_order', 'every_2_days', 'twice_a_week'];
        if (!valid.includes(newCadence)) {
            alert("Invalid cadence.");
            return;
        }
        
        const config = await Repository.get('supplier_config', supplierId) || { supplier_id: supplierId };
        if (config.delivery_cadence !== newCadence) {
            config.delivery_cadence = newCadence;
            config._updatedAt = Date.now();
            config._version = (config._version || 0) + 1;
            
            await Repository.upsert('supplier_config', config);
            SyncEngine.sync();
            await refreshProcurementData();
            await showCreatePOModal();
        }
    }
};

window.togglePoDetails = (supplierId) => {
    const row = document.getElementById(`po-details-${supplierId}`);
    if (row) row.classList.toggle('hidden');
};

window.calculateOtb = async (supplierId) => {
    const res = await fetch(`api/procurement.php?action=calculate-otb&supplier_id=${supplierId}`);
    const data = await res.json();
    if (data.new_otb !== undefined) {
        alert(`OTB Recalculated: ${data.new_otb.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        SyncEngine.sync(); // Pull new config
        // Invalidate cache to force refresh next time
        procurementData = null;
        // Refresh view if modal is open
        if (!document.getElementById('sales-data-modal').classList.contains('hidden')) {
            await showSalesData();
        }
    }
};

window.createPoForItem = async (itemId) => {
    const item = await Repository.get('items', itemId);
    if (item && item.supplier_id) {
        await showCreatePOModal(); // Populate options
        const search = document.getElementById('po-supplier-search');
        // Find supplier name
        const supplier = await Repository.get('suppliers', item.supplier_id);
        if (supplier && search) {
            search.value = supplier.name;
            search.dispatchEvent(new Event('input'));
        }
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
        await window.selectPO(poId);
    }
};

window.selectPO = async (poId) => {
    selectedPoId = poId;
    renderPOList(); // Re-render list to update highlight

    const po = await Repository.get('purchase_orders', poId);
    if (!po) return;
    
    window._currentPoId = poId;
    const suppliers = await Repository.getAll('suppliers');
    const stockIns = await Repository.getAll('stockins');
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const supplierName = supplier ? supplier.name : po.supplier_id;

    // Show panel, hide empty state
    document.getElementById('po-details-panel').classList.remove('hidden');
    document.getElementById('po-details-empty').classList.add('hidden');

    // Header Info
    const headerDiv = document.querySelector('#po-details-panel > div:first-child');
    let headerBg = 'bg-gray-50';
    let statusColor = 'text-gray-500';
    if (po.status === 'approved') { headerBg = 'bg-indigo-100'; statusColor = 'text-indigo-800'; }
    else if (po.status === 'received') { headerBg = 'bg-green-100'; statusColor = 'text-green-800'; }
    else if (po.status === 'partially_received') { headerBg = 'bg-yellow-100'; statusColor = 'text-yellow-800'; }
    else if (po.status === 'cancelled') { headerBg = 'bg-red-100'; statusColor = 'text-red-800'; }
    headerDiv.className = `p-4 border-b ${headerBg} flex justify-between items-start flex-shrink-0`;
    document.getElementById('po-detail-title').textContent = `PO: ${supplierName}`;
    document.getElementById('po-detail-meta').innerHTML = `ID: ${po.id} • Date: ${new Date(po.created_at).toLocaleDateString()} • <span class="font-bold ${statusColor}">${po.status.toUpperCase().replace('_', ' ')}</span>`;

    const tbody = document.getElementById('po-view-items');
    const items = po.items || [];
    
    // Reset search
    document.getElementById('po-view-search').value = '';

    // Configure Actions
    const actionsContainer = document.getElementById('po-detail-actions');
    actionsContainer.innerHTML = '';

    const btnPrint = document.createElement('button');
    btnPrint.className = "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold border border-gray-300";
    btnPrint.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg> Print`;
    btnPrint.onclick = () => window.printPO(poId);
    actionsContainer.appendChild(btnPrint);

    const btnAdd = document.getElementById('btn-add-po-item');
    btnAdd.dataset.id = poId;
    
    if (po.status === 'draft') {
        const btnApprove = document.createElement('button');
        btnApprove.className = "bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs font-bold shadow";
        btnApprove.textContent = "Approve";
        btnApprove.onclick = () => window.approvePO(poId);
        actionsContainer.appendChild(btnApprove);

        const btnDelete = document.createElement('button');
        btnDelete.className = "bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-xs font-bold border border-red-200";
        btnDelete.textContent = "Delete Draft";
        btnDelete.onclick = () => window.deletePO(poId);
        actionsContainer.appendChild(btnDelete);

        btnAdd.classList.remove('hidden');
    } else {
        btnAdd.classList.add('hidden');
    }

    if (po.status === 'approved') {
        const btnReceive = document.createElement('button');
        btnReceive.className = "bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-bold shadow";
        btnReceive.textContent = "Receive Stock";
        btnReceive.onclick = () => window.receivePO(poId);
        actionsContainer.appendChild(btnReceive);
    }

    const isDraft = po.status === 'draft';

    // Calculate Actuals & Variance for Footer
    let actualAmount = 0;
    const related = stockIns.filter(si => si.po_id === po.id && !si._deleted);
    actualAmount = related.reduce((sum, si) => sum + (si.total_amount || 0), 0);

    const orderedAmount = parseFloat(po.total_amount) || 0;
    const variance = actualAmount - orderedAmount;
    
    document.getElementById('po-detail-actual').textContent = (po.status === 'received' || po.status === 'partially_received') ? `₱${actualAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-';
    const varEl = document.getElementById('po-detail-variance');
    varEl.textContent = (po.status === 'received' || po.status === 'partially_received') ? `₱${variance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-';
    varEl.className = `font-bold text-lg ${variance < -0.01 ? 'text-green-600' : (variance > 0.01 ? 'text-red-600' : 'text-gray-800')}`;

    tbody.innerHTML = items.map(item => {
        const manualBadge = item.is_manual ? '<span class="ml-2 text-[10px] bg-yellow-100 text-yellow-800 px-1 rounded border border-yellow-200">Manual</span>' : '';
        const qtyDisplay = isDraft 
            ? `<input type="number" class="w-20 border rounded p-1 text-right text-sm" value="${item.qty}" min="1" onchange="window.updatePoItemQty('${po.id}', '${item.item_id || item.id}', this.value)">` 
            : item.qty;
        const deleteBtn = isDraft
            ? `<button onclick="window.removePoItem('${po.id}', '${item.item_id || item.id}')" class="text-red-600 hover:text-red-800 p-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>`
            : '';
        
        let discrepancyHtml = '';
        let rowBg = '';
        if (po.status === 'received' || po.status === 'partially_received') {
            const receivedItem = (po.received_items || []).find(ri => (ri.item_id || ri.id) === (item.item_id || item.id));
            if (receivedItem && receivedItem.qty < item.qty) {
                rowBg = 'bg-red-50';
                discrepancyHtml = `<div class="text-xs text-red-600 font-bold mt-1">Discrepancy: Received ${receivedItem.qty}/${item.qty}. Reason: ${receivedItem.reason || 'N/A'}</div>`;
            }
        }

        return `
        <tr class="${rowBg}">
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                <div class="flex flex-col">
                    <div class="flex items-center">${item.name || item.item_id} ${manualBadge}</div>
                    ${discrepancyHtml}
                </div>
            </td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-500">${qtyDisplay}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-500">${(item.cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-500">${(item.total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-right">${deleteBtn}</td>
        </tr>
    `}).join('');

    document.getElementById('po-view-total').textContent = `₱${(po.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

window.deletePO = async (poId) => {
    console.log("Executing deletePO for:", poId);
    if (!confirm("Are you sure you want to delete this draft Purchase Order?")) return;
    try {
        await Repository.remove('purchase_orders', poId);
        // Reset view
        selectedPoId = null;
        document.getElementById('po-details-panel').classList.add('hidden');
        document.getElementById('po-details-empty').classList.remove('hidden');
        await renderPOList();
        console.log("PO deleted successfully");
    } catch (e) {
        console.error("Error deleting PO:", e);
        alert("Failed to delete PO: " + (e.message || e));
    }
};

window.receivePO = async (poId) => {
    const po = await Repository.get('purchase_orders', poId);
    if (!po || po.status !== 'approved') return;

    const modal = document.getElementById('po-receive-modal');
    const title = document.getElementById('po-receive-title');
    const tbody = document.getElementById('po-receive-items-body');
    const confirmBtn = document.getElementById('btn-confirm-receive-po');

    title.textContent = `Receive Purchase Order: ${po.id}`;
    confirmBtn.dataset.poId = poId;

    // Reset search
    const searchInput = document.getElementById('po-receive-search');
    if (searchInput) searchInput.value = '';

    tbody.innerHTML = (po.items || []).map(item => `
        <tr data-item-id="${item.item_id || item.id}" data-item-name="${item.name}" data-item-cost="${item.cost}">
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900">${item.name}</td>
            <td class="px-6 py-2 whitespace-nowrap text-sm text-center font-bold">${item.qty}</td>
            <td class="px-6 py-2 whitespace-nowrap text-sm text-center">
                <input type="number" class="w-24 border rounded p-1 text-center received-qty" value="${item.qty}" min="0">
            </td>
            <td class="px-6 py-2 whitespace-nowrap text-sm">
                <input type="text" class="w-full border rounded p-1 text-xs discrepancy-reason" value="Out of Stock" placeholder="e.g., Damaged, Out of stock" disabled>
            </td>
        </tr>
    `).join('');

    // Add event listeners to enable/disable reason field
    tbody.querySelectorAll('.received-qty').forEach((input, index) => {
        const orderedQty = po.items[index].qty;
        const reasonInput = input.closest('tr').querySelector('.discrepancy-reason');
        input.addEventListener('input', () => {
            const receivedQty = parseInt(input.value) || 0;
            reasonInput.disabled = receivedQty === orderedQty;
            if (!reasonInput.disabled) {
                reasonInput.focus();
            }
        });
    });

    // Clear validation error on input
    tbody.querySelectorAll('.discrepancy-reason').forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        });
    });

    modal.classList.remove('hidden');
};

window.confirmReceivePO = async () => {
    const confirmBtn = document.getElementById('btn-confirm-receive-po');
    const poId = confirmBtn.dataset.poId;
    if (!poId) return;

    const po = await Repository.get('purchase_orders', poId);
    if (!po) return;

    const receivedItemsData = [];
    const rows = document.querySelectorAll('#po-receive-items-body tr');
    let hasError = false;
    let allItemsReceivedFully = true;

    rows.forEach(row => {
        const receivedQty = parseInt(row.querySelector('.received-qty').value) || 0;
        const orderedQty = parseInt(row.querySelector('td:nth-child(2)').textContent);
        const reasonInput = row.querySelector('.discrepancy-reason');
        
        // Reset error style
        reasonInput.classList.remove('border-red-500', 'ring-1', 'ring-red-500');

        if (receivedQty < orderedQty) {
            if (!reasonInput.value.trim()) {
                reasonInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
                hasError = true;
            }
        }
        
        if (receivedQty > 0 || receivedQty < orderedQty) {
            receivedItemsData.push({
                item_id: row.dataset.itemId,
                id: row.dataset.itemId, // for compatibility
                name: row.dataset.itemName,
                qty: receivedQty,
                cost: parseFloat(row.dataset.itemCost),
                total: receivedQty * parseFloat(row.dataset.itemCost),
                reason: receivedQty < orderedQty ? row.querySelector('.discrepancy-reason').value : null
            });
        }
        if (receivedQty < orderedQty) {
            allItemsReceivedFully = false;
        }
    });

    if (hasError) {
        alert("Please provide a reason for all items with discrepancies.");
        return;
    }

    if (receivedItemsData.length === 0) {
        if (!confirm("No items were marked as received. Do you want to close this PO without receiving anything?")) {
            return;
        }
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';

    try {
        const user = getUserProfile();
        const userName = user ? (user.name || user.email) : 'System';

        const totalReceivedValue = receivedItemsData.reduce((sum, i) => sum + i.total, 0);
        const stockIn = { id: 'SI-' + Date.now(), supplier_id: po.supplier_id, timestamp: new Date().toISOString(), items: receivedItemsData, total_amount: totalReceivedValue, po_id: poId, _version: 1, _updatedAt: Date.now(), _deleted: 0 };
        await Repository.upsert('stockins', stockIn);

        for (const item of receivedItemsData) {
            const product = await Repository.get('items', item.item_id || item.id);
            if (product) {
                product.stock_level = (product.stock_level || 0) + item.qty;
                if (item.cost > 0) product.cost_price = item.cost; 
                await Repository.upsert('items', product);

                await Repository.upsert('stock_movements', {
                    id: generateUUID(),
                    item_id: product.id,
                    item_name: product.name,
                    timestamp: new Date().toISOString(),
                    type: 'Stock-In',
                    qty: item.qty,
                    user: userName,
                    transaction_id: poId,
                    reason: 'PO Received'
                });
            }
        }

        po.status = allItemsReceivedFully ? 'received' : 'partially_received';
        po.received_items = (po.received_items || []).concat(receivedItemsData);
        po.received_at = new Date().toISOString();
        await Repository.upsert('purchase_orders', po);

        SyncEngine.sync();
        await renderPOList();
        document.getElementById('po-receive-modal').classList.add('hidden');
        await window.selectPO(poId);

    } catch (error) {
        console.error("Error confirming PO reception:", error);
        alert("An error occurred. Please check the console.");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm & Receive Stock';
    }
};

window.printPO = async (poId) => {
    const po = await Repository.get('purchase_orders', poId);
    if (!po) return;
    
    const suppliers = await Repository.getAll('suppliers');
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const supplierName = supplier ? supplier.name : po.supplier_id;
    const date = new Date(po.created_at).toLocaleDateString();

    const itemsHtml = (po.items || []).map(i => `
        <tr>
            <td style="padding:5px; border-bottom:1px solid #ddd;">${i.name}</td>
            <td style="padding:5px; border-bottom:1px solid #ddd; text-align:right;">${i.qty}</td>
            <td style="padding:5px; border-bottom:1px solid #ddd; text-align:right;">${(i.cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="padding:5px; border-bottom:1px solid #ddd; text-align:right;">${(i.total || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
    `).join('');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head><title>Purchase Order ${po.id}</title></head>
        <body style="font-family: sans-serif; padding: 20px;">
            <h1>Purchase Order</h1>
            <p><strong>PO ID:</strong> ${po.id}<br><strong>Supplier:</strong> ${supplierName}<br><strong>Date:</strong> ${date}<br><strong>Status:</strong> ${po.status}</p>
            <table style="width:100%; border-collapse: collapse; margin-top: 20px;">
                <thead><tr style="background:#eee; text-align:left;"><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Cost</th><th style="text-align:right">Total</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot><tr><td colspan="3" style="text-align:right; font-weight:bold; padding-top:10px;">Total:</td><td style="text-align:right; font-weight:bold; padding-top:10px;">${(po.total_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td></tr></tfoot>
            </table>
        </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
};

let _selectedPoItem = null;
let _currentPoIdForAdd = null;

window.showAddItemModal = (poId) => {
    _currentPoIdForAdd = poId;
    _selectedPoItem = null;
    document.getElementById('po-add-item-search').value = '';
    document.getElementById('po-add-item-qty').value = 1;
    document.getElementById('po-add-item-results').classList.add('hidden');
    document.getElementById('po-add-item-modal').classList.remove('hidden');
    document.getElementById('po-add-item-search').focus();
};

window.selectItemForPo = (id, name, cost) => {
    _selectedPoItem = { id, name, cost };
    document.getElementById('po-add-item-search').value = name;
    document.getElementById('po-add-item-results').classList.add('hidden');
};

window.addItemToPo = async () => {
    if (!_selectedPoItem || !_currentPoIdForAdd) {
        alert("Please select an item.");
        return;
    }
    const qty = parseInt(document.getElementById('po-add-item-qty').value) || 1;
    if (qty <= 0) {
        alert("Quantity must be greater than 0.");
        return;
    }

    const po = await Repository.get('purchase_orders', _currentPoIdForAdd);
    if (!po) return;

    const existingItem = po.items.find(i => (i.item_id || i.id) === _selectedPoItem.id);
    if (existingItem) {
        existingItem.qty += qty;
        existingItem.total = existingItem.qty * existingItem.cost;
    } else {
        po.items.push({
            item_id: _selectedPoItem.id,
            name: _selectedPoItem.name,
            qty: qty,
            cost: _selectedPoItem.cost,
            total: qty * _selectedPoItem.cost,
            is_manual: true
        });
    }

    po.total_amount = po.items.reduce((sum, i) => sum + i.total, 0);
    po._updatedAt = Date.now();
    await Repository.upsert('purchase_orders', po);
    
    document.getElementById('po-add-item-modal').classList.add('hidden');
    await window.viewPO(_currentPoIdForAdd);
    await renderPOList();
};

window.updatePoItemQty = async (poId, itemId, newQty) => {
    const po = await Repository.get('purchase_orders', poId);
    if (!po) return;
    const item = po.items.find(i => (i.item_id || i.id) === itemId);
    if (item) {
        item.qty = parseInt(newQty) || 0;
        item.total = item.qty * item.cost;
        po.total_amount = po.items.reduce((sum, i) => sum + i.total, 0);
        await Repository.upsert('purchase_orders', po);
        await window.selectPO(poId);
        await renderPOList();
    }
};

window.removePoItem = async (poId, itemId) => {
    if (!confirm("Remove this item from the PO?")) return;
    const po = await Repository.get('purchase_orders', poId);
    if (!po) return;
    
    po.items = po.items.filter(i => (i.item_id || i.id) !== itemId);
    po.total_amount = po.items.reduce((sum, i) => sum + i.total, 0);
    await Repository.upsert('purchase_orders', po);
    await window.selectPO(poId);
    await renderPOList();
};
