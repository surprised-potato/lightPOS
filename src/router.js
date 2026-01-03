import { loadSuppliersView } from "./modules/suppliers.js";
import { loadItemsView } from "./modules/items.js";
import { loadStockInView } from "./modules/stockin.js";
import { loadStockCountView } from "./modules/stock-count.js";
import { loadPosView } from "./modules/pos.js";
import { loadDashboardView } from "./modules/dashboard.js";
import { loadReportsView } from "./modules/reports.js";
import { loadShiftsView } from "./modules/shift.js";
import { loadExpensesView } from "./modules/expenses.js";
import { loadUsersView } from "./modules/users.js";
import { loadProfileView } from "./modules/profile.js";
import { loadMigrateView } from "./modules/migrate.js";
import { getUserProfile } from "./auth.js";

export function initRouter() {
    // Handle navigation when the hash changes
    window.addEventListener("hashchange", handleRoute);
    
    // Handle the initial load
    handleRoute();
}

function handleRoute() {
    const hash = window.location.hash || "#dashboard";
    const mainContent = document.getElementById("main-content");
    const profile = getUserProfile();

    // Check for Zero Access (New User)
    const hasPermissions = profile && profile.permissions && Object.keys(profile.permissions).length > 0;
    if (profile && !hasPermissions) {
        mainContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center p-10">
                <div class="bg-blue-50 p-8 rounded-lg shadow-md max-w-lg border border-blue-200">
                    <div class="text-5xl mb-4">👋</div>
                    <h2 class="text-2xl font-bold text-blue-800 mb-4">Welcome to LightPOS</h2>
                    <p class="text-gray-700 mb-4">Hello, <span class="font-bold">${profile.name}</span>.</p>
                    <p class="text-gray-600">Your account has been successfully created. Please wait for an administrator to assign modules to your account.</p>
                </div>
            </div>
        `;
        return;
    }

    // Update Sidebar Active State
    updateActiveLink(hash);

    // Route Logic
    switch (hash) {
        case "#dashboard":
            loadDashboardView();
            break;
        case "#pos":
            loadPosView();
            break;
        case "#suppliers":
            loadSuppliersView();
            break;
        case "#items":
            loadItemsView();
            break;
        case "#migrate":
            loadMigrateView();
            break;
        case "#stockin":
            loadStockInView();
            break;
        case "#stock-count":
            loadStockCountView();
            break;
        case "#shifts":
            loadShiftsView();
            break;
        case "#expenses":
            loadExpensesView();
            break;
        case "#reports":
            loadReportsView();
            break;
        case "#users":
            loadUsersView();
            break;
        case "#profile":
            loadProfileView();
            break;
        default:
            mainContent.innerHTML = `<h2 class="text-2xl font-bold mb-4 text-red-600">404 Not Found</h2><p>The requested page does not exist.</p>`;
    }
}

function updateActiveLink(hash) {
    const links = document.querySelectorAll("#sidebar-container a");
    links.forEach(link => {
        const href = link.getAttribute("href");
        if (href === hash) {
            link.classList.add("bg-blue-100", "text-blue-800");
        } else {
            link.classList.remove("bg-blue-100", "text-blue-800");
        }
    });
}