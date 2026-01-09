import { dbPromise, dbRepository as Repository } from '../db.js';
import { loadPurchaseOrdersView } from './purchase_orders.js';
import { permissionManager } from '../auth.js';

export async function testCreateAndApprovePO() {
    const description = "Verifies that a purchase order can be created, saved as a draft, and then approved.";
    const db = await dbPromise;

    // 0. Test setup
    const mockSupplier = { id: 'test-po-sup-1', name: 'Test PO Supplier' };
    const mockItem = { id: 'test-po-item-1', name: 'Test PO Item', stock_level: 10 };

    // Ensure clean state
    await db.suppliers.clear();
    await db.purchase_orders.clear();
    await db.items.clear();

    // Add mock data to DB
    await Repository.upsert('suppliers', mockSupplier);
    await Repository.upsert('items', mockItem);

    // Mock permissions
    const originalCheck = permissionManager.check;
    permissionManager.check = () => true;

    try {
        // 1. Render the purchase orders view
        const mainContent = document.createElement('div');
        mainContent.id = 'main-content';
        document.body.appendChild(mainContent);
        await loadPurchaseOrdersView();

        // 2. Simulate clicking the 'Create PO' button
        document.getElementById('btn-add-po').click();
        
        // Wait for modal to be interactable
        await new Promise(resolve => setTimeout(resolve, 100));

        // 3. Check if modal is visible
        const modal = document.getElementById('modal-add-po');
        if (modal.classList.contains('hidden')) throw new Error("Create PO modal did not become visible.");

        // 4. Fill in the PO form
        document.getElementById('po-supplier').value = mockSupplier.id;
        document.getElementById('po-expected-delivery').value = '2026-01-20';
        
        const itemRow = document.querySelector('#po-items-container .flex');
        itemRow.querySelector('.po-item-name').value = mockItem.name;
        itemRow.querySelector('.po-item-qty').value = 5;
        itemRow.querySelector('.po-item-cost').value = 10;

        // 5. Submit the form
        const form = document.getElementById('form-add-po');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        // Wait for save operation to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // 6. Verify the PO was saved correctly in Dexie as a draft
        const pos = await db.purchase_orders.toArray();
        if (pos.length !== 1) throw new Error(`Expected 1 PO, but found ${pos.length}`);
        
        const savedPo = pos[0];
        if (savedPo.status !== 'draft') throw new Error(`PO status should be 'draft', but was '${savedPo.status}'`);
        if (savedPo.supplier_id !== mockSupplier.id) throw new Error('PO supplier ID is incorrect');
        if (savedPo.total_amount !== 50) throw new Error(`PO total amount should be 50, but was ${savedPo.total_amount}`);

        // 7. Simulate viewing and approving the PO
        await loadPurchaseOrders(); // a new list of POs is loaded
        document.querySelector('.view-po-btn').click();
        
        // Wait for modal to be interactable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        document.getElementById('btn-approve-po').click();

        // Wait for approve operation to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // 8. Verify the PO status is updated to 'approved'
        const approvedPo = await db.purchase_orders.get(savedPo.id);
        if (approvedPo.status !== 'approved') throw new Error(`PO status should be 'approved', but was '${approvedPo.status}'`);

        return { name: "Create and Approve PO", description, success: true, error: null };

    } catch (error) {
        return { name: "Create and Approve PO", description, success: false, error: error.stack };
    } finally {
        // Cleanup
        permissionManager.check = originalCheck; // Restore original function
        await db.suppliers.clear();
        await db.purchase_orders.clear();
        await db.items.clear();
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.remove();
        const modal = document.getElementById('modal-add-po');
        if (modal) modal.remove();
    }
}
