import { getUserProfile, updateLocalProfile } from "../auth.js";

const API_URL = 'api/router.php';

export function loadProfileView() {
    const content = document.getElementById("main-content");
    const profile = getUserProfile();

    content.innerHTML = `
        <div class="max-w-2xl mx-auto mt-10">
            <div class="bg-white shadow-md rounded-lg overflow-hidden">
                <div class="bg-blue-600 px-6 py-4">
                    <h2 class="text-xl font-bold text-white">My Profile</h2>
                </div>
                
                <div class="p-6">
                    <div class="mb-6 border-b pb-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Account Information</h3>
                        <form id="form-update-profile">
                            <div class="grid grid-cols-1 gap-4 mb-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-500">Email Address (Username)</label>
                                    <div class="mt-1 text-gray-900 font-semibold">${profile?.email || 'N/A'}</div>
                                </div>
                                <div>
                                    <label class="block text-gray-700 text-sm font-bold mb-2">Display Name</label>
                                    <input type="text" id="profile-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" value="${profile?.name || ''}" required>
                                </div>
                                <div>
                                    <label class="block text-gray-700 text-sm font-bold mb-2">Contact Number</label>
                                    <input type="text" id="profile-phone" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" value="${profile?.phone || ''}">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-500">Role / Permissions</label>
                                <div class="mt-1 text-sm text-gray-600">
                                    ${Object.keys(profile?.permissions || {}).length} Modules Enabled
                                </div>
                            </div>
                            <div id="profile-update-message" class="hidden mb-4 p-3 rounded text-sm"></div>
                            <div class="flex justify-end">
                                <button type="submit" id="btn-save-profile" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
                                    Update Details
                                </button>
                            </div>
                        </form>
                    </div>

                    <div>
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Security</h3>
                        <form id="form-change-password">
                            <div class="mb-4">
                                <label class="block text-gray-700 text-sm font-bold mb-2">Current Password</label>
                                <input type="password" id="current-password" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                                <p class="text-xs text-gray-500 mt-1">Required to verify your identity.</p>
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label class="block text-gray-700 text-sm font-bold mb-2">New Password</label>
                                    <input type="password" id="new-password" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required minlength="6">
                                </div>
                                <div>
                                    <label class="block text-gray-700 text-sm font-bold mb-2">Confirm New Password</label>
                                    <input type="password" id="confirm-password" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required minlength="6">
                                </div>
                            </div>

                            <div id="password-message" class="hidden mb-4 p-3 rounded text-sm"></div>

                            <div class="flex justify-end">
                                <button type="submit" id="btn-save-password" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
                                    Update Password
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById("form-update-profile").addEventListener("submit", handleUpdateProfile);
    document.getElementById("form-change-password").addEventListener("submit", handleChangePassword);
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    if (!navigator.onLine) {
        showProfileMessage(document.getElementById("profile-update-message"), "You must be online to update your profile.", true);
        return;
    }

    const name = document.getElementById("profile-name").value.trim();
    const phone = document.getElementById("profile-phone").value.trim();
    const btn = document.getElementById("btn-save-profile");
    const msgDiv = document.getElementById("profile-update-message");

    try {
        btn.disabled = true;
        btn.textContent = "Updating...";

        const profile = getUserProfile();
        if (!profile || !profile.email) throw new Error("User session invalid.");

        const response = await fetch(`${API_URL}?file=users`);
        let users = await response.json();
        if (!Array.isArray(users)) users = [];

        const userIndex = users.findIndex(u => u.email === profile.email);
        if (userIndex === -1) throw new Error("User record not found.");

        users[userIndex].name = name;
        users[userIndex].phone = phone;

        await fetch(`${API_URL}?file=users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(users)
        });

        updateLocalProfile(users[userIndex]);
        showProfileMessage(msgDiv, "Profile updated successfully!", false);

    } catch (error) {
        console.error("Error updating profile:", error);
        showProfileMessage(msgDiv, error.message || "Failed to update profile.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Update Details";
    }
}

async function handleChangePassword(e) {
    e.preventDefault();
    if (!navigator.onLine) {
        showProfileMessage(document.getElementById("password-message"), "You must be online to change your password.", true);
        return;
    }
    
    const currentPass = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password").value;
    const confirmPass = document.getElementById("confirm-password").value;
    const msgDiv = document.getElementById("password-message");
    const btn = document.getElementById("btn-save-password");

    if (newPass !== confirmPass) {
        showProfileMessage(msgDiv, "New passwords do not match.", true);
        return;
    }

    if (newPass.length < 6) {
        showProfileMessage(msgDiv, "Password must be at least 6 characters.", true);
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = "Updating...";

        const profile = getUserProfile();
        if (!profile || !profile.email) throw new Error("User session invalid.");

        // 1. Fetch users
        const response = await fetch(`${API_URL}?file=users`);
        let users = await response.json();
        if (!Array.isArray(users)) users = [];

        // 2. Find user
        const userIndex = users.findIndex(u => u.email === profile.email);
        if (userIndex === -1) throw new Error("User record not found.");

        // 3. Verify Current Password (MD5)
        // Note: Assuming md5() is available globally as used in users.js
        if (users[userIndex].password !== md5(currentPass)) {
            throw new Error("Current password is incorrect.");
        }

        // 4. Update Password
        users[userIndex].password = md5(newPass);

        // 5. Save back
        await fetch(`${API_URL}?file=users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(users)
        });

        showProfileMessage(msgDiv, "Password updated successfully!", false);
        document.getElementById("form-change-password").reset();

    } catch (error) {
        console.error("Error updating password:", error);
        showProfileMessage(msgDiv, error.message || "Failed to update password.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Update Password";
    }
}

function showProfileMessage(msgDiv, msg, isError) {
    msgDiv.textContent = msg;
    msgDiv.classList.remove("hidden", "bg-red-100", "text-red-700", "bg-green-100", "text-green-700", "border", "border-red-200", "border-green-200");
    if (isError) {
        msgDiv.classList.add("bg-red-100", "text-red-700", "border", "border-red-200");
    } else {
        msgDiv.classList.add("bg-green-100", "text-green-700", "border", "border-green-200");
    }
    msgDiv.classList.remove("hidden");
}