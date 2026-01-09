export function loadManualView() {
    const content = document.getElementById("main-content");
    content.innerHTML = `
        <div class="p-6 max-w-6xl mx-auto h-full flex flex-col">
            <div class="flex items-center justify-between mb-6">
                <h1 class="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <span class="bg-blue-100 text-blue-600 p-2 rounded-lg">📘</span> User Manual
                </h1>
                <div class="relative w-96">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    <input type="text" id="manual-search" placeholder="Search guides (e.g., 'sale', 'purchase order')..." 
                        class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all">
                </div>
            </div>

            <div class="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
                <!-- Sidebar / TOC -->
                <div class="md:col-span-4 lg:col-span-3 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-180px)]">
                    <div class="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 uppercase text-xs tracking-wider">
                        Guides & FAQs
                    </div>
                    <div id="manual-toc" class="flex-1 overflow-y-auto p-2 space-y-1">
                        <!-- TOC Items injected here -->
                    </div>
                </div>

                <!-- Content Area -->
                <div class="md:col-span-8 lg:col-span-9">
                    <div id="manual-content" class="bg-white rounded-xl shadow-md border border-gray-200 p-8 h-[calc(100vh-180px)] overflow-y-auto">
                        <div class="flex flex-col items-center justify-center h-full text-gray-400">
                            <svg class="w-24 h-24 mb-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                            <h3 class="text-xl font-medium text-gray-500 mb-2">Welcome to the User Manual</h3>
                            <p class="text-sm">Select a topic from the left or use the search bar to find help.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const guides = [
        {
            id: "sale",
            title: "How do I put on a sale?",
            keywords: "pos sell transaction checkout cash card",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Processing a Sale</h2>
                    <p class="mb-8 text-lg text-gray-600">Follow these simple steps to process a customer transaction using the Point of Sale module.</p>
                    
                    <div class="space-y-8">
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">1</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Open the POS</h3>
                                <p class="text-gray-600">Click on the <strong>POS</strong> link in the sidebar (🛒 icon). This is your main checkout screen.</p>
                            </div>
                        </div>

                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">2</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Add Items to Cart</h3>
                                <p class="text-gray-600 mb-3">You have three ways to add items:</p>
                                <ul class="list-disc ml-5 space-y-1 text-gray-600">
                                    <li><strong>Scan:</strong> Use a barcode scanner to scan the product.</li>
                                    <li><strong>Search:</strong> Type the item name or code in the search bar at the top left.</li>
                                    <li><strong>Click:</strong> Browse the item grid and click on a product card.</li>
                                </ul>
                            </div>
                        </div>

                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">3</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Select Customer (Optional)</h3>
                                <p class="text-gray-600">
                                    On the right side, use the customer search bar to find an existing customer. 
                                    Linking a customer allows them to earn loyalty points for this purchase.
                                </p>
                            </div>
                        </div>

                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">4</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Complete Payment</h3>
                                <p class="text-gray-600 mb-3">
                                    Click the large green <strong>PAY</strong> button at the bottom right.
                                </p>
                                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
                                    <p><strong>In the Payment Modal:</strong></p>
                                    <ol class="list-decimal ml-5 mt-1 space-y-1">
                                        <li>Enter the <strong>Amount Tendered</strong> (cash received).</li>
                                        <li>Select the <strong>Payment Method</strong> (Cash, Card, etc.).</li>
                                        <li>Click <strong>Confirm Payment</strong> to finalize and print the receipt.</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "po",
            title: "How to make Purchase Orders?",
            keywords: "procurement stock supply order otb settings",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Creating Purchase Orders</h2>
                    <p class="mb-6 text-lg text-gray-600">The system includes an intelligent Procurement Engine to help you order the right stock at the right time.</p>

                    <div class="bg-amber-50 border-l-4 border-amber-400 p-5 mb-8 rounded-r-lg">
                        <h4 class="text-amber-800 font-bold mb-2 flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Understanding Settings Mode
                        </h4>
                        <p class="text-amber-700 text-sm mb-2">
                            The suggested order quantities depend heavily on your <strong>Procurement Settings</strong> (found in Settings > Procurement).
                        </p>
                        <ul class="list-disc ml-5 text-amber-700 text-sm space-y-1">
                            <li><strong>Standard Mode (Audit Based):</strong> The system checks what you <em>have</em> vs. what you <em>need</em>. If you have enough stock, it suggests 0. Use this for regular restocking.</li>
                            <li><strong>Replenishment Mode (Sales Based):</strong> The system ignores current stock and orders exactly what you plan to sell. Use this for "Just-in-Time" or perishable goods.</li>
                        </ul>
                    </div>
                    
                    <div class="space-y-8">
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">1</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Navigate to Purchase Orders</h3>
                                <p class="text-gray-600">Go to the <strong>Inventory</strong> section in the sidebar and click <strong>Purchase Orders</strong> (🧾 icon).</p>
                            </div>
                        </div>

                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">2</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Start a New Order</h3>
                                <p class="text-gray-600">Click the <strong>New Purchase Order</strong> button. You will be prompted to select a <strong>Supplier</strong>.</p>
                            </div>
                        </div>

                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">3</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Review Automated Suggestions</h3>
                                <p class="text-gray-600 mb-3">
                                    The system will automatically populate the order with suggested items.
                                </p>
                                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
                                    <p class="mb-2"><strong>How suggestions work:</strong></p>
                                    <ul class="list-disc ml-5 space-y-1">
                                        <li>It calculates <strong>Velocity</strong> (how fast items sell).</li>
                                        <li>It checks your <strong>OTB (Open-To-Buy) Budget</strong>.</li>
                                        <li>It applies the <strong>Triple Filter</strong>: Priority A items are added first, then B, then C. If the budget runs out, lower priority items are dropped.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">4</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Finalize and Approve</h3>
                                <p class="text-gray-600">
                                    You can manually edit quantities or add other items. Once satisfied, click <strong>Approve</strong> to lock the PO and prepare it for receiving.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "stockin",
            title: "How to receive stock?",
            keywords: "receive delivery invoice stock in",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Receiving Stock</h2>
                    <p class="mb-8 text-lg text-gray-600">When a delivery arrives, you need to record it to update your inventory levels.</p>
                    
                    <div class="space-y-8">
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">1</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Open the PO or Stock In</h3>
                                <p class="text-gray-600">
                                    If you created a Purchase Order, go to <strong>Purchase Orders</strong>, open the approved PO, and click <strong>Receive</strong>.
                                    <br>Otherwise, go directly to <strong>Stock In</strong> (🚛 icon).
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">2</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Verify Quantities</h3>
                                <p class="text-gray-600">
                                    Count the physical items received. Enter this number in the <strong>Qty Received</strong> field.
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">3</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Handle Discrepancies</h3>
                                <p class="text-gray-600">
                                    If the received quantity is less than ordered, the system will ask for a reason (e.g., "Out of Stock at Supplier").
                                    Click <strong>Confirm Receipt</strong> to update your inventory.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "returns",
            title: "How do I handle returns?",
            keywords: "refund return exchange restock transaction",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Handling Returns</h2>
                    <p class="mb-8 text-lg text-gray-600">Process customer refunds and exchanges efficiently while keeping inventory accurate.</p>
                    
                    <div class="space-y-8">
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">1</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Navigate to Returns</h3>
                                <p class="text-gray-600">Click on the <strong>Returns</strong> link in the sidebar (↩️ icon).</p>
                            </div>
                        </div>
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">2</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Find the Transaction</h3>
                                <p class="text-gray-600">Enter the <strong>Transaction ID</strong> (found on the receipt) into the search bar. The original sale details will appear.</p>
                            </div>
                        </div>
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">3</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Select Items to Return</h3>
                                <p class="text-gray-600">
                                    Check the box next to the items being returned. Adjust the quantity if necessary.
                                </p>
                            </div>
                        </div>
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">4</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Choose Disposition</h3>
                                <p class="text-gray-600 mb-2">Decide what happens to the physical item:</p>
                                <ul class="list-disc ml-5 text-gray-600 space-y-1">
                                    <li><strong>Return to Stock:</strong> Item is resellable. Inventory count increases.</li>
                                    <li><strong>Dispose (Damaged):</strong> Item is broken/spoiled. Inventory count does not increase (recorded as shrinkage).</li>
                                </ul>
                            </div>
                        </div>
                        <div class="flex gap-6">
                            <div class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">5</div>
                            <div class="pt-1">
                                <h3 class="text-xl font-bold text-gray-800 mb-2">Process Refund</h3>
                                <p class="text-gray-600">Click <strong>Process Refund</strong> to complete the transaction. The system will update inventory and financial records accordingly.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "customers",
            title: "How do I manage customers?",
            keywords: "customer loyalty points profile history crm",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Customer Management</h2>
                    <p class="mb-8 text-lg text-gray-600">Track customer history and loyalty points.</p>
                    
                    <div class="space-y-6">
                        <div>
                            <h3 class="text-xl font-bold text-gray-800 mb-2">Adding a Customer</h3>
                            <p class="text-gray-600">Go to <strong>Customers</strong> (👥 icon) and click <strong>+ Add Customer</strong>. Enter their name, phone, and email.</p>
                        </div>
                        <div>
                            <h3 class="text-xl font-bold text-gray-800 mb-2">Loyalty Points</h3>
                            <p class="text-gray-600">Customers earn points automatically on every purchase linked to their profile. You can view their point balance in the customer list.</p>
                        </div>
                        <div>
                            <h3 class="text-xl font-bold text-gray-800 mb-2">Purchase History</h3>
                            <p class="text-gray-600">Click on a customer's name to view their complete transaction history.</p>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "stockcount",
            title: "How do I perform a stock count?",
            keywords: "audit inventory count adjustment variance stocktake",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Stock Count (Audit)</h2>
                    <p class="mb-8 text-lg text-gray-600">Perform physical inventory counts to correct system discrepancies.</p>
                    
                    <ol class="list-decimal ml-6 space-y-4 text-gray-600">
                        <li>Go to <strong>Stock Count</strong> (📋 icon) in the Inventory section.</li>
                        <li>Search for an item by name or barcode.</li>
                        <li>The system will show the <strong>System Stock</strong>. Count the physical items on the shelf.</li>
                        <li>Enter the <strong>Actual Count</strong>. The system will calculate the <strong>Variance</strong>.</li>
                        <li>Select a <strong>Reason</strong> for the adjustment (e.g., Theft, Spoilage, Admin Error).</li>
                        <li>Click <strong>Confirm Adjustment</strong> to update the stock level. This action is logged in the audit trail.</li>
                    </ol>
                </div>
            `
        },
        {
            id: "shifts",
            title: "How do I manage shifts?",
            keywords: "shift open close x-report z-report cash register",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Shift Management</h2>
                    <p class="mb-8 text-lg text-gray-600">Control cash flow by opening and closing shifts.</p>
                    
                    <div class="grid gap-6">
                        <div class="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h3 class="font-bold text-blue-800 mb-2">Opening a Shift</h3>
                            <p class="text-sm text-blue-700">You must open a shift before using the POS. Go to <strong>Shifts</strong> (⏱️ icon) and click <strong>Open Shift</strong>. Enter your starting <strong>Petty Cash</strong> amount.</p>
                        </div>
                        <div class="bg-green-50 p-4 rounded-lg border border-green-100">
                            <h3 class="font-bold text-green-800 mb-2">X-Report (Snapshot)</h3>
                            <p class="text-sm text-green-700">Use this to check current sales totals <em>without</em> closing the shift. Useful for mid-day checks.</p>
                        </div>
                        <div class="bg-purple-50 p-4 rounded-lg border border-purple-100">
                            <h3 class="font-bold text-purple-800 mb-2">Closing a Shift (Z-Report)</h3>
                            <p class="text-sm text-purple-700">
                                When the day or shift ends, click <strong>Close Shift</strong>. 
                                <br>1. Count the cash in the drawer.
                                <br>2. Enter the <strong>Closing Cash</strong> amount.
                                <br>3. The system will calculate any <strong>Overage</strong> or <strong>Shortage</strong>.
                                <br>4. Confirm to generate the Z-Report.
                            </p>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "reports",
            title: "How do I view reports?",
            keywords: "report analytics sales profit inventory performance",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">Reports & Analytics</h2>
                    <p class="mb-6 text-lg text-gray-600">Gain insights into your business performance.</p>
                    
                    <p class="mb-4 text-gray-600">Navigate to <strong>Reports</strong> (📈 icon). Use the date picker at the top to select the period you want to analyze.</p>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="border p-4 rounded-lg hover:shadow-md transition-shadow">
                            <h4 class="font-bold text-gray-800">Financial Summary</h4>
                            <p class="text-sm text-gray-500 mt-1">View Gross Sales, Net Sales, COGS, Gross Profit, and Tax Liability.</p>
                        </div>
                        <div class="border p-4 rounded-lg hover:shadow-md transition-shadow">
                            <h4 class="font-bold text-gray-800">Inventory Valuation</h4>
                            <p class="text-sm text-gray-500 mt-1">See the total value of your stock (Cost vs Retail) and potential profit.</p>
                        </div>
                        <div class="border p-4 rounded-lg hover:shadow-md transition-shadow">
                            <h4 class="font-bold text-gray-800">Product Performance</h4>
                            <p class="text-sm text-gray-500 mt-1">Identify top-selling items, slow movers, and most profitable products.</p>
                        </div>
                        <div class="border p-4 rounded-lg hover:shadow-md transition-shadow">
                            <h4 class="font-bold text-gray-800">Audit Logs</h4>
                            <p class="text-sm text-gray-500 mt-1">Track voided transactions, returns, and stock adjustments.</p>
                        </div>
                    </div>
                </div>
            `
        },
        {
            id: "users",
            title: "How do I manage users?",
            keywords: "user permission role admin access password",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">User Management</h2>
                    <p class="mb-6 text-lg text-gray-600">Control who can access the system and what they can do.</p>
                    
                    <ul class="space-y-4 text-gray-600">
                        <li>
                            <strong>Adding Users:</strong> Go to <strong>Users</strong> (👤 icon) and click <strong>+ Add User</strong>. Provide an email, name, and password.
                        </li>
                        <li>
                            <strong>Permissions:</strong> For each user, you can toggle <strong>Read</strong> (view) and <strong>Write</strong> (edit/create) access for every module.
                            <br><em class="text-sm text-gray-500">Example: A cashier might have Write access to POS but only Read access to Items.</em>
                        </li>
                        <li>
                            <strong>Deactivating:</strong> You can toggle a user's status to "Inactive" to prevent them from logging in without deleting their history.
                        </li>
                    </ul>
                </div>
            `
        },
        {
            id: "settings",
            title: "How do I configure settings?",
            keywords: "settings store backup restore logo tax configuration",
            content: `
                <div class="max-w-3xl">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">System Settings</h2>
                    <p class="mb-6 text-lg text-gray-600">Configure global application preferences in the <strong>Settings</strong> module (⚙️ icon).</p>
                    
                    <div class="space-y-6">
                        <div>
                            <h3 class="font-bold text-gray-800">Store Information</h3>
                            <p class="text-sm text-gray-600">Set your Store Name, Address, Phone, and upload a Logo. These appear on receipts and the login screen.</p>
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800">Tax & Financials</h3>
                            <p class="text-sm text-gray-600">Configure your Tax Rate (%) and Currency symbol.</p>
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800">Data Management</h3>
                            <p class="text-sm text-gray-600">
                                <strong>Backup:</strong> Download a full JSON backup of your database.<br>
                                <strong>Restore:</strong> Upload a backup file to restore data (Warning: Overwrites current data).<br>
                                <strong>Reset:</strong> Factory reset the application (Advanced users only).
                            </p>
                        </div>
                    </div>
                </div>
            `
        }
    ];

    const toc = document.getElementById("manual-toc");
    const contentArea = document.getElementById("manual-content");
    const searchInput = document.getElementById("manual-search");

    function renderTOC(filter = "") {
        toc.innerHTML = "";
        let hasResults = false;
        guides.forEach(guide => {
            if (filter && !guide.title.toLowerCase().includes(filter) && !guide.keywords.includes(filter)) return;
            hasResults = true;
            
            const btn = document.createElement("button");
            btn.className = "text-left px-4 py-3 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-all focus:outline-none w-full text-sm font-medium text-gray-600 border border-transparent";
            btn.textContent = guide.title;
            btn.onclick = () => {
                // Reset active state
                Array.from(toc.children).forEach(c => {
                    c.classList.remove("bg-blue-600", "text-white", "shadow-md", "hover:bg-blue-700", "hover:text-white");
                    c.classList.add("hover:bg-blue-50", "hover:text-blue-700", "text-gray-600");
                });
                // Set active
                btn.classList.remove("hover:bg-blue-50", "hover:text-blue-700", "text-gray-600");
                btn.classList.add("bg-blue-600", "text-white", "shadow-md", "hover:bg-blue-700", "hover:text-white");
                
                // Render Content with fade animation
                contentArea.style.opacity = "0";
                setTimeout(() => {
                    contentArea.innerHTML = guide.content;
                    contentArea.style.opacity = "1";
                }, 150);
            };
            toc.appendChild(btn);
        });

        if (!hasResults) {
            toc.innerHTML = `<div class="p-4 text-center text-gray-400 text-sm">No guides found matching "${filter}"</div>`;
        }
    }

    searchInput.addEventListener("input", (e) => {
        renderTOC(e.target.value.toLowerCase());
    });

    // Initial Render
    renderTOC();
    
    // Add transition style
    contentArea.style.transition = "opacity 0.15s ease-in-out";
}