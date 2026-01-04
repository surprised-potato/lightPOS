const { test, expect } = require('@playwright/test');

test.describe('POS System E2E', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', 'admin@lightpos.com');
    await page.fill('#password', 'admin');
    await page.click('button[type="submit"]');
    await expect(page.locator('#sidebar-container')).toBeVisible();
  });

  test('POS: should open a shift and process a sale', async ({ page }) => {
    // Navigate to POS
    await page.click('text=POS');

    // Handle Open Shift Modal if it appears
    const openShiftModal = page.locator('#modal-open-shift');
    if (await openShiftModal.isVisible()) {
      await page.fill('#shift-opening-cash', '1000');
      await page.click('text=Open Register');
    }

    // Search for an item (assuming "Coffee" exists)
    await page.fill('#pos-search', 'Coffee');
    await page.keyboard.press('Enter');

    // Verify item in cart
    await expect(page.locator('#pos-cart-items')).toContainText('Coffee');

    // Checkout
    await page.click('#btn-checkout');
    await expect(page.locator('#modal-checkout')).toBeVisible();

    // Enter tendered amount
    const totalText = await page.locator('#checkout-total').textContent();
    const total = totalText.replace('₱', '').trim();
    await page.fill('#input-tendered', total);
    
    await page.click('#btn-confirm-pay');

    // Verify success toast or last transaction summary
    await expect(page.locator('#last-transaction')).toBeVisible();
    await expect(page.locator('#last-change-amount')).toContainText('₱0.00');
  });

  test('Customers: should add a new customer', async ({ page }) => {
    await page.click('text=Customers');
    await page.click('#btn-add-customer');
    
    const name = `Test Customer ${Date.now()}`;
    await page.fill('#cust-name', name);
    await page.fill('#cust-phone', '09123456789');
    await page.click('button:has-text("Save")');

    await expect(page.locator('#customers-table-body')).toContainText(name);
  });

  test('Items: should add a new item', async ({ page }) => {
    await page.click('text=Items');
    await page.click('#btn-add-item');
    
    const itemName = `Test Item ${Date.now()}`;
    await page.fill('#item-name', itemName);
    await page.fill('#item-barcode', `BC-${Date.now()}`);
    await page.fill('#item-cost', '50');
    await page.fill('#item-price', '100');
    await page.fill('#item-unit', 'pc');
    
    await page.click('button:has-text("Save Item")');
    await expect(page.locator('#items-table-body')).toContainText(itemName);
  });

  test('Expenses: should record an expense', async ({ page }) => {
    await page.click('text=Expenses');
    await page.click('#btn-add-expense');
    
    const desc = `Utility Bill ${Date.now()}`;
    await page.fill('#exp-desc', desc);
    await page.fill('#exp-amount', '500');
    await page.selectOption('#exp-category', 'Utilities');
    
    await page.click('button:has-text("Save")');
    await expect(page.locator('#expenses-table-body')).toContainText(desc);
  });

  test('Reports: should generate a report', async ({ page }) => {
    await page.click('text=Reports');
    // Wait for default 30 days range to be set
    await page.waitForTimeout(1000);
    await page.click('#btn-generate-report');
    // Check if Gross Sales element is updated (not just visible)
    await expect(page.locator('#report-gross-sales')).not.toContainText('Loading');
  });

  test('Settings: should wipe all data via nuclear reset', async ({ page }) => {
    await page.click('text=Settings');
    
    // Navigate to Advanced tab
    await page.click('button[data-tab="advanced"]');
    await expect(page.locator('#settings-tab-advanced')).toBeVisible();

    // Set up dialog handler for the two confirms and one alert
    page.on('dialog', async dialog => {
      // This automatically accepts "ARE YOU ABSOLUTELY SURE?", "Final confirmation", and "System reset complete"
      await dialog.accept();
    });

    // Monitor the API request to verify the correct action is sent to the backend
    const resetPromise = page.waitForRequest(request => 
      request.url().includes('action=reset_all') && request.method() === 'POST'
    );

    await page.click('#btn-nuclear-reset');

    const request = await resetPromise;
    expect(request.url()).toContain('action=reset_all');
    
    // Verify page reloads (the app calls window.location.reload() on success)
    await expect(page).toHaveURL(/.*index.html/);
  });
});