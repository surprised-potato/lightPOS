import { dbPromise } from "../db.js";
import { getSystemSettings } from "./settings.js";
import { checkPermission, requestManagerApproval } from "../auth.js";
import { generateUUID } from "../utils.js";
import { addNotification } from "../services/notification-service.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";

let reportData = {};
let valuationChartInstance = null;
let velocityTrendChartInstance = null;
let cashflowChartInstance = null;
let sortState = {}; // { tableId: { key, dir } }
let filterState = {}; // { tableId: term }
let renderedTabs = new Set();

export async function loadReportsView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="max-w-6xl mx-auto relative">
            <!-- Loading Spinner -->
            <div id="report-loading" class="hidden absolute inset-0 bg-white bg-opacity-90 z-50 flex flex-col items-center justify-center rounded-lg">
                <div class="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
                <p class="text-blue-600 font-bold text-lg animate-pulse">Generating Report...</p>
            </div>

            <h2 class="text-2xl font-bold text-gray-800 mb-6">Advanced Reports</h2>
            
            <!-- Controls -->
            <div class="bg-white p-4 rounded-lg shadow-md mb-6 flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[300px]">
                    <label class="block text-sm font-bold text-gray-700 mb-1">Date Range</label>
                    <div class="relative">
                        <input type="text" id="report-range" class="w-full border rounded p-2 text-sm bg-white cursor-pointer" placeholder="Select date range...">
                    </div>
                </div>
                <div class="w-24">
                    <label class="block text-sm font-bold text-gray-700 mb-1">Rows</label>
                    <input type="number" id="report-row-limit" value="50" min="1" class="w-full border rounded p-2 text-sm bg-white" title="Rows per table">
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
                    <button data-tab="products" class="tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Products</button>
                    <button data-tab="inventory" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Inventory</button>
                    <button data-tab="financials" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Financials</button>
                    <button data-tab="insights" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Insights</button>
                    <button data-tab="system" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">System</button>
                </nav>
            </div>

            <!-- Tab Panels -->
            <div id="report-panels">
                <!-- Financials Panel -->
                <div id="tab-financials" class="tab-panel hidden">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="fin-summary" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Summary & Payments</button>
                        <button data-subtab="fin-variance" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Shifts</button>
                        <button data-subtab="fin-shift-reports" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Closing Reports</button>
                        <button data-subtab="fin-cashflow" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Cashflow</button>
                    </div>

                    <div id="subpanel-fin-summary" class="sub-panel">
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500 relative group">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Gross Sales</div>
                                <div class="text-3xl font-bold text-gray-800" id="report-gross-sales">₱0.00</div>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-orange-500 relative group">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">VAT Owed (Net)</div>
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
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="cashout" data-table="variance">Cashout</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="expected_cash" data-table="variance">Expected</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="closing_cash" data-table="variance">Actual</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="variance" data-table="variance">Variance</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="totalSales" data-table="variance">Sales</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="totalCogs" data-table="variance">COGS</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="grossProfit" data-table="variance">Profit</th>
                                        <th class="py-3 px-6 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="report-variance-body" class="text-gray-600 text-sm font-light">
                                    <tr><td colspan="11" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div id="subpanel-fin-shift-reports" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Shift Closing Reports</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="shiftReports">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-shiftReports" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter reports..." class="filter-input w-full p-1 border rounded text-sm" data-table="shiftReports"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="end_time" data-table="shiftReports">Closed At</th>
                                        <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="user_id" data-table="shiftReports">User</th>
                                        <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="total_closing_amount" data-table="shiftReports">Total Turnover</th>
                                        <th class="py-3 px-6 text-right">Variance</th>
                                    </tr>
                                </thead>
                                <tbody id="report-shift-reports-body" class="text-gray-600 text-sm font-light"></tbody>
                            </table>
                        </div>
                    </div>

                    <div id="subpanel-fin-cashflow" class="sub-panel hidden">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Total Inflow (Sales)</div>
                                <div class="text-3xl font-bold text-gray-800" id="cashflow-inflow">₱0.00</div>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-500">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Total Outflow (Expenses)</div>
                                <div class="text-3xl font-bold text-gray-800" id="cashflow-outflow">₱0.00</div>
                            </div>
                            <div class="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
                                <div class="text-gray-500 text-sm font-bold uppercase mb-1">Net Cashflow</div>
                                <div class="text-3xl font-bold text-gray-800" id="cashflow-net">₱0.00</div>
                            </div>
                        </div>
                        <div class="bg-white shadow-md rounded p-6 mb-8">
                            <h3 class="font-bold text-gray-800 mb-4">Daily Cashflow Trend</h3>
                            <div class="h-80">
                                <canvas id="cashflow-trend-chart"></canvas>
                            </div>
                        </div>
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50">
                                <h3 class="font-bold text-gray-800">Expense Breakdown</h3>
                            </div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                        <th class="py-3 px-6 text-left">Date</th>
                                        <th class="py-3 px-6 text-left">Category</th>
                                        <th class="py-3 px-6 text-left">Description</th>
                                        <th class="py-3 px-6 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody id="report-cashflow-body" class="text-gray-600 text-sm font-light"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Inventory Panel -->
                <div id="tab-inventory" class="tab-panel hidden">
                    <!-- Sub Tabs -->
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="inv-val" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Valuation</button>
                        <button data-subtab="inv-ledger" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Inventory Ledger</button>
                        <button data-subtab="inv-history" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Stock-In History</button>
                        <button data-subtab="inv-audit" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Adjustments</button>
                        <button data-subtab="inv-movement" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Movement Log</button>
                        <button data-subtab="inv-shrinkage" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Shrinkage</button>
                        <button data-subtab="inv-slow" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Slow Moving</button>
                        <button data-subtab="inv-returns" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Returns</button>
                        <button data-subtab="inv-conversions" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Conversions</button>
                    </div>

                    <div id="subpanel-inv-val" class="sub-panel">
                        <div class="bg-white shadow-md rounded p-6 max-w-lg mb-6">
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Inventory Valuation (End of Period)</h3>
                            <div class="flex justify-between mb-2">
                                <span class="text-gray-600">Total Value (Cost):</span>
                                <span id="val-cost" class="font-bold text-lg">₱0.00</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span class="text-gray-600">Total Value (Retail):</span>
                                <span id="val-retail" class="font-bold text-lg">₱0.00</span>
                            </div>
                            <div class="flex justify-between border-t pt-2 mt-2">
                                <span class="text-gray-600">Potential Profit:</span>
                                <span id="val-profit" class="font-bold text-lg text-green-600">₱0.00</span>
                            </div>
                        </div>

                        <div class="bg-white shadow-md rounded p-6 mb-6">
                            <h3 class="font-bold text-gray-800 mb-4">Historical Valuation (at Cost)</h3>
                            <canvas id="valuation-chart"></canvas>
                        </div>

                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50">
                                <h3 class="font-bold text-gray-800">Daily Valuation Snapshots</h3>
                            </div>
                            <div class="overflow-x-auto max-h-96">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                            <th class="py-3 px-6 text-left">Date</th>
                                            <th class="py-3 px-6 text-right">Total Value (Cost)</th>
                                            <th class="py-3 px-6 text-right">Total Value (Retail)</th>
                                            <th class="py-3 px-6 text-right">Daily Change (Cost)</th>
                                        </tr>
                                    </thead>
                                    <tbody id="valuation-history-body" class="text-gray-600 text-sm font-light"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div id="subpanel-inv-ledger" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded p-6 mb-6">
                            <div class="flex flex-wrap gap-4 items-end">
                                <div>
                                    <label class="block text-sm font-bold text-gray-700 mb-1">Snapshot Date</label>
                                    <input type="date" id="ledger-date" class="border rounded p-2 text-sm bg-white focus:outline-none focus:border-blue-500">
                                </div>
                                <button id="btn-generate-ledger" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition">
                                    Generate Ledger
                                </button>
                            </div>
                        </div>
                        
                        <div id="ledger-summary" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 hidden">
                            <div class="bg-white p-4 rounded shadow border-l-4 border-blue-500">
                                <div class="text-gray-500 text-xs font-bold uppercase">Historical Stock Qty</div>
                                <div class="text-2xl font-bold text-gray-800" id="ledger-total-qty">0</div>
                            </div>
                            <div class="bg-white p-4 rounded shadow border-l-4 border-green-500">
                                <div class="text-gray-500 text-xs font-bold uppercase">Historical Asset Value</div>
                                <div class="text-2xl font-bold text-gray-800" id="ledger-total-value">₱0.00</div>
                            </div>
                        </div>

                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Historical Inventory Ledger</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="invLedger">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-invLedger" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter ledger..." class="filter-input w-full p-1 border rounded text-sm" data-table="invLedger"></div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="invLedger">Item</th>
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="barcode" data-table="invLedger">Barcode</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="cost" data-table="invLedger">Unit Cost (Curr)</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="qty" data-table="invLedger">Hist. Qty</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="value" data-table="invLedger">Hist. Value</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-inv-ledger-body" class="text-gray-600 text-sm font-light">
                                        <tr><td colspan="5" class="py-3 px-6 text-center">Select a date to view snapshot.</td></tr>
                                    </tbody>
                                </table>
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

                    <div id="subpanel-inv-movement" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Stock Movement Log</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="movements">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-movements" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter movements..." class="filter-input w-full p-1 border rounded text-sm" data-table="movements"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="timestamp" data-table="movements">Date</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="item_name" data-table="movements">Item</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="type" data-table="movements">Type</th>
                                        <th class="py-2 px-4 text-right cursor-pointer hover:bg-gray-200" data-sort="qty" data-table="movements">Qty</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="reason" data-table="movements">Reason</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="user" data-table="movements">User</th>
                                    </tr>
                                </thead>
                                <tbody id="report-movements-body" class="text-gray-600 text-xs font-light"></tbody>
                            </table>
                        </div>
                    </div>

                    <div id="subpanel-inv-shrinkage" class="sub-panel hidden">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div class="bg-white shadow-md rounded p-6">
                                <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Shrinkage by Category</h3>
                                <div id="report-shrinkage-summary" class="space-y-2">
                                    <div class="text-center text-gray-400 py-4">No data</div>
                                </div>
                            </div>
                            <div class="bg-white shadow-md rounded p-6">
                                <h3 class="font-bold text-gray-800 mb-4 border-b pb-2">Top Shrinkage Items</h3>
                                <table class="min-w-full text-sm">
                                    <thead>
                                        <tr class="text-left text-gray-500 border-b">
                                            <th class="pb-2">Item</th>
                                            <th class="pb-2 text-right">Loss Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-shrinkage-items-body"></tbody>
                                </table>
                            </div>
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

                    <div id="subpanel-inv-returns" class="sub-panel hidden">
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
                                            <th class="py-3 px-6 text-left">Condition</th>
                                            <th class="py-3 px-6 text-right">Qty</th>
                                            <th class="py-3 px-6 text-right">Refund</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-returns-log-body" class="text-gray-600 text-sm font-light">
                                        <tr><td colspan="6" class="py-3 px-6 text-center">No returns found.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div id="subpanel-inv-conversions" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Stock Conversions (Auto-Breakdown)</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="conversions">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-conversions" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter conversions..." class="filter-input w-full p-1 border rounded text-sm" data-table="conversions"></div>
                            <table class="min-w-full table-auto">
                                <thead>
                                    <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="timestamp" data-table="conversions">Date</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="item_name" data-table="conversions">Item</th>
                                        <th class="py-2 px-4 text-right cursor-pointer hover:bg-gray-200" data-sort="qty" data-table="conversions">Qty Change</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="reason" data-table="conversions">Details</th>
                                        <th class="py-2 px-4 text-left cursor-pointer hover:bg-gray-200" data-sort="user" data-table="conversions">User</th>
                                    </tr>
                                </thead>
                                <tbody id="report-conversions-body" class="text-gray-600 text-xs font-light"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Insights Panel -->
                <div id="tab-insights" class="tab-panel hidden">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="ins-customers" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Customer Insights</button>
                        <button data-subtab="ins-suppliers" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Supplier Insights</button>
                        <button data-subtab="ins-velocity-trend" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Sales Velocity Trend</button>
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
                            <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="custLedger">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                            </button>
                        </div>
                        <div id="filter-custLedger" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter ledger..." class="filter-input w-full p-1 border rounded text-sm" data-table="custLedger"></div>
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="custLedger">Customer</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="totalSpent" data-table="custLedger">Total Sales</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="points" data-table="custLedger">Points Balance</th>
                                    <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="lastVisit" data-table="custLedger">Last Visit</th>
                                </tr>
                            </thead>
                            <tbody id="report-cust-ledger-body" class="text-gray-600 text-sm font-light"></tbody>
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

                    <div id="subpanel-ins-velocity-trend" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded p-6">
                            <h3 class="font-bold text-gray-800 mb-4">Average Hourly Sales Velocity</h3>
                            <p class="text-xs text-gray-500 mb-6">This chart shows the average revenue generated per hour across the selected date range.</p>
                            <div class="h-80">
                                <canvas id="velocity-trend-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Products Panel -->
                <div id="tab-products" class="tab-panel">
                    <div class="flex gap-4 mb-6 border-b border-gray-100">
                        <button data-subtab="prod-perf" class="subtab-btn border-blue-500 text-blue-600 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Performance</button>
                        <button data-subtab="prod-risk" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Risk Metrics</button>
                        <button data-subtab="prod-affinity" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Product Affinity</button>
                        <button data-subtab="prod-lowstock" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Low Stock</button>
                        <button data-subtab="prod-velocity" class="subtab-btn border-transparent text-gray-500 hover:text-gray-700 py-2 px-4 border-b-2 text-xs font-bold transition-colors">Sales Velocity</button>
                    </div>

                    <div id="subpanel-prod-perf" class="sub-panel">
                        <!-- Retailer's Matrix -->
                        <div class="bg-white shadow-md rounded p-6 mb-6">
                            <h3 class="font-bold text-gray-800 mb-6 border-b pb-2">Retailer's Matrix (Product Quadrants)</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="p-4 border-2 border-green-200 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition btn-matrix-quadrant" data-quadrant="winners">
                                    <div class="flex justify-between items-center mb-2 pointer-events-none">
                                        <span class="font-bold text-green-800 uppercase text-sm">Winners</span>
                                        <span class="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded">High Sales, High Margin</span>
                                    </div>
                                    <div id="matrix-winners" class="text-xs space-y-1 text-green-700 pointer-events-none"></div>
                                </div>
                                <div class="p-4 border-2 border-blue-200 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition btn-matrix-quadrant" data-quadrant="cows">
                                    <div class="flex justify-between items-center mb-2 pointer-events-none">
                                        <span class="font-bold text-blue-800 uppercase text-sm">Cash Cows</span>
                                        <span class="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded">High Sales, Low Margin</span>
                                    </div>
                                    <div id="matrix-cows" class="text-xs space-y-1 text-blue-700 pointer-events-none"></div>
                                </div>
                                <div class="p-4 border-2 border-orange-200 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition btn-matrix-quadrant" data-quadrant="sleepers">
                                    <div class="flex justify-between items-center mb-2 pointer-events-none">
                                        <span class="font-bold text-orange-800 uppercase text-sm">Sleepers</span>
                                        <span class="text-[10px] bg-orange-200 text-orange-800 px-2 py-0.5 rounded">Low Sales, High Margin</span>
                                    </div>
                                    <div id="matrix-sleepers" class="text-xs space-y-1 text-orange-700 pointer-events-none"></div>
                                </div>
                                <div class="p-4 border-2 border-red-200 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition btn-matrix-quadrant" data-quadrant="dogs">
                                    <div class="flex justify-between items-center mb-2 pointer-events-none">
                                        <span class="font-bold text-red-800 uppercase text-sm">Dogs</span>
                                        <span class="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded">Low Sales, Low Margin</span>
                                    </div>
                                    <div id="matrix-dogs" class="text-xs space-y-1 text-red-700 pointer-events-none"></div>
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

                    <div id="subpanel-prod-risk" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Product Risk & Quality Metrics</h3>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                            <th class="py-3 px-6 text-left">Product</th>
                                            <th class="py-3 px-6 text-center">Sold</th>
                                            <th class="py-3 px-6 text-center">Returned</th>
                                            <th class="py-3 px-6 text-center text-red-600">Return Rate %</th>
                                            <th class="py-3 px-6 text-center">Shrinkage Qty</th>
                                            <th class="py-3 px-6 text-center text-red-600">Shrinkage %</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-risk-body" class="text-gray-600 text-sm font-light"></tbody>
                                </table>
                            </div>
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

                    <div id="subpanel-prod-lowstock" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Low Stock Report</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="lowStock">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-lowStock" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter items..." class="filter-input w-full p-1 border rounded text-sm" data-table="lowStock"></div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="lowStock">Product</th>
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="barcode" data-table="lowStock">Barcode</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="stock_level" data-table="lowStock">Current Stock</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="min_stock" data-table="lowStock">Min Stock</th>
                                            <th class="py-3 px-6 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-low-stock-body" class="text-gray-600 text-sm font-light">
                                        <tr><td colspan="5" class="py-3 px-6 text-center">Generate report to view data.</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div id="subpanel-prod-velocity" class="sub-panel hidden">
                        <div class="bg-white shadow-md rounded overflow-hidden">
                            <div class="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 class="font-bold text-gray-800">Average Sales Velocity (Units/Day)</h3>
                                <button class="btn-toggle-filter text-blue-500 hover:text-blue-700" data-target="velocity">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                </button>
                            </div>
                            <div id="filter-velocity" class="hidden px-6 py-2 bg-gray-100 border-b"><input type="text" placeholder="Filter items..." class="filter-input w-full p-1 border rounded text-sm" data-table="velocity"></div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full table-auto">
                                    <thead>
                                        <tr class="bg-gray-100 text-gray-600 uppercase text-xs leading-normal">
                                            <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="name" data-table="velocity">Product</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="totalSold" data-table="velocity">Total Sold</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="velocity" data-table="velocity">Avg Velocity</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="stock_level" data-table="velocity">Current Stock</th>
                                            <th class="py-3 px-6 text-right cursor-pointer hover:bg-gray-200" data-sort="daysLeft" data-table="velocity">Est. Days Left</th>
                                        </tr>
                                    </thead>
                                    <tbody id="report-velocity-body" class="text-gray-600 text-sm font-light">
                                        <tr><td colspan="5" class="py-3 px-6 text-center">Select dates and click Generate.</td></tr>
                                    </tbody>
                                </table>
                            </div>
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
                                    <th class="py-3 px-6 text-left cursor-pointer hover:bg-gray-200" data-sort="void_reason" data-table="audit">Reason</th>
                                </tr>
                            </thead>
                            <tbody id="report-audit-body" class="text-gray-600 text-sm font-light">
                                <tr><td colspan="5" class="py-3 px-6 text-center">No voided transactions in this period.</td></tr>
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
            startDate: moment().subtract(29, 'days'),
            endDate: moment(),
            maxDate: moment()
        }, function(start, end) {
            // This callback handles manual date range selection.
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

    // --- Auto-generate report on load for the last 30 days ---
    const quickRangeButtons = content.querySelectorAll(".btn-quick-range");
    quickRangeButtons.forEach(b => {
        b.classList.remove("bg-blue-100", "text-blue-700");
        b.classList.add("bg-gray-100", "text-gray-600");
    });
    const initialButton = content.querySelector('.btn-quick-range[data-range="30days"]');
    if (initialButton) {
        initialButton.classList.remove("bg-gray-100", "text-gray-600");
        initialButton.classList.add("bg-blue-100", "text-blue-700");
    }
    // Trigger the report generation
    setTimeout(() => {
        generateReport();
    }, 100);
    // --- End of auto-generation logic ---

    document.getElementById("btn-generate-ledger")?.addEventListener("click", generateInventoryLedger);

    document.getElementById("btn-generate-report").addEventListener("click", generateReport);

    // Re-render tables when row limit changes
    document.getElementById("report-row-limit")?.addEventListener("change", () => {
        generateReport();
    });

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

            // Lazy Load
            renderTab(target);
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

        const btnMatrix = e.target.closest(".btn-matrix-quadrant");
        if (btnMatrix) {
            showQuadrantDetails(btnMatrix.dataset.quadrant);
        }

        const stockInRow = e.target.closest("#report-stockin-body tr");
        if (stockInRow && stockInRow.dataset.id) {
            showStockInDetails(stockInRow.dataset.id);
        }

        const btnForceClose = e.target.closest(".btn-force-close-shift");
        if (btnForceClose) {
            e.stopPropagation();
            forceCloseShift(btnForceClose.dataset.id);
            return;
        }

        const btnViewShift = e.target.closest(".btn-view-shift-tx");
        if (btnViewShift) {
            showShiftTransactions(btnViewShift.dataset.id);
            return;
        }

        const btnViewShiftReport = e.target.closest(".btn-view-shift-report");
        if (btnViewShiftReport) {
            showShiftReportDetails(btnViewShiftReport.dataset.id);
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
    const db = await dbPromise;
    const usersBody = document.getElementById("report-users-body");
    const loadingOverlay = document.getElementById("report-loading");

    if (typeof $ === 'undefined') return;

    const drp = $('#report-range').data('daterangepicker');
    if (!drp) {
        alert("Please select a date or range.");
        return;
    }

    if (loadingOverlay) loadingOverlay.classList.remove("hidden");

    // Clone and set boundaries to ensure full day coverage
    const startDate = drp.startDate.clone().startOf('day').toDate();
    const endDate = drp.endDate.clone().endOf('day').toDate();
    const daysInRange = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">Loading data from cloud...</td></tr>`;

    const settings = await getSystemSettings();

    const currentUser = JSON.parse(localStorage.getItem('pos_user')) || {};
    const isAdminOrManager = checkPermission('users', 'read') || checkPermission('reports', 'read');

    try {
        // Query Dexie instead of Firestore
        const rawTransactions = await db.transactions
            .where('timestamp')
            .between(startStr, endStr, true, true)
            .and(t => !t._deleted)
            .toArray();
        
        // Also fetch transactions voided in this period but purchased earlier
        const historicalVoids = await db.transactions
            .filter(t => !t._deleted && t.is_voided && t.voided_at && t.voided_at >= startStr && t.voided_at <= endStr)
            .toArray();

        // Fetch ALL transactions with exchanges to ensure we catch exchanges happening in this period
        // even if the original transaction was from a long time ago.
        const allTxsWithExchanges = await db.transactions.filter(t => t.exchanges && t.exchanges.length > 0).toArray();

        const txMap = new Map();
        [...rawTransactions, ...historicalVoids].forEach(t => {
            txMap.set(t.id, t);
        });
        let transactions = Array.from(txMap.values());

        let returns = await db.returns
            .where('timestamp')
            .between(startStr, endStr, true, true)
            .and(r => !r._deleted)
            .toArray();
        
        const localStockIn = await db.table('stockins').filter(i => !i._deleted).toArray();
        const allItems = await db.table('items').filter(i => !i._deleted).toArray();

        // Fetch supporting data from local Dexie - Optimized with date filtering
        const [shifts, customers, suppliers, adjustments, stockMovements, expenses] = await Promise.all([
            db.table('shifts').filter(s => !s._deleted).toArray(),
            db.table('customers').filter(c => !c._deleted).toArray(),
            db.table('suppliers').filter(s => !s._deleted).toArray(),
            db.adjustments.where('timestamp').between(startStr, endStr, true, true).toArray(),
            // For valuation history, we need movements from startDate to now to reverse current stock
            db.stock_movements.where('timestamp').aboveOrEqual(startStr).toArray(),
            db.expenses.where('date').between(startStr, endStr, true, true).toArray()
        ]);

        // Merge Stock-In History (Local Dexie already contains synced server data)
        const historyMap = new Map();
        if (Array.isArray(localStockIn)) localStockIn.forEach(entry => historyMap.set(entry.id, entry));
        
        const stockInHistory = Array.from(historyMap.values());

        const filteredShifts = (Array.isArray(shifts) ? shifts : []).filter(s => {
            const d = s.start_time instanceof Date ? s.start_time.toISOString() : s.start_time;
            const inRange = d >= startStr && d <= endStr;
            
            // If not admin/manager, only show own shifts
            if (!isAdminOrManager) {
                return inRange && s.user_id === currentUser.email;
            }
            return inRange;
        }).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

        const filteredExpenses = (expenses || []).sort((a, b) => new Date(b.date) - new Date(a.date));

        let totalExpenses = 0;
        filteredExpenses.forEach(e => totalExpenses += (e.amount || 0));

        const filteredStockIn = stockInHistory.filter(s => {
            const d = s.timestamp instanceof Date ? s.timestamp.toISOString() : s.timestamp;
            const inRange = d >= startStr && d <= endStr;
            return inRange;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const filteredAdjustments = (adjustments || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Synthesize movements from transactions to ensure the log is complete
        // This ensures the report is accurate even if movements weren't explicitly recorded in pos.js
        const salesMovements = transactions.filter(t => !t.is_voided).flatMap(t => 
            t.items.map(item => ({
                id: `sale-${t.id}-${item.id}`,
                item_id: item.id,
                item_name: item.name,
                timestamp: t.timestamp,
                type: 'Sale',
                qty: -item.qty,
                user: t.user_email,
                transaction_id: t.id,
                reason: "POS Sale"
            }))
        );

        // Synthesize movements from returns
        const returnMovements = returns.filter(r => r.condition === 'Restock').flatMap(r => {
            const moves = [{
                id: `return-${r.id}`,
                item_id: r.item_id,
                item_name: r.item_name,
                timestamp: r.timestamp,
                type: 'Return',
                qty: r.qty,
                user: r.processed_by,
                transaction_id: r.transaction_id,
                reason: `${r.reason} (${r.condition})`
            }];
            return moves;
        });

        // Combine with explicit movements, filtering out synthesized types to avoid duplicates
        const otherMovements = stockMovements.filter(m => {
            const type = m.type;
            return type !== 'Sale' && type !== 'Return' && type !== 'Shrinkage';
        });
        const allMovements = [...otherMovements, ...salesMovements, ...returnMovements];

        const filteredMovements = allMovements.filter(m => {
            const d = m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp;
            return d >= startStr && d <= endStr;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        let grossSales = 0;
        let totalOutputTax = 0;
        let totalInputTax = 0;
        let cogs = 0;
        const userStats = {};
        const productStats = {};
        const pairCounts = {};
        const itemTxCounts = {};
        const paymentStats = {};
        const voidedTxs = [];
        const hourlySales = new Array(24).fill(0);
        const totalTxCount = transactions.filter(t => !t.is_voided).length;

        const taxRate = (settings.tax?.rate || 0) / 100;

        transactions.forEach(data => {
            if (data.is_voided) {
                voidedTxs.push(data);
                return;
            }

            // Financials
            grossSales += data.total_amount || 0;
            
            // Re-calculate tax based on current settings if not stored or for consistency
            const calculatedTax = data.total_amount - (data.total_amount / (1 + taxRate));
            totalOutputTax += calculatedTax;

            const hour = new Date(data.timestamp).getHours();
            hourlySales[hour] += data.total_amount || 0;
            
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
                    const lineCost = cost * qty;
                    cogs += lineCost;
                    
                    totalInputTax += lineCost - (lineCost / (1 + taxRate));
                    
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

        reportData.returns = returns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        reportData.returnReasons = Object.entries(reasonStats).map(([reason, count]) => ({ reason, count }));
        reportData.defectiveSuppliers = Object.entries(defectiveBySupplier).map(([name, count]) => ({ name, count }));

        // Store data in state for sorting/filtering
        reportData.users = Object.entries(userStats).map(([user, d]) => ({ user, ...d }));
        reportData.stockIn = filteredStockIn;
        reportData.adjustments = filteredAdjustments;
        reportData.movements = filteredMovements;
        reportData.conversions = filteredMovements.filter(m => m.type === 'Conversion');
        
        reportData.products = Object.values(productStats).map(p => {
            const itemMaster = allItems.find(i => i.id === p.id);
            const currentStock = itemMaster ? itemMaster.stock_level : 0;
            const costPrice = itemMaster ? itemMaster.cost_price : 0;
            const avgInvCost = Math.max(1, currentStock * costPrice); // Avoid div by zero

            const returnedUnits = returns.filter(r => r.item_id === p.id).reduce((sum, r) => sum + (r.qty || 0), 0);
            const shrinkageQty = Math.abs(filteredAdjustments.filter(a => a.item_id === p.id && a.difference < 0).reduce((sum, a) => sum + a.difference, 0));
            
            return { 
                ...p, 
                margin: p.revenue - p.cost, 
                marginPct: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0,
                str: (p.qty + currentStock) > 0 ? (p.qty / (p.qty + currentStock)) * 100 : 0,
                gmroi: (p.revenue - p.cost) / avgInvCost,
                penetration: totalTxCount > 0 ? (p.txIds.size / totalTxCount * 100) : 0,
                returnedUnits,
                returnRate: p.qty > 0 ? (returnedUnits / p.qty * 100) : 0,
                shrinkageQty,
                shrinkagePct: (p.qty + shrinkageQty) > 0 ? (shrinkageQty / (p.qty + shrinkageQty) * 100) : 0
            };
        });

        reportData.velocity = reportData.products.map(p => {
            const velocity = p.qty / daysInRange;
            const itemMaster = allItems.find(i => i.id === p.id);
            const currentStock = itemMaster ? itemMaster.stock_level : 0;
            return {
                name: p.name,
                totalSold: p.qty,
                velocity: velocity,
                stock_level: currentStock,
                daysLeft: velocity > 0 ? (currentStock / velocity) : Infinity
            };
        });

        reportData.hourlyTrend = hourlySales.map(val => val / daysInRange);

        const shrinkageStats = { Theft: 0, 'Admin Error': 0, 'Vendor Fraud': 0, Other: 0 };
        filteredAdjustments.forEach(a => {
            if (a.difference < 0) shrinkageStats[a.reason || 'Other'] += Math.abs(a.difference);
        });
        reportData.shrinkage = Object.entries(shrinkageStats).map(([reason, qty]) => ({ reason, qty }));

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

        reportData.lowStock = allItems.filter(i => i.stock_level <= (i.min_stock || 10));

        reportData.payments = Object.entries(paymentStats).map(([method, total]) => ({ method, total }));
        reportData.audit = voidedTxs;
        
        reportData.variance = filteredShifts.map(s => {
            const isClosed = s.status === 'closed';
            const shiftTxs = transactions.filter(t => t.user_email === s.user_id && new Date(t.timestamp) >= new Date(s.start_time) && (s.end_time ? new Date(t.timestamp) <= new Date(s.end_time) : true));
            
            let totalSales = 0;
            let cashSales = 0;
            let totalCogs = 0;

            // Calculate Exchange Cash Flow for this shift
            let exchangeCash = 0;
            allTxsWithExchanges.forEach(tx => {
                if (tx.exchanges && Array.isArray(tx.exchanges)) {
                    tx.exchanges.forEach(ex => {
                        // Check if exchange was processed by this user during this shift
                        if (ex.processed_by === s.user_id && new Date(ex.timestamp) >= new Date(s.start_time) && (s.end_time ? new Date(ex.timestamp) <= new Date(s.end_time) : true)) {
                            const returnedTotal = ex.returned.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
                            const takenTotal = ex.taken.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
                            exchangeCash += (takenTotal - returnedTotal);
                        }
                    });
                }
            });

            const shiftReturns = returns.filter(r => r.processed_by === s.user_id && new Date(r.timestamp) >= new Date(s.start_time) && (s.end_time ? new Date(r.timestamp) <= new Date(s.end_time) : true));
            const totalReturns = shiftReturns.reduce((sum, r) => sum + (r.refund_amount || 0), 0);

            shiftTxs.forEach(tx => {
                if (!tx.is_voided) {
                    totalSales += tx.total_amount;
                    if (tx.payment_method === 'Cash') {
                        cashSales += tx.total_amount;
                    }
                    tx.items.forEach(item => {
                        totalCogs += (item.cost_price || 0) * (item.qty - (item.returned_qty || 0));
                    });
                }
            });

            // Recalculate Expected Cash retroactively to fix old records
            // Formula: Opening + Adjustments + Cash Sales + Net Exchange Cash
            const totalAdjustments = (s.adjustments || []).reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
            const expected = (s.opening_cash || 0) + totalAdjustments + cashSales + exchangeCash;

            const cashout = s.cashout || 0;
            const receipts = s.closing_receipts || [];
            const totalExpenses = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
            const turnover = (s.closing_cash || 0) + totalExpenses + cashout;

            return { 
                ...s, 
                expected_cash: expected,
                totalExpenses,
                turnover,
                variance: isClosed ? turnover - expected : null,
                totalSales,
                totalCogs,
                grossProfit: totalSales - totalCogs,
                totalReturns,
                exchangeCash
            };
        });
        
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
            const bought = stockInHistory.reduce((sum, entry) => {
                if (!entry.items || !Array.isArray(entry.items)) return sum;
                return sum + entry.items.filter(i => allItems.find(m => m.id === i.item_id)?.supplier_id === s.id).reduce((s2, i) => s2 + (i.quantity || 0), 0);
            }, 0);
            const sold = transactions.reduce((sum, tx) => {
                if (!tx.items || !Array.isArray(tx.items)) return sum;
                return sum + tx.items.filter(i => allItems.find(m => m.id === i.id)?.supplier_id === s.id).reduce((s2, i) => s2 + (i.qty || 0), 0);
            }, 0);
            return { name: s.name, bought, sold, pct: bought > 0 ? (sold / bought * 100) : 0 };
        });
        reportData.purchaseHistory = stockInHistory.map(h => ({ 
            ...h, 
            vendorName: h.supplier_id_override ? (suppliers.find(s => s.id === h.supplier_id_override)?.name || 'Unknown') : 'Mixed', 
            total: (h.items && Array.isArray(h.items)) ? h.items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.cost_price || 0)), 0) : 0 
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        reportData.landedCost = allItems.filter(i => i.supplier_id).map(i => ({ ...i, vendorName: suppliers.find(s => s.id === i.supplier_id)?.name || '-' }));

        // Daily Cashflow Aggregation
        const dailyCashflow = {};
        let curr = moment(startDate).startOf('day');
        const endDay = moment(endDate).startOf('day');
        while (curr <= endDay) {
            dailyCashflow[curr.format('YYYY-MM-DD')] = { inflow: 0, outflow: 0 };
            curr.add(1, 'days');
        }

        transactions.forEach(t => {
            if (!t.is_voided) {
                const day = moment(t.timestamp).format('YYYY-MM-DD');
                if (dailyCashflow[day]) dailyCashflow[day].inflow += t.total_amount;
            }
        });

        filteredExpenses.forEach(e => {
            const day = moment(e.date).format('YYYY-MM-DD');
            if (dailyCashflow[day]) dailyCashflow[day].outflow += e.amount;
        });

        reportData.dailyCashflow = Object.entries(dailyCashflow).map(([date, vals]) => ({ date, ...vals }));
        reportData.valuationHistory = []; // Will be populated by generateValuationHistory
        reportData.grossSales = grossSales;
        reportData.totalExpenses = totalExpenses;
        reportData.expenses = filteredExpenses;
        reportData.totalOutputTax = totalOutputTax;
        reportData.totalInputTax = totalInputTax;
        reportData.cogs = cogs;
        reportData.valuationContext = { startDate, endDate, allItems, stockMovements };
        
        // Reset lazy load state
        renderedTabs.clear();
        reportData.valuationHistory = null;
        reportData.valuationSnapshot = null;
        reportData.slowMoving = null;

        // Initial Render
        const activeTabBtn = document.querySelector('.tab-btn.border-blue-500');
        const activeTab = activeTabBtn ? activeTabBtn.dataset.tab : 'products';
        await renderTab(activeTab);

        // If no transactions were found, update the users table message
        if (transactions.length === 0) {
            usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No sales data found for this period.</td></tr>`;
        }
        
        document.getElementById("report-total-points").textContent = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0).toLocaleString();

    } catch (error) {
        console.error("Error generating report:", error);
        usersBody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center text-red-500">Error loading report data.</td></tr>`;
    } finally {
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
    }
}

async function renderTab(tabName) {
    if (renderedTabs.has(tabName)) return;
    if (!reportData || Object.keys(reportData).length === 0) return;

    switch (tabName) {
        case 'financials':
            updateFinancials(reportData.grossSales, reportData.totalOutputTax, reportData.totalInputTax, reportData.cogs);
            renderCashflowReport(reportData.grossSales, reportData.totalExpenses, reportData.expenses, reportData.dailyCashflow);
            renderPaymentStats(reportData.payments);
            renderCashVariance(reportData.variance);
            renderShiftReports(reportData.variance.filter(s => s.status === 'closed'));
            break;
        case 'inventory':
            if (!reportData.valuationHistory && reportData.valuationContext) {
                const { startDate, endDate, allItems, stockMovements } = reportData.valuationContext;
                document.getElementById("valuation-history-body").innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">Calculating valuation...</td></tr>`;
                await new Promise(r => requestAnimationFrame(r)); // Allow UI update
                await generateValuationHistory(startDate, endDate, allItems, stockMovements);
            } else if (reportData.valuationHistory) {
                renderValuationHistoryTable(reportData.valuationHistory);
                renderValuationCandleChart(reportData.valuationHistory);
                if (reportData.valuationSnapshot) {
                    const s = reportData.valuationSnapshot;
                    document.getElementById("val-cost").textContent = `₱${s.c.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                    document.getElementById("val-retail").textContent = `₱${s.retail.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                    document.getElementById("val-profit").textContent = `₱${(s.retail - s.c).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                }
            }

            if (!reportData.slowMoving && reportData.valuationContext) {
                const days = parseInt(document.getElementById("slow-moving-threshold").value) || 30;
                await calculateSlowMoving(days, reportData.valuationContext.allItems);
            } else {
                renderSlowMovingItems(reportData.slowMoving);
            }

            renderInventoryHistory(reportData.stockIn, reportData.adjustments);
            renderStockMovement(reportData.movements);
            renderShrinkageAnalysis(reportData.shrinkage, reportData.products);
            renderReturnsReport(reportData.returnReasons, reportData.defectiveSuppliers, reportData.returns);
            renderConversions(reportData.conversions);
            break;
        case 'products':
            renderProductStats(reportData.products);
            renderRiskMetrics(reportData.products);
            renderProductAffinity(reportData.affinity);
            renderLowStockReport(reportData.lowStock);
            renderSalesVelocity(reportData.velocity);
            break;
        case 'insights':
            renderCustomerInsights(reportData.vip, reportData.ledger);
            renderSupplierInsights(reportData.vendorPerf, reportData.purchaseHistory, reportData.landedCost);
            renderVelocityTrendChart(reportData.hourlyTrend);
            break;
        case 'system':
            renderAuditLog(reportData.audit);
            renderUserStats(reportData.users);
            break;
    }
    renderedTabs.add(tabName);
}

async function calculateSlowMoving(days, itemsCache = null) {
    const db = await dbPromise;
    const thresholdDate = moment().subtract(days, 'days').startOf('day').toDate();
    const allItems = itemsCache || await Repository.getAll('items');
    
    // Get transactions in the inactivity period
    const recentTxs = await db.transactions
        .where('timestamp')
        .aboveOrEqual(thresholdDate)
        .and(t => !t._deleted)
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

async function generateValuationHistory(startDate, endDate, allItems, allMovements) {
    const valuationHistoryBody = document.getElementById("valuation-history-body");
    if (valuationHistoryBody) {
        valuationHistoryBody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">Calculating valuation history...</td></tr>`;
    }

    // Pre-process items for fast lookup
    const itemMap = new Map(allItems.map(i => [i.id, i]));

    // 1. Calculate Current Total Valuation (Right Now)
    let currentCostVal = 0;
    let currentRetailVal = 0;

    allItems.forEach(item => {
        const qty = item.stock_level || 0;
        currentCostVal += qty * (item.cost_price || 0);
        currentRetailVal += qty * (item.selling_price || 0);
    });

    // 2. Adjust to get Close value of the End Date (Reverse future movements)
    const rangeEnd = moment(endDate).endOf('day');
    const futureMovements = allMovements.filter(m => moment(m.timestamp).isAfter(rangeEnd));
    
    futureMovements.forEach(m => {
        const item = itemMap.get(m.item_id);
        const cost = m.unit_cost || item?.cost_price || 0;
        const price = item?.selling_price || 0;
        // Reverse the movement: if we added stock (+), we subtract value to go back in time
        currentCostVal -= (m.qty * cost);
        currentRetailVal -= (m.qty * price);
    });

    // currentValuation is now the Close of the last day in range
    const ohlcData = [];
    let runningCostVal = currentCostVal;
    let runningRetailVal = currentRetailVal;

    // Group movements by date for O(1) lookup - Massive performance boost
    const movesByDate = {};
    allMovements.forEach(m => {
        const dateKey = moment(m.timestamp).format('YYYY-MM-DD');
        if (!movesByDate[dateKey]) movesByDate[dateKey] = [];
        movesByDate[dateKey].push(m);
    });

    // Generate days array
    let currentDate = moment(startDate);
    const days = [];
    while (currentDate <= moment(endDate)) {
        days.push(currentDate.clone());
        currentDate.add(1, 'days');
    }
    
    // Iterate backwards to reconstruct history
    const daysDesc = days.reverse();

    for (const day of daysDesc) {
        const dayStart = day.clone().startOf('day');
        const dayEnd = day.clone().endOf('day');
        const dateKey = day.format('YYYY-MM-DD');
        const dayMoves = movesByDate[dateKey] || [];

        // Sort descending (latest first) to walk back from Close to Open
        dayMoves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        let closeCost = runningCostVal;
        let highCost = closeCost;
        let lowCost = closeCost;
        let tempCost = closeCost;
        
        let closeRetail = runningRetailVal;
        let tempRetail = closeRetail;

        dayMoves.forEach(m => {
            const item = itemMap.get(m.item_id);
            const cost = m.unit_cost || item?.cost_price || 0;
            const price = item?.selling_price || 0;
            
            // Step back: Value Before = Value After - Change
            // If we received stock (+), value increased. To get previous value, we subtract.
            tempCost -= (m.qty * cost);
            tempRetail -= (m.qty * price);
            
            if (tempCost > highCost) highCost = tempCost;
            if (tempCost < lowCost) lowCost = tempCost;
        });

        let openCost = tempCost;

        ohlcData.push({
            x: day.format('YYYY-MM-DD'),
            o: openCost,
            h: highCost,
            l: lowCost,
            c: closeCost,
            retail: closeRetail
        });

        // Prepare for next loop (yesterday's close is today's open)
        runningCostVal = openCost;
        runningRetailVal = tempRetail;
    }

    // Reverse back to ascending for chart
    ohlcData.reverse();

    const lastSnapshot = ohlcData[ohlcData.length - 1];
    if (lastSnapshot) {
        document.getElementById("val-cost").textContent = `₱${lastSnapshot.c.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById("val-retail").textContent = `₱${lastSnapshot.retail.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById("val-profit").textContent = `₱${(lastSnapshot.retail - lastSnapshot.c).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    // Save the generated history to the server
    try {
        await fetch('api/router.php?file=valuation_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ohlcData)
        });
    } catch (error) {
        console.error("Failed to save valuation history to server:", error);
    }

    // Store in reportData for lazy re-rendering
    reportData.valuationHistory = ohlcData;
    reportData.valuationSnapshot = lastSnapshot;

    renderValuationHistoryTable(ohlcData);
    renderValuationCandleChart(ohlcData);
}

async function generateInventoryLedger() {
    const db = await dbPromise;
    const dateInput = document.getElementById("ledger-date").value;
    const tbody = document.getElementById("report-ledger-body");
    
    if (!dateInput) {
        alert("Please select a snapshot date.");
        return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">Calculating historical stock...</td></tr>`;

    try {
        const snapshotDate = new Date(dateInput);
        snapshotDate.setHours(23, 59, 59, 999); // End of selected day

        const allItems = await Repository.getAll('items');
        // Fetch movements that happened AFTER the snapshot date to reverse them
        const futureMovements = await db.stock_movements
            .where('timestamp')
            .above(snapshotDate)
            .and(m => !m._deleted)
            .toArray();

        let totalHistQty = 0;
        let totalHistValue = 0;

        const ledgerData = allItems.map(item => {
            // Start with current stock
            let histQty = item.stock_level || 0;

            // Reverse movements: 
            // If movement was + (Receive), we subtract. 
            // If movement was - (Sale), we add.
            // Assuming movement.qty is signed (positive for add, negative for deduct)
            const itemMovements = futureMovements.filter(m => m.item_id === item.id);
            
            itemMovements.forEach(m => {
                histQty -= m.qty; // Reverse the operation
            });

            const value = histQty * (item.cost_price || 0);
            totalHistQty += histQty;
            totalHistValue += value;

            return {
                name: item.name,
                barcode: item.barcode,
                cost: item.cost_price || 0,
                qty: histQty,
                value: value
            };
        });

        reportData.ledgerSnapshot = ledgerData; // Store for sorting/filtering
        
        document.getElementById("ledger-summary").classList.remove("hidden");
        document.getElementById("ledger-total-qty").textContent = totalHistQty.toLocaleString();
        document.getElementById("ledger-total-value").textContent = `₱${totalHistValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        renderInventoryLedger(ledgerData);

    } catch (error) {
        console.error("Error generating ledger:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center text-red-500">Error calculating ledger.</td></tr>`;
    }
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
    
    // Apply row limit
    const limit = parseInt(document.getElementById("report-row-limit")?.value) || 50;
    return result.slice(0, limit);
}

function renderTable(tableId) {
    switch(tableId) {
        case 'users': renderUserStats(reportData.users); break;
        case 'products': renderProductStats(reportData.products); break;
        case 'affinity': renderProductAffinity(reportData.affinity); break;
        case 'slowMoving': renderSlowMovingItems(reportData.slowMoving); break;
        case 'movements': renderStockMovement(reportData.movements); break;
        case 'conversions': renderConversions(reportData.conversions); break;
        case 'payments': renderPaymentStats(reportData.payments); break;
        case 'audit': renderAuditLog(reportData.audit); break;
        case 'velocity': renderSalesVelocity(reportData.velocity); break;
        case 'invLedger': renderInventoryLedger(reportData.ledgerSnapshot); break;
        case 'lowStock': renderLowStockReport(reportData.lowStock); break;
        case 'cashflow': renderCashflowReport(reportData.grossSales, reportData.totalExpenses, reportData.expenses, reportData.dailyCashflow); break;
        case 'shiftReports': renderShiftReports(reportData.variance.filter(s => s.status === 'closed')); break;
        case 'valuationHistory': renderValuationHistoryTable(reportData.valuationHistory); break;
        case 'quadrantDetails': renderQuadrantDetails(); break;
        case 'variance': renderCashVariance(reportData.variance); break;
        case 'stockIn':
        case 'adjustments':
            renderInventoryHistory(reportData.stockIn, reportData.adjustments);
            break;
        case 'vip': 
        case 'custLedger': 
            renderCustomerInsights(reportData.vip, reportData.ledger); 
            break;
        case 'vendorPerf':
        case 'purchaseHistory':
        case 'landedCost':
            renderSupplierInsights(reportData.vendorPerf, reportData.purchaseHistory, reportData.landedCost);
            break;
    }
}

function updateFinancials(sales, outputTax, inputTax, cost) {
    const taxOwed = outputTax - inputTax;
    document.getElementById("report-gross-sales").textContent = `₱${sales.toFixed(2)}`;
    
    const taxEl = document.getElementById("report-tax");
    taxEl.textContent = `₱${taxOwed.toFixed(2)}`;
    taxEl.title = `Output Tax (Additive): ₱${outputTax.toFixed(2)} | Input Tax (Deductive): ₱${inputTax.toFixed(2)}`;
    
    document.getElementById("report-cogs").textContent = `₱${cost.toFixed(2)}`;
    document.getElementById("report-profit").textContent = `₱${((sales - outputTax) - (cost - inputTax)).toFixed(2)}`;
}

function renderCashflowReport(sales, expenses, expenseList, dailyData) {
    const inflowEl = document.getElementById("cashflow-inflow");
    const outflowEl = document.getElementById("cashflow-outflow");
    const netEl = document.getElementById("cashflow-net");
    const tbody = document.getElementById("report-cashflow-body");

    if (inflowEl) inflowEl.textContent = `₱${sales.toFixed(2)}`;
    if (outflowEl) outflowEl.textContent = `₱${expenses.toFixed(2)}`;
    if (netEl) netEl.textContent = `₱${(sales - expenses).toFixed(2)}`;

    if (!tbody) return;
    
    const processedExpenses = applySortAndFilter(expenseList, 'cashflow');
    
    tbody.innerHTML = processedExpenses.map(e => `
        <tr class="border-b border-gray-200 hover:bg-gray-100">
            <td class="py-3 px-6 text-left">${new Date(e.date).toLocaleDateString()}</td>
            <td class="py-3 px-6 text-left"><span class="bg-gray-100 px-2 py-1 rounded text-xs">${e.category}</span></td>
            <td class="py-3 px-6 text-left">${e.description}</td>
            <td class="py-3 px-6 text-right font-bold text-red-600">₱${e.amount.toFixed(2)}</td>
        </tr>
    `).join('');
    
    if (processedExpenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No expenses found for this period.</td></tr>`;
    }

    // Chart Rendering
    const canvas = document.getElementById('cashflow-trend-chart');
    if (!canvas || !dailyData) return;
    const ctx = canvas.getContext('2d');

    if (cashflowChartInstance) {
        cashflowChartInstance.destroy();
    }

    cashflowChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dailyData.map(d => moment(d.date).format('MMM D')),
            datasets: [
                {
                    label: 'Inflow (Sales)',
                    data: dailyData.map(d => d.inflow),
                    backgroundColor: 'rgba(34, 197, 94, 0.6)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1
                },
                {
                    label: 'Outflow (Expenses)',
                    data: dailyData.map(d => d.outflow),
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: 'rgb(239, 68, 68)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => '₱' + value.toLocaleString() }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${context.dataset.label}: ₱${context.raw.toFixed(2)}`
                    }
                }
            }
        }
    });
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

function renderVelocityTrendChart(data) {
    const canvas = document.getElementById('velocity-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (velocityTrendChartInstance) {
        velocityTrendChartInstance.destroy();
    }

    velocityTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Avg Hourly Revenue',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointRadius: 4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₱' + value.toLocaleString(),
                        font: { size: 10 }
                    },
                    grid: { color: '#f3f4f6' }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    padding: 12,
                    titleFont: { size: 12 },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: (context) => ` Avg Revenue: ₱${context.raw.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function renderSalesVelocity(data) {
    const tbody = document.getElementById("report-velocity-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'velocity');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No sales data found for this period.</td></tr>`;
        return;
    }

    processed.forEach(item => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        const daysLeft = item.daysLeft === Infinity ? '∞' : item.daysLeft.toFixed(1);
        const daysLeftClass = item.daysLeft < 7 ? 'text-red-600 font-bold' : (item.daysLeft < 14 ? 'text-orange-600' : 'text-gray-600');

        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${item.name}</td>
            <td class="py-3 px-6 text-right">${item.totalSold}</td>
            <td class="py-3 px-6 text-right font-bold text-blue-600">${item.velocity.toFixed(2)}</td>
            <td class="py-3 px-6 text-right">${item.stock_level}</td>
            <td class="py-3 px-6 text-right ${daysLeftClass}">${daysLeft}</td>
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
    const processedLog = applySortAndFilter(log, 'returns');
    if (processedLog.length === 0) {
        logBody.innerHTML = `<tr><td colspan="6" class="py-3 px-6 text-center">No returns found.</td></tr>`;
    } else {
        logBody.innerHTML = processedLog.map(r => `
            <tr class="border-b border-gray-200 hover:bg-gray-100">
                <td class="py-3 px-6 text-left text-xs">${new Date(r.timestamp).toLocaleString()}</td>
                <td class="py-3 px-6 text-left font-medium">${r.item_name}</td>
                <td class="py-3 px-6 text-left">${r.reason}</td>
                <td class="py-3 px-6 text-left capitalize">${r.condition || '-'}</td>
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

function renderShiftReports(data) {
    const tbody = document.getElementById("report-shift-reports-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'shiftReports');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No closed shift reports found.</td></tr>`;
        return;
    }

    processed.forEach(s => {
        const turnover = s.total_closing_amount || s.closing_cash || 0;
        const variance = turnover - (s.expected_cash || 0);
        const diffClass = variance < 0 ? "text-red-600 font-bold" : (variance > 0 ? "text-green-600 font-bold" : "text-gray-500");
        
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100 cursor-pointer btn-view-shift-report";
        row.dataset.id = s.id;
        row.innerHTML = `
            <td class="py-3 px-6 text-left">${new Date(s.end_time).toLocaleString()}</td>
            <td class="py-3 px-6 text-left">${s.user_id}</td>
            <td class="py-3 px-6 text-right font-bold">₱${turnover.toFixed(2)}</td>
            <td class="py-3 px-6 text-right ${diffClass}">₱${variance.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

async function showShiftReportDetails(shiftId) {
    const shift = reportData.variance.find(s => s.id === shiftId);
    if (!shift) return;

    const cashout = shift.cashout || 0;
    const turnover = (shift.closing_cash || 0) + (shift.totalExpenses || 0) + cashout;
    const variance = turnover - (shift.expected_cash || 0);
    const diffClass = variance < 0 ? "text-red-600" : (variance > 0 ? "text-green-600" : "text-gray-800");

    let modal = document.getElementById('report-shift-details-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-shift-details-modal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50';
        document.body.appendChild(modal);
    }

    const receipts = shift.closing_receipts || [];
    const totalExpenses = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);

    const receiptsHtml = receipts.map(r => `
        <tr class="border-b">
            <td class="p-2">${r.description}</td>
            <td class="p-2 text-right">₱${r.amount.toFixed(2)}</td>
        </tr>
    `).join('');

    const remittancesHtml = (shift.remittances || []).map(r => `
        <tr class="border-b">
            <td class="p-2">${new Date(r.timestamp).toLocaleTimeString()} - ${r.reason}</td>
            <td class="p-2 text-right">₱${r.amount.toFixed(2)}</td>
        </tr>
    `).join('');

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">Shift Closing Report</h3>
                <button class="text-gray-500 hover:text-gray-700 text-2xl close-modal">&times;</button>
            </div>
            <div class="space-y-4">
                <div class="text-sm grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded">
                    <div><strong>User:</strong> ${shift.user_id}</div>
                    <div><strong>Closed:</strong> ${new Date(shift.end_time).toLocaleString()}</div>
                </div>
                
                <div class="border rounded overflow-hidden">
                    <table class="w-full text-sm">
                        <tr class="bg-gray-50 border-b"><td class="p-2">Opening Cash</td><td class="p-2 text-right">₱${(shift.opening_cash || 0).toFixed(2)}</td></tr>
                        <tr class="border-b"><td class="p-2">Total Sales</td><td class="p-2 text-right">₱${(shift.totalSales || 0).toFixed(2)}</td></tr>
                        <tr class="border-b"><td class="p-2">Net Returns</td><td class="p-2 text-right ${(shift.exchangeCash || 0) < 0 ? 'text-red-600' : 'text-gray-800'}">₱${(shift.exchangeCash || 0).toFixed(2)}</td></tr>
                        <tr class="bg-blue-50 border-b font-bold"><td class="p-2">Expected Amount</td><td class="p-2 text-right">₱${(shift.expected_cash || 0).toFixed(2)}</td></tr>
                        <tr class="border-b"><td class="p-2">Physical Cash Count</td><td class="p-2 text-right">₱${(shift.closing_cash || 0).toFixed(2)}</td></tr>
                        ${shift.precounted_bills ? `
                            <tr class="border-b text-xs text-gray-500 italic"><td class="p-2 pl-6">- Precounted Bills</td><td class="p-2 text-right">₱${shift.precounted_bills.toFixed(2)}</td></tr>
                        ` : ''}
                        ${shift.precounted_coins ? `
                            <tr class="border-b text-xs text-gray-500 italic"><td class="p-2 pl-6">- Precounted Coins</td><td class="p-2 text-right">₱${shift.precounted_coins.toFixed(2)}</td></tr>
                        ` : ''}
                        ${cashout ? `
                            <tr class="border-b"><td class="p-2">Cashout (Remittance)</td><td class="p-2 text-right">₱${cashout.toFixed(2)}</td></tr>
                        ` : ''}
                        <tr class="border-b"><td class="p-2">Total Expenses</td><td class="p-2 text-right">₱${totalExpenses.toFixed(2)}</td></tr>
                        <tr class="font-bold ${diffClass}"><td class="p-2">Variance</td><td class="p-2 text-right">₱${variance.toFixed(2)}</td></tr>
                    </table>
                </div>

                ${remittancesHtml ? `
                    <div>
                        <h4 class="text-xs font-bold text-gray-500 uppercase mb-1">Remittances (Cashouts)</h4>
                        <div class="border rounded overflow-hidden">
                            <table class="w-full text-xs">
                                <tbody class="bg-white">${remittancesHtml}</tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}

                ${receiptsHtml ? `
                    <div>
                        <h4 class="text-xs font-bold text-gray-500 uppercase mb-1">Expense Receipts</h4>
                        <div class="border rounded overflow-hidden">
                            <table class="w-full text-xs">
                                <tbody class="bg-white">${receiptsHtml}</tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}

                <div class="pt-3 border-t flex justify-between items-center">
                    <span class="font-bold text-gray-800">Total Turnover:</span>
                    <span class="text-2xl font-bold text-blue-600">₱${turnover.toFixed(2)}</span>
                </div>
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
                            <th class="text-left p-2">Void Reason</th>
                            <th class="text-right p-2">Gross</th>
                            <th class="text-right p-2">Net Total</th>
                            <th class="text-center p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody id="shift-tx-body">
                        <tr><td colspan="7" class="p-4 text-center">Loading transactions...</td></tr>
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
        const startTime = shift.start_time instanceof Date ? shift.start_time.toISOString() : shift.start_time;
        const endTime = (shift.end_time instanceof Date ? shift.end_time.toISOString() : shift.end_time) || new Date().toISOString();
        
        const allTxs = await db.transactions
            .where('timestamp')
            .between(startTime, endTime, true, true)
            .and(t => !t._deleted)
            .toArray();

        const entries = [];
        allTxs.forEach(tx => {
            // Original Sale
            if (tx.user_email === shift.user_id) {
                entries.push({ type: 'Sale', data: tx, timestamp: new Date(tx.timestamp), id: tx.id });
            }
            // Exchanges
            if (tx.exchanges && Array.isArray(tx.exchanges)) {
                tx.exchanges.forEach((ex, idx) => {
                    if (ex.processed_by === shift.user_id && new Date(ex.timestamp) >= new Date(startTime) && new Date(ex.timestamp) <= new Date(endTime)) {
                        entries.push({ type: 'Exchange', data: tx, timestamp: new Date(ex.timestamp), id: tx.id, exchangeIdx: idx });
                    }
                });
            }
        });

        entries.sort((a, b) => b.timestamp - a.timestamp);

        const tbody = document.getElementById('shift-tx-body');
        if (entries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500">No transactions found for this shift.</td></tr>`;
            return;
        }

        let grandGross = 0;
        let grandReturns = 0;
        let grandNet = 0;

        tbody.innerHTML = entries.map(entry => {
            const t = entry.data;
            const isExchange = entry.type === 'Exchange';
            let exchangeNet = 0;

            const returnsTotal = t.items.reduce((sum, item) => sum + ((item.returned_qty || 0) * item.selling_price), 0);
            // Returns are now separate rows, so Net for the sale row is the full amount to avoid double deduction
            const netTotal = t.is_voided ? 0 : t.total_amount;
            
            if (isExchange) {
                const ex = t.exchanges[entry.exchangeIdx];
                const rTotal = ex.returned.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
                const tTotal = ex.taken.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
                exchangeNet = tTotal - rTotal;
                grandNet += exchangeNet;
            } else if (!t.is_voided) {
                grandGross += t.total_amount;
                grandReturns += returnsTotal;
                grandNet += netTotal;
            }

            const displayTotal = isExchange ? exchangeNet : t.total_amount;
            const displayNet = isExchange ? exchangeNet : netTotal;
            const statusLabel = t.is_voided ? 'Voided' : (isExchange ? 'Exchange' : 'Success');
            const statusColor = t.is_voided ? 'text-red-600' : (isExchange ? 'text-blue-600' : 'text-green-600');

            return `
                <tr class="border-b hover:bg-gray-50 cursor-pointer btn-view-tx-detail ${t.is_voided ? 'bg-red-50 opacity-60' : ''}" data-id="${t.id}">
                    <td class="p-2 text-xs">${entry.timestamp.toLocaleTimeString()}</td>
                    <td class="p-2">${t.customer_name || 'Guest'}</td>
                    <td class="p-2 text-xs max-w-xs truncate" title="${t.items.map(i => i.name).join(', ')}">
                        ${isExchange ? 'Exchange Items' : `${t.items.length} items: ${t.items.map(i => i.name).join(', ')}`}
                    </td>
                    <td class="p-2 text-xs italic text-red-500">${t.void_reason || '-'}</td>
                    <td class="p-2 text-right">₱${displayTotal.toFixed(2)}</td>
                    <td class="p-2 text-right font-bold">₱${displayNet.toFixed(2)}</td>
                    <td class="p-2 text-center">
                        <span class="${statusColor} font-bold text-[10px] uppercase">${statusLabel}</span>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML += `
            <tr class="bg-gray-50 font-bold border-t-2 border-gray-200">
                <td colspan="4" class="p-2 text-right uppercase text-xs">Grand Totals:</td>
                <td class="p-2 text-right">₱${grandGross.toFixed(2)}</td>
                <td class="p-2 text-right text-blue-700">₱${grandNet.toFixed(2)}</td>
                <td></td>
            </tr>
        `;

        tbody.querySelectorAll(".btn-view-tx-detail").forEach(row => {
            row.addEventListener("click", () => showTransactionDetail(row.dataset.id));
        });
    } catch (err) {
        console.error(err);
        document.getElementById('shift-tx-body').innerHTML = `<tr><td colspan="7" class="p-4 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

async function showTransactionDetail(id) {
    const txId = isNaN(id) ? id : parseInt(id);
    const tx = await Repository.get('transactions', txId);
    if (!tx) return;

    const hasReturns = tx.items.some(i => (i.returned_qty || 0) > 0);
    const canVoid = checkPermission("pos", "write") && !tx.is_voided;

    let modal = document.getElementById('report-tx-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-tx-detail-modal';
        modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-75 hidden flex items-center justify-center z-[60]';
        document.body.appendChild(modal);
    }

    const itemRows = tx.items.map(item => `
        <tr class="border-b">
            <td class="p-2">${item.name}</td>
            <td class="p-2 text-center">${item.qty}</td>
            <td class="p-2 text-right">₱${item.selling_price.toFixed(2)}</td>
            <td class="p-2 text-right">₱${(item.qty * item.selling_price).toFixed(2)}</td>
        </tr>
    `).join('');

    const exchangeHtml = (tx.exchanges || []).map((ex, idx) => {
        const returnedTotal = ex.returned.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
        const takenTotal = ex.taken.reduce((sum, i) => sum + (i.selling_price * i.qty), 0);
        const net = takenTotal - returnedTotal;
        
        return `
            <div class="mt-4 border-t pt-2 bg-gray-50 p-2 rounded">
                <h4 class="font-bold text-xs text-gray-700 mb-2">Exchange #${idx + 1} - ${new Date(ex.timestamp).toLocaleString()}</h4>
                <div class="grid grid-cols-2 gap-4 text-xs">
                    <div><span class="font-bold text-red-600">Returned:</span> ${ex.returned.map(i => `${i.qty}x ${i.name}`).join(', ')} (-₱${returnedTotal.toFixed(2)})</div>
                    <div><span class="font-bold text-green-600">Taken:</span> ${ex.taken.map(i => `${i.qty}x ${i.name}`).join(', ')} (₱${takenTotal.toFixed(2)})</div>
                </div>
                <div class="text-right font-bold mt-1 text-blue-600">Net: ₱${net.toFixed(2)}</div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">Transaction Details</h3>
                <button class="text-gray-500 hover:text-gray-700 text-2xl close-modal">&times;</button>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4 text-sm bg-gray-50 p-3 rounded">
                <div><strong>ID:</strong> ${tx.id}</div>
                <div><strong>Date:</strong> ${new Date(tx.timestamp).toLocaleString()}</div>
                <div><strong>Customer:</strong> ${tx.customer_name || 'Guest'}</div>
                <div><strong>Cashier:</strong> ${tx.user_email}</div>
                <div><strong>Payment:</strong> ${tx.payment_method}</div>
                <div><strong>Status:</strong> ${tx.is_voided ? '<span class="text-red-600 font-bold">VOIDED</span>' : '<span class="text-green-600 font-bold">SUCCESS</span>'}</div>
            </div>

            <div class="overflow-y-auto border rounded flex-1 mb-4">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-100 sticky top-0">
                        <tr class="border-b">
                            <th class="text-left p-2">Item</th>
                            <th class="text-center p-2">Qty</th>
                            <th class="text-right p-2">Price</th>
                            <th class="text-right p-2">Total</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>

            ${exchangeHtml}

            <div class="flex justify-between items-end">
                <div class="text-sm">
                    <div>Subtotal: ₱${(tx.total_amount - (tx.tax_amount || 0)).toFixed(2)}</div>
                    <div>Tax: ₱${(tx.tax_amount || 0).toFixed(2)}</div>
                    <div class="text-lg font-bold">Total: ₱${tx.total_amount.toFixed(2)}</div>
                </div>
                <div class="flex flex-wrap gap-2 justify-end">
                    ${canVoid ? `<button class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow btn-void-tx-report">Void Transaction</button>` : ''}
                    ${hasReturns ? `<button class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded shadow btn-print-replacement">Print Replacement</button>` : ''}
                    <button class="bg-gray-800 hover:bg-black text-white font-bold py-2 px-6 rounded shadow btn-print-tx">Print Receipt</button>
                    <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow close-modal">Close</button>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.add('hidden'));
    });

    modal.querySelector('.btn-print-tx').addEventListener('click', () => {
        printTransactionReceipt(tx, false, true);
    });

    if (canVoid) {
        modal.querySelector('.btn-void-tx-report').addEventListener('click', () => {
            voidTransactionFromReports(tx.id);
        });
    }

    if (hasReturns) {
        modal.querySelector('.btn-print-replacement').addEventListener('click', () => {
            alert("Please ensure you retrieve the original receipt from the customer before providing the replacement.");
            printTransactionReceipt(tx, true);
        });
    }
}

async function voidTransactionFromReports(id) {
    if (!confirm("Are you sure you want to VOID this transaction? This will reverse stock levels.")) return;
    if (!(await requestManagerApproval())) return;

    const reason = prompt("Please enter the reason for voiding this transaction:");
    if (reason === null) return;

    try {
        const txId = isNaN(id) ? id : parseInt(id);
        const tx = await Repository.get('transactions', txId);
        if (!tx) return;

        const user = JSON.parse(localStorage.getItem('pos_user'));

        // 1. Update Transaction
        const updatedTx = {
            ...tx,
            is_voided: true, 
            voided_at: new Date().toISOString(),
            voided_by: user ? user.email : "System",
            void_reason: reason || "No reason provided"
        };
        await Repository.upsert('transactions', updatedTx);

        // 2. Reverse Stock
        for (const item of tx.items) {
            const current = await Repository.get('items', item.id);
            if (current) {
                const newStock = (current.stock_level || 0) + item.qty;
                await Repository.upsert('items', { ...current, stock_level: newStock });
                
                const movement = {
                    id: generateUUID(),
                    item_id: item.id,
                    item_name: item.name,
                    timestamp: new Date().toISOString(),
                    type: 'Void',
                    qty: item.qty,
                    user: user ? user.email : "System",
                    transaction_id: tx.id,
                    reason: reason || "Transaction Voided"
                };
                await Repository.upsert('stock_movements', movement);
            }
        }

        // 3. Sync
        SyncEngine.sync();

        await addNotification('Void', `Transaction ${txId} was voided by ${user ? user.email : "System"}`);
        alert("Transaction voided successfully.");
        
        // Close modal and refresh report
        document.getElementById('report-tx-detail-modal').classList.add('hidden');
        generateReport();
    } catch (error) {
        console.error("Void error:", error);
        alert("Failed to void transaction.");
    }
}

export async function printTransactionReceipt(tx, isReplacement = false, isReprint = true) {
    const settings = await getSystemSettings();
    const store = settings.store || { name: "LightPOS", data: "" };
    
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    
    let itemsHtml = "";
    let total = 0;

    tx.items.forEach(item => {
        const qty = isReplacement ? (item.qty - (item.returned_qty || 0)) : item.qty;
        if (qty <= 0 && isReplacement) return;

        const lineTotal = qty * item.selling_price;
        total += lineTotal;

        itemsHtml += `
            <tr>
                <td colspan="2" style="padding-top: 5px;">${item.name}</td>
            </tr>
            <tr>
                <td style="font-size: 10px;">${qty} x ${item.selling_price.toFixed(2)}</td>
                <td style="text-align: right;">${lineTotal.toFixed(2)}</td>
            </tr>
        `;
    });

    const receiptHtml = `
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                @page { margin: 0; }
                body { 
                    width: 76mm; 
                    font-family: 'Courier New', Courier, monospace; 
                    font-size: 12px; 
                    padding: 5mm;
                    margin: 0;
                    color: #000;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .bold { font-weight: bold; }
                .hr { border-bottom: 1px dashed #000; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; }
                .footer { margin-top: 20px; font-size: 10px; }
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 40px;
                    color: rgba(0, 0, 0, 0.1);
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: -1;
                    font-weight: bold;
                }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${isReprint && !isReplacement ? '<div class="watermark">REPRINT</div>' : ''}
            <div class="text-center">
                ${isReplacement ? '<div class="bold" style="font-size: 14px; border: 1px solid #000; margin-bottom: 5px;">REPLACEMENT RECEIPT</div>' : ''}
                ${store.logo ? `<img src="${store.logo}" style="max-width: 40mm; max-height: 20mm; margin-bottom: 5px; filter: grayscale(1);"><br>` : ''}
                <div class="bold" style="font-size: 16px;">${store.name}</div>
                <div style="white-space: pre-wrap; font-size: 10px;">${store.data}</div>
            </div>
            <div class="hr"></div>
            <div style="font-size: 10px;">
                Date: ${new Date(tx.timestamp).toLocaleString()}<br>
                Trans: #${tx.id}<br>
                Cashier: ${tx.user_email}<br>
                Customer: ${tx.customer_name}
            </div>
            <div class="hr"></div>
            <table>
                ${itemsHtml}
            </table>
            <div class="hr"></div>
            <table>
                <tr><td class="bold">TOTAL</td><td class="text-right bold">₱${total.toFixed(2)}</td></tr>
                ${!isReplacement ? `
                    <tr><td>Payment (${tx.payment_method})</td><td class="text-right">₱${tx.amount_tendered.toFixed(2)}</td></tr>
                    <tr><td>Change</td><td class="text-right">₱${tx.change.toFixed(2)}</td></tr>
                ` : `
                    <tr><td colspan="2" style="font-size: 9px; font-style: italic;">* Adjusted for returns</td></tr>
                `}
            </table>
            <div class="footer text-center">
                THIS IS NOT AN OFFICIAL RECEIPT<br>
                Thank you for shopping!
            </div>
        </body>
        </html>
    `;
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
}

function renderCustomerInsights(vip, ledger) {
    const vipBody = document.getElementById("report-vip-body");
    const ledgerBody = document.getElementById("report-cust-ledger-body");

    const processedVip = applySortAndFilter(vip, 'vip');
    const processedLedger = applySortAndFilter(ledger, 'custLedger');

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
        tbody.innerHTML = `<tr><td colspan="11" class="py-3 px-6 text-center">No closed shifts found for this period.</td></tr>`;
        return;
    }

    processed.forEach(s => {
        const isClosed = s.status === 'closed';
        const variance = s.variance || 0;
        const diffClass = !isClosed ? "text-gray-400" : (variance < 0 ? "text-red-600 font-bold" : (variance > 0 ? "text-green-600 font-bold" : "text-gray-500"));
        const statusClass = s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
        
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100 cursor-pointer btn-view-shift-tx";
        row.dataset.id = s.id;
        row.innerHTML = `
            <td class="py-3 px-6 text-left">${new Date(s.start_time).toLocaleDateString()}</td>
            <td class="py-3 px-6 text-left">${s.user_id}</td>
            <td class="py-3 px-6 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusClass}">${s.status}</span></td>
            <td class="py-3 px-6 text-right">₱${(s.opening_cash || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right">₱${(s.cashout || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right">₱${(s.expected_cash || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right">${isClosed ? `₱${(s.closing_cash || 0).toFixed(2)}` : '-'}</td>
            <td class="py-3 px-6 text-right ${diffClass}">${isClosed ? `₱${variance.toFixed(2)}` : '-'}</td>
            <td class="py-3 px-6 text-right">₱${(s.totalSales || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right">₱${(s.totalCogs || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-right font-bold text-blue-600">₱${(s.grossProfit || 0).toFixed(2)}</td>
            <td class="py-3 px-6 text-center flex items-center justify-center gap-2">
                <button class="text-blue-600 hover:text-blue-800 font-bold btn-view-shift-tx" data-id="${s.id}">View</button>
                ${!isClosed ? `<button class="text-red-600 hover:text-red-800 font-bold btn-force-close-shift" data-id="${s.id}">Force Close</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
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
        if (prod.revenue >= avgRev && prod.marginPct >= avgMargin) matrix.winners.push(prod);
        else if (prod.revenue >= avgRev && prod.marginPct < avgMargin) matrix.cows.push(prod);
        else if (prod.revenue < avgRev && prod.marginPct >= avgMargin) matrix.sleepers.push(prod);
        else matrix.dogs.push(prod);
    });

    reportData.matrix = matrix;
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
        el.innerHTML = items.slice(0, 8).map(item => `
            <div class="flex items-center gap-2">
                <span class="w-1 h-1 rounded-full bg-current"></span>
                <span class="truncate">${item.name}</span>
            </div>
        `).join('') + (items.length > 8 ? `<div class="pl-3 font-bold">... +${items.length - 8} more</div>` : '');
    };

    renderList('matrix-winners', matrix.winners);
    renderList('matrix-cows', matrix.cows);
    renderList('matrix-sleepers', matrix.sleepers);
    renderList('matrix-dogs', matrix.dogs);
}

function renderStockMovement(data) {
    const tbody = document.getElementById("report-movements-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'movements');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-3 px-6 text-center">No movements found.</td></tr>`;
        return;
    }

    processed.forEach(m => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        
        // Determine badge color based on movement type
        let badgeClass = "bg-blue-100 text-blue-700"; // Default (Sale)
        const type = m.type?.toLowerCase();
        if (type === 'void') badgeClass = "bg-red-100 text-red-700";
        else if (type === 'return') badgeClass = "bg-orange-100 text-orange-700";
        else if (type === 'adjustment') badgeClass = "bg-yellow-100 text-yellow-700";
        else if (type === 'stock-in' || type === 'initial stock') badgeClass = "bg-green-100 text-green-700";
        else if (type === 'shrinkage') badgeClass = "bg-purple-100 text-purple-700";

        row.innerHTML = `
            <td class="py-2 px-4">${new Date(m.timestamp).toLocaleString()}</td>
            <td class="py-2 px-4 font-medium">${m.item_name}</td>
            <td class="py-2 px-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}">${m.type}</span></td>
            <td class="py-2 px-4 text-right font-bold ${m.qty > 0 ? 'text-green-600' : 'text-red-600'}">${m.qty > 0 ? '+' : ''}${m.qty}</td>
            <td class="py-2 px-4 text-xs text-gray-500">${m.reason || '-'}</td>
            <td class="py-2 px-4">${m.user}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderConversions(data) {
    const tbody = document.getElementById("report-conversions-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'conversions');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No conversions found.</td></tr>`;
        return;
    }

    processed.forEach(m => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        const qtyClass = m.qty > 0 ? "text-green-600" : "text-red-600";
        const sign = m.qty > 0 ? "+" : "";
        row.innerHTML = `
            <td class="py-2 px-4">${new Date(m.timestamp).toLocaleString()}</td>
            <td class="py-2 px-4 font-medium">${m.item_name}</td>
            <td class="py-2 px-4 text-right font-bold ${qtyClass}">${sign}${m.qty}</td>
            <td class="py-2 px-4 text-xs text-gray-500">${m.reason || '-'}</td>
            <td class="py-2 px-4">${m.user}</td>
        `;
        tbody.appendChild(row);
    });
}

async function forceCloseShift(id) {
    const shift = reportData.variance.find(s => s.id == id);
    if (!shift) return;

    if (!confirm(`Force close shift for ${shift.user_id}?`)) return;
    
    const approved = await requestManagerApproval();
    if (!approved) return;

    const expected = (shift.opening_cash || 0) + (shift.totalSales || 0);
    const closingCashStr = prompt(`Force Closing Shift\nUser: ${shift.user_id}\nExpected Cash: ₱${expected.toFixed(2)}\n\nEnter actual cash in drawer:`, expected.toFixed(2));
    
    if (closingCashStr === null) return;
    const closingCash = parseFloat(closingCashStr) || 0;

    try {
        const now = new Date().toISOString();
        const shiftId = isNaN(id) ? id : parseInt(id);
        // We need the original record from DB to avoid saving report-only fields
        const original = await Repository.get('shifts', shiftId);
        
        const updatedShift = {
            ...original,
            status: 'closed',
            end_time: now,
            closing_cash: closingCash,
            expected_cash: expected,
            _updatedAt: Date.now()
        };

        await Repository.upsert('shifts', updatedShift);
        SyncEngine.sync();
        
        alert("Shift closed successfully.");
        generateReport();
    } catch (error) {
        console.error("Error force closing shift:", error);
        alert("Failed to close shift.");
    }
}

function renderLowStockReport(data) {
    const tbody = document.getElementById("report-low-stock-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'lowStock');

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No low stock items found.</td></tr>`;
        return;
    }

    processed.forEach(item => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        const isOut = item.stock_level <= 0;
        const statusClass = isOut ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700";
        const statusText = isOut ? "Out of Stock" : "Low Stock";

        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${item.name}</td>
            <td class="py-3 px-6 text-left font-mono text-xs">${item.barcode || '-'}</td>
            <td class="py-3 px-6 text-right font-bold ${isOut ? 'text-red-600' : 'text-yellow-600'}">${item.stock_level}</td>
            <td class="py-3 px-6 text-right">${item.min_stock || 0}</td>
            <td class="py-3 px-6 text-center">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusClass}">${statusText}</span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showQuadrantDetails(quadrant) {
    const data = reportData.matrix ? reportData.matrix[quadrant] : [];
    const title = quadrant.charAt(0).toUpperCase() + quadrant.slice(1);
    
    let modal = document.getElementById('report-quadrant-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'report-quadrant-modal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex items-center justify-center z-50';
        document.getElementById("main-content").appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl mx-4 flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">${title} Quadrant Details</h3>
                <button class="text-gray-500 hover:text-gray-700 text-2xl close-modal">&times;</button>
            </div>
            <div class="overflow-y-auto border rounded flex-1">
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-100 sticky top-0">
                        <tr class="border-b">
                            <th class="text-left p-2 cursor-pointer hover:bg-gray-200" data-sort="name" data-table="quadrantDetails">Product</th>
                            <th class="text-center p-2 cursor-pointer hover:bg-gray-200" data-sort="qty" data-table="quadrantDetails">Sold</th>
                            <th class="text-right p-2 cursor-pointer hover:bg-gray-200" data-sort="revenue" data-table="quadrantDetails">Revenue</th>
                            <th class="text-right p-2 cursor-pointer hover:bg-gray-200" data-sort="marginPct" data-table="quadrantDetails">Margin %</th>
                        </tr>
                    </thead>
                    <tbody id="quadrant-details-body"></tbody>
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

    reportData.currentQuadrant = quadrant;
    renderQuadrantDetails();
}

function renderQuadrantDetails() {
    const tbody = document.getElementById("quadrant-details-body");
    if (!tbody) return;
    
    const quadrant = reportData.currentQuadrant;
    const data = reportData.matrix ? reportData.matrix[quadrant] : [];
    const processed = applySortAndFilter(data, 'quadrantDetails');

    tbody.innerHTML = processed.map(p => `
        <tr class="border-b hover:bg-gray-50 cursor-pointer btn-quick-edit-stock" data-id="${p.id}">
            <td class="p-2 font-medium">${p.name}</td>
            <td class="p-2 text-center">${p.qty}</td>
            <td class="p-2 text-right font-bold">₱${p.revenue.toFixed(2)}</td>
            <td class="p-2 text-right">${p.marginPct.toFixed(1)}%</td>
        </tr>
    `).join('');

    tbody.querySelectorAll(".btn-quick-edit-stock").forEach(row => {
        row.addEventListener("click", () => showQuickEditMinStock(row.dataset.id));
    });
}

async function showQuickEditMinStock(id) {
    const item = await Repository.get('items', id);
    if (!item) return;

    const newMin = prompt(`Quick Edit: Min Stock Alert for "${item.name}"\n\nCurrent: ${item.min_stock || 0}`, item.min_stock || 0);
    
    if (newMin !== null) {
        const minVal = parseInt(newMin);
        if (isNaN(minVal)) {
            alert("Please enter a valid number.");
            return;
        }

        try {
            // Update local and sync
            await Repository.upsert('items', { ...item, min_stock: minVal });
            SyncEngine.sync();
            
            alert("Min stock updated.");
            generateReport(); // Refresh report to update low stock lists etc
        } catch (e) {
            console.error(e);
            alert("Failed to update.");
        }
    }
}

function renderValuationHistoryTable(data) {
    const tbody = document.getElementById("valuation-history-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No valuation data for this period.</td></tr>`;
        return;
    }
    [...data].reverse().forEach(d => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        const change = d.c - d.o;
        const colorClass = change >= 0 ? "text-green-600" : "text-red-600";
        
        row.innerHTML = `
            <td class="py-3 px-6 text-left">${d.x}</td>
            <td class="py-3 px-6 text-right font-bold">₱${d.c.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="py-3 px-6 text-right">₱${d.retail.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="py-3 px-6 text-right text-xs ${colorClass}">${change >= 0 ? '▲' : '▼'} ₱${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderValuationCandleChart(ohlcData) {
    const ctx = document.getElementById('valuation-chart')?.getContext('2d');
    if (!ctx) return;

    if (valuationChartInstance) {
        valuationChartInstance.destroy();
    }

    // Simulate Candlestick using Floating Bars
    // Dataset 1: Wicks (Low to High) - Thin bar
    // Dataset 2: Body (Open to Close) - Thicker bar
    
    const wickData = ohlcData.map(d => [d.l, d.h]);
    const bodyData = ohlcData.map(d => [Math.min(d.o, d.c), Math.max(d.o, d.c)]);
    const colors = ohlcData.map(d => d.c >= d.o ? '#10B981' : '#EF4444'); // Green (Up) / Red (Down)

    valuationChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ohlcData.map(d => moment(d.x).format('MMM D')),
            datasets: [
                {
                    label: 'Range (High/Low)',
                    data: wickData,
                    backgroundColor: 'rgba(107, 114, 128, 0.8)', // Gray wicks
                    barThickness: 2,
                    order: 2
                },
                {
                    label: 'Valuation (Open/Close)',
                    data: bodyData,
                    backgroundColor: colors,
                    barThickness: 12,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            // Only show tooltip for the body dataset to avoid duplicates
                            if (context.datasetIndex === 1) {
                                const idx = context.dataIndex;
                                const d = ohlcData[idx];
                                return [
                                    `Open: ₱${d.o.toLocaleString()}`,
                                    `Close: ₱${d.c.toLocaleString()}`,
                                    `High: ₱${d.h.toLocaleString()}`,
                                    `Low: ₱${d.l.toLocaleString()}`
                                ];
                            }
                            return null;
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: value => '₱' + value.toLocaleString()
                    }
                }
            }
        }
    });
}

function renderInventoryLedger(data) {
    const tbody = document.getElementById("report-inv-ledger-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const processed = applySortAndFilter(data, 'invLedger');

    processed.forEach(item => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left font-medium">${item.name}</td>
            <td class="py-3 px-6 text-left font-mono text-xs">${item.barcode || '-'}</td>
            <td class="py-3 px-6 text-right">₱${item.cost.toFixed(2)}</td>
            <td class="py-3 px-6 text-right font-bold">${item.qty}</td>
            <td class="py-3 px-6 text-right font-bold text-blue-600">₱${item.value.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderShrinkageAnalysis(summary, products) {
    const summaryContainer = document.getElementById("report-shrinkage-summary");
    const itemsBody = document.getElementById("report-shrinkage-items-body");
    if (!summaryContainer || !itemsBody) return;

    summaryContainer.innerHTML = summary.map(s => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span>${s.reason}</span>
            <span class="font-bold text-red-600">${s.qty} units</span>
        </div>
    `).join('');
    
    const limit = parseInt(document.getElementById("report-row-limit")?.value) || 50;
    const topShrinkage = [...products]
        .filter(p => p.shrinkageQty > 0)
        .sort((a, b) => b.shrinkageQty - a.shrinkageQty)
        .slice(0, limit);

    itemsBody.innerHTML = topShrinkage.length ? topShrinkage.map(p => `
        <tr class="border-b last:border-0">
            <td class="py-2">${p.name}</td>
            <td class="py-2 text-right font-bold text-red-600">${p.shrinkageQty}</td>
        </tr>
    `).join('') : `<tr><td colspan="2" class="py-4 text-center text-gray-400">No shrinkage recorded.</td></tr>`;
}

function renderRiskMetrics(products) {
    const tbody = document.getElementById("report-risk-body");
    if (!tbody) return;

    const processed = applySortAndFilter(products, 'risk');
    
    tbody.innerHTML = processed.length ? processed.map(p => `
        <tr class="border-b border-gray-200 hover:bg-gray-100">
            <td class="py-3 px-6 text-left font-medium">${p.name}</td>
            <td class="py-3 px-6 text-center">${p.qty}</td>
            <td class="py-3 px-6 text-center">${p.returnedUnits}</td>
            <td class="py-3 px-6 text-center font-bold ${p.returnRate > 5 ? 'text-red-600' : 'text-gray-600'}">${p.returnRate.toFixed(1)}%</td>
            <td class="py-3 px-6 text-center">${p.shrinkageQty}</td>
            <td class="py-3 px-6 text-center font-bold ${p.shrinkagePct > 2 ? 'text-red-600' : 'text-gray-600'}">${p.shrinkagePct.toFixed(1)}%</td>
        </tr>
    `).join('') : `<tr><td colspan="6" class="py-3 px-6 text-center">No data available.</td></tr>`;
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

    if (processed.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No voided transactions in this period.</td></tr>`;
        return;
    }

    processed.forEach(v => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 bg-red-50";
        
        const vDate = v.voided_at ? new Date(v.voided_at) : null;
        const voidDateStr = (vDate && !isNaN(vDate)) ? vDate.toLocaleString() : 'Unknown';
        const origDateStr = new Date(v.timestamp).toLocaleString();

        row.innerHTML = `
            <td class="py-3 px-6 text-left">${voidDateStr}</td>
            <td class="py-3 px-6 text-left">${origDateStr}</td>
            <td class="py-3 px-6 text-right font-bold">₱${v.total_amount.toFixed(2)}</td>
            <td class="py-3 px-6 text-left">${v.voided_by || 'Unknown'}</td>
            <td class="py-3 px-6 text-left italic text-xs">${v.void_reason || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}