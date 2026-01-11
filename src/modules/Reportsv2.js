import { dbPromise } from "../db.js";
import { renderSidebar } from "../layout.js";

const reportWorker = new Worker('src/workers/reportWorker.js', { type: 'module' });
let reportResolve = null;
let reportReject = null;

reportWorker.onmessage = (e) => {
    const { type, success, data, message } = e.data;
    if (type === 'Re:GENERATE') {
        if (success && reportResolve) reportResolve(data);
        else if (!success && reportReject) reportReject(new Error(message));
    }
};

const generalReportWorker = new Worker('src/workers/generalReportWorker.js', { type: 'module' });
let generalResolve = null;
let generalReject = null;
let lastShiftData = null; // Cache for navigation

generalReportWorker.onmessage = (e) => {
    const { type, success, data, message } = e.data;
    if (type === 'Re:GENERATE_SHIFTS' || type === 'Re:GENERATE_SUMMARY') {
        if (success && generalResolve) generalResolve(data);
        else if (!success && generalReject) generalReject(new Error(message));
    }
};

let currentModalReportId = null;

const REPORTS_CONFIG = {
    products: [
        { id: 'prod-perf', title: 'Product Performance', desc: 'In-depth sales metrics, margins, and Retailer\'s Matrix categorization.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', implemented: false },
        { id: 'prod-risk', title: 'Risk & Quality', desc: 'Analyze return rates and shrinkage per product to identify quality issues.', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', implemented: false },
        { id: 'prod-affinity', title: 'Product Affinity', desc: 'Identify which items are frequently bought together to optimize bundles.', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01', implemented: false },
        { id: 'prod-lowstock', title: 'Low Stock Report', desc: 'Real-time list of products nearing or below their minimum stock threshold.', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', implemented: false },
        { id: 'prod-velocity', title: 'Sales Velocity', desc: 'Track how fast items sell and predict days of stock remaining.', icon: 'M13 10V3L4 14h7v7l9-11h-7z', implemented: false }
    ],
    inventory: [
        { id: 'inv-val', title: 'Inventory Valuation', desc: 'Current and historical asset value based on cost and retail prices.', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', implemented: false },
        { id: 'inv-ledger', title: 'Inventory Ledger', desc: 'Generate a snapshot of total inventory at any historical date.', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', implemented: false },
        { id: 'inv-history', title: 'Stock-In History', desc: 'Detailed log of all inventory receipts and replenishments.', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', implemented: false },
        { id: 'inv-audit', title: 'Adjustments (Audit)', desc: 'Track manual stock changes, user responsible, and reason codes.', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', implemented: false },
        { id: 'inv-movement', title: 'Movement Log', desc: 'Granular log of every single stock change (Sales, Returns, Voids).', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', implemented: true },
        { id: 'inv-shrinkage', title: 'Shrinkage Analysis', desc: 'Identify patterns in inventory loss from theft or admin errors.', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', implemented: false },
        { id: 'inv-slow', title: 'Slow Moving Items', desc: 'Discover items that haven\'t moved in weeks to clear dead stock.', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', implemented: false },
        { id: 'inv-returns', title: 'Returns & Defectives', desc: 'Track customer returns and defective items by supplier.', icon: 'M16 15v-6a4 4 0 00-4-4H4m0 0l4-4m-4 4l4 4', implemented: false },
        { id: 'inv-conversions', title: 'Stock Conversions', desc: 'Log item breakdowns and transformations (e.g., bulk to retail).', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', implemented: false }
    ],
    financials: [
        { id: 'fin-summary', title: 'Sales Summary', desc: 'Revenue breakdown by payment method and net profit metrics.', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z', implemented: true },
        { id: 'fin-users', title: 'User Sales', desc: 'Track sales contribution and transaction count per user.', icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z', implemented: false },
        { id: 'fin-shift-reports', title: 'Closing Reports', desc: 'Full end-of-shift reconciliation and expense tracking.', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', implemented: true },
        { id: 'fin-cashflow', title: 'Cashflow Trend', desc: 'Daily bar chart comparing cash inflows and outflows.', icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z', implemented: false }
    ],
    insights: [
        { id: 'ins-customers', title: 'Customer Insights', desc: 'VIP ranking and outstanding loyalty point liability.', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', implemented: false },
        { id: 'ins-suppliers', title: 'Supplier Performance', desc: 'Analyze vendor sell-through rates and purchase history.', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z', implemented: false },
        { id: 'ins-velocity-trend', title: 'Hourly Sales Trend', desc: 'Heatmap of sales throughout the day on average.', icon: 'M12 11V7l3-3m6 3a9 9 0 11-18 0 9 9 0 0118 0z', implemented: false }
    ],
    system: [
        { id: 'sys-audit', title: 'System Audit', desc: 'Log of sensitive actions like voids and price changes.', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', implemented: false }
    ]
};

export async function loadReportsView() {
    const content = document.getElementById("main-content");
    currentModalReportId = null;

    content.innerHTML = `
        <div class="max-w-7xl mx-auto relative">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Reports Dashboard (v2)</h2>
            </div>
            
            <div class="border-b border-gray-200 mb-6 bg-white sticky top-0 z-10 shadow-sm flex justify-between items-center pr-4">
                <nav class="flex space-x-8 px-4 overflow-x-auto" aria-label="Tabs">
                    <button data-tab="products" class="tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Products</button>
                    <button data-tab="inventory" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Inventory</button>
                    <button data-tab="financials" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Financials</button>
                    <button data-tab="insights" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">Insights</button>
                    <button data-tab="system" class="tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors">System</button>
                </nav>
                 <!-- Report Range Picker -->
                <div id="report-range" class="flex items-center bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 cursor-pointer hover:bg-gray-100">
                    <svg class="w-4 h-4 text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <span id="report-range-label">Select Date Range</span>
                    <svg class="w-4 h-4 text-gray-500 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </div>

            <div id="report-grid-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                <!-- Cards injected here -->
            </div>
        </div>

        <!-- Unified Report Modal -->
        <div id="report-modal" class="hidden fixed inset-0 z-50 overflow-hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" id="modal-backdrop"></div>
            
            <div class="flex items-center justify-center min-h-screen px-4 py-6">
                <!-- Modal Panel: Fixed height, Flex Column -->
                <div class="bg-white rounded-lg shadow-xl transform transition-all w-full max-w-7xl h-[90vh] flex flex-col">
                    
                    <!-- 1. Header (Fixed) -->
                    <div class="flex-none flex justify-between items-center bg-gray-50 px-6 py-4 border-b border-gray-200 rounded-t-lg">
                         <div>
                            <h3 class="text-xl leading-6 font-bold text-gray-900" id="report-modal-title">Report Title</h3>
                            <p class="text-sm text-gray-500 mt-1" id="report-modal-desc">Report Description</p>
                         </div>
                         <button type="button" id="close-report-modal" class="text-gray-400 hover:text-gray-500 focus:outline-none transition-colors">
                            <span class="sr-only">Close</span>
                            <svg class="h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                         </button>
                    </div>

                    <!-- 2. Metrics/KPI Bar (Sticky/Fixed) -->
                    <div id="report-metrics-container" class="flex-none bg-white border-b border-gray-100 empty:hidden">
                        <!-- KPIs injected here -->
                    </div>

                    <!-- 3. Main Content (Scrollable) -->
                    <div id="report-modal-content" class="flex-1 overflow-y-auto p-6 bg-white relative">
                         <!-- Table injected here -->
                        <div class="text-center py-20 text-gray-400">
                            <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            <p class="text-lg">Select a report to generate...</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;

    renderReportCards('products'); // Default tab

    // Setup Tab Listeners
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('border-blue-500', 'text-blue-600');
                b.classList.add('border-transparent', 'text-gray-500');
            });
            e.target.classList.remove('border-transparent', 'text-gray-500');
            e.target.classList.add('border-blue-500', 'text-blue-600');
            renderReportCards(e.target.dataset.tab);
        });
    });

    // Close Modal Listener
    document.getElementById("close-report-modal").addEventListener("click", closeReportModal);

    // Initialize Date Range Picker
    if (typeof $ !== 'undefined' && $('#report-range').length) {
        const start = moment().startOf('month');
        const end = moment().endOf('month');

        function cb(start, end) {
            $('#report-range span').html(start.format('MMM D, YYYY') + ' - ' + end.format('MMM D, YYYY'));
            if (currentModalReportId) generateReport(currentModalReportId);
        }

        $('#report-range').daterangepicker({
            startDate: start,
            endDate: end,
            ranges: {
                'Today': [moment(), moment()],
                'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                'Last 7 Days': [moment().subtract(6, 'days'), moment()],
                'Last 30 Days': [moment().subtract(29, 'days'), moment()],
                'This Month': [moment().startOf('month'), moment().endOf('month')],
                'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
            }
        }, cb);
        cb(start, end);
    }
}

function renderReportCards(category) {
    const container = document.getElementById("report-grid-container");
    container.innerHTML = "";

    const reports = REPORTS_CONFIG[category] || [];
    reports.forEach(report => {
        const isImplemented = report.implemented;
        const card = document.createElement("div");
        const opacityClass = isImplemented ? "bg-white hover:shadow-md cursor-pointer" : "bg-gray-50 opacity-60 cursor-not-allowed grayscale";

        card.className = `${opacityClass} rounded-xl shadow-sm p-6 border border-gray-100 flex flex-col justify-between h-full transition-all`;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="p-3 bg-blue-50 rounded-lg text-blue-600">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${report.icon}"></path></svg>
                </div>
                <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full font-medium uppercase tracking-wider">${category}</span>
            </div>
            <div>
                <h3 class="text-lg font-bold text-gray-800 mb-2 ${isImplemented ? 'group-hover:text-blue-600' : ''} transition-colors">${report.title}</h3>
                <p class="text-sm text-gray-500 line-clamp-2">${report.desc}</p>
            </div>
            <div class="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center text-sm font-medium ${isImplemented ? 'text-blue-600' : 'text-gray-400'}">
                <span>${isImplemented ? 'View Report' : 'Coming Soon'}</span>
                ${isImplemented ? '<span class="transform transition-transform group-hover:translate-x-1">→</span>' : ''}
            </div>
        `;
        if (isImplemented) {
            card.addEventListener("click", () => openReportModal(report));
        }
        container.appendChild(card);
    });
}

async function openReportModal(report) {
    if (!report.implemented) return;

    currentModalReportId = report.id;
    const modal = document.getElementById("report-modal");
    document.getElementById("report-modal-title").textContent = report.title;
    document.getElementById("report-modal-desc").textContent = report.desc;
    document.getElementById("report-modal-content").innerHTML = `
        <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    `;
    modal.classList.remove("hidden");

    // Trigger generation
    await generateReport(report.id);
}

async function generateReport(reportId) {
    if (!reportId) return;

    // Fetch Date Range
    const drp = $('#report-range').data('daterangepicker');
    if (!drp) return;
    const startDate = drp.startDate.clone().startOf('day').toDate();
    const endDate = drp.endDate.clone().endOf('day').toDate();
    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    const db = await dbPromise;

    // Movement Log Logic
    if (reportId === 'inv-movement') {
        const limit = 2000; // Hard limit to prevent hanging

        // Fetch Required Data for Worker Synthesis
        // Optimization: Strict limits and bounds
        const [transactions, returns, stockMovements] = await Promise.all([
            db.transactions.where('timestamp').between(startStr, endStr, true, true).reverse().limit(limit).toArray(),
            db.returns.where('timestamp').between(startStr, endStr, true, true).reverse().limit(limit).toArray(),
            db.stock_movements.where('timestamp').between(startStr, endStr, true, true).reverse().limit(limit).toArray()
        ]);

        // Dispatch to Worker
        reportWorker.postMessage({
            type: 'GENERATE',
            payload: {
                transactions,
                returns,
                filteredMovements: stockMovements, // Worker filters this
                startDate: startStr,
                endDate: endStr,
                allItems: await db.items.toArray(), // Needed for names
                suppliers: [],
                filteredAdjustments: [],
                filteredStockIn: [],
                filteredExpenses: []
            }
        });

        // Wait for result
        const result = await new Promise((resolve, reject) => {
            reportResolve = resolve;
            reportReject = reject;
        });

        // Check if we hit the limit
        const hitLimit = transactions.length === limit || returns.length === limit || stockMovements.length === limit;
        renderStockMovement(result.movements);

        if (hitLimit) {
            const metrics = document.getElementById("report-metrics-container");
            metrics.innerHTML = `
                <div class="bg-yellow-50 border-b border-yellow-200 p-3 text-sm text-yellow-800 text-center font-medium flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    Data limited to the last ${limit} records. Please narrow your date range for accuracy.
                </div>
             `;
        }
    } else if (reportId === 'fin-shift-reports') {
        const shifts = await db.shifts.toArray();

        generalReportWorker.postMessage({
            type: 'GENERATE_SHIFTS',
            payload: {
                shifts,
                startDate: startStr,
                endDate: endStr
            }
        });

        const result = await new Promise((resolve, reject) => {
            generalResolve = resolve;
            generalReject = reject;
        });

        renderShiftReports(result);
    } else if (reportId === 'fin-summary') {
        const transactions = await db.transactions.toArray();
        const items = await db.items.toArray();

        generalReportWorker.postMessage({
            type: 'GENERATE_SUMMARY',
            payload: {
                transactions,
                items,
                startDate: startStr,
                endDate: endStr
            }
        });

        const result = await new Promise((resolve, reject) => {
            generalResolve = resolve;
            generalReject = reject;
        });

        renderSalesSummary(result);
    }
}

function renderSalesSummary(data) {
    const { summary, paymentMethods, categorySales } = data;
    const metricsContainer = document.getElementById("report-metrics-container");
    const contentContainer = document.getElementById("report-modal-content");

    // Metrics Bar
    metricsContainer.innerHTML = `
        <div class="grid grid-cols-4 gap-6 p-6">
            <div class="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col justify-center">
                <div class="text-xs text-blue-500 uppercase font-bold tracking-wider">Total Revenue</div>
                <div class="text-3xl font-bold text-blue-800 mt-1">₱${summary.totalRevenue.toFixed(2)}</div>
            </div>
            <div class="p-4 bg-purple-50 rounded-lg border border-purple-100 flex flex-col justify-center">
                <div class="text-xs text-purple-500 uppercase font-bold tracking-wider">Transactions</div>
                <div class="text-3xl font-bold text-purple-800 mt-1">${summary.transactionCount}</div>
            </div>
            <div class="p-4 bg-green-50 rounded-lg border border-green-100 flex flex-col justify-center">
                <div class="text-xs text-green-500 uppercase font-bold tracking-wider">Gross Profit</div>
                <div class="text-3xl font-bold text-green-800 mt-1">₱${summary.grossProfit.toFixed(2)}</div>
            </div>
            <div class="p-4 bg-yellow-50 rounded-lg border border-yellow-100 flex flex-col justify-center">
                <div class="text-xs text-yellow-600 uppercase font-bold tracking-wider">Avg Ticket</div>
                <div class="text-3xl font-bold text-yellow-800 mt-1">₱${summary.avgTicket.toFixed(2)}</div>
            </div>
        </div>
    `;

    // Main Content
    contentContainer.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Payment Methods -->
            <div class="bg-white border rounded-lg shadow-sm p-6 flex flex-col">
                <h4 class="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center">
                    <svg class="w-5 h-5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                    Payment Methods
                </h4>
                <div class="flex-1 flex justify-center items-center min-h-[300px]">
                     <canvas id="chart-payment-methods" style="max-height: 300px;"></canvas>
                </div>
            </div>

            <!-- Top Categories -->
            <div class="bg-white border rounded-lg shadow-sm p-6 flex flex-col">
                 <h4 class="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center">
                    <svg class="w-5 h-5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
                    Sales by Category
                </h4>
                 <div class="flex-1 flex justify-center items-center min-h-[300px]">
                     <canvas id="chart-categories" style="max-height: 300px;"></canvas>
                </div>
            </div>
        </div>
    `;

    // Initialize Charts if Chart.js is available
    if (typeof Chart !== 'undefined') {
        const bgColors = [
            'rgb(59, 130, 246)', 'rgb(16, 185, 129)', 'rgb(245, 158, 11)', 'rgb(239, 68, 68)',
            'rgb(139, 92, 246)', 'rgb(236, 72, 153)', 'rgb(99, 102, 241)', 'rgb(20, 184, 166)'
        ];

        // destroy existing charts if strict mode, but we just rebuilt innerHTML so canvases are fresh

        // Payment Methods Chart
        new Chart(document.getElementById('chart-payment-methods'), {
            type: 'pie',
            data: {
                labels: Object.keys(paymentMethods),
                datasets: [{
                    data: Object.values(paymentMethods),
                    backgroundColor: bgColors,
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Category Chart
        const sortedCats = Object.entries(categorySales).sort((a, b) => b[1] - a[1]); // Top categories
        new Chart(document.getElementById('chart-categories'), {
            type: 'pie',
            data: {
                labels: sortedCats.map(x => x[0]),
                datasets: [{
                    data: sortedCats.map(x => x[1]),
                    backgroundColor: bgColors,
                    borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } else {
        contentContainer.innerHTML += `<div class="w-full text-center text-red-500 mt-4">Chart.js library not found. Charts cannot be displayed.</div>`;
    }
}

function renderShiftReports(data) {
    lastShiftData = data; // Cache for back navigation
    const { shifts, summary } = data;
    const metricsContainer = document.getElementById("report-metrics-container");
    const contentContainer = document.getElementById("report-modal-content");

    // Clear previous
    metricsContainer.innerHTML = "";
    contentContainer.innerHTML = "";

    if (!shifts || shifts.length === 0) {
        contentContainer.innerHTML = `<div class="p-10 text-center text-gray-500">No closed shifts found for this period.</div>`;
        return;
    }

    // Render Metrics (Fixed Top)
    metricsContainer.innerHTML = `
        <div class="grid grid-cols-3 gap-6 p-6">
            <div class="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col justify-center">
                <div class="text-xs text-blue-500 uppercase font-bold tracking-wider">Total Shifts</div>
                <div class="text-3xl font-bold text-blue-800 mt-1">${summary.totalShifts}</div>
            </div>
            <div class="p-4 bg-green-50 rounded-lg border border-green-100 flex flex-col justify-center">
                <div class="text-xs text-green-500 uppercase font-bold tracking-wider">Total Cashout</div>
                <div class="text-3xl font-bold text-green-800 mt-1">₱${summary.totalCashout.toFixed(2)}</div>
            </div>
            <div class="p-4 ${summary.totalVariance < 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} rounded-lg border flex flex-col justify-center">
                <div class="text-xs ${summary.totalVariance < 0 ? 'text-red-500' : 'text-gray-500'} uppercase font-bold tracking-wider">Net Variance</div>
                <div class="text-3xl font-bold ${summary.totalVariance < 0 ? 'text-red-800' : 'text-gray-800'} mt-1">₱${summary.totalVariance.toFixed(2)}</div>
            </div>
        </div>
    `;

    // Render Table (Scrollable)
    contentContainer.innerHTML = `
        <div class="overflow-hidden border border-gray-200 rounded-lg">
            <table class="min-w-full bg-white border border-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">Started</th>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                         <th class="py-2 px-4 border-b text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th class="py-2 px-4 border-b text-right text-xs font-semibold text-gray-600 uppercase">Expected</th>
                        <th class="py-2 px-4 border-b text-right text-xs font-semibold text-gray-600 uppercase">Actual</th>
                        <th class="py-2 px-4 border-b text-right text-xs font-semibold text-gray-600 uppercase">Variance</th>
                    </tr>
                </thead>
                <tbody class="text-sm divide-y divide-gray-100">
                    ${shifts.map(s => `
                        <tr class="hover:bg-blue-50 cursor-pointer transition-colors shift-row" data-id="${s.id}">
                            <td class="py-3 px-4 whitespace-nowrap">
                                <span class="block font-medium text-gray-800">${new Date(s.start_time).toLocaleDateString()}</span>
                                <span class="text-xs text-gray-500">${new Date(s.start_time).toLocaleTimeString()}</span>
                            </td>
                            <td class="py-3 px-4 text-gray-600">${s.user_id}</td>
                             <td class="py-3 px-4 text-center">
                                <span class="px-2 py-1 rounded-full text-xs font-bold ${s.status === 'closed' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'}">${s.status}</span>
                            </td>
                            <td class="py-3 px-4 text-right font-mono text-gray-600">₱${(s.expected_cash || 0).toFixed(2)}</td>
                            <td class="py-3 px-4 text-right font-mono font-bold">₱${(s.closing_cash || 0).toFixed(2)}</td>
                            <td class="py-3 px-4 text-right font-bold ${s.variance < 0 ? 'text-red-600' : (s.variance > 0 ? 'text-green-600' : 'text-gray-400')}">
                                ${s.variance > 0 ? '+' : ''}${s.variance.toFixed(2)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Attach Listeners
    contentContainer.querySelectorAll('.shift-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.getAttribute('data-id');
            renderShiftDetail(id);
        });
    });
}

async function renderShiftDetail(shiftId) {
    const shift = lastShiftData.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    // Fetch full shift object from DB to get adjustments/remittances not fully in summary if needed
    // But our worker payload 'shifts' was raw DB dump passed to worker logic, wait.
    // In Reportsv2: `const shifts = await db.shifts.toArray();`
    // Then worker processed it. `result.shifts` are lightweight mapped objects.
    // They basically contain what we need, including `adjustment_count` and `remittance_total`, 
    // but maybe not the actual arrays for the detail view?
    // Checking worker: `shifts.map(s => ({ ... adjustment_count ... }))`
    // Ah, the worker DOES NOT return the arrays.
    // So we need to fetch the single shift from DB again or pass it.
    // It's cleaner to fetch fresh from DB here.

    // We can't access `db` variable easily if it's not in scope of this function?
    // `db` is available in `Reportsv2.js` as imports usually? No, `Reportsv2.js` imports `dbPromise`.
    // Wait, `loadReportsView` imports `dbPromise` as `db`.
    // I need `db` here. 
    // Let's assume `db` is available or I need to use the imported `dbPromise`.
    // Actually, `Reportsv2.js` top-level code: `import { dbPromise as db } from '../db.js';` ?
    // No, `Reportsv2.js` does NOT have top level imports shown in previous Steps... 
    // Wait, let me check imports.
    // Step 443 showed imports: `import { dbPromise as db } from '../db.js';`. OK.

    const db = await dbPromise;
    const fullShift = await db.shifts.get(shiftId);
    if (!fullShift) {
        alert("Shift not found");
        return;
    }

    const metricsContainer = document.getElementById("report-metrics-container");
    const contentContainer = document.getElementById("report-modal-content");

    // Calculate Sales & Returns for Reconciliation
    const startTime = new Date(fullShift.start_time);
    const endTime = fullShift.end_time ? new Date(fullShift.end_time) : new Date();
    const userEmail = fullShift.user_id;

    // Fetch all transactions in range to filter for sales and exchanges
    const txs = await db.transactions
        .where('timestamp').between(startTime.toISOString(), endTime.toISOString(), true, true)
        .toArray();

    let calcSales = 0;
    let calcExchange = 0;

    txs.forEach(tx => {
        // Sales: Cash payments by this user
        if (tx.user_email === userEmail && !tx.is_voided && tx.payment_method === 'Cash') {
            calcSales += (tx.total_amount || 0);
        }

        // Exchanges: Processed by this user (check array)
        if (tx.exchanges && Array.isArray(tx.exchanges)) {
            tx.exchanges.forEach(exch => {
                const exchTime = new Date(exch.timestamp);
                if (exchTime >= startTime && exchTime <= endTime && exch.processed_by === userEmail) {
                    const returned = (exch.returned || []).reduce((s, i) => s + (i.selling_price * (i.qty || 1)), 0);
                    const taken = (exch.taken || []).reduce((s, i) => s + (i.selling_price * (i.qty || 1)), 0);
                    calcExchange += (taken - returned);
                }
            });
        }
    });

    const netAdjustments = (fullShift.adjustments || []).reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
    const calculatedExpected = (fullShift.opening_cash || 0) + calcSales + calcExchange + netAdjustments;

    // Detail Header (in Metrics Area)
    metricsContainer.innerHTML = `
        <div class="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <button id="btn-back-shifts" class="flex items-center text-gray-600 hover:text-blue-600 transition font-medium">
                <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                Back to List
            </button>
            <div class="text-right">
                <div class="text-sm text-gray-500">Shift ID: <span class="font-mono text-xs">${fullShift.id.slice(0, 8)}...</span></div>
                <div class="font-bold text-gray-800">${new Date(fullShift.start_time).toLocaleString()}</div>
            </div>
        </div>
        
        <!-- High Level Stats -->
        <div class="grid grid-cols-4 gap-4 p-4 text-center text-sm border-b border-gray-100">
             <div class="bg-blue-50 p-2 rounded border border-blue-100">
                <div class="text-xs text-gray-500 uppercase">Opening</div>
                <div class="font-bold text-blue-800">₱${(fullShift.opening_cash || 0).toFixed(2)}</div>
             </div>
             <div class="bg-gray-50 p-2 rounded border border-gray-200 relative group">
                <div class="text-xs text-gray-500 uppercase">Expected</div>
                <div class="font-bold text-gray-800">₱${(calculatedExpected).toFixed(2)}</div>
                <!-- Tooltip for Breakdown -->
                <div class="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 bg-gray-800 text-white text-xs rounded p-2 hidden group-hover:block z-20 shadow-lg text-left">
                    <div>Op: ₱${(fullShift.opening_cash || 0).toFixed(2)}</div>
                    <div>+ Sales: ₱${calcSales.toFixed(2)}</div>
                    <div>${calcExchange >= 0 ? '+' : '-'} Exch: ₱${Math.abs(calcExchange).toFixed(2)}</div>
                    <div>${netAdjustments >= 0 ? '+' : '-'} Adj: ₱${Math.abs(netAdjustments).toFixed(2)}</div>
                </div>
             </div>
             <div class="bg-gray-50 p-2 rounded border border-gray-200">
                <div class="text-xs text-gray-500 uppercase">Closing</div>
                <div class="font-bold text-gray-800">₱${(fullShift.closing_cash || 0).toFixed(2)}</div>
             </div>
             <div class="${(shift.variance < 0 ? 'bg-red-50 border-red-100 text-red-800' : 'bg-green-50 border-green-100 text-green-800')} p-2 rounded border">
                <div class="text-xs opacity-75 uppercase">Variance</div>
                <div class="font-bold">₱${(shift.variance || 0).toFixed(2)}</div>
             </div>
        </div>

        <!-- Detailed Reconciliation Bar -->
        <div class="grid grid-cols-3 gap-2 px-4 pb-4 text-center text-xs text-gray-600">
             <div class="flex items-center justify-center gap-2 bg-gray-50 rounded py-1 px-2 border border-gray-100">
                <span>Total Cash Sales:</span>
                <span class="font-bold text-gray-800">₱${calcSales.toFixed(2)}</span>
             </div>
             <div class="flex items-center justify-center gap-2 bg-gray-50 rounded py-1 px-2 border border-gray-100">
                <span>Net Returns/Exch:</span>
                <span class="font-bold ${calcExchange < 0 ? 'text-red-500' : 'text-green-600'}">₱${calcExchange.toFixed(2)}</span>
             </div>
             <div class="flex items-center justify-center gap-2 bg-gray-50 rounded py-1 px-2 border border-gray-100">
                <span>Net Adjustments:</span>
                <span class="font-bold ${netAdjustments < 0 ? 'text-red-500' : 'text-green-600'}">₱${netAdjustments.toFixed(2)}</span>
             </div>
        </div>
    `;

    // Detail Body (Adjustments & Remittances)
    const adjustments = fullShift.adjustments || [];
    const remittances = fullShift.remittances || [];

    contentContainer.innerHTML = `
        <div class="space-y-6">
            <!-- Adjustments -->
            <div class="border rounded-lg overflow-hidden">
                <div class="bg-gray-100 px-4 py-2 font-bold text-sm text-gray-700">Cash Adjustments</div>
                ${adjustments.length === 0 ? '<div class="p-4 text-center text-gray-500 text-sm">No adjustments.</div>' : `
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="py-2 px-4 text-left font-medium text-gray-500">Time</th>
                            <th class="py-2 px-4 text-left font-medium text-gray-500">Reason</th>
                            <th class="py-2 px-4 text-left font-medium text-gray-500">User</th>
                            <th class="py-2 px-4 text-right font-medium text-gray-500">Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${adjustments.map(a => `
                            <tr>
                                <td class="py-2 px-4 text-gray-600">${new Date(a.timestamp).toLocaleTimeString()}</td>
                                <td class="py-2 px-4 text-gray-800">${a.reason}</td>
                                <td class="py-2 px-4 text-gray-500">${a.user}</td>
                                <td class="py-2 px-4 text-right font-bold ${a.amount >= 0 ? 'text-green-600' : 'text-red-600'}">₱${Math.abs(a.amount).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>

            <!-- Remittances -->
             <div class="border rounded-lg overflow-hidden">
                <div class="bg-gray-100 px-4 py-2 font-bold text-sm text-gray-700">Remittances (Cash Out)</div>
                ${remittances.length === 0 ? '<div class="p-4 text-center text-gray-500 text-sm">No remittances.</div>' : `
                <table class="min-w-full text-sm">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="py-2 px-4 text-left font-medium text-gray-500">Time</th>
                            <th class="py-2 px-4 text-left font-medium text-gray-500">Reason</th>
                            <th class="py-2 px-4 text-left font-medium text-gray-500">User</th>
                            <th class="py-2 px-4 text-right font-medium text-gray-500">Amount</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${remittances.map(r => `
                            <tr>
                                <td class="py-2 px-4 text-gray-600">${new Date(r.timestamp).toLocaleTimeString()}</td>
                                <td class="py-2 px-4 text-gray-800">${r.reason}</td>
                                <td class="py-2 px-4 text-gray-500">${r.user}</td>
                                <td class="py-2 px-4 text-right font-bold text-purple-600">₱${r.amount.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>
            
            <!-- Receipts/Expenses Scan if any -->
             ${(fullShift.closing_receipts && fullShift.closing_receipts.length > 0) ? `
             <div class="border rounded-lg overflow-hidden">
                <div class="bg-gray-100 px-4 py-2 font-bold text-sm text-gray-700">Closing Expenses</div>
                <table class="min-w-full text-sm">
                    <tbody class="divide-y divide-gray-100">
                         ${fullShift.closing_receipts.map(r => `
                            <tr>
                                <td class="py-2 px-4 text-gray-800">${r.description || 'Expense'}</td>
                                <td class="py-2 px-4 text-right font-bold text-gray-800">₱${(r.amount || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
             </div>
             ` : ''}

        </div>
    `;

    document.getElementById("btn-back-shifts").addEventListener("click", () => {
        renderShiftReports(lastShiftData);
    });
}

function renderStockMovement(movements) {
    const metricsContainer = document.getElementById("report-metrics-container");
    const contentContainer = document.getElementById("report-modal-content");

    // Clear Metrics for this view (or add summary later)
    metricsContainer.innerHTML = "";
    contentContainer.innerHTML = "";

    if (!movements || movements.length === 0) {
        contentContainer.innerHTML = `<div class="p-10 text-center text-gray-500">No movements found for this period.</div>`;
        return;
    }

    // Check for limit warning (which we prepended before, but now we must handle carefully since we clear innerHTML)
    // The caller might modify DOM after this, but let's handle it purely. 
    // Actually, the caller codes: prepend(warning).
    // So we just set the main table here.

    contentContainer.innerHTML = `
        <div class="overflow-hidden border border-gray-200 rounded-lg">
            <table class="min-w-full bg-white">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">Input</th>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                        <th class="py-2 px-4 border-b text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                        <th class="py-2 px-4 border-b text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                    </tr>
                </thead>
                <tbody class="text-sm divide-y divide-gray-100">
                    ${movements.map(m => `
                        <tr class="hover:bg-gray-50">
                            <td class="py-2 px-4 text-gray-900 whitespace-nowrap">${new Date(m.timestamp).toLocaleString()}</td>
                             <td class="py-2 px-4">
                                <span class="px-2 py-1 rounded text-xs font-bold ${m.type === 'Sale' ? 'bg-green-100 text-green-800' :
            m.type === 'Return' ? 'bg-yellow-100 text-yellow-800' :
                m.type === 'Shrinkage' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
        }">${m.type}</span>
                            </td>
                            <td class="py-2 px-4 text-gray-700">${m.item_name || 'Unkown'} <span class="text-xs text-gray-400">(${m.item_id || '-'})</span></td>
                            <td class="py-2 px-4 text-right ${m.qty < 0 ? 'text-red-600' : 'text-green-600'} font-bold">${m.qty}</td>
                            <td class="py-2 px-4 text-gray-500">${m.reason || '-'}</td>
                             <td class="py-2 px-4 text-gray-500 text-xs">${m.user || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function closeReportModal() {
    document.getElementById("report-modal").classList.add("hidden");
    document.getElementById("report-metrics-container").innerHTML = "";
    document.getElementById("report-modal-content").innerHTML = "";
    currentModalReportId = null;
}
