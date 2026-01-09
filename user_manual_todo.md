# LightPOS Interactive User Manual

This document outlines the structure and content requirements for the LightPOS User Manual. It follows an interactive, Q&A-based layout with a searchable sidebar and dynamic content area.

## 1. Interface & Architecture
- [x] **Layout Structure**:
    - **Header**: Title and Search Bar.
    - **Sidebar (Left)**: Scrollable Table of Contents (TOC) listing Guides & FAQs.
    - **Content Area (Right)**: Dynamic view rendering the selected guide.
- [x] **Search Engine**: Client-side filtering of guides based on titles and keywords.
- [x] **Interactive Navigation**: Clicking a TOC item injects HTML content into the main view without page reloads.

## 2. Implemented Guides (Q&A Format)
These guides are currently implemented in `src/modules/manual.js`.

- [x] **How do I put on a sale?**
    - Steps: Open POS -> Add Items (Scan/Search) -> Select Customer -> Payment.
    - Context: Explains different ways to add items and payment modal details.
- [x] **How to make Purchase Orders?**
    - Steps: Inventory -> New PO -> Review Suggestions -> Approve.
    - Context: **Settings Mode** (Standard vs Replenishment), Velocity, and OTB logic.
- [x] **How to receive stock?**
    - Steps: Open PO/Stock In -> Verify Qty -> Handle Discrepancies.

## 3. Planned Guides (Backlog)
- [x] **How do I handle returns?** (Refunds, Exchanges, Restocking).
- [x] **How do I manage customers?** (Loyalty points, History).
- [x] **How do I perform a stock count?** (Audits, Adjustments).
- [x] **How do I manage shifts?** (Opening, Closing, X/Z Reports).
- [x] **How do I view reports?** (Sales, Inventory, Profit).
- [x] **How do I manage users?** (Permissions, Roles).
- [x] **How do I configure settings?** (Store info, Backup/Restore).