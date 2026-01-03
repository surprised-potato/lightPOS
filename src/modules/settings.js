import { checkPermission } from "../auth.js";
import { renderHeader } from "../layout.js";

const API_URL = 'api/router.php';

export async function loadSettingsView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("settings", "write");

    content.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">System Settings</h2>

            <!-- Tab Navigation -->
            <div class="border-b border-gray-200 mb-6">
                <nav class="flex -mb-px space-x-8">
                    <button data-tab="store" class="settings-tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Store Info</button>
                    <button data-tab="tax" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Tax Settings</button>
                    <button data-tab="rewards" class="settings-tab-btn border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Rewards & Loyalty</button>
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
}

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}?file=settings`);
        const settings = await response.json();
        
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
        }
    } catch (error) {
        console.error("Error loading settings:", error);
    }
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
        }
    };

    try {
        await fetch(`${API_URL}?file=settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        alert("Settings saved successfully!");
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
        const response = await fetch(`${API_URL}?file=settings`);
        const settings = await response.json();
        return settings || {
            store: { name: "LightPOS", logo: "", data: "" },
            tax: { rate: 12 },
            rewards: { ratio: 100 }
        };
    } catch (e) {
        return {
            store: { name: "LightPOS", logo: "", data: "" },
            tax: { rate: 12 },
            rewards: { ratio: 100 }
        };
    }
}