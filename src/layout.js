import { checkPermission, logout, getUserProfile } from "./auth.js";
import { checkActiveShift } from "./modules/shift.js";
import { getRecentNotifications, markAllAsRead } from "./services/notification-service.js";

export function renderSidebar() {
    console.log("renderSidebar: Function called.");
    renderHeader();

    const sidebar = document.getElementById("sidebar-container");
    
    if (!sidebar) {
        console.error("renderSidebar: #sidebar-container not found in DOM.");
        return;
    }

    const currentRawHash = window.location.hash || "#dashboard";
    let currentHash = currentRawHash;
    if (currentRawHash.startsWith("#_")) {
        try {
            currentHash = "#" + atob(currentRawHash.substring(2));
        } catch (e) {}
    }

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

    let html = `
        <button id="btn-toggle-sidebar" class="absolute -right-3 top-12 bg-white border border-gray-200 rounded-full p-1 shadow-md z-20 text-gray-400 hover:text-blue-600 transition-all duration-300 focus:outline-none" title="${isCollapsed ? 'Expand' : 'Collapse'}">
            ${isCollapsed ? 
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>' : 
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>'
            }
        </button>
        <div class="flex flex-col h-full py-2 overflow-y-auto overflow-x-hidden">
    `;

    // Shift Status at the top
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

    const menuItems = [
        { section: "Front Office" },
        { label: "Dashboard", icon: "📊", hash: "#dashboard", permission: "reports", type: "read" },
        { label: "POS", icon: "🛒", hash: "#pos", permission: "pos", type: "read" },
        { label: "Customers", icon: "👥", hash: "#customers", permission: "customers", type: "read" },
        { label: "Shifts", icon: "⏱️", hash: "#shifts", permission: "shifts", type: "read" },
        { label: "Returns", icon: "↩️", hash: "#returns", permission: "returns", type: "read" },
        { label: "Profile", icon: "👤", hash: "#profile" },
        
        { section: "Inventory" },
        { label: "Items", icon: "📦", hash: "#items", permission: "items", type: "read" },
        { label: "Suppliers", icon: "🏭", hash: "#suppliers", permission: "suppliers", type: "read" },
        { label: "Stock In", icon: "🚛", hash: "#stockin", permission: "stockin", type: "read" },
        { label: "Stock Count", icon: "📋", hash: "#stock-count", permission: "stock-count", type: "read" },
        
        { section: "Back Office" },
        { label: "Expenses", icon: "💸", hash: "#expenses", permission: "expenses", type: "read" },
        { label: "Reports", icon: "📈", hash: "#reports", permission: "reports", type: "read" },
        { label: "Users", icon: "👤", hash: "#users", permission: "users", type: "read" },
        { label: "Settings", icon: "⚙️", hash: "#settings", permission: "settings", type: "read" },
        { label: "Migrate", icon: "🔄", hash: "#migrate", permission: "migrate", type: "write" },
    ];

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

    // Helper to obfuscate hashes in the URL bar (e.g., #users -> #_dXNlcnM)
    const obfuscate = (h) => h === "#dashboard" ? h : "#_" + btoa(h.substring(1));

    menuItems.forEach(item => {
        if (item.section) {
            if (!isCollapsed) {
                html += `<div class="px-4 py-2 mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">${item.section}</div>`;
            } else {
                html += `<div class="my-2 border-t border-gray-200 mx-4"></div>`;
            }
        } else {
            if (!item.permission || checkPermission(item.permission, item.type)) {
                const activeClass = currentHash === item.hash ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";
                
                if (isCollapsed) {
                    html += `<a href="${obfuscate(item.hash)}" class="flex justify-center py-3 my-1 mx-2 rounded-lg transition-colors duration-150 ${activeClass}" title="${item.label}"><span class="text-xl">${item.icon}</span></a>`;
                } else {
                    const activeBorder = currentHash === item.hash ? "border-r-4 border-blue-700" : "";
                    html += `<a href="${obfuscate(item.hash)}" class="flex items-center px-4 py-2 text-sm font-medium transition-colors duration-150 ${activeClass} ${activeBorder}"><span class="mr-3 text-lg">${item.icon}</span>${item.label}</a>`;
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
    setTimeout(() => {
        updateSidebarShiftStatus(0);
        updateNotificationUI();
    }, 50);
}

async function getStoreSettings() {
    try {
        const res = await fetch('api/router.php?file=settings');
        const settings = await res.json();
        return settings?.store || { name: "LightPOS", logo: "" };
    } catch (e) {
        return { name: "LightPOS", logo: "" };
    }
}

export async function renderLoginBranding() {
    const brandingContainer = document.getElementById("login-branding");
    if (!brandingContainer) return;

    const { name: storeName, logo: storeLogo } = await getStoreSettings();

    brandingContainer.innerHTML = `
        <div class="flex flex-col items-center mb-8">
            ${storeLogo ? `<img src="${storeLogo}" class="h-20 w-auto mb-4 object-contain">` : ''}
            <h1 class="text-3xl font-bold text-gray-900 tracking-tight">${storeName}</h1>
            <div class="w-16 h-1 bg-blue-600 mt-2 rounded-full"></div>
        </div>
    `;
}

export async function renderHeader() {
    const headerActions = document.getElementById("header-actions");
    if (!headerActions) return;

    // Fetch Store Info
    const { name: storeName, logo: storeLogo } = await getStoreSettings();

    const profile = getUserProfile();
    const initials = profile?.name ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '??';

    const canSeeNotifications = checkPermission("reports", "read") || checkPermission("users", "read");

    const titleCenter = document.getElementById("header-title-center");
    if (titleCenter) {
        titleCenter.innerHTML = `<div class="flex items-center gap-2">${storeLogo ? `<img src="${storeLogo}" class="h-8 w-auto object-contain">` : ''}<span class="font-bold text-white tracking-tight">${storeName}</span></div>`;
    }

    headerActions.innerHTML = `
        <div class="flex items-center gap-2 mr-4 cursor-pointer group border-r border-blue-600 pr-4 select-none active:opacity-80 active:scale-95 transition-all touch-manipulation" id="btn-manual-sync" title="Click to sync now">
            <div id="sync-indicator-dot" class="w-2 h-2 rounded-full ${navigator.onLine ? 'bg-green-500' : 'bg-red-500'}"></div>
            <div class="flex flex-col">
                <span class="text-[9px] text-blue-200 uppercase font-bold leading-none">Sync Status</span>
                <span id="last-sync-label" class="text-[10px] text-white font-medium leading-tight">Loading...</span>
            </div>
            <button type="button" id="sync-icon-btn" class="text-blue-200 group-hover:text-white transition-colors focus:outline-none">
                <svg id="sync-icon-svg" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </button>
        </div>
        ${canSeeNotifications ? `
            <div class="relative">
                <button id="btn-notifications" class="relative text-white hover:text-blue-200 transition-colors focus:outline-none" title="Notifications">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                    <span id="notification-badge" class="absolute -top-1 -right-1 block h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white hidden"></span>
                </button>
                <div id="notification-dropdown" class="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl overflow-hidden z-[60] hidden border border-blue-200 text-gray-800">
                    <div class="py-2 px-4 bg-blue-700 text-white flex justify-between items-center">
                        <span class="text-xs font-bold uppercase tracking-wider">Notifications</span>
                    </div>
                    <div id="notification-list" class="max-h-80 overflow-y-auto">
                        <div class="p-4 text-center text-gray-400 text-xs">No notifications</div>
                    </div>
                </div>
            </div>
        ` : ''}
        <div class="flex items-center gap-3 ml-2 border-l border-blue-600 pl-4">
            <div class="w-8 h-8 rounded-full bg-blue-800 border border-blue-400 flex items-center justify-center text-[10px] font-bold text-white shadow-inner" title="${profile?.name || 'User'}">
                ${initials}
            </div>
            <button id="btn-logout" class="text-white hover:text-red-200 transition-colors" title="Logout">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </button>
        </div>
    `;

    document.getElementById("btn-logout")?.addEventListener("click", () => logout());

    const btnSync = document.getElementById("btn-manual-sync");
    if (btnSync) {
        btnSync.addEventListener("click", async () => {
            if (!navigator.onLine) return;
            const icon = document.getElementById("sync-icon-svg");
            const dot = document.getElementById("sync-indicator-dot");
            const label = document.getElementById("last-sync-label");
            if (icon.classList.contains("animate-spin")) return;

            icon.classList.add("animate-spin");
            if (label) label.textContent = "Syncing...";
            dot.classList.replace("bg-green-500", "bg-yellow-500");
            
            try {
                const { syncAll } = await import("./services/sync-service.js");
                await syncAll();
            } catch (e) {
                console.error("Manual sync failed", e);
            } finally {
                icon.classList.remove("animate-spin");
                dot.classList.replace("bg-yellow-500", "bg-green-500");
            }
        });
    }

    if (canSeeNotifications) {
        const btnNotif = document.getElementById("btn-notifications");
        const dropdownNotif = document.getElementById("notification-dropdown");
        if (btnNotif && dropdownNotif) {
            btnNotif.addEventListener("click", (e) => {
                e.stopPropagation();
                const isHidden = dropdownNotif.classList.contains("hidden");
                dropdownNotif.classList.toggle("hidden");
                if (isHidden) markAllAsRead();
            });
        }
    }

    updateSyncUI();
}

window.addEventListener('sync-updated', updateSyncUI);
window.addEventListener('online', () => {
    const dot = document.getElementById("sync-indicator-dot");
    if (dot) {
        dot.classList.remove("bg-red-500");
        dot.classList.add("bg-green-500");
    }
});
window.addEventListener('offline', () => {
    const dot = document.getElementById("sync-indicator-dot");
    if (dot) {
        dot.classList.remove("bg-green-500");
        dot.classList.add("bg-red-500");
    }
});

function updateSyncUI() {
    const label = document.getElementById('last-sync-label');
    if (!label) return;

    const lastSync = localStorage.getItem('last_sync_timestamp');
    const date = new Date(lastSync);

    if (!lastSync || isNaN(date.getTime())) {
        label.textContent = "Never synced";
        return;
    }

    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) {
        label.textContent = "Just now";
    } else if (diffMin < 60) {
        label.textContent = `${diffMin}m ago`;
    } else {
        label.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

window.addEventListener('notification-updated', updateNotificationUI);

document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("notification-dropdown");
    const btn = document.getElementById("btn-notifications");
    if (dropdown && !dropdown.contains(e.target) && btn && !btn.contains(e.target)) {
        dropdown.classList.add("hidden");
    }
});

async function updateNotificationUI() {
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');
    if (!badge || !list) return;

    const notifications = await getRecentNotifications(7);
    const unreadCount = notifications.filter(n => n.read === 0).length;

    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (notifications.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs">No notifications</div>';
    } else {
        list.innerHTML = notifications.map(n => `
            <div class="px-4 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[10px] font-bold uppercase ${n.type === 'Void' ? 'text-red-500' : n.type === 'Adjustment' ? 'text-yellow-600' : 'text-blue-600'}">${n.type}</span>
                    <span class="text-[9px] text-gray-400">${new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p class="text-xs text-gray-700 leading-tight">${n.message}</p>
            </div>
        `).join('');
    }
}

async function updateSidebarShiftStatus(retryCount = 0) {
    const dot = document.getElementById("sidebar-shift-dot");
    const text = document.getElementById("sidebar-shift-text");
    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    const dotSize = isCollapsed ? "w-3 h-3" : "w-4 h-4";
    
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
            dot.className = `${dotSize} rounded-full bg-green-500 border-2 border-white shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-breathe-green`;
            text.textContent = "OPEN";
            text.className = "text-sm font-bold text-green-600";
        } else {
            console.log("updateSidebarShiftStatus: Shift CLOSED -> Red");
            dot.className = `${dotSize} rounded-full bg-red-500 border-2 border-white shadow-sm`;
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