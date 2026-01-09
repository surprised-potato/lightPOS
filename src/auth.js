import { dbRepository as Repository } from "./db.js";
import { SyncEngine } from "./services/SyncEngine.js";

const API_URL = 'api/router.php';

let currentUserProfile = null;

export async function login(email, password) {
    try {
        const response = await fetch(`${API_URL}?action=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const text = await response.text();
        console.log("Server Response:", text); // Debug log
        
        const data = JSON.parse(text);
        
        if (response.ok && data.success) {
            currentUserProfile = data.user;
            console.log("Logged in user profile:", currentUserProfile); // Added for debugging
            localStorage.setItem('pos_user', JSON.stringify(currentUserProfile));
            return { success: true, user: currentUserProfile };
        } else {
            return { success: false, error: data.error || 'Login failed' };
        }
    } catch (error) {
        console.error("Login Error:", error);
        return { success: false, error: error.message };
    }
}

export async function logout() {
    currentUserProfile = null;
    localStorage.removeItem('pos_user');
    window.location.reload();
    return { success: true };
}

export function monitorAuthState(callback) {
    const stored = localStorage.getItem('pos_user');
    if (stored) {
        try {
            currentUserProfile = JSON.parse(stored);
            callback(currentUserProfile);
        } catch (e) {
            console.error("Auth Parse Error", e);
            localStorage.removeItem('pos_user');
            callback(null);
        }
    } else {
        callback(null);
    }
}

export function checkPermission(module, type) {
    return permissionManager.check(module, type);
}

export const permissionManager = {
    check: function(module, type) {
        if (!currentUserProfile || !currentUserProfile.is_active) return false;
        const perms = currentUserProfile.permissions || {};
        return perms[module]?.[type] === true;
    }
};

export function getUserProfile() {
    return currentUserProfile;
}

export function updateLocalProfile(updatedUser) {
    currentUserProfile = updatedUser;
    localStorage.setItem('pos_user', JSON.stringify(currentUserProfile));
}

const MAX_MANAGER_ATTEMPTS = 5;
const MANAGER_LOCKOUT_MS = 30000; // 30 seconds

export async function verifyManagerPassword(password) {
    const now = Date.now();
    const lockoutUntil = parseInt(localStorage.getItem('manager_lockout_until') || '0');
    
    if (now < lockoutUntil) return false;

    try {
        if (navigator.onLine) {
            await SyncEngine.sync();
        }
        
        const users = await Repository.getAll('users');

        const hashed = md5(password);
        const isValid = users.some(u => 
            u.is_active && 
            (u.permissions?.pos?.write || u.permissions?.shifts?.write) && 
            u.password === hashed
        );

        if (isValid) {
            localStorage.removeItem('manager_lockout_attempts');
            localStorage.removeItem('manager_lockout_until');
            return true;
        } else {
            let attempts = parseInt(localStorage.getItem('manager_lockout_attempts') || '0') + 1;
            localStorage.setItem('manager_lockout_attempts', attempts.toString());
            if (attempts >= MAX_MANAGER_ATTEMPTS) {
                localStorage.setItem('manager_lockout_until', (now + MANAGER_LOCKOUT_MS).toString());
            }
            return false;
        }
    } catch (e) {
        return false;
    }
}

export async function requestManagerApproval() {
    return new Promise((resolve) => {
        const modalId = 'modal-manager-approval';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-[100]';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6 w-80">
                <h3 class="text-lg font-bold mb-4 text-gray-800">Manager Approval</h3>
                <p class="text-sm text-gray-600 mb-4">Please enter manager password to proceed.</p>
                <input type="password" id="manager-password-input" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" placeholder="Password">
                <div id="approval-error" class="text-xs text-red-600 mb-4 hidden">Invalid manager password.</div>
                <div class="flex justify-end gap-2">
                    <button id="btn-cancel-approval" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded text-sm">Cancel</button>
                    <button id="btn-confirm-approval" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm">Verify</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = modal.querySelector('#manager-password-input');
        const btnConfirm = modal.querySelector('#btn-confirm-approval');
        const btnCancel = modal.querySelector('#btn-cancel-approval');
        const errorEl = modal.querySelector('#approval-error');

        const cleanup = () => modal.remove();

        const handleConfirm = async () => {
            const password = input.value;
            const now = Date.now();
            const lockoutUntil = parseInt(localStorage.getItem('manager_lockout_until') || '0');
            
            if (now < lockoutUntil) {
                const remaining = Math.ceil((lockoutUntil - now) / 1000);
                errorEl.textContent = `Too many failed attempts. Try again in ${remaining}s.`;
                errorEl.classList.remove('hidden');
                return;
            }

            errorEl.classList.add('hidden');
            const isValid = await verifyManagerPassword(password);
            if (isValid) {
                cleanup();
                resolve(true);
            } else {
                const attempts = parseInt(localStorage.getItem('manager_lockout_attempts') || '0');
                if (attempts >= MAX_MANAGER_ATTEMPTS) {
                    const remaining = Math.ceil(MANAGER_LOCKOUT_MS / 1000);
                    errorEl.textContent = `Too many failed attempts. Locked for ${remaining}s.`;
                } else {
                    errorEl.textContent = `Invalid manager password. (${attempts}/${MAX_MANAGER_ATTEMPTS})`;
                }
                errorEl.classList.remove('hidden');
                input.value = "";
                input.focus();
            }
        };

        btnConfirm.onclick = handleConfirm;
        btnCancel.onclick = () => { cleanup(); resolve(false); };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') { cleanup(); resolve(false); }
        };

        setTimeout(() => input.focus(), 100);
    });
}