import { checkPermission } from "../auth.js";
import { renderHeader } from "../layout.js";
import { db } from "../db.js";
import { generateUUID } from "../utils.js";
import { Repository } from "../services/Repository.js";
import { SyncEngine } from "../services/SyncEngine.js";

const API_URL = 'api/sync.php';
// The router.php endpoint is a simple file-based store used for administrative
// tasks like full backup and restore, which are not part of the delta sync flow.
const ADMIN_API_URL = 'api/router.php';

export async function loadSettingsView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("settings", "write");
    const canMigrate = checkPermission("migrate", "write");

    content.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">System Settings</h2>

            <!-- Tab Navigation -->
            <div class="border-b border-gray-200 mb-6">
                <nav class="flex -mb-px space-x-8">
                    <button data-tab="store" class="settings-tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Store Info</button>
                    <button data-tab="tax" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Tax Settings</button>
                    <button data-tab="rewards" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Rewards & Loyalty</button>
                    <button data-tab="advanced" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Advanced</button>
                    <button data-tab="sync" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Sync History</button>
                    ${canMigrate ? '<button data-tab="migration" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Data Migration</button>' : ''}
                </nav>
            </div>

            <form id="form-settings">
                <!-- Store Tab -->
                <div id="settings-tab-store" class="settings-panel space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Store Identity</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Store Name</label>
                                <input type="text" id="set-store-name" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Store Logo</label>
                                <div class="flex items-center gap-4">
                                    <div id="logo-preview" class="w-16 h-16 border rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                                        <span class="text-gray-400 text-[10px]">No Logo</span>
                                    </div>
                                    <input type="file" id="set-store-logo-file" accept="image/*" class="text-xs">
                                    <input type="hidden" id="set-store-logo-base64">
                                </div>
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-bold text-gray-700 mb-2">Store Address / Contact</label>
                                <textarea id="set-store-data" rows="3" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Address, Phone, TIN..."></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tax Tab -->
                <div id="settings-tab-tax" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Taxation (E-VAT)</h3>
                        <div class="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                            <p class="text-xs text-blue-800">
                                <strong>Note:</strong> All prices in the system (Cost and Selling) are treated as <strong>Tax Inclusive</strong>. 
                                The rate below is used to extract the tax component for reporting.
                            </p>
                        </div>
                        <div class="max-w-xs">
                            <label class="block text-sm font-bold text-gray-700 mb-2">VAT Rate (%)</label>
                            <div class="flex items-center gap-2">
                                <input type="number" id="set-tax-rate" step="0.01" min="0" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-right">
                                <span class="font-bold text-gray-500">%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Rewards Tab -->
                <div id="settings-tab-rewards" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Loyalty Program</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">Points Earning Ratio</label>
                                <div class="flex items-center gap-2">
                                    <span class="text-sm text-gray-500">1 Point per every ₱</span>
                                    <input type="number" id="set-reward-ratio" step="1" min="1" class="w-24 border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-right">
                                    <span class="text-sm text-gray-500">spent</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Advanced Tab -->
                <div id="settings-tab-advanced" class="settings-panel hidden space-y-6">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div class="lg:col-span-2 space-y-6">
                            <div class="bg-white p-6 rounded-lg shadow-sm border">
                                <h3 class="text-lg font-bold mb-4">Receipt Designer</h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Paper Width (mm)</label>
                                        <input type="number" id="set-print-width" class="w-full border rounded p-2 text-sm">
                                    </div>
                                    <div class="flex items-end pb-2">
                                        <label class="inline-flex items-center cursor-pointer">
                                            <input type="checkbox" id="set-print-show-dividers" class="form-checkbox h-4 w-4 text-blue-600">
                                            <span class="ml-2 text-xs font-bold text-gray-700">Show Dividers (Dashed Lines)</span>
                                        </label>
                                    </div>
                                </div>

                                <!-- Header Section -->
                                <div class="border-t pt-4 mt-4">
                                    <h4 class="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wider">Header Section</h4>
                                    <div class="space-y-3">
                                        <div>
                                            <label class="block text-[10px] font-bold text-gray-500 uppercase">Custom Header Text (Overrides Store Info)</label>
                                            <textarea id="set-print-header-text" rows="2" class="w-full border rounded p-2 text-sm" placeholder="Leave blank to use Store Name & Address"></textarea>
                                        </div>
                                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            <div>
                                                <label class="block text-[10px] font-bold text-gray-500 uppercase">Size (px)</label>
                                                <input type="number" id="set-print-header-size" class="w-full border rounded p-1 text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold text-gray-500 uppercase">Font</label>
                                                <select id="set-print-header-font" class="w-full border rounded p-1 text-sm">
                                                    <option value="'Courier New', Courier, monospace">Courier New</option>
                                                    <option value="Arial, sans-serif">Arial</option>
                                                    <option value="'Times New Roman', serif">Times New Roman</option>
                                                </select>
                                            </div>
                                            <div class="flex items-center gap-2 pt-4">
                                                <label class="inline-flex items-center"><input type="checkbox" id="set-print-header-bold" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Bold</span></label>
                                                <label class="inline-flex items-center"><input type="checkbox" id="set-print-header-italic" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Italic</span></label>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Body Section -->
                                <div class="border-t pt-4 mt-4">
                                    <h4 class="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wider">Body Section (General Text)</h4>
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div>
                                            <label class="block text-[10px] font-bold text-gray-500 uppercase">Size (px)</label>
                                            <input type="number" id="set-print-body-size" class="w-full border rounded p-1 text-sm">
                                        </div>
                                        <div>
                                            <label class="block text-[10px] font-bold text-gray-500 uppercase">Font</label>
                                            <select id="set-print-body-font" class="w-full border rounded p-1 text-sm">
                                                <option value="'Courier New', Courier, monospace">Courier New</option>
                                                <option value="Arial, sans-serif">Arial</option>
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2 pt-4">
                                            <label class="inline-flex items-center"><input type="checkbox" id="set-print-body-bold" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Bold</span></label>
                                            <label class="inline-flex items-center"><input type="checkbox" id="set-print-body-italic" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Italic</span></label>
                                        </div>
                                    </div>
                                </div>

                                <!-- Items Section -->
                                <div class="border-t pt-4 mt-4">
                                    <h4 class="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wider">Items List Section</h4>
                                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div>
                                            <label class="block text-[10px] font-bold text-gray-500 uppercase">Size (px)</label>
                                            <input type="number" id="set-print-items-size" class="w-full border rounded p-1 text-sm">
                                        </div>
                                        <div>
                                            <label class="block text-[10px] font-bold text-gray-500 uppercase">Font</label>
                                            <select id="set-print-items-font" class="w-full border rounded p-1 text-sm">
                                                <option value="'Courier New', Courier, monospace">Courier New</option>
                                                <option value="Arial, sans-serif">Arial</option>
                                            </select>
                                        </div>
                                        <div class="flex items-center gap-2 pt-4">
                                            <label class="inline-flex items-center"><input type="checkbox" id="set-print-items-bold" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Bold</span></label>
                                            <label class="inline-flex items-center"><input type="checkbox" id="set-print-items-italic" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Italic</span></label>
                                        </div>
                                    </div>
                                </div>

                                <!-- Footer Section -->
                                <div class="border-t pt-4 mt-4">
                                    <h4 class="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wider">Footer Section</h4>
                                    <div class="space-y-3">
                                        <div>
                                            <label class="block text-[10px] font-bold text-gray-500 uppercase">Footer Text</label>
                                            <textarea id="set-print-footer-text" rows="2" class="w-full border rounded p-2 text-sm"></textarea>
                                        </div>
                                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            <div>
                                                <label class="block text-[10px] font-bold text-gray-500 uppercase">Size (px)</label>
                                                <input type="number" id="set-print-footer-size" class="w-full border rounded p-1 text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold text-gray-500 uppercase">Font</label>
                                                <select id="set-print-footer-font" class="w-full border rounded p-1 text-sm">
                                                    <option value="'Courier New', Courier, monospace">Courier New</option>
                                                    <option value="Arial, sans-serif">Arial</option>
                                                </select>
                                            </div>
                                            <div class="flex items-center gap-2 pt-4">
                                                <label class="inline-flex items-center"><input type="checkbox" id="set-print-footer-bold" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Bold</span></label>
                                                <label class="inline-flex items-center"><input type="checkbox" id="set-print-footer-italic" class="form-checkbox h-3 w-3"><span class="ml-1 text-[10px]">Italic</span></label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-6">
                            <div class="bg-white p-6 rounded-lg shadow-sm border">
                                <h3 class="text-lg font-bold mb-4">Shift Settings</h3>
                                <div class="max-w-xs">
                                    <label class="block text-sm font-bold text-gray-700 mb-2">Discrepancy Alert Threshold (₱)</label>
                                    <input type="number" id="set-shift-threshold" step="0.01" min="0" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0.00">
                                    <p class="text-[10px] text-gray-500 mt-1">Triggers a system notification if the closing discrepancy exceeds this amount.</p>
                                </div>
                                <div class="mt-4">
                                    <label class="inline-flex items-center cursor-pointer">
                                        <input type="checkbox" id="set-auto-print" class="form-checkbox h-5 w-5 text-blue-600">
                                        <span class="ml-2 text-sm font-bold text-gray-700">Auto-print receipt after payment</span>
                                    </label>
                        </div>
                        <div class="mt-6 pt-6 border-t">
                            <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Developer Tools</h4>
                            <button type="button" id="btn-run-tests" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition text-sm shadow-sm">Run Sync Architecture Tests</button>
                            <button type="button" id="btn-diagnostic-export" class="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition text-sm shadow-sm">Export Diagnostic Report</button>
                            <p class="text-[10px] text-gray-400 mt-1">Verifies Outbox, LWW Conflict Resolution, and Web Locks.</p>
                                </div>
                            </div>

                            <div class="bg-white p-6 rounded-lg shadow-sm border border-red-100">
                                <h3 class="text-lg font-bold mb-4 text-red-600">Danger Zone</h3>
                                <p class="text-sm text-gray-600 mb-4">This will permanently delete all transactions, items, and history from the server and local database. Users will be preserved.</p>
                                <button type="button" id="btn-nuclear-reset" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition">Wipe All Data</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Migration Tab -->
                ${canMigrate ? `
                <div id="settings-tab-migration" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold text-gray-700 mb-4">Backup & Restore</h3>
                        <p class="text-sm text-gray-600 mb-4">Download a full backup of your system data (items, transactions, settings, etc.) or restore from a previous backup file.</p>
                        <div class="flex flex-wrap gap-4">
                            <button type="button" id="btn-download-backup-server" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded focus:outline-none shadow transition">
                                📥 Backup from Server
                            </button>
                            <button type="button" id="btn-download-backup-local" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded focus:outline-none shadow transition">
                                📥 Backup from Local
                            </button>
                            <div class="flex items-center gap-2">
                                <input type="file" id="restore-file" class="hidden" accept=".json">
                                <button type="button" id="btn-trigger-restore" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-6 rounded focus:outline-none shadow transition">
                                    📤 Restore from Backup
                                </button>
                            </div>
                        </div>
                        <div class="mt-3 mb-1">
                            <label class="inline-flex items-center cursor-pointer select-none">
                                <input type="checkbox" id="restore-dry-run" class="form-checkbox h-4 w-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500">
                                <span class="ml-2 text-sm text-gray-700 font-medium">Simulate Restore (Dry Run)</span>
                            </label>
                        </div>
                        <p class="text-[10px] text-red-500 mt-2 font-bold italic">⚠️ Warning: Restoring from a backup will overwrite all current data on the server.</p>
                        
                        <div id="restore-progress-container" class="hidden mt-4">
                            <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                                <div id="restore-progress-bar" class="bg-orange-600 h-2.5 rounded-full" style="width: 0%"></div>
                            </div>
                            <p id="restore-progress-text" class="text-xs text-gray-600 text-center">Preparing restore...</p>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <div class="mb-6">
                            <h3 class="text-lg font-bold text-gray-700 mb-2">Bulk Import Items</h3>
                            <p class="text-sm text-gray-600 mb-4">Upload a JSON or CSV file containing your item master list. This will add new items to your inventory.</p>
                            
                            <div class="flex flex-col gap-4">
                                <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer" id="drop-zone">
                                    <input type="file" id="import-file" class="hidden" accept=".json,.csv">
                                    <div class="text-gray-500">
                                        <span class="text-4xl block mb-2">📄</span>
                                        <p id="file-name">Click to select or drag and drop your JSON or CSV file</p>
                                    </div>
                                </div>
                                
                                <div class="flex justify-between items-center">
                                    <div class="flex gap-4">
                                        <button type="button" id="btn-download-sample-json" class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                            📥 Sample JSON
                                        </button>
                                        <button type="button" id="btn-download-sample-csv" class="text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1">
                                            📥 Sample CSV
                                        </button>
                                    </div>
                                    <button type="button" id="btn-start-import" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                        Start Import
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div id="import-progress" class="hidden mt-6">
                            <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                                <div id="progress-bar" class="bg-blue-600 h-2.5 rounded-full" style="width: 0%"></div>
                            </div>
                            <p id="progress-text" class="text-xs text-gray-600 text-center">Processing...</p>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold text-gray-700 mb-2">Import Items with Suppliers</h3>
                        <p class="text-sm text-gray-600 mb-4">CSV Format: "barcode","item_name","category","cost_price","unit_price","supplier_name","supplier_account"</p>
                        <div class="flex flex-col gap-4">
                            <div class="flex items-center gap-4">
                                <input type="file" id="import-items-suppliers-file" accept=".csv" class="text-sm">
                                <button type="button" id="btn-import-items-suppliers" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow transition disabled:opacity-50" disabled>
                                    Import Items & Links
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold text-gray-700 mb-2">Import Supplier Master</h3>
                        <p class="text-sm text-gray-600 mb-4">CSV Format: "company_name","agency_name","account_number","first_name","last_name","email","phone_number","address","city"</p>
                        <div class="flex flex-col gap-4">
                            <div class="flex items-center gap-4">
                                <input type="file" id="import-suppliers-master-file" accept=".csv" class="text-sm">
                                <button type="button" id="btn-import-suppliers-master" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded shadow transition disabled:opacity-50" disabled>
                                    Import Suppliers
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold text-gray-700 mb-2">Bulk Import Customers</h3>
                        <p class="text-sm text-gray-600 mb-4">Upload a CSV file to bulk add customers. Format: "first_name","last_name","account_number","points"</p>
                        
                        <div class="flex flex-col gap-4">
                            <div class="flex items-center gap-4">
                                <input type="file" id="import-customers-file" accept=".csv" class="text-sm">
                                <button type="button" id="btn-import-customers" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded shadow transition disabled:opacity-50" disabled>
                                    Import Customers
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold text-gray-700 mb-4">Database Synchronization</h3>
                        <p class="text-sm text-gray-600 mb-4">Compare your local offline database (IndexedDB) with the server database (JSON) to identify discrepancies.</p>
                        
                        <div class="flex gap-4 mb-6">
                            <button type="button" id="btn-analyze-sync" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded focus:outline-none shadow">
                                Analyze Differences
                            </button>
                        </div>

                        <div id="sync-results" class="hidden">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div class="p-4 bg-gray-50 rounded border border-gray-200">
                                    <div class="text-xs text-gray-500 uppercase font-bold">Server Items</div>
                                    <div id="count-server" class="text-2xl font-bold text-gray-800">-</div>
                                </div>
                                <div class="p-4 bg-gray-50 rounded border border-gray-200">
                                    <div class="text-xs text-gray-500 uppercase font-bold">Local Items</div>
                                    <div id="count-local" class="text-2xl font-bold text-gray-800">-</div>
                                </div>
                                <div class="p-4 bg-gray-50 rounded border border-gray-200">
                                    <div class="text-xs text-gray-500 uppercase font-bold">Status</div>
                                    <div id="sync-status-text" class="text-lg font-bold text-gray-800">-</div>
                                </div>
                            </div>

                            <table class="min-w-full border mb-4">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discrepancy Type</th>
                                        <th class="p-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                                        <th class="p-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="sync-diff-body" class="bg-white divide-y divide-gray-200"></tbody>
                            </table>
                        </div>
                    </div>
                </div>` : ''}

                <!-- Sync History Tab -->
                <div id="settings-tab-sync" class="settings-panel hidden space-y-6">
                    <div class="bg-white p-6 rounded-lg shadow-sm border">
                        <h3 class="text-lg font-bold mb-4">Synchronization Log</h3>
                        <p class="text-sm text-gray-600 mb-4">Last successful synchronization for each data entity.</p>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-sm">
                                <thead>
                                    <tr class="border-b bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                        <th class="text-left p-3">Entity / Data Type</th>
                                        <th class="text-right p-3">Last Successful Sync</th>
                                    </tr>
                                </thead>
                                <tbody id="sync-history-body" class="divide-y divide-gray-100">
                                    <tr><td colspan="2" class="p-4 text-center text-gray-400">Loading history...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="mt-8 flex justify-end">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition ${canWrite ? '' : 'hidden'}">
                        Save All Settings
                    </button>
                </div>
            </form>
        </div>
    `;

    setupEventListeners();
    await loadSettings();
}

function setupEventListeners() {
    const tabs = document.querySelectorAll(".settings-tab-btn");
    const panels = document.querySelectorAll(".settings-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => {
                t.classList.remove("border-blue-500", "text-blue-600");
                t.classList.add("border-transparent", "text-gray-500");
            });
            tab.classList.add("border-blue-500", "text-blue-600");
            tab.classList.remove("border-transparent", "text-gray-500");

            panels.forEach(p => {
                if (p.id === `settings-tab-${target}`) p.classList.remove("hidden");
                else p.classList.add("hidden");
            });

            if (target === 'sync') renderSyncHistory();
        });
    });

    // Logo Upload
    const logoFile = document.getElementById("set-store-logo-file");
    const logoBase64 = document.getElementById("set-store-logo-base64");
    const logoPreview = document.getElementById("logo-preview");

    logoFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                logoBase64.value = base64;
                logoPreview.innerHTML = `<img src="${base64}" class="w-full h-full object-contain">`;
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById("form-settings").addEventListener("submit", handleSave);

    document.getElementById("btn-run-tests")?.addEventListener("click", async () => {
        const { TestRunner } = await import("../services/TestRunner.js");
        await TestRunner.runAll();
        alert("Architecture tests completed. Please check the browser console (F12) for detailed logs.");
    });

    document.getElementById("btn-diagnostic-export")?.addEventListener("click", runDiagnosticExport);

    document.getElementById("btn-nuclear-reset")?.addEventListener("click", async () => {
        if (confirm("ARE YOU ABSOLUTELY SURE? This cannot be undone. All sales and inventory data will be lost.")) {
            if (confirm("Final confirmation: Delete everything?")) {
                try {
                    const res = await fetch(`${API_URL}?action=reset_all`, { method: 'POST' });
                    if (res.ok) {
                        const { db } = await import("../db.js");
                        await db.delete();
                        alert("System reset complete. The app will now reload.");
                        window.location.reload();
                    }
                } catch (e) {
                    alert("Reset failed: " + e.message);
                }
            }
        }
    });

    if (checkPermission("migrate", "write")) {
        setupMigrationEventListeners();
    }
}

async function loadSettings() {
    try {
        if (navigator.onLine) await SyncEngine.sync();

        const localData = await Repository.get('sync_metadata', 'settings');
        let settings = null;
        if (localData) {
            settings = localData.value;
        }
        
        if (settings) {
            if (settings.store) {
                document.getElementById("set-store-name").value = settings.store.name || "";
                document.getElementById("set-store-data").value = settings.store.data || "";
                if (settings.store.logo) {
                    document.getElementById("set-store-logo-base64").value = settings.store.logo;
                    document.getElementById("logo-preview").innerHTML = `<img src="${settings.store.logo}" class="w-full h-full object-contain">`;
                }
            }
            if (settings.tax) {
                document.getElementById("set-tax-rate").value = settings.tax.rate || 0;
            }
            if (settings.rewards) {
                document.getElementById("set-reward-ratio").value = settings.rewards.ratio || 100;
            }
            if (settings.shift) {
                document.getElementById("set-shift-threshold").value = settings.shift.threshold || 0;
            }
            if (settings.pos) {
                document.getElementById("set-auto-print").checked = settings.pos.auto_print || false;
            }
            if (settings.print) {
                const p = settings.print;
                document.getElementById("set-print-width").value = p.paper_width || 76;
                document.getElementById("set-print-show-dividers").checked = p.show_dividers !== false;
                
                document.getElementById("set-print-header-text").value = p.header?.text || "";
                document.getElementById("set-print-header-size").value = p.header?.font_size || 14;
                document.getElementById("set-print-header-font").value = p.header?.font_family || "'Courier New', Courier, monospace";
                document.getElementById("set-print-header-bold").checked = p.header?.bold || false;
                document.getElementById("set-print-header-italic").checked = p.header?.italic || false;

                document.getElementById("set-print-body-size").value = p.body?.font_size || 12;
                document.getElementById("set-print-body-font").value = p.body?.font_family || "'Courier New', Courier, monospace";
                document.getElementById("set-print-body-bold").checked = p.body?.bold || false;
                document.getElementById("set-print-body-italic").checked = p.body?.italic || false;

                document.getElementById("set-print-items-size").value = p.items?.font_size || 12;
                document.getElementById("set-print-items-font").value = p.items?.font_family || "'Courier New', Courier, monospace";
                document.getElementById("set-print-items-bold").checked = p.items?.bold || false;
                document.getElementById("set-print-items-italic").checked = p.items?.italic || false;

                document.getElementById("set-print-footer-text").value = p.footer?.text || "";
                document.getElementById("set-print-footer-size").value = p.footer?.font_size || 10;
                document.getElementById("set-print-footer-font").value = p.footer?.font_family || "'Courier New', Courier, monospace";
                document.getElementById("set-print-footer-bold").checked = p.footer?.bold || false;
                document.getElementById("set-print-footer-italic").checked = p.footer?.italic || false;
            }
            await renderSyncHistory();
        }
    } catch (error) {
        console.error("Error loading settings:", error);
    }
}

async function renderSyncHistory() {
    const tbody = document.getElementById("sync-history-body");
    if (!tbody) return;

    const history = await db.sync_metadata.filter(m => m.key.startsWith('sync_history_')).toArray();
    
    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="p-4 text-center text-gray-400 italic">No sync history recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = history.map(h => {
        const entity = h.key.replace('sync_history_', '').replace(/_/g, ' ');
        const date = new Date(h.value);
        return `
            <tr>
                <td class="p-3 font-medium text-gray-700 capitalize">${entity}</td>
                <td class="p-3 text-right text-gray-500">${date.toLocaleString()}</td>
            </tr>
        `;
    }).join('');
}

async function handleSave(e) {
    e.preventDefault();
    
    const settings = {
        store: {
            name: document.getElementById("set-store-name").value.trim(),
            logo: document.getElementById("set-store-logo-base64").value,
            data: document.getElementById("set-store-data").value.trim()
        },
        tax: {
            rate: parseFloat(document.getElementById("set-tax-rate").value) || 0
        },
        rewards: {
            ratio: parseInt(document.getElementById("set-reward-ratio").value) || 100
        },
        shift: {
            threshold: parseFloat(document.getElementById("set-shift-threshold").value) || 0
        },
        pos: {
            auto_print: document.getElementById("set-auto-print").checked
        },
        print: {
            paper_width: parseInt(document.getElementById("set-print-width").value) || 76,
            show_dividers: document.getElementById("set-print-show-dividers").checked,
            header: {
                text: document.getElementById("set-print-header-text").value.trim(),
                font_size: parseInt(document.getElementById("set-print-header-size").value) || 14,
                font_family: document.getElementById("set-print-header-font").value,
                bold: document.getElementById("set-print-header-bold").checked,
                italic: document.getElementById("set-print-header-italic").checked
            },
            body: {
                font_size: parseInt(document.getElementById("set-print-body-size").value) || 12,
                font_family: document.getElementById("set-print-body-font").value,
                bold: document.getElementById("set-print-body-bold").checked,
                italic: document.getElementById("set-print-body-italic").checked
            },
            items: {
                font_size: parseInt(document.getElementById("set-print-items-size").value) || 12,
                font_family: document.getElementById("set-print-items-font").value,
                bold: document.getElementById("set-print-items-bold").checked,
                italic: document.getElementById("set-print-items-italic").checked
            },
            footer: {
                text: document.getElementById("set-print-footer-text").value.trim(),
                font_size: parseInt(document.getElementById("set-print-footer-size").value) || 10,
                font_family: document.getElementById("set-print-footer-font").value,
                bold: document.getElementById("set-print-footer-bold").checked,
                italic: document.getElementById("set-print-footer-italic").checked
            }
        }
    };

    try {
        // Fetch existing to maintain versioning for the SyncEngine
        const existing = await Repository.get('sync_metadata', 'settings');
        
        // Save locally first
        await Repository.upsert('sync_metadata', { 
            key: 'settings', 
            value: settings,
            _version: (existing?._version || 0) + 1,
            _updatedAt: Date.now()
        });

        // Trigger background sync
        SyncEngine.sync();

        alert("Settings saved.");
        renderHeader(); // Refresh title bar
    } catch (error) {
        console.error("Error saving settings:", error);
        alert("Failed to save settings.");
    }
}

/**
 * Helper to get settings for other modules
 */
export async function getSystemSettings() {
    try {
        const localData = await Repository.get('sync_metadata', 'settings');
        if (localData && localData.value) {
            return localData.value;
        }
        return {
            store: { name: "LightPOS", logo: "", data: "" },
            tax: { rate: 12 },
            rewards: { ratio: 100 },
            shift: { threshold: 0 },
            pos: { auto_print: false },
            print: { 
                paper_width: 76, 
                show_dividers: true,
                header: { 
                    text: "", 
                    font_size: 14, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: true, 
                    italic: false 
                },
                body: { 
                    font_size: 12, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: false, 
                    italic: false 
                },
                items: { 
                    font_size: 12, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: false, 
                    italic: false 
                },
                footer: { 
                    text: "Thank you for shopping!", 
                    font_size: 10, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: false, 
                    italic: true 
                }
            }
        };
    } catch (e) {
        return {
            store: { name: "LightPOS", logo: "", data: "" },
            tax: { rate: 12 },
            rewards: { ratio: 100 },
            shift: { threshold: 0 },
            pos: { auto_print: false },
            print: { 
                paper_width: 76, 
                show_dividers: true,
                header: { 
                    text: "", 
                    font_size: 14, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: true, 
                    italic: false 
                },
                body: { 
                    font_size: 12, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: false, 
                    italic: false 
                },
                items: { 
                    font_size: 12, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: false, 
                    italic: false 
                },
                footer: { 
                    text: "Thank you for shopping!", 
                    font_size: 10, 
                    font_family: "'Courier New', Courier, monospace", 
                    bold: false, 
                    italic: true 
                }
            }
        };
    }
}

/**
 * Migration Logic (Moved from migrate.js)
 */
function setupMigrationEventListeners() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("import-file");
    const btnImport = document.getElementById("btn-start-import");
    const btnSampleJson = document.getElementById("btn-download-sample-json");
    const btnSampleCsv = document.getElementById("btn-download-sample-csv");
    const fileNameDisplay = document.getElementById("file-name");

    if (!dropZone) return;

    dropZone.addEventListener("click", () => fileInput.click());
    
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
            btnImport.disabled = false;
        }
    });

    btnSampleJson.addEventListener("click", () => downloadSample("json"));
    btnSampleCsv.addEventListener("click", () => downloadSample("csv"));

    document.getElementById("btn-analyze-sync").addEventListener("click", analyzeSync);

    document.getElementById("btn-download-backup-server").addEventListener("click", downloadServerBackup);
    document.getElementById("btn-download-backup-local").addEventListener("click", downloadLocalBackup);
    const restoreFileInput = document.getElementById("restore-file");
    document.getElementById("btn-trigger-restore").addEventListener("click", () => restoreFileInput.click());
    restoreFileInput.addEventListener("change", handleRestoreBackup);

    // Customer Import Logic
    const custFileInput = document.getElementById("import-customers-file");
    const btnImportCust = document.getElementById("btn-import-customers");

    custFileInput?.addEventListener("change", () => {
        btnImportCust.disabled = custFileInput.files.length === 0;
    });

    btnImportCust?.addEventListener("click", async () => {
        const file = custFileInput.files[0];
        if (!file) return;
        const text = await file.text();
        const { bulkAddCustomersFromCSV } = await import("./migrations.js");
        const count = await bulkAddCustomersFromCSV(text);
        alert(`Successfully added ${count} customers.`);
        custFileInput.value = "";
        btnImportCust.disabled = true;
    });

    // Items with Suppliers Import
    const itemsSupFile = document.getElementById("import-items-suppliers-file");
    const btnImportItemsSup = document.getElementById("btn-import-items-suppliers");
    itemsSupFile?.addEventListener("change", () => btnImportItemsSup.disabled = itemsSupFile.files.length === 0);
    btnImportItemsSup?.addEventListener("click", async () => {
        const file = itemsSupFile.files[0];
        if (!file) return;
        const text = await file.text();
        const rows = parseGenericCSV(text);
        
        let count = 0;
        for (const row of rows) {
            const name = row.item_name;
            if (!name || name === 'NULL') continue;

            let supplierId = null;
            if (row.supplier_name && row.supplier_name !== 'NULL') {
                let sup = await db.suppliers.where('name').equalsIgnoreCase(row.supplier_name).first();
                if (!sup) {
                    sup = { id: generateUUID(), name: row.supplier_name };
                    await Repository.upsert('suppliers', sup);
                }
                supplierId = sup.id;
            }

            // Check for duplicates
            let existing = null;
            if (row.barcode && row.barcode !== 'NULL') {
                existing = await db.items.where('barcode').equals(row.barcode).first();
            }
            if (!existing) {
                existing = await db.items.where('name').equalsIgnoreCase(name).first();
            }

            if (existing) {
                // Update existing
                existing.category = (row.category && row.category !== 'NULL') ? row.category : existing.category;
                existing.supplier_id = supplierId || existing.supplier_id;
                await Repository.upsert('items', existing);
            } else {
                // Create new
                const newItem = {
                    id: generateUUID(),
                    barcode: (row.barcode && row.barcode !== 'NULL') ? row.barcode : "",
                    name: name,
                    category: (row.category && row.category !== 'NULL') ? row.category : "",
                    cost_price: parseFloat(row.cost_price) || 0,
                    selling_price: parseFloat(row.unit_price) || 0,
                    supplier_id: supplierId,
                    stock_level: 0,
                    min_stock: 10
                };
                await Repository.upsert('items', newItem);
            }
            count++;
        }
        alert(`Processed ${count} items.`);
        SyncEngine.sync();
    });

    // Supplier Master Import
    const supMasterFile = document.getElementById("import-suppliers-master-file");
    const btnImportSupMaster = document.getElementById("btn-import-suppliers-master");
    supMasterFile?.addEventListener("change", () => btnImportSupMaster.disabled = supMasterFile.files.length === 0);
    btnImportSupMaster?.addEventListener("click", async () => {
        const file = supMasterFile.files[0];
        if (!file) return;
        const text = await file.text();
        const rows = parseGenericCSV(text);
        
        let count = 0;
        for (const row of rows) {
            const name = row.company_name || row.agency_name;
            if (!name || name === 'NULL') continue;

            let existing = await db.suppliers.where('name').equalsIgnoreCase(name).first();
            const supData = {
                name: name,
                contact: `${row.first_name !== 'NULL' ? row.first_name : ''} ${row.last_name !== 'NULL' ? row.last_name : ''}`.trim() || null,
                email: row.email && row.email !== 'NULL' ? row.email : (row.phone_number !== 'NULL' ? row.phone_number : null)
            };

            if (existing) {
                await Repository.upsert('suppliers', { ...existing, ...supData });
            } else {
                await Repository.upsert('suppliers', { id: generateUUID(), ...supData });
            }
            count++;
        }
        alert(`Processed ${count} suppliers.`);
        SyncEngine.sync();
    });

    btnImport.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return;

        btnImport.disabled = true;
        document.getElementById("import-progress").classList.remove("hidden");
        
        try {
            const text = await file.text();
            let data;
            
            if (file.name.endsWith(".json")) {
                data = JSON.parse(text);
            } else if (file.name.endsWith(".csv")) {
                data = parseCSV(text);
            } else {
                throw new Error("Unsupported file format. Please upload JSON or CSV.");
            }
            
            if (!Array.isArray(data)) {
                throw new Error("Invalid format: Data must be an array of items.");
            }

            await processImport(data);
            alert(`Successfully imported ${data.length} items.`);
            loadSettingsView(); // Reset view
        } catch (error) {
            console.error("Import error:", error);
            alert("Import failed: " + error.message);
            btnImport.disabled = false;
        }
    });
}

function parseGenericCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const clean = (val) => val ? val.trim().replace(/^"|"$/g, '') : "";
    const headers = lines[0].split(delimiter).map(h => clean(h).toLowerCase());
    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => clean(v));
        const row = {};
        headers.forEach((header, index) => {
            const val = values[index];
            row[header] = (val === 'NULL' || val === undefined) ? null : val;
        });
        results.push(row);
    }
    return results;
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    const clean = (val) => val ? val.trim().replace(/^"|"$/g, '') : "";
    const headers = lines[0].split(delimiter).map(h => clean(h).toLowerCase());
    const items = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => clean(v));
        const row = {};
        headers.forEach((header, index) => { row[header] = values[index]; });
        items.push({
            barcode: row.barcode || "",
            name: row.name || "",
            category: row.category || "",
            cost_price: parseFloat(row.cost_price) || 0,
            selling_price: parseFloat(row.unit_price) || 0,
            min_stock: parseFloat(row.reorder_level) || 0,
            stock_level: 0,
            base_unit: "Unit"
        });
    }
    return items;
}

async function processImport(items) {
    const progressBar = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");
    progressBar.style.width = "10%";
    progressText.textContent = "Preparing data...";
    
    progressBar.style.width = "40%";
    progressText.textContent = "Processing data...";
    const newItems = items.map(item => ({
        id: generateUUID(),
        ...item,
        cost_price: parseFloat(item.cost_price) || 0,
        selling_price: parseFloat(item.selling_price) || 0,
        stock_level: parseFloat(item.stock_level) || 0,
        min_stock: parseFloat(item.min_stock) || 0,
        supplier_id: item.supplier_id || ""
    }));
    progressBar.style.width = "70%";
    progressText.textContent = "Saving to local database...";
    
    for (const item of newItems) {
        await Repository.upsert('items', item);
    }

    progressText.textContent = "Syncing...";
    SyncEngine.sync();
    
    progressBar.style.width = "100%";
    progressText.textContent = "Import Complete!";
}

async function analyzeSync() {
    const resultsDiv = document.getElementById("sync-results");
    const tbody = document.getElementById("sync-diff-body");
    const btnAnalyze = document.getElementById("btn-analyze-sync");
    resultsDiv.classList.remove("hidden");
    tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-500">Analyzing databases...</td></tr>`;
    btnAnalyze.disabled = true;
    btnAnalyze.classList.add("opacity-50");
    try {
        const [serverRes, localData] = await Promise.all([
            fetch(`${API_URL}?since=0`), 
            Repository.getAll('items')
        ]);
        const response = await serverRes.json();
        const serverData = response.deltas?.items || [];

        document.getElementById("count-server").textContent = serverData.length;
        document.getElementById("count-local").textContent = localData.length;
        const serverMap = new Map(serverData.map(i => [i.id, i]));
        const localMap = new Map(localData.map(i => [i.id, i]));
        const onlyInServer = serverData.filter(i => !localMap.has(i.id));
        const onlyInLocal = localData.filter(i => !serverMap.has(i.id));
        const conflicts = serverData.filter(s => {
            const l = localMap.get(s.id);
            if (!l) return false;
            const sVer = s._version || 0;
            const lVer = l._version || 0;
            const sUpd = s._updatedAt || 0;
            const lUpd = l._updatedAt || 0;
            return sVer !== lVer || sUpd !== lUpd;
        });
        const statusEl = document.getElementById("sync-status-text");
        if (onlyInServer.length === 0 && onlyInLocal.length === 0 && conflicts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-green-600 font-bold bg-green-50">All databases are in sync!</td></tr>`;
            statusEl.textContent = "Synced";
            statusEl.className = "text-lg font-bold text-green-600";
        } else {
            statusEl.textContent = "Not Synced";
            statusEl.className = "text-lg font-bold text-red-600";
            tbody.innerHTML = "";
            const renderRow = (label, count, btnText, btnClass, actionFn) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td class="p-3 text-sm font-medium text-gray-900">${label}</td><td class="p-3 text-center text-sm text-gray-500">${count}</td><td class="p-3 text-right"><button type="button" class="text-xs px-3 py-1 rounded text-white font-bold ${btnClass} hover:opacity-90 transition">${btnText}</button></td>`;
                tr.querySelector("button").addEventListener("click", async (e) => {
                    e.target.disabled = true; e.target.textContent = "Processing...";
                    await actionFn(); analyzeSync();
                });
                tbody.appendChild(tr);
            };
            if (onlyInServer.length > 0) renderRow("Missing in Local DB", onlyInServer.length, "Download to Local", "bg-blue-500", async () => {
                for (const item of onlyInServer) {
                    // Directly apply server state and clear outbox to prevent push-back loops
                    await db.transaction('rw', [db.items, db.outbox], async () => {
                        await db.items.put(item);
                        await db.outbox.where({ collection: 'items', docId: item.id }).delete();
                    });
                }
            });
            if (onlyInLocal.length > 0) renderRow("Missing in Server DB", onlyInLocal.length, "Upload to Server", "bg-green-500", async () => {
                for (const item of onlyInLocal) {
                    await Repository.upsert('items', item);
                }
                await SyncEngine.sync();
            });
            if (conflicts.length > 0) renderRow("Data Mismatch / Conflicts", conflicts.length, "Overwrite Local (Trust Server)", "bg-orange-500", async () => {
                for (const item of conflicts) {
                    // Force local to match server version and timestamp
                    await db.transaction('rw', [db.items, db.outbox], async () => {
                        await db.items.put(item);
                        await db.outbox.where({ collection: 'items', docId: item.id }).delete();
                    });
                }
            });
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-600">Error analyzing data. Check console.</td></tr>`;
    } finally {
        btnAnalyze.disabled = false; btnAnalyze.classList.remove("opacity-50");
    }
}

async function downloadServerBackup() {
    const files = [
        'sync_metadata', 'items', 'transactions', 'suppliers', 'customers',
        'expenses', 'returns', 'shifts', 'stock_movements', 'stock_logs',
        'adjustments', 'stockins', 'suspended_transactions', 'notifications'
    ];
    
    const backupData = {};
    const btn = document.getElementById("btn-download-backup-server");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "⌛ Preparing Backup...";

    try {
        for (const file of files) {
            const res = await fetch(`${ADMIN_API_URL}?file=${file}`);
            if (res.ok) {
                backupData[file] = await res.json();
            }
        }

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `lightpos-server-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert("Backup downloaded successfully.");
    } catch (error) {
        console.error("Backup failed:", error);
        alert("Failed to generate backup.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function downloadLocalBackup() {
    const files = [
        'sync_metadata', 'items', 'transactions', 'suppliers', 'customers',
        'expenses', 'returns', 'shifts', 'stock_movements', 'stock_logs',
        'adjustments', 'stockins', 'suspended_transactions', 'notifications'
    ];
    
    const backupData = {};
    const btn = document.getElementById("btn-download-backup-local");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "⌛ Exporting...";

    try {
        for (const collection of files) {
            if (db[collection]) {
                backupData[collection] = await db[collection].toArray();
            }
        }

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `lightpos-local-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert("Local backup downloaded successfully.");
    } catch (error) {
        console.error("Local backup failed:", error);
        alert("Failed to generate local backup.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleRestoreBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isDryRun = document.getElementById("restore-dry-run")?.checked;

    let backupData;
    try {
        const text = await file.text();
        backupData = JSON.parse(text);
    } catch (error) {
        alert("Failed to read backup file: " + error.message);
        e.target.value = "";
        return;
    }

    if (!backupData || typeof backupData !== 'object') {
        alert("Invalid backup file format.");
        e.target.value = "";
        return;
    }

    // Intelligent detection of file structure
    if (Array.isArray(backupData)) {
        alert("This file contains a single list of items (Array), not a full system backup. Please upload a full backup file.");
        e.target.value = "";
        return;
    }

    if (backupData.serverData && typeof backupData.serverData === 'object' && !backupData.items) {
        if (confirm("This file appears to be a Diagnostic Report. Do you want to extract and restore the Server Data from it?")) {
            backupData = backupData.serverData;
        }
    } else if (backupData.deltas && typeof backupData.deltas === 'object' && !backupData.items) {
        backupData = backupData.deltas;
    } else if (backupData.settings && backupData.settings.deltas && typeof backupData.settings.deltas === 'object') {
        backupData = backupData.settings.deltas;
    }

    const collections = Object.entries(backupData);
    let totalCollections = 0;
    let totalItems = 0;
    let details = "";

    for (const [name, data] of collections) {
        if (Array.isArray(data)) {
            totalCollections++;
            totalItems += data.length;
            details += `- ${name}: ${data.length}\n`;
        }
    }

    if (totalCollections === 0) {
        alert("No valid data collections found in this file. Please ensure it is a valid LightPOS backup file.\n\nFound keys: " + Object.keys(backupData).join(", "));
        e.target.value = "";
        return;
    }

    let summary = `Backup Analysis:\n\nCollections: ${totalCollections}\nTotal Items: ${totalItems}\n\nDetails:\n${details}`;
    
    if (isDryRun) {
        summary += `\n[DRY RUN MODE]: No data will be written to the server. This is a simulation to check file integrity.\n\nProceed with simulation?`;
    } else {
        summary += `\nWARNING: This will overwrite ALL current data on the server. This cannot be undone.\n\nProceed with restore?`;
    }

    if (!confirm(summary)) {
        e.target.value = "";
        return;
    }

    const btn = document.getElementById("btn-trigger-restore");
    const progressContainer = document.getElementById("restore-progress-container");
    const progressBar = document.getElementById("restore-progress-bar");
    const progressText = document.getElementById("restore-progress-text");

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = isDryRun ? "⌛ Simulating..." : "⌛ Processing...";

    if (progressContainer) {
        progressContainer.classList.remove("hidden");
        progressBar.style.width = "0%";
        progressText.textContent = isDryRun ? "Reading backup file for simulation..." : "Reading backup file...";
    }

    try {
        const serverTime = Date.now();
        
        // Use calculated total from analysis step
        const totalItemsToRestore = totalItems;

        let itemsRestoredSoFar = 0;
        const CHUNK_SIZE = 200; // Reduced chunk size to ensure reliability

        // Upload collection by collection to avoid hitting server POST size limits (e.g. 76MB)
        for (const [fileName, data] of collections) {
            if (!Array.isArray(data)) continue;
            
            // Update timestamps to ensure the sync engine sees this as "new" data
            data.forEach(item => {
                if (item && typeof item === 'object') item._updatedAt = serverTime;
            });

            const totalItems = data.length;
            if (totalItems === 0) {
                await fetch(`${ADMIN_API_URL}?file=${fileName}&mode=overwrite${isDryRun ? '&dry_run=true' : ''}`, { method: 'POST', body: JSON.stringify([]) });
                continue;
            }

            for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
                const chunk = data.slice(i, i + CHUNK_SIZE);
                const mode = (i === 0) ? 'overwrite' : 'append';
                
                const currentChunkSize = chunk.length;
                itemsRestoredSoFar += currentChunkSize;
                const percent = totalItemsToRestore > 0 ? Math.round((itemsRestoredSoFar / totalItemsToRestore) * 100) : 100;

                if (progressBar) progressBar.style.width = `${percent}%`;
                if (progressText) progressText.textContent = `${isDryRun ? 'Simulating' : 'Restoring'} ${fileName}... (${Math.round((i + currentChunkSize) / totalItems * 100)}%) - Total: ${percent}%`;
                btn.innerHTML = `⌛ ${percent}%`;

                const response = await fetch(`${ADMIN_API_URL}?file=${fileName}&mode=${mode}${isDryRun ? '&dry_run=true' : ''}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chunk)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Failed to restore ${fileName} (chunk ${i}): ${errText}`);
                }
            }
        }

        if (isDryRun) {
            if (progressBar) progressBar.style.width = "100%";
            if (progressText) progressText.textContent = "Simulation complete! No errors found.";
            alert("Dry Run Successful!\n\nThe backup file is valid and can be safely restored.");
        } else {
            if (progressBar) progressBar.style.width = "100%";
            if (progressText) progressText.textContent = "Restore complete! Reloading...";

            // The server has been restored. Now prepare the client for a fresh sync
            // by deleting the local database.
            await db.delete();

            alert("System restored successfully! The app will now reload and re-sync all data from the server.");
            window.location.reload();
        }
    } catch (error) {
        console.error("Restore failed:", error);
        alert("Failed to restore backup: " + error.message);
        if (progressContainer) progressContainer.classList.add("hidden");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        e.target.value = "";
    }
}

function downloadSample(type) {
    let content, filename, mimeType;
    if (type === "json") {
        content = JSON.stringify([{ "barcode": "1001", "name": "Sample Soda 330ml", "base_unit": "Can", "cost_price": 15.50, "selling_price": 25.00, "stock_level": 48, "min_stock": 12, "supplier_id": "" }], null, 2);
        filename = "surprised-potato-items-sample.json"; mimeType = "application/json";
    } else {
        content = '"barcode","name","category","cost_price","unit_price","reorder_level"\n"123465","Rubber Band","SCHOOL SUPPLIES","0.45","0.50","0.000"\n"42184676","Nivea Cool Kick 25ml","DEODORANT","54.00","59.00","2.000"\n"42187608","Nivea Silver P 25ml","DEODORANT","67.00","73.00","2.000"\n"42316688","Nivea Invisible 25ml","DEODORANT","62.00","68.00","2.000"\n"45687485","Royal Rice 1Kl","rice","35.00","43.00","2.000"';
        filename = "surprised-potato-items-sample.csv"; mimeType = "text/csv";
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export async function runDiagnosticExport() {
    const btn = document.getElementById("btn-diagnostic-export");
    const originalText = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "⌛ Generating Report...";
    }

    const entities = [
        'items', 'transactions', 'suppliers', 'customers', 
        'expenses', 'returns', 'shifts', 'stock_movements', 'stock_logs',
        'adjustments', 'stockins', 'suspended_transactions', 'notifications'
    ];
    
    try {
        const report = {
            timestamp: new Date().toISOString(),
            environment: {
                userAgent: navigator.userAgent,
                online: navigator.onLine,
                localStorage: {
                    last_sync_timestamp: localStorage.getItem('last_sync_timestamp')
                }
            },
            syncStatus: {
                lastPullTimestamp: (await db.sync_metadata.get('last_pull_timestamp'))?.value,
                outboxCount: await db.outbox.count(),
                outboxPreview: await db.outbox.toArray()
            },
            serverData: {},
            localData: {},
            discrepancies: {}
        };

        // 1. Settings comparison
        const sSetRes = await fetch(`${ADMIN_API_URL}?file=sync_metadata`);
        let sSet = sSetRes.ok ? await sSetRes.json() : null;
        
        // Unwrap sync envelope if present
        if (sSet && sSet.deltas && sSet.deltas.settings) {
            sSet = sSet.deltas.settings;
        }

        // If using router.php (ADMIN_API_URL), sSet is an array of metadata. Find settings.
        if (Array.isArray(sSet)) {
            sSet = sSet.find(i => i.key === 'settings');
        }

        // Extract value
        const sSetVal = (sSet && sSet.value) ? sSet.value : sSet;
        const lSet = (await db.sync_metadata.get('settings'))?.value;

        report.serverData.settings = sSetVal;
        report.localData.settings = lSet;

        // Compare only the actual settings content, ignoring metadata
        if (JSON.stringify(sSetVal) !== JSON.stringify(lSet)) {
            report.discrepancies.settings = "Mismatch between server settings.json and local sync_metadata['settings']";
        }

        // 2. Entity comparison
        for (const entity of entities) {
            if (!db[entity]) continue;

            const sRes = await fetch(`${ADMIN_API_URL}?file=${entity}`);
            let sData = sRes.ok ? await sRes.json() : [];
            
            // Unwrap sync envelope if present
            if (sData && !Array.isArray(sData) && sData.deltas && sData.deltas[entity]) {
                sData = sData.deltas[entity];
            }

            if (!Array.isArray(sData)) sData = [];
            const lData = await db[entity].toArray();

            report.serverData[entity] = sData;
            report.localData[entity] = lData;

            const sMap = new Map(sData.map(i => [i.id, i]));
            const lMap = new Map(lData.map(i => [i.id, i]));
            
            const onlyInServer = sData.filter(i => !lMap.has(i.id)).map(i => i.id);
            const onlyInLocal = lData.filter(i => !sMap.has(i.id)).map(i => i.id);
            const contentMismatch = sData.filter(s => {
                const l = lMap.get(s.id);
                return l && JSON.stringify(s) !== JSON.stringify(l);
            }).map(s => s.id);

            if (onlyInServer.length > 0 || onlyInLocal.length > 0 || contentMismatch.length > 0) {
                report.discrepancies[entity] = {
                    missingInLocalCount: onlyInServer.length,
                    missingInLocalIds: onlyInServer,
                    missingInServerCount: onlyInLocal.length,
                    missingInServerIds: onlyInLocal,
                    mismatchCount: contentMismatch.length,
                    mismatchIds: contentMismatch
                };
            }
        }

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lightpos-diagnostic-${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        return report;
    } catch (error) {
        console.error("Diagnostic export failed:", error);
        alert("Failed to generate diagnostic report.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}