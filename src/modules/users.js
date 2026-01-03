import { checkPermission } from "../auth.js";

const API_URL = 'api/router.php';
const MODULES = ['pos', 'items', 'stockin', 'stock-count', 'reports', 'expenses', 'users', 'shifts'];

export async function loadUsersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("users", "write");
    content.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-2xl font-bold text-gray-800">User Management</h1>
                <button id="btn-add-user" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 ${canWrite ? '' : 'hidden'}">
                    Add User
                </button>
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
                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Email (ID)</label>
                                <input type="email" id="user-email" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Display Name</label>
                                <input type="text" id="user-name" required class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
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
                                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Read</th>
                                            <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Write</th>
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
    document.getElementById("btn-cancel-user").addEventListener("click", closeUserModal);
    document.getElementById("user-form").addEventListener("submit", handleUserSubmit);

    await fetchAndRenderUsers();
}

async function fetchAndRenderUsers() {
    const tbody = document.getElementById("users-table-body");
    const canWrite = checkPermission("users", "write");
    try {
        const response = await fetch(`${API_URL}?file=users`);
        const users = await response.json();
        
        tbody.innerHTML = "";
        
        if (!Array.isArray(users) || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No users found.</td></tr>`;
            return;
        }

        users.forEach((user) => {
            const tr = document.createElement("tr");
            
            let permCount = 0;
            if (user.permissions) {
                Object.values(user.permissions).forEach(p => {
                    if (p.read) permCount++;
                });
            }
            
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.name || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.email}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${user.is_active ? 'Active' : 'Inactive'}
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
    const activeInput = document.getElementById("user-active");
    const permBody = document.getElementById("permissions-body");
    const passwordContainer = document.getElementById("password-container");

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
        activeInput.checked = user.is_active;
        passwordContainer.classList.add("hidden");
    } else {
        title.textContent = "Add User";
        emailInput.value = "";
        emailInput.disabled = false;
        nameInput.value = "";
        activeInput.checked = true;
        passwordContainer.classList.remove("hidden");
        document.getElementById("user-password").value = "";
    }
}

function closeUserModal() {
    document.getElementById("user-modal").classList.add("hidden");
}

async function handleUserSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById("user-email").value.trim();
    const name = document.getElementById("user-name").value.trim();
    const password = document.getElementById("user-password").value;
    const isActive = document.getElementById("user-active").checked;
    const isEdit = document.getElementById("user-email").disabled;

    if (!isEdit && (!password || password.length < 6)) {
        alert("Password is required and must be at least 6 characters.");
        return;
    }
    
    // Harvest permissions
    const permissions = {};
    document.querySelectorAll(".perm-check").forEach(chk => {
        const mod = chk.dataset.module;
        const type = chk.dataset.type;
        if (!permissions[mod]) permissions[mod] = { read: false, write: false };
        permissions[mod][type] = chk.checked;
    });

    try {
        const response = await fetch(`${API_URL}?file=users`);
        let users = await response.json();
        if (!Array.isArray(users)) users = [];

        if (isEdit) {
            // Update existing
            const index = users.findIndex(u => u.email === email);
            if (index !== -1) {
                users[index].name = name;
                users[index].is_active = isActive;
                users[index].permissions = permissions;
                if (password) users[index].password = md5(password);
            }
        } else {
            // Create new
            if (users.find(u => u.email === email)) {
                alert("User already exists.");
                return;
            }
            users.push({
                email,
                name,
                password: md5(password),
                is_active: isActive,
                permissions
            });
        }

        await fetch(`${API_URL}?file=users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(users)
        });
        
        closeUserModal();
        fetchAndRenderUsers();
    } catch (error) {
        console.error("Error saving user:", error);
        alert("Failed to save user: " + error.message);
    }
}