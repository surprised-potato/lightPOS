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
import { loadMigrateView } from "./modules/migrate.js";
import { loadShiftsView } from "./modules/shift.js";
import { renderSidebar } from "./layout.js";

export function initRouter() {
    window.addEventListener("hashchange", handleRoute);
    handleRoute();
}

async function handleRoute() {
    const hash = window.location.hash || "#dashboard";
    const content = document.getElementById("main-content");
    
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
        case "#migrate": await loadMigrateView(); break;
        case "#shifts": await loadShiftsView(); break;
        default:
            content.innerHTML = `<div class="p-6"><h2>404 - Page Not Found</h2></div>`;
    }
}