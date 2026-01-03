import { auth, db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUserProfile = null;

export async function fetchUserProfile(user) {
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        currentUserProfile = userSnap.data();
    } else {
        // Create new user with Zero Access (Default Policy)
        const newProfile = {
            email: user.email,
            name: user.displayName || user.email.split('@')[0],
            is_active: true,
            permissions: {} // Empty permissions = Zero Access
        };
        await setDoc(userRef, newProfile);
        currentUserProfile = newProfile;
    }
    return currentUserProfile;
}

export function checkPermission(module, type) {
    if (!currentUserProfile || !currentUserProfile.is_active) return false;
    const perms = currentUserProfile.permissions || {};
    return perms[module]?.[type] === true;
}

export function getUserProfile() {
    return currentUserProfile;
}

export async function login(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Login Error:", error);
        return { success: false, error: error.message };
    }
}

export async function loginWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        return { success: true, user: result.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function logout() {
    try {
        await signOut(auth);
        currentUserProfile = null;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function monitorAuthState(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await fetchUserProfile(user);
        } else {
            currentUserProfile = null;
        }
        callback(user);
    });
}