import { checkPermission } from "../auth.js";
import { addNotification } from "../services/notification-service.js";
import { generateUUID, showToast } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";
import { loadStockCountView } from "./stock-count.js";

let itemsData = [];
let selectedItem = null;
let html5QrCode = null;
let lastUsedCamera = false;
let currentFacingMode = "environment";
let isTorchOn = true;

export async function loadStockCountMobileView() {
    // Temporary Debugger for iPad on Linux
    if (!window.erudaLoaded) {
        const script = document.createElement('script');
        script.src = "//cdn.jsdelivr.net/npm/eruda";
        document.body.appendChild(script);
        script.onload = () => { eruda.init(); window.erudaLoaded = true; };
    }

    const content = document.getElementById("main-content");
    
    content.innerHTML = `
        <div id="mobile-stock-container" class="p-4 max-w-md mx-auto bg-gray-50 min-h-screen font-sans">
            <!-- Header -->
            <div class="flex items-center justify-between mb-4">
                <button id="btn-back-to-desktop" class="text-blue-600 font-bold flex items-center p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back
                </button>
                <h2 class="text-xl font-bold text-gray-800">Mobile Audit</h2>
                <button id="btn-manual-sync" class="p-2 bg-white rounded shadow text-[10px] font-bold uppercase tracking-wider text-gray-600 border border-gray-200 active:bg-gray-50">Sync</button>
            </div>
            
            <div id="sync-status" class="text-[10px] text-right text-gray-400 mb-4 italic">Last synced: Just now</div>

            <!-- Search & Scan -->
            <div class="space-y-4">
                <div class="relative">
                    <input type="text" id="mobile-search" placeholder="Search name or barcode..." autocomplete="off" class="w-full p-4 border-2 border-gray-200 rounded-xl shadow-sm focus:border-blue-500 focus:ring-0 outline-none transition-all text-lg">
                    <div id="mobile-results" class="hidden absolute z-20 bg-white w-full border rounded-b-xl shadow-2xl max-h-80 overflow-y-auto mt-1"></div>
                </div>
                
                <button id="btn-open-scanner" class="w-full py-5 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Scan Barcode
                </button>
            </div>

            <!-- Scanner Container -->
            <div id="reader-container" class="hidden fixed inset-0 z-50 bg-black flex flex-col">
                <div id="reader" class="flex-1 w-full h-full"></div>
                
                <!-- Scanning Line Overlay -->
                <div class="absolute top-0 left-0 w-full h-1 bg-red-500 shadow-[0_0_10px_red] z-10 animate-scan-line pointer-events-none"></div>
                
                <div class="absolute top-6 left-6 flex flex-col gap-4 z-20">
                    <button id="btn-switch-camera" class="bg-blue-600/80 backdrop-blur text-white p-3 rounded-full shadow-lg" title="Switch Camera">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <button id="btn-toggle-torch" class="hidden bg-yellow-500/80 backdrop-blur text-white p-3 rounded-full shadow-lg" title="Toggle Flashlight">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </button>
                </div>
                
                <button id="btn-close-scanner" class="absolute top-6 right-6 bg-red-600/80 backdrop-blur text-white p-3 rounded-full shadow-lg z-20">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Adjustment Modal -->
            <div id="mobile-adj-modal" class="hidden fixed inset-0 z-30 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl transform transition-all">
                    <h3 id="m-adj-name" class="text-2xl font-bold text-gray-800 mb-1"></h3>
                    <p id="m-adj-barcode" class="text-sm text-gray-500 mb-6"></p>
                    
                    <div class="bg-blue-50 p-4 rounded-xl mb-6 flex justify-between items-center border border-blue-100">
                        <span class="text-blue-700 font-semibold">System Stock:</span>
                        <span id="m-adj-system" class="text-3xl font-black text-blue-900"></span>
                    </div>

                    <div class="mb-8">
                        <label class="block text-sm font-bold text-gray-600 mb-2 uppercase tracking-wide">Actual Physical Count</label>
                        <input type="number" id="m-adj-actual" inputmode="numeric" class="w-full p-5 text-5xl text-center font-bold border-2 border-blue-500 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all" placeholder="0">
                    </div>

                    <div class="flex gap-4">
                        <button id="btn-m-cancel" class="flex-1 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold active:bg-gray-200">Cancel</button>
                        <button id="btn-m-save" class="flex-1 py-4 bg-green-600 text-white rounded-xl font-bold shadow-lg active:bg-green-700">Record</button>
                    </div>
                </div>
            </div>

            <style>
                @keyframes scan-line {
                    0% { top: 35%; opacity: 0.3; }
                    50% { top: 50%; opacity: 1; }
                    100% { top: 65%; opacity: 0.3; }
                }
                .animate-scan-line { animation: scan-line 3s linear infinite; }
                #reader video { object-fit: cover !important; }
            </style>

            <!-- Success Overlay -->
            <div id="mobile-success-overlay" class="hidden fixed inset-0 z-40 bg-green-600 bg-opacity-95 flex flex-col items-center justify-center text-white p-6 text-center cursor-pointer">
                <div class="mb-6 bg-white bg-opacity-20 p-6 rounded-full animate-bounce">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 class="text-4xl font-black mb-2">Success!</h2>
                <p class="text-xl opacity-90 mb-12">Stock updated and synced.</p>
                <div class="px-8 py-4 border-2 border-white border-dashed rounded-xl animate-pulse">
                    <p class="text-lg font-bold uppercase tracking-widest">Tap to continue</p>
                </div>
            </div>
        </div>
    `;

    await fetchItems();
    setupEventListeners();
    updateSyncStatus();
}

async function fetchItems() {
    try {
        itemsData = await Repository.getAll('items');
        if (!Array.isArray(itemsData)) itemsData = [];
    } catch (error) {
        console.error("Error fetching items:", error);
    }
}

function updateSyncStatus() {
    const status = document.getElementById("sync-status");
    if (status) {
        status.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
    }
}

async function ensureScannerLib() {
    if (window.Html5Qrcode) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://unpkg.com/html5-qrcode";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById("mobile-search");
    const resultsDiv = document.getElementById("mobile-results");
    const btnOpenScanner = document.getElementById("btn-open-scanner");
    const btnSwitchCamera = document.getElementById("btn-switch-camera");
    const btnToggleTorch = document.getElementById("btn-toggle-torch");
    const btnCloseScanner = document.getElementById("btn-close-scanner");
    const btnBack = document.getElementById("btn-back-to-desktop");
    const btnSync = document.getElementById("btn-manual-sync");
    const btnCancel = document.getElementById("btn-m-cancel");
    const btnSave = document.getElementById("btn-m-save");
    const successOverlay = document.getElementById("mobile-success-overlay");

    btnBack.addEventListener("click", loadStockCountView);

    btnSync.addEventListener("click", async () => {
        btnSync.textContent = "Syncing...";
        await SyncEngine.sync();
        btnSync.textContent = "Sync";
        updateSyncStatus();
    });

    searchInput.addEventListener("input", () => {
        const term = searchInput.value.toLowerCase();
        resultsDiv.innerHTML = "";
        
        if (term.length < 2) {
            resultsDiv.classList.add("hidden");
            return;
        }

        const filtered = itemsData.filter(i => 
            (i.name || "").toLowerCase().includes(term) || 
            (i.barcode && i.barcode.includes(term))
        ).slice(0, 10);

        if (filtered.length > 0) {
            resultsDiv.classList.remove("hidden");
            filtered.forEach(item => {
                const div = document.createElement("div");
                div.className = "p-4 border-b last:border-b-0 active:bg-blue-50 flex justify-between items-center";
                div.innerHTML = `
                    <div>
                        <div class="font-bold text-gray-800">${item.name}</div>
                        <div class="text-xs text-gray-500">${item.barcode || 'No Barcode'}</div>
                    </div>
                    <div class="bg-gray-100 px-2 py-1 rounded text-sm font-mono">Qty: ${item.stock_level}</div>
                `;
                div.addEventListener("click", () => {
                    lastUsedCamera = false;
                    selectItem(item);
                });
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.classList.add("hidden");
        }
    });

    btnOpenScanner.addEventListener("click", async () => {
        lastUsedCamera = true;
        await startScanner();
    });

    btnSwitchCamera.addEventListener("click", async () => {
        currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
        await stopScanner();
        await startScanner();
    });

    btnToggleTorch.addEventListener("click", async () => {
        if (!html5QrCode) return;
        isTorchOn = !isTorchOn;
        await html5QrCode.applyVideoConstraints({
            advanced: [{ torch: isTorchOn }]
        });
    });

    btnCloseScanner.addEventListener("click", stopScanner);

    btnCancel.addEventListener("click", () => {
        document.getElementById("mobile-adj-modal").classList.add("hidden");
        selectedItem = null;
    });

    btnSave.addEventListener("click", async () => {
        const actual = parseInt(document.getElementById("m-adj-actual").value);
        if (isNaN(actual)) {
            alert("Please enter a valid number.");
            return;
        }
        await processAdjustment(actual, "Mobile Audit");
    });

    successOverlay.addEventListener("click", () => {
        successOverlay.classList.add("hidden");
        if (lastUsedCamera) {
            startScanner();
        } else {
            searchInput.value = "";
            searchInput.focus();
        }
    });
}

async function startScanner() {
    if (html5QrCode) return;

    let lastScannedUnknown = null;
    let lastScannedTime = 0;

    try {
        await ensureScannerLib();

        // iPad/Safari Requirement: Must be HTTPS or localhost
        if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            alert("Camera access requires an HTTPS connection on iPad/Mobile. Please check your URL.");
            return;
        }

        const container = document.getElementById("reader-container");
        container.classList.remove("hidden");
        document.getElementById("btn-open-scanner").classList.add("hidden");

        // Small delay to ensure DOM reflow on iPad before initializing hardware
        await new Promise(r => setTimeout(r, 100));
        
        // Constructor takes (elementId, verbose)
        html5QrCode = new Html5Qrcode("reader", false);
        
        const config = { 
            fps: 20, // Higher FPS for more responsive auto-detection
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                // 1D Optimized: Wide and short rectangle
                const width = Math.floor(viewfinderWidth * 0.85);
                const height = Math.floor(viewfinderHeight * 0.3);
                return { width: Math.max(width, 250), height: Math.max(height, 120) };
            },
            aspectRatio: 1.777778, // 16:9 aspect ratio is better for 1D barcodes
            disableFlip: true, // Mirroring isn't needed for barcodes and saves CPU
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.QR_CODE
            ]
        };
        
        const onScanSuccess = (decodedText) => {
            const item = itemsData.find(i => i.barcode === decodedText);
            if (item) {
                stopScanner();
                selectItem(item);
            } else {
                const now = Date.now();
                if (decodedText !== lastScannedUnknown || now - lastScannedTime > 3000) {
                    showToast(`Barcode "${decodedText}" detected but not found in system.`, 'info');
                    lastScannedUnknown = decodedText;
                    lastScannedTime = now;
                }
            }
        };

        // Use simple facingMode for maximum compatibility on iPad Safari
        await html5QrCode.start({ facingMode: currentFacingMode }, config, onScanSuccess);

        // Check for torch capability
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities.torch) {
            document.getElementById("btn-toggle-torch").classList.remove("hidden");
            if (isTorchOn) {
                await html5QrCode.applyVideoConstraints({
                    advanced: [{ torch: true }]
                });
            }
        }
    } catch (err) {
        console.error("Scanner error:", err);
        showToast(`Could not start camera (${currentFacingMode}). Try switching or check permissions.`, 'error');
        if (html5QrCode) {
            document.getElementById("btn-toggle-torch").classList.add("hidden");
            try { await html5QrCode.clear(); } catch(e) {}
            html5QrCode = null;
        }
        // We don't call stopScanner() here so the container stays open with the switch button
    }
}

async function stopScanner() {
    if (html5QrCode) {
        isTorchOn = true;
        try {
            await html5QrCode.stop();
        } catch (e) {}
        html5QrCode = null;
    }
    document.getElementById("btn-toggle-torch").classList.add("hidden");
    document.getElementById("reader-container").classList.add("hidden");
    document.getElementById("btn-open-scanner").classList.remove("hidden");
}

function selectItem(item) {
    selectedItem = item;
    document.getElementById("mobile-results").classList.add("hidden");
    document.getElementById("m-adj-name").textContent = item.name;
    document.getElementById("m-adj-barcode").textContent = item.barcode || "No Barcode";
    document.getElementById("m-adj-system").textContent = item.stock_level;
    document.getElementById("m-adj-actual").value = "";
    
    document.getElementById("mobile-adj-modal").classList.remove("hidden");
    setTimeout(() => document.getElementById("m-adj-actual").focus(), 300);
}

async function processAdjustment(newStock, reason) {
    if (!checkPermission("stock-count", "write")) {
        alert("No permission.");
        return;
    }

    try {
        const oldStock = selectedItem.stock_level;
        const difference = newStock - oldStock;
        const user = JSON.parse(localStorage.getItem('pos_user'))?.email || 'unknown';

        selectedItem.stock_level = newStock;
        selectedItem.sync_status = 'pending';
        selectedItem._updatedAt = Date.now();
        selectedItem._version = (selectedItem._version || 0) + 1;
        await Repository.upsert('items', selectedItem);

        const adjustment = {
            id: generateUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            old_stock: oldStock,
            new_stock: newStock,
            difference: difference,
            reason: reason,
            user: user,
            timestamp: new Date().toISOString(),
            sync_status: 'pending',
            _version: 1,
            _updatedAt: Date.now()
        };
        await Repository.upsert('adjustments', adjustment);

        const movement = {
            id: generateUUID(),
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            timestamp: new Date().toISOString(),
            type: 'Adjustment',
            qty: difference,
            user: user,
            reason: reason,
            sync_status: 'pending',
            _version: 1,
            _updatedAt: Date.now()
        };
        await Repository.upsert('stock_movements', movement);

        await SyncEngine.sync();
        updateSyncStatus();
        
        await addNotification('Stock Count', `Mobile adjustment for ${selectedItem.name}: ${difference > 0 ? '+' : ''}${difference} units`);

        document.getElementById("mobile-adj-modal").classList.add("hidden");
        document.getElementById("mobile-success-overlay").classList.remove("hidden");
        
        await fetchItems();
    } catch (error) {
        console.error("Adjustment error:", error);
        alert("Failed to save.");
    }
}