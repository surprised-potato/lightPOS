import { db } from "../db.js";
import { getSystemSettings } from "./settings.js";

let reportData = {};
let sortState = {}; // { tableId: { key, dir } }
let filterState = {}; // { tableId: term }

export async function loadReportsView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Advanced Reports</h2>
            
            <!-- Controls -->
            <div class="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[300px]">
                    <label class="block text-sm font-bold text-gray-700 mb-1">Date Range</label>
                    <div class="relative">
                        <input type="text" id="report-range" class="w-full border rounded p-2 text-sm bg-white cursor-pointer" placeholder="Select date range...">
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 mb-0.5">
                    <button type="button" data-range="today" class="btn-quick-range text-xs bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded font-semibold text-gray-600 transition">Today</button>
                    <button type="button" data-range="7days" class="btn-quick-range text-xs bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded font-semibold text-gray-600 transition">7 Days</button>
                    <button type="button" data-range="30days" class="btn-quick-range text-xs bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded font-semibold text-gray-600 transition">30 Days</button>
                    <button type="button" data-range="thisMonth" class="btn-quick-range text-xs bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded font-semibold text-gray-600 transition">This Month</button>
                </div>
                <button id="btn-generate-report" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition">
                    Generate Report
                </button>
            </div>

            <!-- Tab Navigation -->
            <div class="border-b border-gray-200 mb-6">
                <nav class="flex -mb-px space-x-8" aria-label="Tabs">
                    <button data-tab="financials" class="tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Financials</button>
                    <button data-tab="inventory" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Inventory</button>
                    <button data-tab="products" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Products</button>
                    <button data-tab="insights" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Insights</button>
                    <button data-tab="returns" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Returns</button>
                    <button data-tab="system" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">System</button>
                </nav>
            </div>

            <!-- Tab Panels -->
            <div id="report-panels">
                <!-- Financials Panel -->
                <div id="tab-financials" class="tab-panel">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="fin-summary" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Summary & Payments</button>
                        <button data-subtab="fin-variance" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Shifts</button>
                    </div>

                    <div id="subpanel-fin-summary" class="sub-panel">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500 relative group">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Gross Sales</div>
                                <div class="text-3xl font-bold text-gray-800" id="report-gross-sales">₱0.00</div>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-orange-500">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Tax Collected</div>
                                <div class="text-3xl font-bold text-gray-800" id="report-tax">₱0.00</div>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-500">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Cost of Goods</div>
                                <div class="text-3xl font-bold text-gray-800" id="report-cogs">₱0.00</div>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Net Profit</div>
                                <div class="text-3xl font-bold text-gray-800" id="report-profit">₱0.00</div>
                            </div>
                        </div>
                        <div class="bg-white shadow-md rounded p-6 max-w-md">
                            <div class="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 class="font-bold text-gray-800">Payment Method Breakdown</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="payments">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-payments" class="hidden mb-4"><input type="text" placeholder="Filter methods..." class="filter-input w-full p-1 border rounded text-sm" data-table="payments"></div>
                            <div id="report-payments-list" class="space-y-2">
                                <div class="text-center text-gray-400 py-4">No data</div>
                            </div>
                        </div>
                    </div>

                    <div id="subpanel-fin-variance" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Shift History & Variance</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="variance">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-variance" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter shifts..." class="filter-input w-full p-1 border rounded text-sm" data-table="variance"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="start_time" data-table="variance">Shift Date</th>
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="user_id" data-table="variance">User</th>
                                        <th class="py-3 px-6 text-center cursor-pointer hover:bg-gray-200" data-sort="status" data-table="variance">Status</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="opening_cash" data-table="variance">Opening</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="expected_cash" data-table="variance">Expected</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="closing_cash" data-table="variance">Actual</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="variance" data-table="variance">Variance</th>
                                        <th class="py-3 px-6 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="report-variance-body" class="text-gray-600 text-sm font-light">
                                    <tr><td colspan="6" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Inventory Panel -->
                <div id="tab-inventory" class="tab-panel hidden">
                    <!-- Sub Tabs -->
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="inv-val" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Valuation</button>
                        <button data-subtab="inv-history" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Stock-In History</button>
                        <button data-subtab="inv-audit" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Adjustments</button>
                        <button data-subtab="inv-slow" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Slow Moving</button>
                    </div>

                    <div id="subpanel-inv-val" class="sub-panel">
                        <div class="bg-white shadow-md rounded p-6 max-w-lg">
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Inventory Valuation</h3>
                            <div class="flex justify-between mb-2">
                                <span class="text-gray-600">Total Value (Cost):</span>
                                <span id="val-cost" class="font-bold">₱0.00</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span class="text-gray-600">Total Value (Retail):</span>
                                <span id="val-retail" class="font-bold">₱0.00</span>
                            </div>
                            <div class="flex justify-between border-t pt-2 mt-2">
                                <span class="text-gray-600">Potential Profit:</span>
                                <span id="val-profit" class="font-bold text-green-600">₱0.00</span>
                            </div>
                        </div>
                    </div>

                    <div id="subpanel-inv-history" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Stock-In History</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="stockIn">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-stockIn" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter stock-in..." class="filter-input w-full p-1 border rounded text-sm" data-table="stockIn"></div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                            <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="timestamp" data-table="stockIn">Date</th>
                                            <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="username" data-table="stockIn">User</th>
                                            <th class="py-2 px-4 text-right">Total Units</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-stockin-body" class="text-gray-600 text-xs font-light"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div id="subpanel-inv-audit" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Stock Adjustment History (Audit)</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="adjustments">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-adjustments" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter adjustments..." class="filter-input w-full p-1 border rounded text-sm" data-table="adjustments"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="timestamp" data-table="adjustments">Date</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="item_name" data-table="adjustments">Item</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="reason" data-table="adjustments">Reason</th>
                                        <th class="py-2 px-4 text-right cursor-pointer hover:bg-gray-200" data-sort="difference" data-table="adjustments">Diff</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="user" data-table="adjustments">User</th>
                                    </tr>
                                </thead>
                                <tbody id="report-adjustments-body" class="text-gray-600 text-xs font-light"></tbody>
                            </table>
                        </div>
                    </div>

                    <div id="subpanel-inv-slow" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <div class="flex flex-col sm:flex-row sm:items-center gap-4">
                                    <h3 class="font-bold text-gray-800">Slow Moving Items (Zero Sales)</h3>
                                    <div class="flex items-center gap-2 bg-white border rounded px-2 py-1">
                                        <label for="slow-moving-threshold" class="text-[10px] font-bold text-gray-500 uppercase">Inactivity Days:</label>
                                        <input type="number" id="slow-moving-threshold" value="30" min="1" class="w-12 text-xs focus:outline-none font-bold text-blue-600">
                                        <button id="btn-refresh-slow" class="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-0.5 rounded font-bold transition">Update</button>
                                    </div>
                                </div>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="slowMoving">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-slowMoving" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter items..." class="filter-input w-full p-1 border rounded text-sm" data-table="slowMoving"></div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="slowMoving">Product</th>
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="barcode" data-table="slowMoving">Barcode</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="stock_level" data-table="slowMoving">Current Stock</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="cost_price" data-table="slowMoving">Unit Cost</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="value" data-table="slowMoving">Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-slow-moving-body" class="text-gray-600 text-sm font-light">
                                        <tr><td colspan="5" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Insights Panel -->
                <div id="tab-insights" class="tab-panel hidden">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="ins-customers" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Customer Insights</button>
                        <button data-subtab="ins-suppliers" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Supplier Insights</button>
                    </div>

                    <div id="subpanel-ins-customers" class="sub-panel">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div class="bg-white shadow-md rounded p-6">
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Loyalty Liability</h3>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-600">Total Outstanding Points:</span>
                                <span id="report-total-points" class="text-2xl font-bold text-orange-600">0</span>
                            </div>
                            <p class="text-xs text-gray-500 mt-2 italic">* This represents future debt owed to customers in rewards.</p>
                        </div>
                        <div class="bg-white shadow-md rounded p-6">
                            <div class="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 class="font-bold text-gray-800">VIP Report (Top 10)</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="vip">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-vip" class="hidden mb-4"><input type="text" placeholder="Filter VIPs..." class="filter-input w-full p-1 border rounded text-sm" data-table="vip"></div>
                            <table class="min-w-full text-sm">
                                <thead>
                                    <tr class="text-left text-gray-500 border-b">
                                        <th class="pb-2 cursor-pointer hover:text-blue-600" data-sort="name" data-table="vip">Customer</th>
                                        <th class="pb-2 text-right cursor-pointer hover:text-blue-600" data-sort="totalSpent" data-table="vip">Total Spent</th>
                                    </tr>
                                </thead>
                                <tbody id="report-vip-body"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="bg-white shadow-md rounded overflow-hidden">
                        <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-800">Customer Ledger / Credit Balance</h3>
                            <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="ledger">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-ledger" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter ledger..." class="filter-input w-full p-1 border rounded text-sm" data-table="ledger"></div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="ledger">Customer</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="totalSpent" data-table="ledger">Total Sales</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="points" data-table="ledger">Points Balance</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="lastVisit" data-table="ledger">Last Visit</th>
                                </tr>
                            </thead>
                            <tbody id="report-ledger-body" class="text-gray-600 text-sm font-light"></tbody>
                        </table>
                    </div>
                    </div>

                    <div id="subpanel-ins-suppliers" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden mb-8">
                        <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-800">Vendor Performance (Sell-Through)</h3>
                            <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="vendorPerf">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-vendorPerf" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter vendors..." class="filter-input w-full p-1 border rounded text-sm" data-table="vendorPerf"></div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="vendorPerf">Supplier</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="bought" data-table="vendorPerf">Units Bought</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="sold" data-table="vendorPerf">Units Sold</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="pct" data-table="vendorPerf">Sell-Through %</th>
                                </tr>
                            </thead>
                            <tbody id="report-vendor-perf-body" class="text-gray-600 text-sm font-light"></tbody>
                        </table>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Purchase History by Vendor</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="purchaseHistory">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-purchaseHistory" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter history..." class="filter-input w-full p-1 border rounded text-sm" data-table="purchaseHistory"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="timestamp" data-table="purchaseHistory">Date</th>
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="vendorName" data-table="purchaseHistory">Vendor</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="total" data-table="purchaseHistory">Total Cost</th>
                                    </tr>
                                </thead>
                                <tbody id="report-purchase-history-body" class="text-gray-600 text-sm font-light"></tbody>
                            </table>
                        </div>
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Landed Cost Report</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="landedCost">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-landedCost" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter items..." class="filter-input w-full p-1 border rounded text-sm" data-table="landedCost"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="landedCost">Item</th>
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="vendorName" data-table="landedCost">Vendor</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="cost_price" data-table="landedCost">Last Cost</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="selling_price" data-table="landedCost">Retail</th>
                                    </tr>
                                </thead>
                                <tbody id="report-landed-cost-body" class="text-gray-600 text-sm font-light"></tbody>
                            </table>
                        </div>
                    </div>
                    </div>
                </div>

                <!-- Products Panel -->
                <div id="tab-products" class="tab-panel hidden">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="prod-perf" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Performance</button>
                        <button data-subtab="prod-affinity" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Product Affinity</button>
                    </div>

                    <div id="subpanel-prod-perf" class="sub-panel">
                        <!-- Retailer's Matrix -->
                        <div class="bg-white shadow-md rounded p-6 mb-6">
                            <h3 class="font-bold text-gray-800 mb-6 border-b pb-2">Retailer's Matrix (Product Quadrants)</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="p-4 border-2 border-green-200 bg-green-50 rounded-lg">
                                    <div class="flex justify-between items-center mb-2">
                                        <span class="font-bold text-green-800 uppercase text-sm">Winners</span>
                                        <span class="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded">High Sales, High Margin</span>
                                    </div>
                                    <div id="matrix-winners" class="text-xs space-y-1 text-green-700"></div>
                                </div>
                                <div class="p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
                                    <div class="flex justify-between items-center mb-2">
                                        <span class="font-bold text-blue-800 uppercase text-sm">Cash Cows</span>
                                        <span class="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded">High Sales, Low Margin</span>
                                    </div>
                                    <div id="matrix-cows" class="text-xs space-y-1 text-blue-700"></div>
                                </div>
                                <div class="p-4 border-2 border-orange-200 bg-orange-50 rounded-lg">
                                    <div class="flex justify-between items-center mb-2">
                                        <span class="font-bold text-orange-800 uppercase text-sm">Sleepers</span>
                                        <span class="text-[10px] bg-orange-200 text-orange-800 px-2 py-0.5 rounded">Low Sales, High Margin</span>
                                    </div>
                                    <div id="matrix-sleepers" class="text-xs space-y-1 text-orange-700"></div>
                                </div>
                                <div class="p-4 border-2 border-red-200 bg-red-50 rounded-lg">
                                    <div class="flex justify-between items-center mb-2">
                                        <span class="font-bold text-red-800 uppercase text-sm">Dogs</span>
                                        <span class="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded">Low Sales, Low Margin</span>
                                    </div>
                                    <div id="matrix-dogs" class="text-xs space-y-1 text-red-700"></div>
                                </div>
                            </div>
                        </div>

                        <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-800">Product Performance (Advanced Metrics)</h3>
                            <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="products">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-products" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter products..." class="filter-input w-full p-1 border rounded text-sm" data-table="products"></div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="products">Product</th>
                                    <th class="py-3 px-6 text-center cursor-pointer hover:bg-gray-200" data-sort="qty" data-table="products">Sold</th>
                                    <th class="py-3 px-6 text-center cursor-pointer hover:bg-gray-200" data-sort="str" data-table="products" title="Sell-Through Rate">STR %</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="revenue" data-table="products">Revenue</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="marginPct" data-table="products">Margin %</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="gmroi" data-table="products" title="Gross Margin Return on Investment">GMROI</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="penetration" data-table="products" title="Basket Penetration">Pen. %</th>
                                </tr>
                            </thead>
                            <tbody id="report-products-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="7" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                            </tbody>
                        </table>
                        </div>
                    </div>

                    <div id="subpanel-prod-affinity" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                        <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-800">Product Affinity (Frequently Bought Together)</h3>
                            <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="affinity">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-affinity" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter pairs..." class="filter-input w-full p-1 border rounded text-sm" data-table="affinity"></div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="itemAName" data-table="affinity">Item A</th>
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="itemBName" data-table="affinity">Item B</th>
                                        <th class="py-3 px-6 text-center cursor-pointer hover:bg-gray-200" data-sort="count" data-table="affinity">Frequency</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="attachRateA" data-table="affinity">Attach Rate (A→B)</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="attachRateB" data-table="affinity">Attach Rate (B→A)</th>
                                    </tr>
                                </thead>
                                <tbody id="report-affinity-body" class="text-gray-600 text-sm font-light">
                                    <tr><td colspan="5" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    </div>
                </div>

                <!-- Returns Panel -->
                <div id="tab-returns" class="tab-panel hidden">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <!-- Reason Code Breakdown -->
                        <div class="bg-white shadow-md rounded p-6">
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Return Reasons</h3>
                            <div id="report-return-reasons" class="space-y-2">
                                <div class="text-center text-gray-400 py-4">No data</div>
                            </div>
                        </div>
                        <!-- Defective Items by Supplier -->
                        <div class="bg-white shadow-md rounded p-6">
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Defective Items by Supplier</h3>
                            <div class="overflow-x-auto">
                                <table class="min-w-full text-sm">
                                    <thead>
                                        <tr class="text-left text-gray-500 border-b">
                                            <th class="pb-2">Supplier</th>
                                            <th class="pb-2 text-right">Defective Count</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-defective-supplier-body">
                                        <tr><td colspan="2" class="py-4 text-center text-gray-400">No data</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <!-- Detailed Returns Table -->
                    <div class="bg-white shadow-md rounded overflow-hidden">
                        <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-800">Detailed Returns Log</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left">Date</th>
                                        <th class="py-3 px-6 text-left">Item</th>
                                        <th class="py-3 px-6 text-left">Reason</th>
                                        <th class="py-3 px-6 text-right">Qty</th>
                                        <th class="py-3 px-6 text-right">Refund</th>
                                    </tr>
                                </thead>
                                <tbody id="report-returns-log-body" class="text-gray-600 text-sm font-light">
                                    <tr><td colspan="5" class="py-3 px-6 text-center">No returns found.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- System Panel -->
                <div id="tab-system" class="tab-panel hidden">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="sys-audit" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Audit Log</button>
                        <button data-subtab="sys-users" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">User Sales</button>
                    </div>

                    <div id="subpanel-sys-audit" class="sub-panel">
                        <div class="bg-white shadow-md rounded overflow-hidden border-t-4 border-red-500">
                        <div class="px-6 py-4 border-b bg-red-50 flex justify-between items-center">
                            <h3 class="font-bold text-red-800">Audit Log: Voided Transactions</h3>
                            <button class="btn-toggle-filter text-red-500 hover:text-red-700" data-target="audit">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-audit" class="hidden px-6 py-2 bg-red-100 border-b"><input type="text" placeholder="Filter voids..." class="filter-input w-full p-1 border rounded text-sm" data-table="audit"></div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="voided_at" data-table="audit">Voided At</th>
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="timestamp" data-table="audit">Original Time</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="total_amount" data-table="audit">Amount</th>
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="voided_by" data-table="audit">Voided By</th>
                                </tr>
                            </thead>
                            <tbody id="report-audit-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="4" class="py-3 px-6 text-center">No voided transactions in this period.</td></tr>
                            </tbody>
                        </table>
                    </div>
                    </div>

                    <div id="subpanel-sys-users" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                        <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 class="font-bold text-gray-800">Sales by User</h3>
                            <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="users">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-users" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter users..." class="filter-input w-full p-1 border rounded text-sm" data-table="users"></div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="user" data-table="users">User</th>
                                    <th class="py-3 px-6 text-center cursor-pointer hover:bg-gray-200" data-sort="count" data-table="users">Transactions</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="total" data-table="users">Total Sales</th>
                                </tr>
                            </thead>
                            <tbody id="report-users-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="3" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                            </tbody>
                        </table>
                    </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize DateRangePicker (requires jQuery and Moment.js)
    if (typeof $ !== 'undefined' && $.fn.daterangepicker) {
        $('#report-range').daterangepicker({
            opens: 'left',
            autoUpdateInput: true,
            locale: {
                format: 'YYYY-MM-DD'
            },
            startDate: moment(),
            endDate: moment(),
            maxDate: moment()
        }, function(start, end) {
            // Auto-generate report on selection
            generateReport();
        });
    }

    // Quick Range Logic
    content.querySelectorAll(".btn-quick-range").forEach(btn => {
        btn.addEventListener("click", () => {
            if (typeof $ === 'undefined' || typeof moment === 'undefined') return;

            const drp = $('#report-range').data('daterangepicker');
            if (!drp) return;

            const range = btn.dataset.range;
            const end = moment();
            let start = moment();
            
            switch(range) {
                case 'today': break;
                case '7days': start = moment().subtract(6, 'days'); break;
                case '30days': start = moment().subtract(29, 'days'); break;
                case 'thisMonth': start = moment().startOf('month'); break;
            }
            
            drp.setStartDate(start);
            drp.setEndDate(end);
            
            // Visual feedback for active button
            content.querySelectorAll(".btn-quick-range").forEach(b => {
                b.classList.remove("bg-blue-100", "text-blue-700");
                b.classList.add("bg-gray-100", "text-gray-600");
            });
            btn.classList.remove("bg-gray-100", "text-gray-600");
            btn.classList.add("bg-blue-100", "text-blue-700");

            // Auto-generate report on quick select
            generateReport();
        });
    });

    document.getElementById("btn-generate-report").addEventListener("click", generateReport);

    // Tab Switching Logic
    const tabs = content.querySelectorAll(".tab-btn");
    const panels = content.querySelectorAll(".tab-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            
            // Update Tab UI
            tabs.forEach(t => {
                t.classList.remove("border-blue-500", "text-blue-600");
                t.classList.add("border-transparent", "text-gray-500");
            });
            tab.classList.add("border-blue-500", "text-blue-600");
            tab.classList.remove("border-transparent", "text-gray-500");

            // Update Panel Visibility
            panels.forEach(p => {
                if (p.id === `tab-${target}`) p.classList.remove("hidden");
                else p.classList.add("hidden");
            });
        });
    });

    // Inventory Sub-Tab Switching Logic
    content.querySelectorAll(".subtab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.subtab;
            
            // Update Sub-Tab UI
            btn.parentElement.querySelectorAll(".subtab-btn").forEach(b => {
                b.classList.remove("border-blue-500", "text-blue-600");
                b.classList.add("border-transparent", "text-gray-500");
            });
            btn.classList.add("border-blue-500", "text-blue-600");
            btn.classList.remove("border-transparent", "text-gray-500");

            // Update Sub-Panel Visibility
            btn.closest(".tab-panel").querySelectorAll(".sub-panel").forEach(p => {
                if (p.id === `subpanel-${target}`) p.classList.remove("hidden");
                else p.classList.add("hidden");
            });
        });
    });

    // Sorting and Filtering Listeners
    content.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-sort]");
        if (th) {
            const tableId = th.dataset.table;
            const key = th.dataset.sort;
            handleSort(tableId, key);
        }

        const btnFilter = e.target.closest(".btn-toggle-filter");
        if (btnFilter) {
            const target = btnFilter.dataset.target;
            const container = document.getElementById(`filter-${target}`);
            container.classList.toggle("hidden");
            if (!container.classList.contains("hidden")) {
                container.querySelector("input").focus();
            }
        }

        const stockInRow = e.target.closest("#report-stockin-body tr");
        if (stockInRow && stockInRow.dataset.id) {
            showStockInDetails(stockInRow.dataset.id);
        }

        const btnViewShift = e.target.closest(".btn-view-shift-tx");
        if (btnViewShift) {
            showShiftTransactions(btnViewShift.dataset.id);
        }
    });

    document.getElementById("btn-refresh-slow")?.addEventListener("click", async () => {
        const days = parseInt(document.getElementById("slow-moving-threshold").value) || 30;
        await calculateSlowMoving(days);
    });

    content.addEventListener("input", (e) => {
        if (e.target.classList.contains("filter-input")) {
            const tableId = e.target.dataset.table;
            handleFilter(tableId, e.target.value);
        }
    });
}

async function generateReport() {
    const usersBody = document.getElementById("report-users-body");

    if (typeof $ === 'undefined') return;

    const drp = $('#report-range').data('daterangepicker');
    if (!drp) {
        alert("Please select a date or range.");
        return;
    }

    // Clone and set boundaries to ensure full day coverage
    const startDate = drp.startDate.clone().startOf('day').toDate();
    const endDate = drp.endDate.clone().endOf('day').toDate();

    usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">Loading data from cloud...</td></tr>`;

    const settings = await getSystemSettings();

    try {
        // Query Dexie instead of Firestore
        const transactions = await db.transactions
            .where('timestamp')
            .between(startDate, endDate, true, true)
            .toArray();
        
        const returns = await db.returns
            .where('timestamp')
            .between(startDate, endDate, true, true)
            .toArray();
        
        const localStockIn = await db.stockins.toArray();
        const allItems = await db.items.toArray();

        // Fetch supporting data from server
        const [shiftsRes, customersRes, suppliersRes, stockInRes, adjustmentsRes] = await Promise.all([
            fetch('api/router.php?file=shifts'),
            fetch('api/router.php?file=customers'),
            fetch('api/router.php?file=suppliers'),
            fetch('api/router.php?file=stock_in_history'),
            fetch('api/router.php?file=adjustments')
        ]);

        const safeJson = async (res) => {
            try { return await res.json(); } catch(e) { return []; }
        };

        const shifts = await safeJson(shiftsRes);
        const customers = await safeJson(customersRes);
        const suppliers = await safeJson(suppliersRes);
        const serverStockIn = await safeJson(stockInRes);
        const adjustments = await safeJson(adjustmentsRes);

        // Merge Stock-In History (Server + Local)
        const historyMap = new Map();
        if (Array.isArray(serverStockIn)) serverStockIn.forEach(entry => historyMap.set(entry.id, entry));
        if (Array.isArray(localStockIn)) localStockIn.forEach(entry => historyMap.set(entry.id, entry));
        
        const stockInHistory = Array.from(historyMap.values());

        const filteredShifts = (Array.isArray(shifts) ? shifts : []).filter(s => {
            const d = new Date(s.start_time);
            return d >= startDate && d <= endDate;
        });

        const filteredStockIn = stockInHistory.filter(s => {
            const d = new Date(s.timestamp);
            return d >= startDate && d <= endDate;
        });

        const filteredAdjustments = adjustments.filter(a => {
            const d = new Date(a.timestamp);
            return d >= startDate && d <= endDate;
        });

        let grossSales = 0;
        let totalTax = 0;
        let cogs = 0;
        const userStats = {};
        const productStats = {};
        const pairCounts = {};
        const itemTxCounts = {};
        const paymentStats = {};
        const voidedTxs = [];
        const totalTxCount = transactions.filter(t => !t.is_voided).length;

        if (transactions.length === 0 && returns.length === 0) {
            reportData = {};
            usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No data found for this period.</td></tr>`;
            updateFinancials(0, 0, 0);
            renderUserStats([]);
            renderInventoryValuation(allItems);
            renderPaymentStats([]);
            renderProductStats([]);
            renderProductAffinity([]);
            renderSlowMovingItems([]);
            renderAuditLog([]);
            renderCashVariance([]);
            renderCustomerInsights([], []);
            renderSupplierInsights([], [], []);
            renderReturnsReport([], [], []);
            return;
        }

        transactions.forEach(data => {
            if (data.is_voided) {
                voidedTxs.push(data);
                return;
            }

            // Financials
            grossSales += data.total_amount || 0;
            
            // Re-calculate tax based on current settings if not stored or for consistency
            const taxRate = (settings.tax?.rate || 0) / 100;
            const calculatedTax = data.total_amount - (data.total_amount / (1 + taxRate));
            totalTax += calculatedTax;
            
            if (data.items && Array.isArray(data.items)) {
                // Affinity Logic
                const uniqueItemIds = [...new Set(data.items.map(i => i.id))];
                uniqueItemIds.forEach(id => {
                    itemTxCounts[id] = (itemTxCounts[id] || 0) + 1;
                });

                if (uniqueItemIds.length > 1) {
                    for (let i = 0; i < uniqueItemIds.length; i++) {
                        for (let j = i + 1; j < uniqueItemIds.length; j++) {
                            const idA = uniqueItemIds[i];
                            const idB = uniqueItemIds[j];
                            const pairKey = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
                            pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
                        }
                    }
                }

                data.items.forEach(item => {
                    const cost = item.cost_price || 0;
                    const qty = item.qty || 0;
                    cogs += cost * qty;
                    
                    // Product Stats
                    if (!productStats[item.id]) {
                        productStats[item.id] = { id: item.id, name: item.name, qty: 0, revenue: 0, cost: 0, txCount: 0, txIds: new Set() };
                    }
                    productStats[item.id].qty += qty;
                    productStats[item.id].revenue += (item.selling_price * qty);
                    productStats[item.id].cost += (item.cost_price * qty);
                    productStats[item.id].txIds.add(data.id);
                });
            }

            // Payment Stats
            const method = data.payment_method || "Cash";
            paymentStats[method] = (paymentStats[method] || 0) + (data.total_amount || 0);

            // User Stats
            const user = data.user_email || "Unknown";
            if (!userStats[user]) {
                userStats[user] = { count: 0, total: 0 };
            }
            userStats[user].count++;
            userStats[user].total += data.total_amount || 0;
        });

        // Returns Processing
        const reasonStats = {};
        const defectiveBySupplier = {};

        returns.forEach(ret => {
            // Reason Stats
            reasonStats[ret.reason] = (reasonStats[ret.reason] || 0) + 1;

            // Defective by Supplier
            if (ret.reason === 'Defective') {
                const item = allItems.find(i => i.id === ret.item_id);
                const supplierId = item?.supplier_id || 'Unknown';
                const supplierName = suppliers.find(s => s.id === supplierId)?.name || 'Unknown';
                defectiveBySupplier[supplierName] = (defectiveBySupplier[supplierName] || 0) + ret.qty;
            }
        });

        reportData.returns = returns;
        reportData.returnReasons = Object.entries(reasonStats).map(([reason, count]) => ({ reason, count }));
        reportData.defectiveSuppliers = Object.entries(defectiveBySupplier).map(([name, count]) => ({ name, count }));

        // Store data in state for sorting/filtering
        reportData.users = Object.entries(userStats).map(([user, d]) => ({ user, ...d }));
        reportData.stockIn = filteredStockIn;
        reportData.adjustments = filteredAdjustments;
        
        reportData.products = Object.values(productStats).map(p => {
            const itemMaster = allItems.find(i => i.id === p.id);
            const currentStock = itemMaster ? itemMaster.stock_level : 0;
            const costPrice = itemMaster ? itemMaster.cost_price : 0;
            const avgInvCost = Math.max(1, currentStock * costPrice); // Avoid div by zero
            
            return { 
                ...p, 
                margin: p.revenue - p.cost, 
                marginPct: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0,
                str: (p.qty / (p.qty + currentStock)) * 100,
                gmroi: (p.revenue - p.cost) / avgInvCost,
                penetration: totalTxCount > 0 ? (p.txIds.size / totalTxCount * 100) : 0
            };
        });

        reportData.affinity = Object.entries(pairCounts).map(([key, count]) => {
            const [idA, idB] = key.split('|');
            const itemA = allItems.find(i => i.id === idA);
            const itemB = allItems.find(i => i.id === idB);
            return {
                itemAName: itemA ? itemA.name : 'Unknown',
                itemBName: itemB ? itemB.name : 'Unknown',
                count,
                attachRateA: (count / (itemTxCounts[idA] || 1)) * 100,
                attachRateB: (count / (itemTxCounts[idB] || 1)) * 100
            };
        }).sort((a, b) => b.count - a.count);

        // Slow Moving Items (Initial calculation based on threshold input)
        const slowDays = parseInt(document.getElementById("slow-moving-threshold").value) || 30;
        await calculateSlowMoving(slowDays, allItems);

        reportData.payments = Object.entries(paymentStats).map(([method, total]) => ({ method, total }));
        reportData.audit = voidedTxs;
        reportData.variance = filteredShifts.map(s => ({ ...s, variance: s.status === 'closed' ? (s.closing_cash || 0) - (s.expected_cash || 0) : null }));
        
        // Customer Data
        const custStats = customers.map(c => {
            const txs = transactions.filter(t => t.customer_id === c.id);
            return {
                id: c.id,
                name: c.name,
                points: c.loyalty_points || 0,
                totalSpent: txs.reduce((sum, t) => sum + (t.total_amount || 0), 0),
                lastVisit: txs.length > 0 ? new Date(Math.max(...txs.map(t => new Date(t.timestamp)))).toLocaleDateString() : '-'
            };
        });
        reportData.ledger = custStats;
        reportData.vip = [...custStats].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);

        // Supplier Data
        reportData.vendorPerf = suppliers.map(s => {
            const bought = stockInHistory.reduce((sum, entry) => sum + entry.items.filter(i => allItems.find(m => m.id === i.item_id)?.supplier_id === s.id).reduce((s2, i) => s2 + (i.quantity || 0), 0), 0);
            const sold = transactions.reduce((sum, tx) => sum + tx.items.filter(i => allItems.find(m => m.id === i.id)?.supplier_id === s.id).reduce((s2, i) => s2 + (i.qty || 0), 0), 0);
            return { name: s.name, bought, sold, pct: bought > 0 ? (sold / bought * 100) : 0 };
        });
        reportData.purchaseHistory = stockInHistory.map(h => ({ ...h, vendorName: h.supplier_id_override ? (suppliers.find(s => s.id === h.supplier_id_override)?.name || 'Unknown') : 'Mixed', total: h.items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.cost_price || 0)), 0) }));
        reportData.landedCost = allItems.filter(i => i.supplier_id).map(i => ({ ...i, vendorName: suppliers.find(s => s.id === i.supplier_id)?.name || '-' }));

        // Initial Render
        updateFinancials(grossSales, totalTax, cogs);
        renderInventoryValuation(allItems);
        renderInventoryHistory(filteredStockIn, filteredAdjustments);
        renderUserStats(reportData.users);
        renderPaymentStats(reportData.payments);
        renderProductStats(reportData.products);
        renderProductAffinity(reportData.affinity);
        renderAuditLog(reportData.audit);
        renderCashVariance(reportData.variance);
        renderCustomerInsights(reportData.vip, reportData.ledger);
        renderSupplierInsights(reportData.vendorPerf, reportData.purchaseHistory, reportData.landedCost);
        renderReturnsReport(reportData.returnReasons, reportData.defectiveSuppliers, reportData.returns);
        
        document.getElementById("report-total-points").textContent = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0).toLocaleString();

    } catch (error) {
        console.error("Error generating report:", error);
        usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading report data.</td></tr>`;
    }
}

async function calculateSlowMoving(days, itemsCache = null) {
    const thresholdDate = moment().subtract(days, 'days').startOf('day').toDate();
    const allItems = itemsCache || await db.items.toArray();
    
    // Get transactions in the inactivity period
    const recentTxs = await db.transactions
        .where('timestamp')
        .aboveOrEqual(thresholdDate)
        .toArray();
        
    const soldItemIds = new Set();
    recentTxs.forEach(tx => {
        if (!tx.is_voided && tx.items) {
            tx.items.forEach(i => soldItemIds.add(i.id));
        }
    });
    
    reportData.slowMoving = allItems
        .filter(item => !soldItemIds.has(item.id))
        .map(item => ({
            ...item,
            value: Math.max(0, item.stock_level || 0) * (item.cost_price || 0)
        }));
        
    renderSlowMovingItems(reportData.slowMoving);
}

function handleSort(tableId, key) {
    const current = sortState[tableId] || { key: null, dir: 'asc' };
    const dir = (current.key === key && current.dir === 'asc') ? 'desc' : 'asc';
    sortState[tableId] = { key, dir };
    
    // Re-render specific table
    renderTable(tableId);
}

function handleFilter(tableId, term) {
    filterState[tableId] = term.toLowerCase();
    renderTable(tableId);
}

function applySortAndFilter(data, tableId) {
    if (!data) return [];
    let result = [...data];
    
    // Filter
    const term = filterState[tableId];
    if (term) {
        result = result.filter(item => JSON.stringify(item).toLowerCase().includes(term));
    }
    
    // Sort
    const sort = sortState[tableId];
    if (sort && sort.key) {
        result.sort((a, b) => {
            const valA = a[sort.key];
            const valB = b[sort.key];
            if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    return result;
}

function renderTable(tableId) {
    switch(tableId) {
        case 'users': renderUserStats(reportData.users); break;
        case 'products': renderProductStats(reportData.products); break;
        case 'affinity': renderProductAffinity(reportData.affinity); break;
        case 'slowMoving': renderSlowMovingItems(reportData.slowMoving); break;
        case 'payments': renderPaymentStats(reportData.payments); break;
        case 'audit': renderAuditLog(reportData.audit); break;
        case 'variance': renderCashVariance(reportData.variance); break;
        case 'stockIn':
        case 'adjustments':
            renderInventoryHistory(reportData.stockIn, reportData.adjustments);
            break;
        case 'vip': 
        case 'ledger': 
            renderCustomerInsights(reportData.vip, reportData.ledger); 
            break;
        case 'vendorPerf':
        case 'purchaseHistory':
        case 'landedCost':
            renderSupplierInsights(reportData.vendorPerf, reportData.purchaseHistory, reportData.landedCost);
            break;
    }
}

function updateFinancials(sales, tax, cost) {
    document.getElementById("report-gross-sales").textContent = `₱${sales.toFixed(2)}`;
    document.getElementById("report-tax").textContent = `₱${tax.toFixed(2)}`;
    document.getElementById("report-cogs").textContent = `₱${cost.toFixed(2)}`;
    document.getElementById("report-profit").textContent = `₱${(sales - tax - cost).toFixed(2)}`;
}

function renderUserStats(data) {
    const tbody = document.getElementById("report-users-body");
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'users');

    processed.forEach(d => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${d.user}</td>
            <td class="py-3 px-6 text-center">${d.count}</td>
            <td class="py-3 px-6 text-right font-bold">₱${d.total.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderReturnsReport(reasons, defectiveSuppliers, log) {
    const reasonContainer = document.getElementById("report-return-reasons");
    const supplierBody = document.getElementById("report-defective-supplier-body");
    const logBody = document.getElementById("report-returns-log-body");

    if (!reasonContainer || !supplierBody || !logBody) return;

    // Reasons
    if (reasons.length === 0) {
        reasonContainer.innerHTML = `<div class="text-center text-gray-400 py-4">No data</div>`;
    } else {
        reasonContainer.innerHTML = reasons.map(r => `
            <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span>${r.reason}</span>
                <span class="font-bold">${r.count}</span>
            </div>
        `).join('');
    }

    // Defective Suppliers
    if (defectiveSuppliers.length === 0) {
        supplierBody.innerHTML = `<tr><td colspan="2" class="py-4 text-center text-gray-400">No data</td></tr>`;
    } else {
        supplierBody.innerHTML = defectiveSuppliers.map(s => `
            <tr class="border-b last:border-0">
                <td class="py-2">${s.name}</td>
                <td class="py-2 text-right font-bold">${s.count}</td>
            </tr>
        `).join('');
    }

    // Log
    if (log.length === 0) {
        logBody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No returns found.</td></tr>`;
    } else {
        logBody.innerHTML = log.map(r => `
            <tr class="border-b border-gray-200 hover:bg-gray-100">
                <td class="py-3 px-6 text-left text-xs">${new Date(r.timestamp).toLocaleString()}</td>
                <td class="py-3 px-6 text-left font-medium">${r.item_name}</td>
                <td class="py-3 px-6 text-left">${r.reason}</td>
                <td class="py-3 px-6 text-right">${r.qty}</td>
                <td class="py-3 px-6 text-right font-bold text-red-600">₱${r.refund_amount.toFixed(2)}</td>
            </tr>
        `).join('');
    }
}

function showStockInDetails(id) {
    const entry = reportData.stockIn.find(e => e.id == id);
    if (!entry) return;

    let modal = document.getElementById('report-stockin-details-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-stockin-details-modal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50';
        document.body.appendChild(modal);
    }

    const itemRows = entry.items.map(item => {
        const qty = item.quantity || item.qty || 0;
        const cost = item.cost_price || 0;
        return `
        <tr class="border-b">
            <td class="p-2">${item.name}</td>
            <td class="p-2 text-center">${qty}</td>
            <td class="p-2 text-right">₱${cost.toFixed(2)}</td>
            <td class="p-2 text-right">₱${(qty * cost).toFixed(2)}</td>
        </tr>
    `}).join('');

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl mx-4">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">Stock In Details</h3>
                <button class="text-gray-500 hover:text-gray-700 text-2xl close-modal">&times;</button>
            </div>
            <div class="mb-4 text-sm text-gray-600 grid grid-cols-2 gap-2">
                <div><strong>Date:</strong> ${new Date(entry.timestamp).toLocaleString()}</div>
                <div><strong>User:</strong> ${entry.username || 'N/A'}</div>
            </div>
            <div class="max-h-96 overflow-y-auto border rounded">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50">
                        <tr class="border-b">
                            <th class="text-left p-2 font-semibold">Item</th>
                            <th class="text-center p-2 font-semibold">Qty</th>
                            <th class="text-right p-2 font-semibold">Cost</th>
                            <th class="text-right p-2 font-semibold">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>
            <div class="mt-6 flex justify-end">
                <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow close-modal">Close</button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.add('hidden'));
    });
}

async function showShiftTransactions(shiftId) {
    const shift = reportData.variance.find(s => s.id === shiftId);
    if (!shift) return;

    let modal = document.getElementById('report-shift-tx-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-shift-tx-modal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl mx-4 flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">Transactions for Shift</h3>
                <button class="text-gray-500 hover:text-gray-700 text-2xl close-modal">&times;</button>
            </div>
            <div class="mb-4 text-sm text-gray-600 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-3 rounded">
                <div><strong>User:</strong> ${shift.user_id}</div>
                <div><strong>Status:</strong> <span class="uppercase font-bold">${shift.status}</span></div>
                <div><strong>Start:</strong> ${new Date(shift.start_time).toLocaleString()}</div>
                <div><strong>End:</strong> ${shift.end_time ? new Date(shift.end_time).toLocaleString() : '-'}</div>
            </div>
            <div class="overflow-y-auto border rounded flex-1">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-100 sticky top-0">
                        <tr class="border-b">
                            <th class="text-left p-2">Time</th>
                            <th class="text-left p-2">Customer</th>
                            <th class="text-left p-2">Items</th>
                            <th class="text-right p-2">Total</th>
                            <th class="text-center p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody id="shift-tx-body">
                        <tr><td colspan="5" class="p-4 text-center">Loading transactions...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="mt-6 flex justify-end">
                <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow close-modal">Close</button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.add('hidden'));
    });

    try {
        const startTime = new Date(shift.start_time);
        const endTime = shift.end_time ? new Date(shift.end_time) : new Date();
        
        const txs = await db.transactions
            .where('timestamp')
            .between(startTime, endTime, true, true)
            .filter(t => t.user_email === shift.user_id)
            .toArray();

        const tbody = document.getElementById('shift-tx-body');
        if (txs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">No transactions found for this shift.</td></tr>`;
            return;
        }

        tbody.innerHTML = txs.map(t => `
            <tr class="border-b hover:bg-gray-50 ${t.is_voided ? 'bg-red-50 opacity-60' : ''}">
                <td class="p-2 text-xs">${new Date(t.timestamp).toLocaleTimeString()}</td>
                <td class="p-2">${t.customer_name || 'Guest'}</td>
                <td class="p-2 text-xs max-w-xs truncate" title="${t.items.map(i => i.name).join(', ')}">
                    ${t.items.length} items: ${t.items.map(i => i.name).join(', ')}
                </td>
                <td class="p-2 text-right font-bold">₱${t.total_amount.toFixed(2)}</td>
                <td class="p-2 text-center">
                    ${t.is_voided ? '<span class="text-red-600 font-bold text-[10px] uppercase">Voided</span>' : '<span class="text-green-600 font-bold text-[10px] uppercase">Success</span>'}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
        document.getElementById('shift-tx-body').innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

function renderCustomerInsights(vip, ledger) {
    const vipBody = document.getElementById("report-vip-body");
    const ledgerBody = document.getElementById("report-ledger-body");

    const processedVip = applySortAndFilter(vip, 'vip');
    const processedLedger = applySortAndFilter(ledger, 'ledger');

    // VIP Report
    vipBody.innerHTML = processedVip.map(c => `
        <tr class="border-b last:border-0">
            <td class="py-2">${c.name}</td>
            <td class="py-2 text-right font-bold">₱${c.totalSpent.toFixed(2)}</td>
        </tr>
    `).join('');

    // Ledger Report
    ledgerBody.innerHTML = processedLedger.map(c => `
        <tr class="border-b border-gray-200 hover:bg-gray-100">
            <td class="py-3 px-6 text-left font-medium">${c.name}</td>
            <td class="py-3 px-6 text-right">₱${c.totalSpent.toFixed(2)}</td>
            <td class="py-3 px-6 text-right font-bold text-blue-600">${c.points}</td>
            <td class="py-3 px-6 text-right text-xs text-gray-500">${c.lastVisit || '-'}</td>
        </tr>
    `).join('');
}

function renderSupplierInsights(vendorPerf, purchaseHistory, landedCost) {
    const perfBody = document.getElementById("report-vendor-perf-body");
    const historyBody = document.getElementById("report-purchase-history-body");
    const landedBody = document.getElementById("report-landed-cost-body");

    const processedPerf = applySortAndFilter(vendorPerf, 'vendorPerf');
    const processedHistory = applySortAndFilter(purchaseHistory, 'purchaseHistory');
    const processedLanded = applySortAndFilter(landedCost, 'landedCost');

    // Render Performance
    perfBody.innerHTML = processedPerf.map(v => `
        <tr class="border-b border-gray-200 hover:bg-gray-100">
            <td class="py-3 px-6 text-left font-medium">${v.name}</td>
            <td class="py-3 px-6 text-right">${v.bought}</td>
            <td class="py-3 px-6 text-right">${v.sold}</td>
            <td class="py-3 px-6 text-right font-bold text-indigo-600">${v.pct.toFixed(1)}%</td>
        </tr>
    `).join('');

    // Render Purchase History
    historyBody.innerHTML = processedHistory.map(h => `
        <tr class="border-b border-gray-200 hover:bg-gray-100">
            <td class="py-3 px-6 text-left text-xs">${new Date(h.timestamp).toLocaleDateString()}</td>
            <td class="py-3 px-6 text-left">${h.vendorName}</td>
            <td class="py-3 px-6 text-right font-bold">₱${h.total.toFixed(2)}</td>
        </tr>
    `).join('');

    // Render Landed Cost (Last known cost per item)
    landedBody.innerHTML = processedLanded.map(i => `
        <tr class="border-b border-gray-200 hover:bg-gray-100">
            <td class="py-3 px-6 text-left font-medium">${i.name}</td>
            <td class="py-3 px-6 text-left text-xs">${i.vendorName}</td>
            <td class="py-3 px-6 text-right font-bold">₱${(i.cost_price || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right text-green-600">₱${(i.selling_price || 0).toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderInventoryHistory(stockIn, adjustments) {
    const stockInBody = document.getElementById("report-stockin-body");
    const adjBody = document.getElementById("report-adjustments-body");

    if (!stockInBody || !adjBody) return;

    const processedStockIn = applySortAndFilter(stockIn, 'stockIn');
    const processedAdj = applySortAndFilter(adjustments, 'adjustments');

    // Render Stock-In
    stockInBody.innerHTML = processedStockIn.length ? "" : "<tr><td colspan='3' class='p-4 text-center'>No stock-in records.</td></tr>";
    processedStockIn.forEach(s => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100 cursor-pointer";
        row.dataset.id = s.id;
        row.innerHTML = `
            <td class="py-2 px-4">${new Date(s.timestamp).toLocaleDateString()}</td>
            <td class="py-2 px-4">${s.username || 'N/A'}</td>
            <td class="py-2 px-4 text-right">${s.items ? s.items.reduce((sum, i) => sum + (i.quantity || 0), 0) : 0}</td>
        `;
        stockInBody.appendChild(row);
    });

    // Render Adjustments
    adjBody.innerHTML = processedAdj.length ? "" : "<tr><td colspan='5' class='p-4 text-center'>No adjustments found.</td></tr>";
    processedAdj.forEach(a => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        const diffClass = a.difference > 0 ? "text-green-600" : (a.difference < 0 ? "text-red-600" : "");
        row.innerHTML = `
            <td class="py-2 px-4">${new Date(a.timestamp).toLocaleString()}</td>
            <td class="py-2 px-4 font-medium">${a.item_name}</td>
            <td class="py-2 px-4">${a.reason}</td>
            <td class="py-2 px-4 text-right font-bold ${diffClass}">${a.difference > 0 ? '+' : ''}${a.difference}</td>
            <td class="py-2 px-4">${a.user}</td>
        `;
        adjBody.appendChild(row);
    });
}

function renderCashVariance(shifts) {
    const tbody = document.getElementById("report-variance-body");
    tbody.innerHTML = "";
    const processed = applySortAndFilter(shifts, 'variance');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-3 px-6 text-center">No closed shifts found for this period.</td></tr>`;
        return;
    }

    processed.forEach(s => {
        const isClosed = s.status === 'closed';
        const variance = isClosed ? (s.closing_cash || 0) - (s.expected_cash || 0) : 0;
        const diffClass = !isClosed ? "text-gray-400" : (variance < 0 ? "text-red-600 font-bold" : (variance > 0 ? "text-green-600 font-bold" : "text-gray-500"));
        const statusClass = s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
        
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left">${new Date(s.start_time).toLocaleDateString()}</td>
            <td class="py-3 px-6 text-left">${s.user_id}</td>
            <td class="py-3 px-6 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusClass}">${s.status}</span></td>
            <td class="py-3 px-6 text-right">₱${(s.opening_cash || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right">₱${(s.expected_cash || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right">${isClosed ? `₱${(s.closing_cash || 0).toFixed(2)}` : '-'}</td>
            <td class="py-3 px-6 text-right ${diffClass}">${isClosed ? `₱${variance.toFixed(2)}` : '-'}</td>
            <td class="py-3 px-6 text-center">
                <button class="text-blue-600 hover:text-blue-800 font-bold btn-view-shift-tx" data-id="${s.id}">View</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderInventoryValuation(items) {
    let totalCost = 0;
    let totalRetail = 0;
    items.forEach(i => {
        const qty = Math.max(0, i.stock_level || 0);
        totalCost += (i.cost_price || 0) * qty;
        totalRetail += (i.selling_price || 0) * qty;
    });
    document.getElementById("val-cost").textContent = `₱${totalCost.toFixed(2)}`;
    document.getElementById("val-retail").textContent = `₱${totalRetail.toFixed(2)}`;
    document.getElementById("val-profit").textContent = `₱${(totalRetail - totalCost).toFixed(2)}`;
}

function renderPaymentStats(data) {
    const container = document.getElementById("report-payments-list");
    container.innerHTML = "";
    const processed = applySortAndFilter(data, 'payments');

    processed.forEach(d => {
        const div = document.createElement("div");
        div.className = "flex justify-between items-center p-2 bg-gray-50 rounded";
        div.innerHTML = `<span>${d.method}</span><span class="font-bold">₱${d.total.toFixed(2)}</span>`;
        container.appendChild(div);
    });
}

function renderProductStats(data) {
    const tbody = document.getElementById("report-products-body");
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'products');

    // Calculate averages for Matrix categorization
    const avgRev = processed.reduce((sum, p) => sum + p.revenue, 0) / (processed.length || 1);
    const avgMargin = processed.reduce((sum, p) => sum + p.marginPct, 0) / (processed.length || 1);

    const matrix = { winners: [], cows: [], sleepers: [], dogs: [] };
    
    processed.forEach(prod => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${prod.name}</td>
            <td class="py-3 px-6 text-center font-mono">${prod.qty}</td>
            <td class="py-3 px-6 text-center">${prod.str.toFixed(1)}%</td>
            <td class="py-3 px-6 text-right font-bold">₱${prod.revenue.toFixed(2)}</td>
            <td class="py-3 px-6 text-right ${prod.marginPct > 30 ? 'text-green-600' : 'text-orange-600'} font-medium">${prod.marginPct.toFixed(1)}%</td>
            <td class="py-3 px-6 text-right font-bold ${prod.gmroi > 1.5 ? 'text-indigo-600' : ''}">${prod.gmroi.toFixed(2)}</td>
            <td class="py-3 px-6 text-right text-xs text-gray-500">${prod.penetration.toFixed(1)}%</td>
        `;
        tbody.appendChild(row);

        // Categorize for Matrix
        if (prod.revenue >= avgRev && prod.marginPct >= avgMargin) matrix.winners.push(prod.name);
        else if (prod.revenue >= avgRev && prod.marginPct < avgMargin) matrix.cows.push(prod.name);
        else if (prod.revenue < avgRev && prod.marginPct >= avgMargin) matrix.sleepers.push(prod.name);
        else matrix.dogs.push(prod.name);
    });

    renderRetailerMatrix(matrix);
}

function renderRetailerMatrix(matrix) {
    const renderList = (id, items) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (items.length === 0) {
            el.innerHTML = `<div class="italic text-gray-400">No products in this category</div>`;
            return;
        }
        // Show top 8 items per quadrant
        el.innerHTML = items.slice(0, 8).map(name => `
            <div class="flex items-center gap-2">
                <span class="w-1 h-1 rounded-full bg-current"></span>
                <span class="truncate">${name}</span>
            </div>
        `).join('') + (items.length > 8 ? `<div class="pl-3 font-bold">... +${items.length - 8} more</div>` : '');
    };

    renderList('matrix-winners', matrix.winners);
    renderList('matrix-cows', matrix.cows);
    renderList('matrix-sleepers', matrix.sleepers);
    renderList('matrix-dogs', matrix.dogs);
}

function renderProductAffinity(data) {
    const tbody = document.getElementById("report-affinity-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'affinity');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No product pairs found in this period.</td></tr>`;
        return;
    }

    processed.forEach(pair => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${pair.itemAName}</td>
            <td class="py-3 px-6 text-left font-medium">${pair.itemBName}</td>
            <td class="py-3 px-6 text-center font-bold text-blue-600">${pair.count}</td>
            <td class="py-3 px-6 text-right">${pair.attachRateA.toFixed(1)}%</td>
            <td class="py-3 px-6 text-right">${pair.attachRateB.toFixed(1)}%</td>
        `;
        tbody.appendChild(row);
    });
}

function renderSlowMovingItems(data) {
    const tbody = document.getElementById("report-slow-moving-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'slowMoving');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No slow moving items found for this period.</td></tr>`;
        return;
    }

    processed.forEach(item => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${item.name}</td>
            <td class="py-3 px-6 text-left font-mono text-xs">${item.barcode || '-'}</td>
            <td class="py-3 px-6 text-right font-bold">${item.stock_level}</td>
            <td class="py-3 px-6 text-right">₱${(item.cost_price || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right font-bold text-red-600">₱${(item.value || 0).toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderAuditLog(data) {
    const tbody = document.getElementById("report-audit-body");
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'audit');

    processed.forEach(v => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 bg-red-50";
        row.innerHTML = `
            <td class="py-3 px-6 text-left">${new Date(v.voided_at).toLocaleString()}</td>
            <td class="py-3 px-6 text-left">${new Date(v.timestamp).toLocaleString()}</td>
            <td class="py-3 px-6 text-right font-bold">₱${v.total_amount.toFixed(2)}</td>
            <td class="py-3 px-6 text-left">${v.voided_by || 'Unknown'}</td>
        `;
        tbody.appendChild(row);
    });
}