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