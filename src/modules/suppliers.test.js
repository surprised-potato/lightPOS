import { dbPromise, dbRepository as Repository } from '../db.js';
import { loadSuppliersView } from './suppliers.js';
import { permissionManager } from '../auth.js';

export async function testSupplierSettingsSave() {
    const description = "Verifies that supplier-specific procurement settings can be saved and retrieved via the UI.";
    const db = await dbPromise;

    // 0. Test setup
    const mockSupplier = { id: 'test-sup-1', name: 'Test Supplier Co.' };
    const mockSettings = {
        supplier_id: 'test-sup-1',
        delivery_cadence: 7,
        lead_time_days: 2,
        monthly_otb: 25000
    };

    // Ensure clean state
    await db.suppliers.clear();
    await db.supplier_config.clear();
    await db.items.clear();

    // Add mock supplier to DB
    await Repository.upsert('suppliers', mockSupplier);

    // Mock permissions
    const originalCheck = permissionManager.check;
    permissionManager.check = () => true;

    try {
        // 1. Render the suppliers view
        const mainContent = document.createElement('div');
        mainContent.id = 'main-content';
        document.body.appendChild(mainContent);
        await loadSuppliersView();

        // 2. Simulate clicking the 'Edit' button for our mock supplier
        const editBtn = document.querySelector(`.edit-btn[data-id="${mockSupplier.id}"]`);
        if (!editBtn) throw new Error("Edit button for mock supplier not found.");
        
        // Need to wait for modal to be interactable
        await new Promise(resolve => setTimeout(resolve, 100));
        editBtn.click();
        
        // 3. Check if modal is visible and has the correct title
        const modal = document.getElementById('modal-add-supplier');
        if (modal.classList.contains('hidden')) throw new Error("Edit modal did not become visible.");
        
        // 3a. Verify that the correct version of the modal is loaded.
        const versionMarker = document.getElementById('supplier-modal-version');
        if (!versionMarker || versionMarker.value !== '2') {
            throw new Error("Stale version of suppliers.js loaded. Please clear your browser cache and try again.");
        }

        const title = document.getElementById('supplier-modal-title').textContent;
        if (title !== 'Edit Supplier') throw new Error(`Modal title was incorrect: ${title}`);

        // 4. Fill in the new procurement settings
        document.getElementById('sup-config-cadence').value = mockSettings.delivery_cadence;
        document.getElementById('sup-config-leadtime').value = mockSettings.lead_time_days;
        document.getElementById('sup-config-otb').value = mockSettings.monthly_otb;

        // 5. Submit the form
        const form = document.getElementById('form-add-supplier');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        // Wait for save operation to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // 6. Verify the data was saved correctly in Dexie
        const savedConfig = await db.supplier_config.get(mockSupplier.id);
        
        if (!savedConfig) throw new Error("Supplier config was not saved to the database.");

        const errors = [];
        if (savedConfig.delivery_cadence !== mockSettings.delivery_cadence) {
            errors.push(`Cadence mismatch: expected ${mockSettings.delivery_cadence}, got ${savedConfig.delivery_cadence}`);
        }
        if (savedConfig.lead_time_days !== mockSettings.lead_time_days) {
            errors.push(`Lead time mismatch: expected ${mockSettings.lead_time_days}, got ${savedConfig.lead_time_days}`);
        }
        if (savedConfig.monthly_otb !== mockSettings.monthly_otb) {
            errors.push(`OTB mismatch: expected ${mockSettings.monthly_otb}, got ${savedConfig.monthly_otb}`);
        }

        if (errors.length > 0) {
            throw new Error(errors.join('; '));
        }

        return { name: "Supplier Settings Save", description, success: true, error: null };

    } catch (error) {
        return { name: "Supplier Settings Save", description, success: false, error };
    } finally {
        // Cleanup
        permissionManager.check = originalCheck; // Restore original function
        await db.suppliers.clear();
        await db.supplier_config.clear();
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.remove();
        const modal = document.getElementById('modal-add-supplier');
        if (modal) modal.remove();
    }
}
