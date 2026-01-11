
import { dbPromise, dbRepository } from "../db.js";
import { renderHeader } from "../layout.js";

export async function loadAIToolsView() {
    const content = document.getElementById("main-content");
    content.innerHTML = `
        <div class="max-w-6xl mx-auto h-full flex flex-col">
            <h2 class="text-2xl font-bold text-gray-800 mb-6">AI Tools</h2>

            <!-- Tab Navigation -->
            <div class="border-b border-gray-200 mb-6">
                <nav class="flex -mb-px space-x-8">
                    <button data-tab="categories" class="ai-tab-btn border-blue-500 text-blue-600 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm">Category Analyzer</button>
                    <!-- Future tabs can go here -->
                </nav>
            </div>

            <!-- Category Analyzer Tab -->
            <div id="ai-tab-categories" class="ai-panel flex-1 flex flex-col min-h-0">
                <div class="bg-white p-6 rounded-lg shadow-sm border h-full flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-700">Unique Categories</h3>
                        <div class="text-sm text-gray-500">
                            Total: <span id="category-count" class="font-bold text-gray-800">0</span>
                        </div>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto border rounded-lg bg-gray-50 p-2">
                        <ul id="category-list" class="space-y-1">
                            <li class="p-4 text-center text-gray-400 italic">Loading categories...</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupTabListeners();
    await loadCategories();
}

function setupTabListeners() {
    const tabs = document.querySelectorAll(".ai-tab-btn");
    const panels = document.querySelectorAll(".ai-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;

            // Reset all tabs
            tabs.forEach(t => {
                t.classList.remove("border-blue-500", "text-blue-600");
                t.classList.add("border-transparent", "text-gray-500");
            });

            // Activate clicked tab
            tab.classList.add("border-blue-500", "text-blue-600");
            tab.classList.remove("border-transparent", "text-gray-500");

            // Show target panel
            panels.forEach(p => {
                if (p.id === `ai-tab-${target}`) p.classList.remove("hidden");
                else p.classList.add("hidden");
            });
        });
    });
}

async function loadCategories() {
    try {
        const db = await dbPromise;
        const items = await db.items.toArray();

        // Extract unique categories, filter out null/empty, and sort alphabetically
        const categories = [...new Set(items.map(i => i.category))]
            .filter(c => c && c.trim() !== "" && c !== "NULL")
            .sort((a, b) => a.localeCompare(b));

        const listContainer = document.getElementById("category-list");
        const countSpan = document.getElementById("category-count");

        if (!listContainer) return;

        countSpan.textContent = categories.length;

        if (categories.length === 0) {
            listContainer.innerHTML = `<li class="p-4 text-center text-gray-400 italic">No categories found in items.</li>`;
            return;
        }

        listContainer.innerHTML = categories.map(cat => `
            <li class="bg-white border border-gray-200 rounded px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:shadow-md transition-shadow flex justify-between items-center group">
                <span>${cat}</span>
                <span class="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">
                    ${items.filter(i => i.category === cat).length} items
                </span>
            </li>
        `).join('');

    } catch (error) {
        console.error("Error loading categories:", error);
        const list = document.getElementById("category-list");
        if (list) list.innerHTML = `<li class="p-4 text-center text-red-500">Error loading categories.</li>`;
    }
}
