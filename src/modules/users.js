import { checkPermission, getUserProfile, updateLocalProfile } from "../auth.js";
import { renderSidebar } from "../layout.js";
import { dbRepository as Repository } from "../db.js";
import { SyncEngine } from "../services/SyncEngine.js";

export const MODULES = ['pos', 'customers', 'shifts', 'items', 'suppliers', 'purchase_orders', 'stockin', 'stock-count', 'expenses', 'reports', 'users', 'migrate', 'returns', 'settings'];

export const ROLES = {
    admin: {
        label: 'Administrator',
        permissions: MODULES.reduce((acc, mod) => ({ ...acc, [mod]: { read: true, write: true } }), {})
    },
    manager: {
        label: 'Manager',
        permissions: {
            pos: { read: true, write: true },
            customers: { read: true, write: true },
            shifts: { read: true, write: true },
            items: { read: true, write: true },
            suppliers: { read: true, write: true },
            purchase_orders: { read: true, write: true },
            stockin: { read: true, write: true },
            'stock-count': { read: true, write: true },
            expenses: { read: true, write: true },
            reports: { read: true, write: false },
            returns: { read: true, write: true },
            users: { read: false, write: false },
            migrate: { read: false, write: false },
            settings: { read: false, write: false }
        }
    },
    cashier: {
        label: 'Cashier',
        permissions: MODULES.reduce((acc, mod) => ({ ...acc, [mod]: { read: ['pos', 'customers', 'shifts', 'returns'].includes(mod), write: ['pos', 'customers', 'shifts', 'returns'].includes(mod) } }), {})
    },
    custom: { label: 'Custom', permissions: {} }
};

export async function loadUsersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("users", "write");
    content.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h1 class="text-2xl font-bold text-gray-800">User Management</h1>
                    <div class="flex gap-4 mt-2">
                        <button id="filter-all" class="text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1">All Users</button>
                        <button id="filter-pending" class="text-sm font-medium text-gray-500 hover:text-blue-600 pb-1">Pending Approval</button>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button id="btn-refresh-users" class="bg-gray-100 text-gray-600 px-4 py-2 rounded hover:bg-gray-200 transition">
                        Refresh
                    </button>
                    <button id="btn-add-user" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 ${canWrite ? '' : 'hidden'}">
                        Add User
                    </button>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow overflow-hidden">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permissions</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body" class="bg-white divide-y divide-gray-200">
                        <tr><td colspan="5" class="px-6 py-4 text-center">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- User Modal -->
        <div id="user-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 id="modal-title" class="text-lg leading-6 font-medium text-gray-900 mb-4">Add User</h3>
                    <form id="user-form">
                        <div class="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                            <label class="block text-sm font-bold text-blue-800 mb-1">Role Template</label>
                            <select id="user-role" class="block w-full border border-blue-300 rounded-md shadow-sm p-2 bg-white">
                                <option value="custom">Custom Permissions</option>
                                <option value="cashier">Cashier</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Email (ID)</label>
                                <input type="email" id="user-email" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Display Name</label>
                                <input type="text" id="user-name" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Contact Number</label>
                                <input type="text" id="user-phone" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            </div>
                        </div>

                        <div class="mb-4" id="password-container">
                            <label class="block text-sm font-medium text-gray-700">Password</label>
                            <input type="password" id="user-password" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" placeholder="Min. 6 characters">
                            <p class="text-xs text-gray-500 mt-1">Required for new users.</p>
                        </div>
                        
                        <div class="mb-4">
                            <label class="flex items-center">
                                <input type="checkbox" id="user-active" class="form-checkbox h-5 w-5 text-blue-600">
                                <span class="ml-2 text-gray-700">Account Active</span>
                            </label>
                        </div>

                        <div class="mb-4">
                            <h4 class="font-medium text-gray-900 mb-2">Permissions Matrix</h4>
                            <div class="border rounded-md overflow-hidden">
                                <table class="min-w-full divide-y divide-gray-200">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
                                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                                Read <br> <input type="checkbox" id="select-all-read" class="form-checkbox h-3 w-3 text-blue-600">
                                            </th>
                                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                                Write <br> <input type="checkbox" id="select-all-write" class="form-checkbox h-3 w-3 text-blue-600">
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody id="permissions-body" class="bg-white divide-y divide-gray-200">
                                        <!-- Generated via JS -->
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="flex justify-end gap-2 mt-4">
                            <button type="button" id="btn-cancel-user" class="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300">Cancel</button>
                            <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Save User</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    if (canWrite) {
        document.getElementById("btn-add-user").addEventListener("click", () => openUserModal());
    }
    document.getElementById("btn-refresh-users").addEventListener("click", () => fetchAndRenderUsers());
    document.getElementById("btn-cancel-user").addEventListener("click", closeUserModal);
    document.getElementById("user-form").addEventListener("submit", handleUserSubmit);

    // Filter Logic
    const filterAll = document.getElementById("filter-all");
    const filterPending = document.getElementById("filter-pending");

    filterAll.onclick = () => {
        filterAll.className = "text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1";
        filterPending.className = "text-sm font-medium text-gray-500 hover:text-blue-600 pb-1";
        fetchAndRenderUsers("all");
    };

    filterPending.onclick = () => {
        filterPending.className = "text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1";
        filterAll.className = "text-sm font-medium text-gray-500 hover:text-blue-600 pb-1";
        fetchAndRenderUsers("pending");
    };

    await fetchAndRenderUsers("all");
}

async function fetchAndRenderUsers(filter = "all") {
    const tbody = document.getElementById("users-table-body");
    const canWrite = checkPermission("users", "write");
    try {
        if (navigator.onLine) {
            await SyncEngine.sync();
        }
        
        const users = await Repository.getAll('users');
        
        tbody.innerHTML = "";
        
        let filteredUsers = users;
        if (filter === "pending") {
            filteredUsers = users.filter(u => {
                const hasPerms = u.permissions && Object.values(u.permissions).some(p => p.read || p.write);
                return !hasPerms || !u.is_active;
            });
        }

        if (!Array.isArray(filteredUsers) || filteredUsers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No users found matching criteria.</td></tr>`;
            return;
        }

        filteredUsers.forEach((user) => {
            const tr = document.createElement("tr");
            
            let permCount = 0;
            if (user.permissions) {
                Object.values(user.permissions).forEach(p => {
                    if (p.read) permCount++;
                });
            }
            
            // Normalize is_active to handle 1/0, "1"/"0", true/false
            const isActive = user.is_active === undefined ? true : (user.is_active === true || user.is_active === 1 || user.is_active === '1');

            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.name || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.email}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${permCount} Modules Configured
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-indigo-600 hover:text-indigo-900 btn-edit ${canWrite ? '' : 'hidden'}">Edit</button>
                </td>
            `;
            
            tr.querySelector(".btn-edit").addEventListener("click", () => openUserModal(user));
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading users.</td></tr>`;
    }
}

function openUserModal(user = null) {
    const modal = document.getElementById("user-modal");
    const title = document.getElementById("modal-title");
    const emailInput = document.getElementById("user-email");
    const nameInput = document.getElementById("user-name");
    const phoneInput = document.getElementById("user-phone");
    const activeInput = document.getElementById("user-active");
    const permBody = document.getElementById("permissions-body");
    const passwordContainer = document.getElementById("password-container");
    const roleSelect = document.getElementById("user-role");

    modal.classList.remove("hidden");
    
    // Generate Permissions Matrix
    permBody.innerHTML = MODULES.map(mod => {
        const p = user?.permissions?.[mod] || { read: false, write: false };
        return `
            <tr>
                <td class="px-4 py-2 text-sm text-gray-700 capitalize">${mod.replace('-', ' ')}</td>
                <td class="px-4 py-2 text-center">
                    <input type="checkbox" class="perm-check form-checkbox h-4 w-4 text-blue-600" data-module="${mod}" data-type="read" ${p.read ? 'checked' : ''}>
                </td>
                <td class="px-4 py-2 text-center">
                    <input type="checkbox" class="perm-check form-checkbox h-4 w-4 text-blue-600" data-module="${mod}" data-type="write" ${p.write ? 'checked' : ''}>
                </td>
            </tr>
        `;
    }).join("");

    if (user) {
        title.textContent = "Edit User";
        emailInput.value = user.email;
        emailInput.disabled = true; // Cannot change ID
        nameInput.value = user.name;
        phoneInput.value = user.phone || "";
        activeInput.checked = user.is_active === true || user.is_active === 1 || user.is_active === '1';
        
        passwordContainer.classList.remove("hidden");
        document.getElementById("user-password").placeholder = "Leave blank to keep current";

        // Determine Role based on permissions
        let matchedRole = 'custom';
        for (const [roleKey, roleData] of Object.entries(ROLES)) {
            if (roleKey === 'custom') continue;
            if (JSON.stringify(user.permissions) === JSON.stringify(roleData.permissions)) {
                matchedRole = roleKey;
                break;
            }
        }
        roleSelect.value = matchedRole;
    } else {
        title.textContent = "Add User";
        emailInput.value = "";
        emailInput.disabled = false;
        nameInput.value = "";
        phoneInput.value = "";
        activeInput.checked = true;
        passwordContainer.classList.remove("hidden");
        roleSelect.value = "cashier"; // Default for new users
        document.getElementById("user-password").value = "";
        
        // Apply default role permissions
        setTimeout(() => applyRolePermissions("cashier"), 0);
    }

    // Event Listeners for Role and Select All
    roleSelect.onchange = (e) => applyRolePermissions(e.target.value);
    
    document.getElementById("select-all-read").onchange = (e) => {
        document.querySelectorAll('.perm-check[data-type="read"]').forEach(cb => cb.checked = e.target.checked);
        roleSelect.value = "custom";
    };
    
    document.getElementById("select-all-write").onchange = (e) => {
        document.querySelectorAll('.perm-check[data-type="write"]').forEach(cb => cb.checked = e.target.checked);
        roleSelect.value = "custom";
    };

    // If any individual checkbox is changed, set role to custom
    modal.querySelectorAll(".perm-check").forEach(cb => {
        cb.addEventListener("change", () => {
            roleSelect.value = "custom";
        });
    });
}

function applyRolePermissions(roleKey) {
    if (roleKey === 'custom') return;
    
    const perms = ROLES[roleKey].permissions;
    MODULES.forEach(mod => {
        const readCb = document.querySelector(`.perm-check[data-module="${mod}"][data-type="read"]`);
        const writeCb = document.querySelector(`.perm-check[data-module="${mod}"][data-type="write"]`);
        
        if (readCb) readCb.checked = perms[mod]?.read || false;
        if (writeCb) writeCb.checked = perms[mod]?.write || false;
    });
    
    document.getElementById("select-all-read").checked = false;
    document.getElementById("select-all-write").checked = false;
}

function closeUserModal() {
    document.getElementById("user-modal").classList.add("hidden");
}

async function handleUserSubmit(e) {
    e.preventDefault();
    
    const btnSave = e.target.querySelector('button[type="submit"]');
    const originalBtnText = btnSave.textContent;
    btnSave.disabled = true;
    btnSave.textContent = "Saving...";

    const email = document.getElementById("user-email").value.trim();
    const name = document.getElementById("user-name").value.trim();
    const phone = document.getElementById("user-phone").value.trim();
    const password = document.getElementById("user-password").value;
    const isActive = document.getElementById("user-active").checked;
    const isEdit = document.getElementById("user-email").disabled;

    try {
        if ((!isEdit || password) && (!password || password.length < 6)) {
            throw new Error("Password is required and must be at least 6 characters.");
        }
        
        // Harvest permissions
        const permissions = {};
        document.querySelectorAll(".perm-check").forEach(chk => {
            const mod = chk.dataset.module;
            const type = chk.dataset.type;
            if (!permissions[mod]) permissions[mod] = { read: false, write: false };
            permissions[mod][type] = chk.checked;
        });

        // To preserve existing password if not changed during edit, we need the full user list
        const existingUser = await Repository.get('users', email);

        if (!isEdit && existingUser) {
            throw new Error("User already exists.");
        }

        const userData = {
            ...existingUser,
            email,
            name,
            phone,
            is_active: isActive ? 1 : 0, // Store as 1/0 for SQLite compatibility
            permissions
        };
        
        // Only update password if provided
        if (password) {
            if (typeof md5 === 'function') {
                userData.password = md5(password);
            } else {
                console.error("MD5 function not found. Password not updated.");
                throw new Error("Security library missing. Password could not be set.");
            }
        }

        // Log user data before saving (mask sensitive hash)
        const debugUserData = { ...userData };
        // If password_hash present, partially mask it for logs
        if (debugUserData.password_hash) {
            debugUserData.password_hash = debugUserData.password_hash.slice(0,6) + '...';
        }
        if (debugUserData.password) {
            // Password on client is md5(password); mask it as well
            debugUserData.password = debugUserData.password.slice(0,6) + '...';
        }
        console.log("User submit data (masked):", debugUserData);

        // Optimistic UI: save locally first
        const saved = await Repository.upsert('users', userData);
        console.log("User saved locally. Outbox queued. Local record:", saved);

        // Trigger background sync, but don't block the UI
        if (navigator.onLine) {
            SyncEngine.sync().then(() => console.log("Background sync triggered after user save")).catch(e => console.warn("Background sync failed after user save:", e));
        }

        alert("User saved. Will sync with server.");
        closeUserModal();
        fetchAndRenderUsers();

        // If the edited user is the current user, update their session
        const currentUser = getUserProfile();
        if (currentUser && currentUser.email === userData.email) {
            updateLocalProfile(userData);
            renderSidebar();
        }
    } catch (error) {
        console.error("Error saving user:", error);
        alert("Failed to save user: " + error.message);
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = originalBtnText;
    }
}