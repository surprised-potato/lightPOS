import { checkActiveShift, showCloseShiftModal, showAdjustCashModal } from "./modules/shift.js";
import { checkActiveShift, showCloseShiftModal } from "./modules/shift.js";
import { getUserProfile, checkPermission } from "./auth.js";

export function renderSidebar() {
    const profile = getUserProfile();
    const sidebar = document.getElementById("sidebar-container");

    // 1. Check for Zero Access / Pending Approval
    const hasPermissions = profile && profile.permissions && Object.keys(profile.permissions).length > 0;
    
    if (!hasPermissions) {
        sidebar.innerHTML = ""; 
        return;
    }

    // 2. Render Sidebar with Permission Filtering
    sidebar.innerHTML = `
        <div class="h-full flex flex-col bg-white">
            <div class="p-4 border-b">
                <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Menu</div>
                <div id="sidebar-shift-status" class="text-xs font-bold text-gray-400 mt-1">Loading...</div>
            </div>
            <nav class="flex-1 overflow-y-auto py-4">
                <ul class="space-y-1 px-2">
                    <li><a href="#dashboard" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150 group">
                        <span class="font-medium">Dashboard</span>
                    </a></li>
                    <li class="${checkPermission('pos', 'read') ? '' : 'hidden'}"><a href="#pos" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Point of Sale</span>
                    </a></li>
                    <li class="${checkPermission('items', 'read') ? '' : 'hidden'}"><a href="#suppliers" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Suppliers</span>
                    </a></li>
                    <li class="${checkPermission('items', 'read') ? '' : 'hidden'}"><a href="#items" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Items</span>
                    </a></li>
                    <li class="${checkPermission('stockin', 'read') ? '' : 'hidden'}"><a href="#stockin" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Stock In</span>
                    </a></li>
                    <li class="${checkPermission('stock-count', 'read') ? '' : 'hidden'}"><a href="#stock-count" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Stock Count</span>
                    </a></li>
                    <li class="${checkPermission('shifts', 'read') ? '' : 'hidden'}"><a href="#shifts" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Shifts</span>
                    </a></li>
                    <li class="${checkPermission('expenses', 'read') ? '' : 'hidden'}"><a href="#expenses" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Expenses</span>
                    </a></li>
                    <li class="${checkPermission('reports', 'read') ? '' : 'hidden'}"><a href="#reports" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Reports</span>
                    </a></li>
                    <li class="${checkPermission('users', 'read') ? '' : 'hidden'}"><a href="#users" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Users</span>
                    </a></li>
                    <li><a href="#profile" class="nav-link flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors duration-150">
                        <span class="font-medium">Profile</span>
                    </a></li>
                </ul>
            </nav>
            <div class="p-4 border-t text-xs text-gray-500 text-center">
                LightPOS v1.0
            </div>
        </div>
    `;
    updateShiftStatus();
}

async function updateShiftStatus() {
    const statusEl = document.getElementById("sidebar-shift-status");
    const shift = await checkActiveShift();
    if (shift) {
        statusEl.innerHTML = `
            <div class="flex flex-col gap-1">
                <span class="text-green-600">● Shift Open</span>
                <div class="flex gap-1">
                    <button id="btn-adjust-cash" class="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded text-center flex-1">Adjust</button>
                    <button id="btn-close-shift" class="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded text-center flex-1">Close</button>
                </div>
                <button id="btn-close-shift" class="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded text-center w-full">Close Shift</button>
            </div>
        `;
        document.getElementById("btn-adjust-cash").addEventListener("click", () => {
            showAdjustCashModal(() => updateShiftStatus());
        });
        document.getElementById("btn-close-shift").addEventListener("click", () => {
            showCloseShiftModal(() => updateShiftStatus());
        });
    } else {
        statusEl.innerHTML = `<span class="text-red-500">● Shift Closed</span>`;
    }
}