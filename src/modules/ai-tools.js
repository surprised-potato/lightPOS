
import { dbPromise, dbRepository } from "../db.js";
import { renderHeader } from "../layout.js";

// --- State Management ---
let currentAnalysisResult = null;
let currentItems = [];

export async function loadAIToolsView() {
    const content = document.getElementById("main-content");
    content.innerHTML = `
        <div class="max-w-7xl mx-auto h-full flex flex-col">
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
                    
                    <!-- Header Actions -->
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-4">
                            <div>
                                <h3 class="text-lg font-bold text-gray-700">Category Optimization</h3>
                                <div class="text-sm text-gray-500">
                                    Total Unique: <span id="category-count" class="font-bold text-gray-800">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <div class="relative">
                                <select id="audit-category-select" class="border rounded-lg p-2 text-sm w-48 hidden">
                                    <option value="">Select category to audit...</option>
                                </select>
                                <button id="btn-audit-category" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg shadow transition flex items-center gap-2 hidden">
                                    <span>🔍</span> Audit Category
                                </button>
                            </div>
                            <button id="btn-analyze-categories" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow transition flex items-center gap-2">
                                <span>✨</span> Analyze All
                            </button>
                        </div>
                    </div>
                    
                    <div class="flex-1 flex gap-6 min-h-0">
                        
                        <!-- Left: Current Categories -->
                        <div class="w-1/4 flex flex-col min-h-0 border rounded-lg bg-gray-50">
                            <div class="p-3 border-b bg-gray-100 font-bold text-gray-700 text-sm">Current Categories</div>
                            <div class="flex-1 overflow-y-auto p-2">
                                <ul id="category-list" class="space-y-1">
                                    <li class="p-4 text-center text-gray-400 italic">Loading...</li>
                                </ul>
                            </div>
                        </div>

                        <!-- Right: Analysis Results (Split 3 ways) -->
                        <div class="flex-1 flex flex-col min-h-0 gap-4 relative">
                            
                            <!-- Section: Merged -->
                            <div class="flex-1 border rounded-lg bg-white flex flex-col min-h-0">
                                <div class="p-3 border-b bg-blue-50 font-bold text-blue-700 text-sm flex justify-between items-center">
                                    <span>Proposed Merges</span>
                                    <button id="btn-apply-merges" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded disabled:opacity-50" disabled>Apply All Merges</button>
                                </div>
                                <div id="container-merged" class="flex-1 overflow-y-auto p-2 space-y-2 text-sm">
                                    <div class="text-center text-gray-400 py-4 italic">Run analysis to see suggestions</div>
                                </div>
                            </div>

                            <!-- Section: Removed -->
                            <div class="flex-1 border rounded-lg bg-white flex flex-col min-h-0">
                                <div class="p-3 border-b bg-red-50 font-bold text-red-700 text-sm flex justify-between items-center">
                                    <span>Categories to Remove</span>
                                    <button id="btn-process-removed" class="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded disabled:opacity-50" disabled>Re-categorize Items (Batch 100)</button>
                                </div>
                                <div id="container-removed" class="flex-1 overflow-y-auto p-2 space-y-2 text-sm"></div>
                            </div>

                             <!-- Section: New -->
                             <div class="flex-1 border rounded-lg bg-white flex flex-col min-h-0">
                                <div class="p-3 border-b bg-green-50 font-bold text-green-700 text-sm">
                                    <span>Proposed New Categories</span>
                                </div>
                                <div id="container-new" class="flex-1 overflow-y-auto p-2 space-y-2 text-sm"></div>
                            </div>

                            <!-- Loading Overlay -->
                            <div id="ai-loading" class="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 hidden flex flex-col items-center justify-center rounded-lg">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                                <p id="ai-loading-text" class="text-purple-600 font-bold animate-pulse text-lg">Analyzing Store Data...</p>
                                <p id="ai-loading-subtext" class="text-sm text-gray-500 mt-2">Connecting to Local LLM...</p>
                                <div class="w-64 bg-gray-200 rounded-full h-2.5 mt-4 hidden" id="ai-progress-bar-container">
                                    <div id="ai-progress-bar" class="bg-purple-600 h-2.5 rounded-full" style="width: 0%"></div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupTabListeners();
    currentItems = await loadCategories();

    document.getElementById("btn-analyze-categories").addEventListener("click", () => analyzeCategories(currentItems));
    document.getElementById("btn-apply-merges").addEventListener("click", applyMerges);
    document.getElementById("btn-process-removed").addEventListener("click", categorizeRemoved);

    // Audit Setup
    const auditBtn = document.getElementById("btn-audit-category");
    const auditSelect = document.getElementById("audit-category-select");
    if (auditBtn && auditSelect) {
        auditBtn.classList.remove("hidden");
        auditSelect.classList.remove("hidden");
        auditBtn.addEventListener("click", () => {
            const cat = auditSelect.value;
            if (cat) auditCategory(cat);
            else alert("Select a category first!");
        });
    }
}

function setupTabListeners() {
    // ... (Same as before)
}

async function loadCategories() {
    try {
        const db = await dbPromise;
        const items = await db.items.toArray();
        const categories = [...new Set(items.map(i => i.category))]
            .filter(c => c && c.trim() !== "" && c !== "NULL")
            .sort((a, b) => a.localeCompare(b));

        const listContainer = document.getElementById("category-list");
        const countSpan = document.getElementById("category-count");
        const auditSelect = document.getElementById("audit-category-select");

        if (!listContainer) return [];

        countSpan.textContent = categories.length;

        // Populate Audit Dropdown
        if (auditSelect) {
            auditSelect.innerHTML = '<option value="">Select to audit...</option>' +
                categories.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        if (categories.length === 0) {
            listContainer.innerHTML = `<li class="p-4 text-center text-gray-400 italic">No categories found.</li>`;
            return [];
        }

        listContainer.innerHTML = categories.map(cat => `
            <li class="bg-white border border-gray-200 rounded px-3 py-2 text-xs text-gray-700 shadow-sm flex justify-between items-center group">
                <span class="font-medium truncate mr-2 w-3/4" title="${cat}">${cat}</span>
                <span class="text-[10px] bg-gray-100 rounded-full px-2 py-0.5 text-gray-500 whitespace-nowrap">
                    ${items.filter(i => i.category === cat).length}
                </span>
            </li>
        `).join('');

        return items;
    } catch (error) {
        console.error("Error loading categories:", error);
        return [];
    }
}

// --- Analysis Logic ---

async function analyzeCategories(allItems) {
    const aiSettings = JSON.parse(localStorage.getItem('ai_settings') || '{}');
    if (!aiSettings.url) return alert("Configure AI Settings first.");

    setLoading(true, "Analyzing Categories...");

    try {
        const categoryMap = {};
        allItems.forEach(item => {
            const cat = item.category || "Uncategorized";
            if (!categoryMap[cat]) categoryMap[cat] = [];
            if (categoryMap[cat].length < 5) categoryMap[cat].push(item.name);
        });

        const promptData = Object.entries(categoryMap).map(([cat, samples]) => ({
            category: cat,
            samples: samples
        }));

        const prompt = `
        You are an expert inventory manager. Analyze these categories.
        Task:
        1. Identify categories to REMOVE (redundant, vague, spelling errors).
        2. Identify categories to MERGE (e.g. "Bev" -> "Beverages").
        3. Identify PROPOSED NEW categories if beneficial.

        Data: ${JSON.stringify(promptData)}

        Return JSON only:
        {
            "removed": ["cat1", "cat2"],
            "merged": [{"old": "oldName", "new": "newName"}],
            "users_proposed_new": ["High Margin", "Seasonal"]
        }
        `;

        const result = await callLLM(aiSettings, prompt);
        currentAnalysisResult = result;
        renderAnalysisResults(result);

    } catch (error) {
        console.error("Analysis Failed", error);
        alert("Analysis failed: " + error.message);
    } finally {
        setLoading(false);
    }
}

function renderAnalysisResults(result) {
    // 1. Merged
    const mergedContainer = document.getElementById("container-merged");
    document.getElementById("btn-apply-merges").disabled = !result.merged || result.merged.length === 0;

    if (result.merged && result.merged.length > 0) {
        mergedContainer.innerHTML = result.merged.map(m => `
            <div class="flex justify-between items-center bg-blue-50 p-2 rounded border border-blue-100">
                <span class="line-through text-gray-500">${m.old}</span>
                <span class="font-bold text-gray-400">→</span>
                <span class="font-bold text-blue-700">${m.new}</span>
            </div>
        `).join('');
    } else {
        mergedContainer.innerHTML = '<div class="text-gray-400 italic text-center p-2">No merges suggested.</div>';
    }

    // 2. Removed
    const removedContainer = document.getElementById("container-removed");
    document.getElementById("btn-process-removed").disabled = !result.removed || result.removed.length === 0;

    if (result.removed && result.removed.length > 0) {
        removedContainer.innerHTML = result.removed.map(r => `
            <div class="bg-red-50 p-2 rounded border border-red-100 flex justify-between">
                <span class="text-red-700 font-medium">${r}</span>
                <span class="text-xs text-red-400">Marked for removal</span>
            </div>
        `).join('');
    } else {
        removedContainer.innerHTML = '<div class="text-gray-400 italic text-center p-2">No categories marked for removal.</div>';
    }

    // 3. New
    const newContainer = document.getElementById("container-new");
    if (result.users_proposed_new && result.users_proposed_new.length > 0) {
        newContainer.innerHTML = result.users_proposed_new.map(n => `
             <div class="bg-green-50 p-2 rounded border border-green-100">
                <span class="text-green-700 font-bold">＋ ${n}</span>
            </div>
        `).join('');
    } else {
        newContainer.innerHTML = '<div class="text-gray-400 italic text-center p-2">No new categories proposed.</div>';
    }
}

// --- Action: Apply Merges ---

async function applyMerges() {
    if (!currentAnalysisResult || !currentAnalysisResult.merged) return;
    if (!confirm(`Apply ${currentAnalysisResult.merged.length} merges? This is irreversible.`)) return;

    setLoading(true, "Merging Categories...");
    const db = await dbPromise;

    try {
        for (const merge of currentAnalysisResult.merged) {
            await db.items.where('category').equals(merge.old).modify({ category: merge.new });
        }
        alert("Merges applied successfully!");
        currentItems = await loadCategories(); // Refresh
        document.getElementById("btn-apply-merges").disabled = true;
        document.getElementById("container-merged").innerHTML = '<div class="text-green-600 custom-center p-2">Merges applied!</div>';
    } catch (e) {
        console.error(e);
        alert("Error applying merges.");
    } finally {
        setLoading(false);
    }
}

// --- Action: Categorize Removed Items (Batch 100) ---

async function categorizeRemoved() {
    if (!currentAnalysisResult || !currentAnalysisResult.removed) return;

    // 1. Get all valid target categories (Existing + Proposed New + Merged targets)
    // Actually, asking LLM to pick from *existing* non-removed categories + proposed new is best.
    const validCategories = [...new Set(currentItems.map(i => i.category))]
        .filter(c => !currentAnalysisResult.removed.includes(c)); // Exclude removed ones

    if (currentAnalysisResult.users_proposed_new) {
        validCategories.push(...currentAnalysisResult.users_proposed_new);
    }
    // Also include merge targets just in case
    if (currentAnalysisResult.merged) {
        currentAnalysisResult.merged.forEach(m => {
            if (!validCategories.includes(m.new)) validCategories.push(m.new);
        });
    }

    // 2. Find items in removed categories
    const itemsToProcess = currentItems.filter(i => currentAnalysisResult.removed.includes(i.category));

    if (itemsToProcess.length === 0) {
        alert("No items found in 'Removed' categories.");
        return;
    }

    // 3. Batch Process
    const BATCH_SIZE = 100;
    const aiSettings = JSON.parse(localStorage.getItem('ai_settings') || '{}');
    const updateProgress = (curr, total) => {
        const p = document.getElementById("ai-progress-bar");
        const pc = document.getElementById("ai-progress-bar-container");
        if (p && pc) {
            pc.classList.remove("hidden");
            const pect = Math.round((curr / total) * 100);
            p.style.width = `${pect}%`;
        }
        document.getElementById("ai-loading-subtext").textContent = `Processing items ${curr}/${total}`;
    };

    setLoading(true, "Re-categorizing Items...");
    const db = await dbPromise;
    let processedCount = 0;

    try {
        for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
            const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
            updateProgress(i, itemsToProcess.length);

            const prompt = `
            Assign a new category to these items.
            Valid Categories: ${JSON.stringify(validCategories)}
            Items: ${JSON.stringify(batch.map(b => ({ id: b.id, name: b.name, old_cat: b.category })))}
            
            Return JSON: { "items": [{ "id": "itemId", "category": "Valid Category Name" }] }
            `;

            const batchResult = await callLLM(aiSettings, prompt);

            if (batchResult && batchResult.items) {
                for (const change of batchResult.items) {
                    await db.items.update(change.id, { category: change.category });
                }
            }
            processedCount += batch.length;
        }

        alert(`Successfully re-categorized ${processedCount} items!`);
        currentItems = await loadCategories();
    } catch (e) {
        console.error(e);
        alert("Error during batch processing: " + e.message);
    } finally {
        setLoading(false);
    }
}

// --- Action: Audit Category (Batch 50) ---

async function auditCategory(categoryName) {
    const itemsInCat = currentItems.filter(i => i.category === categoryName);
    if (itemsInCat.length === 0) return alert("Category is empty.");

    const BATCH_SIZE = 50;
    const aiSettings = JSON.parse(localStorage.getItem('ai_settings') || '{}');
    const db = await dbPromise;

    // Valid potential categories (all existing)
    const validCategories = [...new Set(currentItems.map(i => i.category))];

    const updateProgress = (curr, total) => {
        // Re-use progress bar logic
        const p = document.getElementById("ai-progress-bar");
        const pc = document.getElementById("ai-progress-bar-container");
        if (p && pc) {
            pc.classList.remove("hidden");
            const pect = Math.round((curr / total) * 100);
            p.style.width = `${pect}%`;
        }
        document.getElementById("ai-loading-subtext").textContent = `Auditing items ${curr}/${total}`;
    };

    setLoading(true, `Auditing '${categoryName}'...`);
    let changesCount = 0;

    try {
        for (let i = 0; i < itemsInCat.length; i += BATCH_SIZE) {
            const batch = itemsInCat.slice(i, i + BATCH_SIZE);
            updateProgress(i, itemsInCat.length);

            const prompt = `
            Audit these items currently in category '${categoryName}'.
            Identify items that DO NOT belong here and suggest a better category from: ${JSON.stringify(validCategories.slice(0, 50))}... (others available).
            If no existing category fits well, suggest a generic standard one.
            
            Items: ${JSON.stringify(batch.map(b => ({ id: b.id, name: b.name })))}
            
            Return JSON: { "changes": [{ "id": "itemId", "new_category": "Better Name" }] }
            Only include items that NEED changing.
            `;

            const batchResult = await callLLM(aiSettings, prompt);
            if (batchResult && batchResult.changes) {
                for (const change of batchResult.changes) {
                    await db.items.update(change.id, { category: change.new_category });
                    changesCount++;
                }
            }
        }
        alert(`Audit complete. Moved ${changesCount} items out of '${categoryName}'.`);
        currentItems = await loadCategories();

    } catch (e) {
        console.error(e);
        alert("Audit Error: " + e.message);
    } finally {
        setLoading(false);
    }
}

// --- Helper: Call LLM ---
async function callLLM(settings, prompt) {
    const response = await fetch(`${settings.url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: settings.model || "local-model",
            messages: [
                { role: "system", content: "You are a helpful JSON data assistant. Always return valid JSON." },
                { role: "user", content: prompt }
            ],
            temperature: 0.1
        })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    let content = json.choices[0].message.content;

    // Basic cleanup
    if (content.includes("```json")) {
        content = content.split("```json")[1].split("```")[0];
    } else if (content.includes("```")) {
        content = content.split("```")[1].split("```")[0];
    }
    return JSON.parse(content);
}

function setLoading(isLoading, text = "") {
    const el = document.getElementById("ai-loading");
    if (isLoading) {
        el.classList.remove("hidden");
        document.getElementById("ai-loading-text").textContent = text;
    } else {
        el.classList.add("hidden");
        document.getElementById("ai-progress-bar-container")?.classList.add("hidden");
    }
}
