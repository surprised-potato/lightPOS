import { checkPermission } from "../auth.js";

const API_URL = 'api/router.php';

export async function loadSuppliersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("suppliers", "write"); 

    content.innerHTML = `
        <div class="max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-gray-800">Suppliers</h2>
                <button id="btn-add-supplier" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 ${canWrite ? '' : 'hidden'}">
                    + Add Supplier
                </button>
            </div>

            <div class="bg-white shadow-md rounded overflow-hidden">
                <table class="min-w-full table-auto">
                    <thead>
                        <tr class="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                            <th class="py-3 px-6 text-left">Name</th>
                            <th class="py-3 px-6 text-left">Contact Person</th>
                            <th class="py-3 px-6 text-left">Email/Phone</th>
                            <th class="py-3 px-6 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="suppliers-table-body" class="text-gray-600 text-sm font-light">
                        <tr><td colspan="4" class="py-3 px-6 text-center">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add Supplier Modal -->
        <div id="modal-add-supplier" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 text-center mb-4">Add New Supplier</h3>
                    <form id="form-add-supplier">
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Supplier Name</label>
                            <input type="text" id="sup-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Contact Person</label>
                            <input type="text" id="sup-contact" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Email or Phone</label>
                            <input type="text" id="sup-email" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="flex items-center justify-between mt-6">
                            <button type="button" id="btn-cancel-supplier" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none">Cancel</button>
                            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    if (canWrite) {
        document.getElementById("btn-add-supplier").addEventListener("click", () => {
            document.getElementById("modal-add-supplier").classList.remove("hidden");
        });
    }

    document.getElementById("btn-cancel-supplier").addEventListener("click", () => {
        document.getElementById("modal-add-supplier").classList.add("hidden");
    });

    document.getElementById("form-add-supplier").addEventListener("submit", handleAddSupplier);

    await fetchSuppliers();
}

async function fetchSuppliers() {
    const tbody = document.getElementById("suppliers-table-body");
    const canWrite = checkPermission("items", "write");

    try {
        const response = await fetch(`${API_URL}?file=suppliers`);
        const suppliers = await response.json();

        tbody.innerHTML = "";

        if (!Array.isArray(suppliers) || suppliers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center">No suppliers found.</td></tr>`;
            return;
        }

        suppliers.forEach((sup, index) => {
            const row = document.createElement("tr");
            row.className = "border-b border-gray-200 hover:bg-gray-100";
            row.innerHTML = `
                <td class="py-3 px-6 text-left whitespace-nowrap font-medium">${sup.name}</td>
                <td class="py-3 px-6 text-left">${sup.contact || '-'}</td>
                <td class="py-3 px-6 text-left">${sup.email || '-'}</td>
                <td class="py-3 px-6 text-center">
                    <button class="text-red-500 hover:text-red-700 delete-btn ${canWrite ? '' : 'hidden'}" data-index="${index}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </td>
            `;
            
            if (canWrite) {
                row.querySelector(".delete-btn").addEventListener("click", () => deleteSupplier(index));
            }
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error("Error fetching suppliers:", error);
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

async function handleAddSupplier(e) {
    e.preventDefault();
    const name = document.getElementById("sup-name").value;
    const contact = document.getElementById("sup-contact").value;
    const email = document.getElementById("sup-email").value;

    const newSupplier = {
        id: crypto.randomUUID(),
        name,
        contact,
        email
    };

    try {
        const response = await fetch(`${API_URL}?file=suppliers`);
        const suppliers = await response.json();
        const updatedSuppliers = Array.isArray(suppliers) ? [...suppliers, newSupplier] : [newSupplier];

        await fetch(`${API_URL}?file=suppliers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedSuppliers)
        });

        document.getElementById("modal-add-supplier").classList.add("hidden");
        document.getElementById("form-add-supplier").reset();
        fetchSuppliers();
    } catch (error) {
        console.error("Error saving supplier:", error);
        alert("Failed to save supplier.");
    }
}

async function deleteSupplier(index) {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    try {
        const response = await fetch(`${API_URL}?file=suppliers`);
        const suppliers = await response.json();

        if (Array.isArray(suppliers)) {
            suppliers.splice(index, 1);
            
            await fetch(`${API_URL}?file=suppliers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(suppliers)
            });
            
            fetchSuppliers();
        }
    } catch (error) {
        console.error("Error deleting supplier:", error);
        alert("Failed to delete supplier.");
    }
}