import { login, logout, monitorAuthState } from "./auth.js";
import { renderSidebar, renderLoginBranding } from "./layout.js";
import { initRouter } from "./router.js";
import { SyncEngine } from "./services/SyncEngine.js";
import { dbPromise } from "./db.js";
import { dbRepository as Repository } from "./db.js";
import { ROLES } from "./modules/users.js";

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
    SyncEngine.sync();
}

function showLogin() {
    console.log("User signed out");
    appContainer.classList.add("hidden");
    loginView.classList.remove("hidden");
    renderLoginBranding();
}

// 1. Check Initialization State before Auth
async function checkAppInitialization() {
    try {
        // await sqliteConnect('data/database.sqlite'); // No longer needed as we use Dexie.js
        // const db = await dbPromise; // No longer needed as we use get/run directly
        // console.log('main.js: db object in checkAppInitialization (after sqliteConnect):', sqliteDb); // ADDED LOG
        // Check Local Data
        const users = await Repository.getAll('users');
        const localUserCount = users.length;
        if (localUserCount > 0) {
            // Auto-fix: Check if admin password was saved as plain text due to missing MD5 previously
            const admin = await Repository.get('users', 'admin@lightpos.com');
            if (admin && (admin.password === 'admin123' || !admin.password_hash) && typeof md5 === 'function') {
                console.log("Auto-repairing admin password and permissions...");
                admin.password = md5('admin123');
                admin.password_hash = md5('admin123');
                if (admin.permissions && !admin.permissions_json) {
                    admin.permissions_json = JSON.stringify(admin.permissions);
                }
                await Repository.upsert('users', admin);
            }

            startAppNormalFlow();
            return;
        }

        // Check Server Data
        let serverHasData = false;
        try {
            const response = await fetch('api/sync.php?since=0&limit=1');
            if (response.ok) {
                const data = await response.json();
                if (data.deltas && data.deltas.users && data.deltas.users.length > 0) {
                    serverHasData = true;
                }
            }
        } catch (e) {
            console.warn("Server check failed (Offline?):", e);
        }

        if (serverHasData) {
            startAppNormalFlow();
        } else {
            // Initialization Mode
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('init-view').classList.remove('hidden');
            
            const initBtn = document.getElementById('btn-initialize');
            const newBtn = initBtn.cloneNode(true);
            initBtn.parentNode.replaceChild(newBtn, initBtn);
            
            newBtn.addEventListener('click', initializeApplication);
        }
    } catch (error) {
        console.error("Startup check failed:", error);
        startAppNormalFlow();
    }
}

function startAppNormalFlow() {
    monitorAuthState((user) => {
        if (user) {
            showApp(user);
        } else {
            showLogin();
        }
    });
}

async function initializeApplication() {
    const btn = document.getElementById('btn-initialize');
    btn.disabled = true;
    btn.textContent = "Setting up...";

    if (typeof md5 !== 'function') {
        alert("System Error: MD5 library not loaded. Cannot secure password.\nPlease check your internet connection and reload.");
        btn.disabled = false;
        btn.textContent = "Initialize Application";
        return;
    }

    try {
        const defaultUser = {
            email: 'admin@lightpos.com',
            // id: 'admin@lightpos.com', // Not a column in users table
            name: 'Administrator',
            password: md5('admin123'),
            password_hash: md5('admin123'),
            is_active: true,
            permissions: ROLES.admin.permissions,
            permissions_json: JSON.stringify(ROLES.admin.permissions),
            sync_status: 'pending',
            _version: 1,
            _updatedAt: Date.now()
        };

        await Repository.upsert('users', defaultUser);
        
        alert("Application Initialized Successfully!\n\nDefault Credentials:\nEmail: admin@lightpos.com\nPassword: admin123");
        window.location.reload();
    } catch (e) {
        console.error("Initialization error:", e);
        alert("Error initializing application: " + e.message);
        btn.disabled = false;
        btn.textContent = "Initialize Application";
    }
}

checkAppInitialization();

// 2. Handle Login Submission
formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    
    loginError.classList.add("hidden");
    console.log("Attempting login for:", email);
    
    try {
        const result = await login(email, password);
        console.log("Login Result:", result);

        if (!result.success) {
            loginError.textContent = result.error || "Invalid email or password.";
            loginError.classList.remove("hidden");
        } else {
            showApp(result.user);
        }
    } catch (err) {
        console.error("Login error:", err);
        loginError.textContent = "Login failed. Check console for details.";
        loginError.classList.remove("hidden");
    }
});

// 3. Handle Google Login
btnGoogleLogin.addEventListener("click", async () => {
    loginError.classList.add("hidden");
    alert("Google Login is not supported in this version.");
});