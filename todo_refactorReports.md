# Refactor Reports Module to Button-Modal Layout

Objective: Modernize the reports interface by replacing nested sub-tabs with a clean, grid-based card layout. Clicking a card should open the specific report in a unified modal dialog.

## Phase 1: Preparation & Configuration
- [ ] Define `REPORTS_CONFIG` constant in `src/modules/reports.js` containing metadata (title, description, icon) for all reports, grouped by category (products, inventory, financials, etc.).
- [ ] Create state variables for modal management (`currentModalReportId`).

## Phase 2: UI Structure Overhaul
- [ ] Modify `loadReportsView` to remove the secondary sub-tab navigation bars (e.g., `#subpanel-buttons`).
- [ ] Add a `div#report-grid-container` to the main report view for displaying the cards.
- [ ] Add the HTML structure for the Unified Report Modal (`#report-modal`) including:
    - [ ] Header with Title and Close button.
    - [ ] Controls bar (Search, Row Limit, Export).
    - [ ] Content area (`#report-modal-content`).

## Phase 3: Core Logic Implementation
- [ ] Implement `renderReportCards(category)`: Renders the grid of cards based on the selected main tab.
- [ ] Implement `openReportModal(reportId)`: Handles opening the modal, setting the title, and triggering the specific data render.
- [ ] Implement `renderReportInModal(reportId)`: A switch/case function that clears the modal content and calls the appropriate existing render function (e.g., `renderProductStats`) or injects the necessary container HTML first.
- [ ] Update main tab event listeners to call `renderReportCards` instead of just showing/hiding panels.

## Phase 4: Migration of Reports
Migrate each rendering function to work within the modal container.
- [ ] **Financials**: Summary, Shift Variances, Closing Reports, Cashflow.
- [ ] **Products**: Performance (Matrix), Risk/Quality, Affinity, Low Stock, Velocity.
- [ ] **Inventory**: Valuation, Ledger, Stock-In, Audit, Movements, Shrinkage, Slow Moving, Returns, Conversions.
- [ ] **Insights**: Customers, Suppliers, Velocity Trend.
- [ ] **System**: Audit Log, User Sales.

## Phase 5: Cleanup
- [ ] Remove all old `sub-panel` HTML structures from `loadReportsView`.
- [ ] Remove old `subtab-btn` event listeners.
- [ ] Ensure all "View Details" buttons (like Shift Details, Stock-In Details) still work correctly on top of the report modal (nested modals or replaced content).
- [ ] Verify Export to CSV functionality works for the active modal report.
