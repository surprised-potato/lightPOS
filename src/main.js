import { login, logout, monitorAuthState } from "./auth.js";
import { renderSidebar, renderLoginBranding } from "./layout.js";
import { initRouter } from "./router.js";
import { startRealtimeSync } from "./services/sync-service.js";

// DOM Elements
const loginView = document.getElementById("login-view");
const appContainer = document.getElementById("app-container");
const formLogin = document.getElementById("form-login");
const loginError = document.getElementById("login-error");
const mainContent = document.getElementById("main-content");
const btnGoogleLogin = document.getElementById("btn-google-login");

function showApp(user) {
    console.log("User authenticated:", user.email);
    loginView.classList.add("hidden");
    appContainer.classList.remove("hidden");
    
    // Initialize App Shell
    renderSidebar();
    initRouter();
    startRealtimeSync();
}

function showLogin() {
    console.log("User signed out");
    appContainer.classList.add("hidden");
    loginView.classList.remove("hidden");
    renderLoginBranding();
}

// 1. Monitor Auth State on initial load
monitorAuthState((user) => {
    if (user) {
        showApp(user);
    } else {
        showLogin();
    }
});

// 2. Handle Login Submission
formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    
    loginError.classList.add("hidden");
    console.log("Attempting login for:", email);
    
    const result = await login(email, password);
    console.log("Login Result:", result);

    if (!result.success) {
        loginError.textContent = result.error || "Invalid email or password.";
        loginError.classList.remove("hidden");
    } else {
        showApp(result.user);
    }
});

// 3. Handle Google Login
btnGoogleLogin.addEventListener("click", async () => {
    loginError.classList.add("hidden");
    alert("Google Login is not supported in this version.");
});