import { auth } from "../firebase-config.js";
import { getUserProfile } from "../auth.js";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function loadProfileView() {
    const content = document.getElementById("main-content");
    const user = auth.currentUser;
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
                        <div class="grid grid-cols-1 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-500">Display Name</label>
                                <div class="mt-1 text-gray-900 font-semibold">${profile?.name || 'N/A'}</div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-500">Email Address</label>
                                <div class="mt-1 text-gray-900 font-semibold">${user?.email || 'N/A'}</div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-500">Role / Permissions</label>
                                <div class="mt-1 text-sm text-gray-600">
                                    ${Object.keys(profile?.permissions || {}).length} Modules Enabled
                                </div>
                            </div>
                        </div>
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

    document.getElementById("form-change-password").addEventListener("submit", handleChangePassword);
}

async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPass = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password").value;
    const confirmPass = document.getElementById("confirm-password").value;
    const msgDiv = document.getElementById("password-message");
    const btn = document.getElementById("btn-save-password");

    msgDiv.classList.add("hidden");
    msgDiv.className = "hidden mb-4 p-3 rounded text-sm"; // reset classes

    if (newPass !== confirmPass) {
        showMessage("New passwords do not match.", true);
        return;
    }

    if (newPass.length < 6) {
        showMessage("Password must be at least 6 characters.", true);
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = "Updating...";

        const user = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, currentPass);

        // 1. Re-authenticate
        await reauthenticateWithCredential(user, credential);

        // 2. Update Password
        await updatePassword(user, newPass);

        showMessage("Password updated successfully!", false);
        document.getElementById("form-change-password").reset();

    } catch (error) {
        console.error("Error updating password:", error);
        let errorMsg = "Failed to update password.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            errorMsg = "Current password is incorrect.";
        } else if (error.code === 'auth/weak-password') {
            errorMsg = "Password is too weak.";
        }
        showMessage(errorMsg, true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Update Password";
    }
}

function showMessage(msg, isError) {
    const msgDiv = document.getElementById("password-message");
    msgDiv.textContent = msg;
    msgDiv.classList.remove("hidden");
    if (isError) {
        msgDiv.classList.add("bg-red-100", "text-red-700", "border", "border-red-200");
    } else {
        msgDiv.classList.add("bg-green-100", "text-green-700", "border", "border-green-200");
    }
}