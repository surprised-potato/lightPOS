import { db } from "../firebase-config.js";
import { checkPermission } from "../auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let suppliersData = [];

export async function loadSuppliersView() {
    const content = document.getElementById("main-content");
    const canWrite = checkPermission("items", "write"); // Suppliers part of Master Data (Items)
    
    // Render Basic Layout
    content.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 md:mb-0">Suppliers</h2>
            <div class="flex w-full md:w-auto gap-2">
                <input type="text" id="search-supplier" placeholder="Search suppliers..." class="shadow appearance-none border rounded w-full md:w-64 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500">
                <button id="btn-add-supplier" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150 whitespace-nowrap ${canWrite ? '' : 'hidden'}">
                    + Add Supplier
                </button>
            </div>
        </div>

        <!-- Suppliers Table -->
        <div class="bg-white shadow-md rounded my-6 overflow-x-auto">
            <table class="min-w-full table-auto">
                <thead>
                    <tr class="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                        <th class="py-3 px-6 text-left">Name</th>
                        <th class="py-3 px-6 text-left">Contact Person</th>
                        <th class="py-3 px-6 text-left">Mobile</th>
                        <th class="py-3 px-6 text-left">Email</th>
                        <th class="py-3 px-6 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody id="suppliers-table-body" class="text-gray-600 text-sm font-light">
                    <tr><td colspan="5" class="py-3 px-6 text-center">Loading...</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Add Supplier Modal (Hidden by default) -->
        <div id="modal-add-supplier" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden overflow-y-auto h-full w-full z-50">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3 text-center">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">Add New Supplier</h3>
                    <form id="form-add-supplier" class="mt-2 text-left">
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Supplier Name</label>
                            <input type="text" id="sup-name" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Contact Person</label>
                            <input type="text" id="sup-contact" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500">
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Mobile Number</label>
                            <input type="text" id="sup-mobile" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500">
                        </div>
                        <div class="mb-4">
                            <label class="block text-gray-700 text-sm font-bold mb-2">Email</label>
                            <input type="email" id="sup-email" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500">
                        </div>
                        <div class="flex items-center justify-between mt-4">
                            <button type="button" id="btn-cancel-supplier" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none">Cancel</button>
                            <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Wire up Modal Logic
    const modal = document.getElementById("modal-add-supplier");
    if (canWrite) {
        document.getElementById("btn-add-supplier").addEventListener("click", () => modal.classList.remove("hidden"));
    }
    document.getElementById("btn-cancel-supplier").addEventListener("click", () => modal.classList.add("hidden"));

    // Wire up Search
    document.getElementById("search-supplier").addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = suppliersData.filter(s => 
            s.name.toLowerCase().includes(term) || 
            (s.contact && s.contact.toLowerCase().includes(term)) ||
            (s.email && s.email.toLowerCase().includes(term))
        );
        renderSuppliers(filtered);
    });

    // Handle Form Submit
    document.getElementById("form-add-supplier").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("sup-name").value;
        const contact = document.getElementById("sup-contact").value;
        const mobile = document.getElementById("sup-mobile").value;
        const email = document.getElementById("sup-email").value;

        try {
            await addDoc(collection(db, "suppliers"), { name, contact, mobile, email });
            modal.classList.add("hidden");
            e.target.reset();
            fetchSuppliers(); // Refresh table
        } catch (error) {
            console.error("Error adding supplier: ", error);
            alert("Failed to add supplier.");
        }
    });

    // Initial Fetch
    fetchSuppliers();
}

async function fetchSuppliers() {
    const tbody = document.getElementById("suppliers-table-body");
    tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">Loading...</td></tr>`;

    try {
        const querySnapshot = await getDocs(collection(db, "suppliers"));
        
        suppliersData = [];
        querySnapshot.forEach((docSnap) => {
            suppliersData.push({ id: docSnap.id, ...docSnap.data() });
        });

        renderSuppliers(suppliersData);
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center text-red-500">Error loading data.</td></tr>`;
    }
}

function renderSuppliers(suppliers) {
    const tbody = document.getElementById("suppliers-table-body");
    const canWrite = checkPermission("items", "write");
    tbody.innerHTML = "";

    if (suppliers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-3 px-6 text-center">No suppliers found.</td></tr>`;
        return;
    }

    suppliers.forEach((data) => {
        const row = document.createElement("tr");
        row.className = "border-b border-gray-200 hover:bg-gray-100";
        row.innerHTML = `
            <td class="py-3 px-6 text-left whitespace-nowrap font-medium">${data.name}</td>
            <td class="py-3 px-6 text-left">${data.contact || '-'}</td>
            <td class="py-3 px-6 text-left">${data.mobile || '-'}</td>
            <td class="py-3 px-6 text-left">${data.email || '-'}</td>
            <td class="py-3 px-6 text-center">
                <button class="text-red-500 hover:text-red-700 transform hover:scale-110 transition duration-150 delete-btn ${canWrite ? '' : 'hidden'}" data-id="${data.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </td>
        `;
        
        // Add Delete Event Listener
        row.querySelector(".delete-btn").addEventListener("click", async (e) => {
            if (confirm(`Delete supplier "${data.name}"?`)) {
                const id = e.currentTarget.getAttribute("data-id");
                await deleteDoc(doc(db, "suppliers", id));
                fetchSuppliers(); // Refresh
            }
        });

        tbody.appendChild(row);
    });
}