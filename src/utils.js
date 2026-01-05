/**
 * Generates a universally unique identifier (UUID).
 * This function first checks for the modern, secure `crypto.randomUUID()` method.
 * If that's not available (e.g., in an insecure context like HTTP or older browsers),
 * it falls back to a widely-used `Math.random()`-based implementation.
 *
 * @returns {string} A new UUID.
 */
export function generateUUID() {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for insecure contexts or older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Centralized error handler for logging and user notification.
 * @param {Error|string} error The error object or message.
 * @param {string} context A string describing where the error occurred.
 */
export function handleError(error, context = 'System') {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`%c[${context} Error]`, 'color: white; background: #d32f2f; padding: 2px 5px; border-radius: 2px;', error);

    showToast(`${context}: ${message}`, 'error');
}

/**
 * Displays a temporary toast notification in the UI.
 * @param {string} message The text to display.
 * @param {string} type 'info', 'success', or 'error'.
 */
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
        error: 'bg-red-600',
        success: 'bg-green-600',
        info: 'bg-blue-600'
    };
    
    toast.className = `${bgColors[type] || bgColors.info} text-white px-6 py-3 rounded-lg shadow-2xl transform transition-all duration-500 translate-y-10 opacity-0 pointer-events-auto flex items-center gap-3 min-w-[280px] max-w-md`;
    toast.innerHTML = `
        <span class="text-lg">${type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️')}</span>
        <div class="flex-1 text-sm font-bold">${message}</div>
    `;

    container.appendChild(toast);

    // Trigger entry animation
    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-20px]');
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}