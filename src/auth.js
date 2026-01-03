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
    if (!currentUserProfile || !currentUserProfile.is_active) return false;
    const perms = currentUserProfile.permissions || {};
    return perms[module]?.[type] === true;
}

export function getUserProfile() {
    return currentUserProfile;
}