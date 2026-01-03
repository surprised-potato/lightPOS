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
    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';

    // Adjust sidebar width classes
    sidebar.classList.add("transition-all", "duration-300");
    if (isCollapsed) {
        sidebar.classList.remove("w-64");
        sidebar.classList.add("w-20");
    } else {
        sidebar.classList.remove("w-20");
        sidebar.classList.add("w-64");
    }

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

    let html = `<div class="flex flex-col h-full py-2">`;

    // Toggle Button
    html += `
        <div class="px-4 mb-2 flex ${isCollapsed ? 'justify-center' : 'justify-end'}">
            <button id="btn-toggle-sidebar" class="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors" title="${isCollapsed ? 'Expand' : 'Collapse'}">
                ${isCollapsed ? '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>' : '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>'}
            </button>
        </div>
    `;

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

    if (isCollapsed) {
        html += `
            <div class="px-2 mb-4 flex justify-center">
                <div id="shift-status-card" class="w-10 h-10 flex items-center justify-center bg-white rounded-full border-2 border-gray-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors" title="Shift Status">
                    <div id="sidebar-shift-dot" class="w-3 h-3 rounded-full bg-gray-300 border border-white shadow-sm transition-all duration-500"></div>
                    <span id="sidebar-shift-text" class="hidden"></span>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="px-4 mb-4">
                <div id="shift-status-card" class="flex items-center justify-between bg-white p-3 rounded-lg border-2 border-gray-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors">
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
    }

    menuItems.forEach(item => {
        if (item.section) {
            if (!isCollapsed) {
                html += `<div class="px-4 py-2 mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">${item.section}</div>`;
            } else {
                html += `<div class="my-2 border-t border-gray-200 mx-4"></div>`;
            }
        } else {
            if (checkPermission(item.permission, item.type)) {
                const activeClass = currentHash === item.hash ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";
                
                if (isCollapsed) {
                    html += `<a href="${item.hash}" class="flex justify-center py-3 my-1 mx-2 rounded-lg transition-colors duration-150 ${activeClass}" title="${item.label}"><span class="text-xl">${item.icon}</span></a>`;
                } else {
                    const activeBorder = currentHash === item.hash ? "border-r-4 border-blue-700" : "";
                    html += `<a href="${item.hash}" class="flex items-center px-4 py-2 text-sm font-medium transition-colors duration-150 ${activeClass} ${activeBorder}"><span class="mr-3 text-lg">${item.icon}</span>${item.label}</a>`;
                }
            }
        }
    });

    html += `</div>`;
    sidebar.innerHTML = html;
    sidebar.classList.remove("hidden");

    // Add click handler for sidebar toggle
    document.getElementById("btn-toggle-sidebar").addEventListener("click", () => {
        localStorage.setItem('sidebar_collapsed', (!isCollapsed).toString());
        renderSidebar();
    });

    // Add click handler for shift status card
    const shiftCard = document.getElementById("shift-status-card");
    if (shiftCard) {
        shiftCard.addEventListener("click", () => window.location.hash = "#shifts");
    }

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