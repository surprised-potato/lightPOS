import { checkPermission } from "./auth.js";
import { checkActiveShift } from "./modules/shift.js";

export function renderSidebar() {
    console.log("renderSidebar: Function called.");
    const sidebar = document.getElementById("sidebar-container");
    
    if (!sidebar) {
        console.error("renderSidebar: #sidebar-container not found in DOM.");
        return;
    }

    const currentHash = window.location.hash || "#dashboard";

    const menuItems = [
        { section: "Front Office" },
        { label: "Dashboard", icon: "📊", hash: "#dashboard", permission: "reports", type: "read" },
        { label: "POS", icon: "🛒", hash: "#pos", permission: "pos", type: "read" },
        { label: "Customers", icon: "👥", hash: "#customers", permission: "pos", type: "read" },
        { label: "Shifts", icon: "⏱️", hash: "#shifts", permission: "shifts", type: "read" },
        
        { section: "Inventory" },
        { label: "Items", icon: "📦", hash: "#items", permission: "items", type: "read" },
        { label: "Suppliers", icon: "🏭", hash: "#suppliers", permission: "items", type: "read" },
        { label: "Stock In", icon: "🚛", hash: "#stockin", permission: "stockin", type: "read" },
        { label: "Stock Count", icon: "📋", hash: "#stock-count", permission: "stock-count", type: "read" },
        
        { section: "Back Office" },
        { label: "Expenses", icon: "💸", hash: "#expenses", permission: "expenses", type: "read" },
        { label: "Reports", icon: "📈", hash: "#reports", permission: "reports", type: "read" },
        { label: "Users", icon: "👤", hash: "#users", permission: "users", type: "read" },
        { label: "Migrate", icon: "🔄", hash: "#migrate", permission: "items", type: "write" },
    ];

    let html = `<div class="py-4">`;

    html += `
        <style>
            @keyframes breathe-green {
                0%, 100% { box-shadow: 0 0 4px rgba(34, 197, 94, 0.5); transform: scale(1); }
                50% { box-shadow: 0 0 12px rgba(34, 197, 94, 1); transform: scale(1.15); }
            }
            .animate-breathe-green {
                animation: breathe-green 2s infinite ease-in-out;
            }
        </style>
    `;

    html += `
        <div class="px-4 mb-4">
            <div id="shift-status-card" class="flex items-center justify-between bg-white p-3 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors" onclick="window.location.hash='#shifts'">
                <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Shift Status</span>
                    <span id="sidebar-shift-text" class="text-sm font-bold text-gray-500">Checking...</span>
                </div>
                <div class="relative flex items-center justify-center">
                    <div id="sidebar-shift-dot" class="w-4 h-4 rounded-full bg-gray-300 border-2 border-white shadow-sm transition-all duration-500"></div>
                </div>
            </div>
        </div>
    `;

    menuItems.forEach(item => {
        if (item.section) {
            html += `<div class="px-4 py-2 mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">${item.section}</div>`;
        } else {
            if (checkPermission(item.permission, item.type)) {
                const activeClass = currentHash === item.hash ? "bg-blue-100 text-blue-700 border-r-4 border-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";
                html += `<a href="${item.hash}" class="flex items-center px-4 py-2 text-sm font-medium transition-colors duration-150 ${activeClass}"><span class="mr-3 text-lg">${item.icon}</span>${item.label}</a>`;
            }
        }
    });

    html += `</div>`;
    sidebar.innerHTML = html;
    sidebar.classList.remove("hidden");

    // Delay slightly to ensure DOM update is processed
    setTimeout(() => updateSidebarShiftStatus(0), 50);
}

async function updateSidebarShiftStatus(retryCount = 0) {
    const dot = document.getElementById("sidebar-shift-dot");
    const text = document.getElementById("sidebar-shift-text");
    
    console.log(`updateSidebarShiftStatus: Checking status (Attempt ${retryCount + 1})...`);

    if (!dot || !text) {
        console.warn("Sidebar shift status elements not found. Retrying...");
        if (retryCount < 5) {
            setTimeout(() => updateSidebarShiftStatus(retryCount + 1), 500);
        }
        return;
    }

    try {
        const shift = await checkActiveShift();
        console.log("updateSidebarShiftStatus: Result:", shift);

        if (shift) {
            console.log("updateSidebarShiftStatus: Shift OPEN -> Green");
            dot.className = "w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-breathe-green";
            text.textContent = "OPEN";
            text.className = "text-sm font-bold text-green-600";
        } else {
            console.log("updateSidebarShiftStatus: Shift CLOSED -> Red");
            dot.className = "w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-sm";
            text.textContent = "CLOSED";
            text.className = "text-sm font-bold text-red-600";
        }
    } catch (error) {
        console.error("updateSidebarShiftStatus: Error:", error);
        dot.className = "w-4 h-4 rounded-full bg-gray-400 border-2 border-white";
        text.textContent = "OFFLINE";
        text.className = "text-sm font-bold text-gray-500";
    }
}