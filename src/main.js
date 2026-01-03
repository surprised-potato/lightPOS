import { login, logout, monitorAuthState, loginWithGoogle, fetchUserProfile } from "./auth.js";
import { renderSidebar } from "./layout.js";
import { initRouter } from "./router.js";
import { startRealtimeSync } from "./services/sync-service.js";

// DOM Elements
const loginView = document.getElementById("login-view");
const appContainer = document.getElementById("app-container");
const formLogin = document.getElementById("form-login");
const btnLogout = document.getElementById("btn-logout");
const loginError = document.getElementById("login-error");
const mainContent = document.getElementById("main-content");
const btnGoogleLogin = document.getElementById("btn-google-login");

// 1. Monitor Auth State
monitorAuthState(async (user) => {
    if (user) {
        // User is logged in
        console.log("User authenticated:", user.email);
        loginView.classList.add("hidden");
        appContainer.classList.remove("hidden");
        
        await fetchUserProfile(user);

        // Initialize App Shell
        renderSidebar();
        initRouter();
        startRealtimeSync();
    } else {
        // User is logged out
        console.log("User signed out");
        appContainer.classList.add("hidden");
        loginView.classList.remove("hidden");
    }
});

// 2. Handle Login Submission
formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    
    loginError.classList.add("hidden");
    
    const result = await login(email, password);
    if (!result.success) {
        loginError.textContent = "Invalid email or password.";
        loginError.classList.remove("hidden");
    }
});

// 3. Handle Google Login
btnGoogleLogin.addEventListener("click", async () => {
    loginError.classList.add("hidden");
    
    const result = await loginWithGoogle();
    if (!result.success) {
        loginError.textContent = result.error;
        loginError.classList.remove("hidden");
    }
});

// 4. Handle Logout
btnLogout.addEventListener("click", () => logout());