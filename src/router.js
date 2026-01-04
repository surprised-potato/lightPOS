import { loadDashboardView } from "./modules/dashboard.js";
import { loadItemsView } from "./modules/items.js";
import { loadSuppliersView } from "./modules/suppliers.js";
import { loadCustomersView } from "./modules/customers.js";
import { loadStockInView } from "./modules/stockin.js";
import { loadStockCountView } from "./modules/stock-count.js";
import { loadPosView } from "./modules/pos.js";
import { loadReportsView } from "./modules/reports.js";
import { loadExpensesView } from "./modules/expenses.js";
import { loadUsersView } from "./modules/users.js";
import { loadProfileView } from "./modules/profile.js";
import { loadShiftsView } from "./modules/shift.js";
import { loadSettingsView } from "./modules/settings.js";
import { loadReturnsView } from "./modules/returns.js";
import { checkPermission } from "./auth.js";
import { renderSidebar } from "./layout.js";

export function initRouter() {
    window.addEventListener("hashchange", handleRoute);
    handleRoute();
}

async function handleRoute() {
    const rawHash = window.location.hash || "#dashboard";
    let hash = rawHash;

    // Obfuscation Layer: Decode hash if it uses the obfuscated prefix
    if (rawHash.startsWith("#_")) {
        try {
            hash = "#" + atob(rawHash.substring(2));
        } catch (e) {
            console.error("Routing Error: Malformed obfuscated hash.");
        }
    }

    const content = document.getElementById("main-content");
    
    // Permission Guard: Prevent unauthorized access via manual URL entry
    const routeGuards = {
        "#dashboard": { module: "reports", type: "read" },
        "#pos": { module: "pos", type: "read" },
        "#items": { module: "items", type: "read" },
        "#suppliers": { module: "suppliers", type: "read" },
        "#customers": { module: "customers", type: "read" },
        "#stockin": { module: "stockin", type: "read" },
        "#stock-count": { module: "stock-count", type: "read" },
        "#expenses": { module: "expenses", type: "read" },
        "#reports": { module: "reports", type: "read" },
        "#users": { module: "users", type: "read" },
        "#shifts": { module: "shifts", type: "read" },
        "#returns": { module: "returns", type: "read" },
        "#settings": { module: "settings", type: "read" }
    };

    const guard = routeGuards[hash];
    if (guard && !checkPermission(guard.module, guard.type)) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center h-[calc(100vh-200px)] p-6">
                <div class="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md border border-red-50 w-full">
                    <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span class="text-4xl">🚫</span>
                    </div>
                    <h2 class="text-2xl font-black text-gray-800 mb-2">Access Denied</h2>
                    <p class="text-gray-500 mb-8 font-medium">You don't have permission to view this module. Please contact your administrator.</p>
                    <button onclick="location.hash='#dashboard'" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transition transform hover:-translate-y-1 active:scale-95">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        `;
        return;
    }

    renderSidebar();

    switch (hash) {
        case "#dashboard": await loadDashboardView(); break;
        case "#pos": await loadPosView(); break;
        case "#items": await loadItemsView(); break;
        case "#suppliers": await loadSuppliersView(); break;
        case "#customers": await loadCustomersView(); break;
        case "#stockin": await loadStockInView(); break;
        case "#stock-count": await loadStockCountView(); break;
        case "#expenses": await loadExpensesView(); break;
        case "#reports": await loadReportsView(); break;
        case "#users": await loadUsersView(); break;
        case "#profile": await loadProfileView(); break;
        case "#shifts": await loadShiftsView(); break;
        case "#returns": await loadReturnsView(); break;
        case "#settings": await loadSettingsView(); break;
        default:
            content.innerHTML = `<div class="p-6"><h2>404 - Page Not Found</h2></div>`;
    }
}