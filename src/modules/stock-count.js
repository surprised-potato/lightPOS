import { checkPermission } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID } from "../utils.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";

let itemsData = [];
let selectedItem = null;

export async function loadStockCountView() {
    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Side: Search and Audit Form -->
            <div class="lg:col-span-2">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">Stock Count (Audit)</h2>
                    <button id="btn-mobile-mode" class="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition transform hover:scale-105" title="Switch to Mobile View">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    </button>
                </div>
                
                <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-200">
                    <!-- Item Search & Sort -->
                    <div class="mb-6 flex flex-col sm:flex-row gap-4">
                        <div class="flex-1 relative">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Search Item to Audit</label>
                            <input type="text" id="audit-search" placeholder="Scan barcode or type name..." autocomplete="off" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div id="audit-results" class="hidden absolute z-10 bg-white border border-gray-300 mt-1 w-full rounded shadow-lg max-h-64 overflow-y-auto"></div>
                            <div class="mt-2">
                                <label class="inline-flex items-center text-sm text-gray-600 cursor-pointer">
                                    <input type="checkbox" id="audit-low-stock-only" class="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out">
                                    <span class="ml-2">Show Low Stock Only</span>
                                </label>
                            </div>
                        </div>
                        <div class="sm:w-48">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Sort By</label>
                            <select id="audit-sort" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="name">Name</option>
                                <option value="stock_level">Quantity</option>
                                <option value="_updatedAt">Modify Date</option>
                            </select>
                        </div>
                        <div class="sm:w-32">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Order</label>
                            <select id="audit-order" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="asc">Ascending</option>
                                <option value="desc">Descending</option>
                            </select>
                        </div>
                    </div>

                <!-- Selected Item Details -->
                <div id="audit-item-container" class="hidden mb-6 p-4 bg-yellow-50 rounded border border-yellow-200">
                    <h3 id="audit-name" class="font-bold text-lg text-yellow-800"></h3>
                    <p class="text-sm text-gray-600">Barcode: <span id="audit-barcode"></span></p>
                    <p class="text-sm text-gray-600">System Stock: <span id="audit-system-stock" class="font-bold text-lg"></span></p>
                </div>

                <!-- Adjustment Fields -->
                <div id="audit-form" class="hidden">
                    <div class="mb-4">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Actual Physical Count</label>
                        <input type="number" id="audit-actual" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    
                    <div class="mb-6">
                        <label class="block text-gray-700 text-sm font-bold mb-2">Reason for Adjustment</label>
                        <select id="audit-reason" class="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="Routine Audit">Routine Audit</option>
                            <option value="Spoilage/Damage">Spoilage / Damage</option>
                            <option value="Theft/Loss">Theft / Loss</option>
                            <option value="Correction">Data Entry Correction</option>
                        </select>
                    </div>

                    <div class="flex items-center justify-between">
                        <div id="audit-diff-display" class="text-sm font-bold text-gray-500">Difference: -</div>
                        <button id="btn-adjust" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
                            Confirm Adjustment
                        </button>
                    </div>
                </div>
                </div>
            </div>

            <!-- Right Side: Recent Adjustments History -->
            <div class="lg:col-span-1">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Recent Adjustments</h3>
                
                <div class="flex flex-wrap gap-2 mb-4 items-end bg-gray-50 p-2 rounded border border-gray-200">
                    <div class="flex-1 min-w-[80px]">
                        <label class="block text-[10px] font-bold text-gray-600">Start</label>
                        <input type="date" id="audit-history-start" class="w-full border rounded p-1 text-xs">
                    </div>
                    <div class="flex-1 min-w-[80px]">
                        <label class="block text-[10px] font-bold text-gray-600">End</label>
                        <input type="date" id="audit-history-end" class="w-full border rounded p-1 text-xs">
                    </div>
                    <div class="w-14">
                        <label class="block text-[10px] font-bold text-gray-600">Rows</label>
                        <input type="number" id="audit-history-limit" value="15" min="5" class="w-full border rounded p-1 text-xs">
                    </div>
                    <button id="btn-refresh-logs" class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-bold h-[26px]">Go</button>
                </div>

                <div class="bg-white shadow-md rounded overflow-hidden border border-gray-200">
                    <div class="overflow-x-auto">
                        <table class="min-w-full table-auto">
                            <thead>
                                <tr class="bg-gray-100 text-gray-600 uppercase text-[10px] leading-normal">
                                    <th class="py-2 px-3 text-left">Item</th>
                                    <th class="py-2 px-3 text-left">Mod. Date</th>
                                    <th class="py-2 px-3 text-right">Diff</th>
                                </tr>
                            </thead>
                            <tbody id="adjustment-logs-table-body" class="text-gray-600 text-xs font-light">
                                <tr><td colspan="2" class="py-3 px-6 text-center">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Mobile View Container -->
        <div id="mobile-view-container" class="fixed inset-0 bg-gray-100 z-50 hidden flex flex-col">
            <!-- Mobile Header -->
            <div class="bg-blue-600 p-4 flex justify-between items-center shadow-md z-20">
                <h2 class="text-white font-bold text-lg">Mobile Audit</h2>
                <button id="btn-exit-mobile" class="text-white p-2 hover:bg-blue-700 rounded-full">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- Mobile Search -->
            <div class="p-4 bg-white shadow-sm z-20">
                <div class="relative">
                    <input type="text" id="mobile-search-input" placeholder="Scan barcode or type..." class="w-full p-3 pl-10 border rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none" autocomplete="off">
                    <svg class="w-6 h-6 absolute left-3 top-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <div id="mobile-search-results" class="hidden absolute w-full bg-white border mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto z-30"></div>
                </div>
            </div>

            <!-- Camera Viewport -->
            <div class="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                <video id="mobile-camera-video" class="absolute inset-0 w-full h-full object-cover hidden" autoplay playsinline muted></video>
                
                <!-- Scanner Overlay -->
                <div id="scanner-overlay" class="absolute inset-0 border-2 border-red-500 opacity-50 z-10 hidden pointer-events-none">
                    <div class="absolute top-1/2 left-0 right-0 h-0.5 bg-red-600 shadow-[0_0_10px_rgba(255,0,0,0.8)]"></div>
                </div>

                <!-- Success Overlay -->
                <div id="scan-success-overlay" class="absolute inset-0 bg-green-500 opacity-0 z-30 pointer-events-none transition-opacity duration-300 flex items-center justify-center">
                    <svg class="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </div>

                <!-- Start Camera Button (Large & Prominent) -->
                <button id="btn-start-camera" class="z-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-6 shadow-2xl flex flex-col items-center justify-center transition transform active:scale-95">
                    <svg class="w-12 h-12 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 16h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                    <span class="font-bold text-sm uppercase tracking-wider">Scan</span>
                </button>

                <!-- Camera Controls -->
                <div id="camera-controls" class="absolute bottom-6 right-6 z-20 flex flex-col gap-4 hidden">
                    <button id="btn-switch-camera" class="bg-gray-800 bg-opacity-70 text-white p-3 rounded-full hover:bg-opacity-90 shadow-lg">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    </button>
                    <button id="btn-toggle-flash" class="bg-gray-800 bg-opacity-70 text-white p-3 rounded-full hover:bg-opacity-90 shadow-lg hidden">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </button>
                </div>
            </div>
        </div>

        <!-- Mobile Count Modal -->
        <div id="mobile-count-modal" class="fixed inset-0 bg-gray-900 bg-opacity-95 z-[60] hidden flex items-center justify-center p-4">
            <div class="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl">
                <h3 id="mobile-item-name" class="text-xl font-bold text-gray-800 mb-1"></h3>
                <p id="mobile-item-barcode" class="text-sm text-gray-500 mb-6 font-mono"></p>
                
                <label class="block text-sm font-bold text-gray-700 mb-2">Actual Count</label>
                <input type="number" id="mobile-count-input" class="w-full border-2 border-blue-500 rounded-lg p-4 text-3xl text-center font-bold focus:outline-none mb-6" inputmode="numeric" pattern="[0-9]*">
                
                <div class="grid grid-cols-2 gap-4">
                    <button id="btn-mobile-cancel" class="bg-gray-200 text-gray-800 font-bold py-3 rounded-lg hover:bg-gray-300">Cancel</button>
                    <button id="btn-mobile-confirm" class="bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700">Confirm</button>
                </div>
            </div>
        </div>

        <!-- Full Screen Notification -->
        <div id="mobile-notification" class="fixed inset-0 z-[70] hidden flex flex-col items-center justify-center text-center p-8 transition-colors duration-300">
            <div id="mobile-notif-icon" class="mb-4"></div>
            <h2 id="mobile-notif-title" class="text-4xl font-black text-white mb-2"></h2>
            <p id="mobile-notif-msg" class="text-white text-lg opacity-90"></p>
        </div>
    `;

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const lastMonth = new Date();
    lastMonth.setDate(lastMonth.getDate() - 30);
    document.getElementById('audit-history-start').value = lastMonth.toISOString().split('T')[0];
    document.getElementById('audit-history-end').value = today;

    await Promise.all([fetchItems(), fetchAdjustmentLogs()]);
    setupEventListeners();
    setupMobileEventListeners();
    // Auto-focus search on load
    setTimeout(() => document.getElementById("audit-search")?.focus(), 100);

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        const mobileContainer = document.getElementById("mobile-view-container");
        if (mobileContainer) {
            mobileContainer.classList.remove("hidden");
            document.getElementById("mobile-search-input")?.focus();
        }
    }
}

async function fetchItems() {
    try {
        itemsData = await Repository.getAll('items');
        if (!Array.isArray(itemsData)) itemsData = [];
    } catch (error) {
        console.error("Error fetching items:", error);
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById("audit-search");
    const resultsDiv = document.getElementById("audit-results");
    const sortSelect = document.getElementById("audit-sort");
    const orderSelect = document.getElementById("audit-order");
    const lowStockCheck = document.getElementById("audit-low-stock-only");
    const actualInput = document.getElementById("audit-actual");
    const btnAdjust = document.getElementById("btn-adjust");
    const canWrite = checkPermission("stock-count", "write");
    const btnRefreshLogs = document.getElementById("btn-refresh-logs");

    // Search & Sort Logic
    const performSearch = () => {
        const term = searchInput.value.toLowerCase();
        const sortBy = sortSelect.value;
        const order = orderSelect.value;
        const lowStockOnly = lowStockCheck.checked;
        
        resultsDiv.innerHTML = "";
        if (term.length < 1 && !lowStockOnly) {
            resultsDiv.classList.add("hidden");
            return;
        }

        let filtered = itemsData.filter(i => {
            const matchesTerm = term.length === 0 || 
                               (i.name || "").toLowerCase().includes(term) || 
                               (i.barcode && i.barcode.includes(term));
            const matchesLowStock = !lowStockOnly || (i.stock_level <= (i.min_stock || 10));
            return matchesTerm && matchesLowStock;
        });

        // Apply Sorting
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'stock_level') {
                comparison = (a.stock_level || 0) - (b.stock_level || 0);
            } else if (sortBy === '_updatedAt') {
                comparison = (a._updatedAt || 0) - (b._updatedAt || 0);
            }
            return order === 'asc' ? comparison : -comparison;
        });

        if (filtered.length > 0) {
            resultsDiv.classList.remove("hidden");
            filtered.forEach((item, index) => {
                const div = document.createElement("div");
                div.className = "p-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm flex justify-between items-center focus:bg-blue-100 focus:outline-none";
                div.setAttribute("tabindex", "0");
                div.innerHTML = `
                    <div>
                        <div class="font-bold">${item.name}</div>
                        <div class="text-xs text-gray-500">${item.barcode || 'No Barcode'}</div>
                    </div>
                    <div class="text-xs font-mono bg-gray-100 px-1 rounded">Qty: ${item.stock_level}</div>
                `;
                
                const selectAction = () => selectItem(item);
                div.addEventListener("click", selectAction);
                
                div.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        selectAction();
                    } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        const next = div.nextElementSibling;
                        if (next && next.getAttribute("tabindex")) next.focus();
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        const prev = div.previousElementSibling;
                        if (prev && prev.getAttribute("tabindex")) prev.focus();
                        else searchInput.focus();
                    }
                });
                
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.classList.add("hidden");
        }
    };

    searchInput.addEventListener("input", performSearch);
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            const first = resultsDiv.querySelector("div[tabindex='0']");
            if (first) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    searchInput.addEventListener("blur", () => setTimeout(() => {
        if (!resultsDiv.contains(document.activeElement)) resultsDiv.classList.add("hidden");
    }, 200));

    sortSelect.addEventListener("change", performSearch);
    orderSelect.addEventListener("change", performSearch);
    lowStockCheck.addEventListener("change", performSearch);

    // Calculate Difference Live
    actualInput.addEventListener("input", () => {
        if (!selectedItem) return;
        const actual = parseInt(actualInput.value) || 0;
        const diff = actual - selectedItem.stock_level;
        const diffDisplay = document.getElementById("audit-diff-display");
        diffDisplay.textContent = `Difference: ${diff > 0 ? '+' : ''}${diff}`;
        diffDisplay.className = `text-sm font-bold ${diff === 0 ? 'text-gray-500' : (diff < 0 ? 'text-red-500' : 'text-green-500')}`;
    });

    // Confirm on Enter
    actualInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            btnAdjust.click();
        }
    });

    // Submit
    btnAdjust.addEventListener("click", async () => {
        if (!canWrite) {
            alert("You do not have permission to adjust stock.");
            return;
        }

        if (!selectedItem) return;
        const actual = parseInt(actualInput.value);
        const reason = document.getElementById("audit-reason").value;
        
        if (isNaN(actual)) {
            alert("Please enter a valid count.");
            return;
        }

        if (actual === selectedItem.stock_level && !confirm("Count matches system stock. Log audit anyway?")) {
            return;
        }

        await processAdjustment(actual, reason);
    });

    btnRefreshLogs?.addEventListener("click", fetchAdjustmentLogs);
}

let mobileStream = null;
let isCameraRunning = false;
let barcodeDetector = null;
let scanDebounce = false;

function setupMobileEventListeners() {
    const btnMobileMode = document.getElementById("btn-mobile-mode");
    const mobileContainer = document.getElementById("mobile-view-container");
    const btnExitMobile = document.getElementById("btn-exit-mobile");
    const btnStartCamera = document.getElementById("btn-start-camera");
    const btnSwitchCamera = document.getElementById("btn-switch-camera");
    const btnToggleFlash = document.getElementById("btn-toggle-flash");
    const mobileSearch = document.getElementById("mobile-search-input");
    const mobileResults = document.getElementById("mobile-search-results");
    const btnMobileCancel = document.getElementById("btn-mobile-cancel");
    const btnMobileConfirm = document.getElementById("btn-mobile-confirm");
    const mobileCountInput = document.getElementById("mobile-count-input");

    // Toggle Mobile View
    btnMobileMode.addEventListener("click", () => {
        mobileContainer.classList.remove("hidden");
        mobileSearch.focus();
    });

    btnExitMobile.addEventListener("click", () => {
        stopCamera();
        mobileContainer.classList.add("hidden");
    });

    // Camera Controls
    btnStartCamera.addEventListener("click", startCamera);
    btnSwitchCamera.addEventListener("click", switchCamera);
    btnToggleFlash.addEventListener("click", toggleFlash);

    // Mobile Search
    mobileSearch.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        
        // Exact Match Logic
        const exactMatch = itemsData.find(i => i.barcode === term);
        if (exactMatch) {
            openMobileModal(exactMatch);
            mobileSearch.value = "";
            mobileResults.classList.add("hidden");
            return;
        }

        if (term.length < 2) {
            mobileResults.classList.add("hidden");
            return;
        }

        const filtered = itemsData.filter(i => 
            (i.name || "").toLowerCase().includes(term) || 
            (i.barcode || "").includes(term)
        ).slice(0, 10);

        mobileResults.innerHTML = filtered.map(item => `
            <div class="p-3 border-b hover:bg-gray-100 cursor-pointer mobile-result-item" data-id="${item.id}">
                <div class="font-bold text-gray-800">${item.name}</div>
                <div class="text-xs text-gray-500">${item.barcode || 'No Barcode'}</div>
            </div>
        `).join('');
        
        if (filtered.length > 0) mobileResults.classList.remove("hidden");
        else mobileResults.classList.add("hidden");

        mobileResults.querySelectorAll(".mobile-result-item").forEach(el => {
            el.addEventListener("click", () => {
                const item = itemsData.find(i => i.id === el.dataset.id);
                if (item) openMobileModal(item);
                mobileSearch.value = "";
                mobileResults.classList.add("hidden");
            });
        });
    });

    // Modal Actions
    btnMobileCancel.addEventListener("click", () => {
        document.getElementById("mobile-count-modal").classList.add("hidden");
        if (isCameraRunning) {
            scanDebounce = false; // Re-enable scanning
        } else {
            mobileSearch.focus();
        }
    });

    btnMobileConfirm.addEventListener("click", async () => {
        const count = parseInt(mobileCountInput.value);
        if (isNaN(count)) return;
        
        const itemId = document.getElementById("mobile-count-modal").dataset.itemId;
        const item = itemsData.find(i => i.id === itemId);
        
        if (item) {
            // Check discrepancy
            const diff = count - item.stock_level;
            let notifType = 'success';
            let msg = 'Count Matches System';
            
            if (diff !== 0) {
                notifType = 'warning';
                msg = `Discrepancy Recorded: ${diff > 0 ? '+' : ''}${diff}`;
            }

            // Process Adjustment
            selectedItem = item; // Set global selectedItem for processAdjustment
            await processAdjustment(count, "Routine Audit (Mobile)");
            
            document.getElementById("mobile-count-modal").classList.add("hidden");
            showMobileNotification(notifType, msg);
            
            setTimeout(() => {
                document.getElementById("mobile-notification").classList.add("hidden");
                if (isCameraRunning) {
                    scanDebounce = false;
                } else {
                    mobileSearch.focus();
                }
            }, 2000);
        }
    });
}

async function startCamera() {
    if (isCameraRunning) return;
    
    const video = document.getElementById("mobile-camera-video");
    const btnStart = document.getElementById("btn-start-camera");
    const controls = document.getElementById("camera-controls");
    const overlay = document.getElementById("scanner-overlay");

    try {
        // Check for BarcodeDetector support
        if ('BarcodeDetector' in window) {
            barcodeDetector = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']
            });
        } else {
            console.warn("BarcodeDetector not supported");
        }

        const savedFacingMode = localStorage.getItem('stock_camera_facing') || 'environment';
        
        mobileStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: savedFacingMode }
        });
        
        video.srcObject = mobileStream;
        video.classList.remove("hidden");
        btnStart.classList.add("hidden");
        controls.classList.remove("hidden");
        overlay.classList.remove("hidden");
        
        isCameraRunning = true;
        scanDebounce = false;
        requestAnimationFrame(scanLoop);

        // Check flash capability
        const track = mobileStream.getVideoTracks()[0];
        if (track && track.getCapabilities) {
            const capabilities = track.getCapabilities();
            if (capabilities.torch) {
                const btnFlash = document.getElementById("btn-toggle-flash");
                btnFlash.classList.remove("hidden");
                
                try {
                    await track.applyConstraints({ advanced: [{ torch: true }] });
                    btnFlash.classList.remove("text-white");
                    btnFlash.classList.add("text-yellow-400");
                } catch (e) {
                    console.warn("Failed to enable flash by default:", e);
                }
            }
        }

    } catch (err) {
        console.error("Camera error:", err);
        alert("Could not access camera.");
    }
}

function stopCamera() {
    if (mobileStream) {
        mobileStream.getTracks().forEach(track => track.stop());
        mobileStream = null;
    }
    isCameraRunning = false;
    document.getElementById("mobile-camera-video").classList.add("hidden");
    document.getElementById("btn-start-camera").classList.remove("hidden");
    document.getElementById("camera-controls").classList.add("hidden");
    document.getElementById("scanner-overlay").classList.add("hidden");
    
    const btnFlash = document.getElementById("btn-toggle-flash");
    btnFlash.classList.add("hidden");
    btnFlash.classList.remove("text-yellow-400");
    btnFlash.classList.add("text-white");
}

async function switchCamera() {
    stopCamera();
    const current = localStorage.getItem('stock_camera_facing') || 'environment';
    const next = current === 'environment' ? 'user' : 'environment';
    localStorage.setItem('stock_camera_facing', next);
    await startCamera();
}

async function toggleFlash() {
    if (mobileStream) {
        const track = mobileStream.getVideoTracks()[0];
        if (track && track.getCapabilities) {
            const capabilities = track.getCapabilities();
            if (capabilities.torch) {
                const current = track.getSettings().torch;
                await track.applyConstraints({ advanced: [{ torch: !current }] });
                const btn = document.getElementById("btn-toggle-flash");
                if (!current) {
                    btn.classList.remove("text-white");
                    btn.classList.add("text-yellow-400");
                } else {
                    btn.classList.add("text-white");
                    btn.classList.remove("text-yellow-400");
                }
            }
        }
    }
}

async function scanLoop() {
    if (!isCameraRunning) return;
    
    const video = document.getElementById("mobile-camera-video");
    
    // Robust check: If DOM element is gone (navigation), stop loop to prevent errors
    if (!video) {
        isCameraRunning = false;
        return;
    }
    
    if (barcodeDetector && !scanDebounce && video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                handleScannedCode(code);
            }
        } catch (e) {
            // Ignore detection errors
        }
    }
    
    if (isCameraRunning) {
        requestAnimationFrame(scanLoop);
    }
}

async function handleScannedCode(code) {
    if (scanDebounce) return;
    scanDebounce = true;
    
    // Defensive check for itemsData
    const safeItems = Array.isArray(itemsData) ? itemsData : [];
    const item = safeItems.find(i => i.barcode === code);
    
    if (item) {
        playBeep();
        const overlay = document.getElementById("scan-success-overlay");
        if (overlay) {
            overlay.classList.remove("opacity-0");
            overlay.classList.add("opacity-75");
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (overlay) {
            overlay.classList.remove("opacity-75");
            overlay.classList.add("opacity-0");
        }
        openMobileModal(item);
    } else {
        showMobileNotification('error', `Item Not Found: ${code}`);
        setTimeout(() => {
            const notif = document.getElementById("mobile-notification");
            if (notif) notif.classList.add("hidden");
            scanDebounce = false;
        }, 2000);
    }
}

function openMobileModal(item) {
    const modal = document.getElementById("mobile-count-modal");
    document.getElementById("mobile-item-name").textContent = item.name;
    document.getElementById("mobile-item-barcode").textContent = item.barcode;
    document.getElementById("mobile-count-input").value = "";
    modal.dataset.itemId = item.id;
    modal.classList.remove("hidden");
    document.getElementById("mobile-count-input").focus();
}

function showMobileNotification(type, msg) {
    const notif = document.getElementById("mobile-notification");
    const title = document.getElementById("mobile-notif-title");
    const message = document.getElementById("mobile-notif-msg");
    const icon = document.getElementById("mobile-notif-icon");

    notif.className = "fixed inset-0 z-[70] flex flex-col items-center justify-center text-center p-8 transition-colors duration-300";
    
    if (type === 'success') {
        notif.classList.add("bg-green-600");
        title.textContent = "Success";
        icon.innerHTML = `<svg class="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (type === 'warning') {
        notif.classList.add("bg-yellow-600");
        title.textContent = "Discrepancy";
        icon.innerHTML = `<svg class="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    } else {
        notif.classList.add("bg-red-600");
        title.textContent = "Error";
        icon.innerHTML = `<svg class="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
    }

    message.textContent = msg;
    notif.classList.remove("hidden");
}

function selectItem(item) {
    selectedItem = item;
    document.getElementById("audit-search").value = item.name;
    document.getElementById("audit-results").classList.add("hidden");
    
    document.getElementById("audit-item-container").classList.remove("hidden");
    document.getElementById("audit-form").classList.remove("hidden");
    
    document.getElementById("audit-name").textContent = item.name;
    document.getElementById("audit-barcode").textContent = item.barcode;
    document.getElementById("audit-system-stock").textContent = item.stock_level;
    
    document.getElementById("audit-actual").value = "";
    document.getElementById("audit-diff-display").textContent = "Difference: -";
    document.getElementById("audit-actual").focus();

    if (!checkPermission("stock-count", "write")) {
        document.getElementById("btn-adjust").disabled = true;
        document.getElementById("btn-adjust").classList.add("opacity-50", "cursor-not-allowed");
    }
}

async function processAdjustment(newStock, reason) {
    try {
        const oldStock = selectedItem.stock_level;
        const difference = newStock - oldStock;
        const user = JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown';

        // 1. Update local item stock
        selectedItem.stock_level = newStock;
        await Repository.upsert('items', selectedItem);

        // 2. Log to adjustments locally
        const adjustment = {
            id: generateUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            old_stock: oldStock,
            new_stock: newStock,
            difference: difference,
            reason: reason,
            user: user,
            timestamp: new Date().toISOString()
        };
        await Repository.upsert('adjustments', adjustment);

        // 3. Record Stock Movement Locally
        const movement = {
            id: generateUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            timestamp: new Date().toISOString(),
            type: 'Adjustment',
            qty: difference,
            user: user,
            reason: reason
        };
        await Repository.upsert('stock_movements', movement);

        // 4. Sync with Server
        SyncEngine.sync();

        await addNotification('Stock Count', `Stock adjustment for ${selectedItem.name}: ${difference > 0 ? '+' : ''}${difference} units by ${user}`);

        alert("Stock adjusted successfully.");
        
        // Reset
        const searchInput = document.getElementById("audit-search");
        searchInput.value = "";
        document.getElementById("audit-item-container").classList.add("hidden");
        document.getElementById("audit-form").classList.add("hidden");
        selectedItem = null;
        
        await Promise.all([fetchItems(), fetchAdjustmentLogs()]);
        searchInput.focus();

    } catch (error) {
        console.error("Error adjusting stock:", error);
        alert("Failed to adjust stock.");
    }
}

async function fetchAdjustmentLogs() {
    const tbody = document.getElementById("adjustment-logs-table-body");
    try {
        let logs = await Repository.getAll('adjustments');

        const startStr = document.getElementById('audit-history-start').value;
        const endStr = document.getElementById('audit-history-end').value;
        const limit = parseInt(document.getElementById('audit-history-limit').value) || 15;

        if (startStr && endStr) {
            const startDate = new Date(startStr);
            const endDate = new Date(endStr);
            endDate.setHours(23, 59, 59, 999);
            logs = logs.filter(l => {
                const d = new Date(l.timestamp);
                return d >= startDate && d <= endDate;
            });
        }

        // Sort by timestamp descending and take top 15 for the sidebar
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        logs = logs.slice(0, limit);
        
        tbody.innerHTML = "";
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="py-3 px-6 text-center">No history found.</td></tr>`;
            return;
        }

        logs.forEach(data => {
            const dateObj = new Date(data.timestamp);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const diffClass = data.difference > 0 ? "text-green-600" : (data.difference < 0 ? "text-red-600" : "text-gray-600");
            const diffSign = data.difference > 0 ? "+" : "";
            
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-2 px-3 text-left font-medium text-gray-800 truncate max-w-[100px]" title="${data.item_name}">${data.item_name}</td>
                <td class="py-2 px-3 text-left text-[10px] text-gray-400">
                    <div>${dateStr}</div>
                    <div class="text-[9px] opacity-75">${timeStr}</div>
                </td>
                <td class="py-2 px-3 text-right font-bold ${diffClass}">${diffSign}${data.difference}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error fetching logs:", error);
        tbody.innerHTML = `<tr><td colspan="2" class="py-3 px-6 text-center text-red-500">Error loading history.</td></tr>`;
    }
}

let audioCtx = null;
function playBeep(freq = 880, dur = 0.1, type = 'sine') {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
    } catch (e) { console.warn("Audio feedback failed", e); }
}