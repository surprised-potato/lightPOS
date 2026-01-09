Product Requirement Document: Inventory Optimization & Procurement Engine

1. Executive Summary

This document outlines the requirements for an Inventory Optimization Engine to be integrated into an existing POS system. The goal is to move from manual ordering to a data-driven system that uses ABC-XYZ Analysis, Economic Order Quantity (EOQ), Reorder Point (ROP), and Open-to-Buy (OTB) budgeting.

2. Technical Stack

Backend: PHP 7.4+ (Class-based/OOP).

Database: SQLite 3 (separate .db file for optimization metrics).

Architecture: API-First (RESTful JSON).

UI: Existing POS Frontend (Integration via API).

3. Database Schema (SQLite)

Table: inventory_metrics

Field

Type

Description

sku_id

TEXT (PK)

Unique identifier for the product.

first_sale_date

DATE

Date of the first recorded sale (for dynamic lookback).

abc_class

TEXT

'A' (High Value), 'B' (Mid), 'C' (Low).

xyz_class

TEXT

'X' (Stable), 'Y' (Variable), 'Z' (Erratic).

cv_value

REAL

Coefficient of Variation ($\sigma / \mu$).

daily_velocity

REAL

Average units sold per day (adjusted for store age).

std_dev_sales

REAL

Standard deviation of daily sales.

eoq_qty

INTEGER

Calculated Economic Order Quantity.

rop_trigger

INTEGER

Calculated Reorder Point.

safety_stock

INTEGER

"Min Stock" buffer based on volatility.

last_recalc

DATETIME

Timestamp of last mathematical update.

Table: supplier_config

Field

Type

Description

supplier_id

TEXT (PK)

Link to main POS supplier ID.

delivery_cadence

TEXT

Enum: 'weekly', 'biweekly', 'monthly', 'on_order'.

lead_time_days

INTEGER

Expected days from order to arrival.

monthly_otb

REAL

Financial ceiling for monthly purchases (PHP).

current_spend

REAL

Running total of spend in current calendar month.

4. Core Logic & Algorithms

4.1. Dynamic Lookback (The "New Store" Logic)

To prevent skewed averages in new stores, the system must calculate the Effective Sales Window.

Lookback Window: Set to 180 days.

Effective Days Calculation:

Data_Age = Today - first_sale_date

Effective_Days = Min(180, Data_Age) (Minimum 1 day).

Velocity Calculation: Total_Units_Sold / Effective_Days.

4.2. ABC-XYZ Analysis

ABC (Value): Rank SKUs by (Annual Demand * Unit Cost).

Top 80% = A, Next 15% = B, Remaining 5% = C.

XYZ (Predictability): Based on Coefficient of Variation ($CV = \sigma / \mu$).

X: $CV < 0.2$ | Y: $CV \in [0.2, 0.5]$ | Z: $CV > 0.5$.

4.3. Reorder Point (ROP) with Delivery Cadence

The ROP must account for the time between supplier deliveries (Review Period).

Cadence Map: Weekly = 7, Biweekly = 14, Monthly = 30, On Order = 0.

Formula: ROP = (Daily_Velocity * (Lead_Time + Review_Period)) + Safety_Stock.

Note: For "On Order" suppliers, the Review Period is 0 because the system evaluates the need instantly upon every transaction.

4.4. Economic Order Quantity (EOQ)

Calculate for A and B items where $CV < 0.5$.

Formula: $EOQ = \sqrt{\frac{2 * D * S}{H}}$

$D$ = Annual Demand, $S$ = Ordering Cost, $H$ = Holding Cost per unit.

5. Automated Procurement Workflow

5.1. The "On Order" Trigger System

Unlike scheduled suppliers (Weekly/Monthly) which are reviewed in batches, "On Order" suppliers require an active trigger.

Event Hook: Upon every SALE or STOCK_ADJUSTMENT event in the POS, the system must check the inventory_metrics for that SKU.

Condition: If (Current_Stock + On_Order) <= ROP AND Supplier_Cadence == 'on_order'.

Action: The system must automatically generate a Draft PO or send a Notification Alert to the procurement officer immediately. This bypasses the overnight Cron job.

5.2. Purchase Order Optimization (The "Triple Filter")

When generating a PO (either via manual review or automated trigger), follow this logic:

Trigger Filter: Select items where (Current_Stock + On_Order) <= ROP.

Initial Quantity: Set quantity to EOQ.

OTB Conflict Resolution: If Total_PO_Value > Available_OTB:

Priority 1: Keep Class A items at 100%.

Priority 2: Reduce Class B quantities to fit budget.

Priority 3: Remove Class C items entirely from the suggestion.

6. API Endpoints

GET /api/recalculate-all

Triggered by Cron Job. Performs the ABC-XYZ math and updates inventory_metrics.

GET /api/inventory/alerts

Returns a list of all items currently below their ROP. Used for a "Needs Attention" dashboard.

GET /api/suppliers/{id}/suggested-order

Returns a JSON object of optimized items.

Output: List of SKUs, Recommended Qty, ABC/XYZ tags, and current OTB status.

POST /api/settings/otb

Updates the monthly_otb for a specific supplier.

7. Developer Notes

Real-time Performance: The check for "On Order" triggers (Section 5.1) must be lightweight to avoid lagging the checkout process. Use indexed SQLite queries.

Data Integrity: If a product has zero sales in the history, default its class to 'C' and 'Z'.

Edge Case: If Lead_Time is unknown, default to 7 days for calculation.