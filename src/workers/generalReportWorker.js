
self.onmessage = function (e) {
    const { type, payload } = e.data;

    try {
        if (type === 'GENERATE_SHIFTS') {
            const result = generateShiftReports(payload);
            self.postMessage({ type: 'Re:GENERATE_SHIFTS', success: true, data: result });
        } else if (type === 'GENERATE_SUMMARY') {
            const result = generateSalesSummary(payload);
            self.postMessage({ type: 'Re:GENERATE_SUMMARY', success: true, data: result });
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

function generateSalesSummary(payload) {
    const { transactions, items, startDate, endDate } = payload;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Create Item Cost Map for fast lookup
    const itemMap = new Map();
    items.forEach(i => itemMap.set(i.id, i));

    let totalRevenue = 0;
    let totalCost = 0;
    let totalTax = 0; // If you have tax logic
    let transactionCount = 0;

    const paymentMethods = {};
    const categorySales = {};

    transactions.forEach(tx => {
        const d = new Date(tx.timestamp);
        if (d >= start && d <= end && !tx.is_voided) {
            transactionCount++;
            totalRevenue += parseFloat(tx.total_amount || 0);

            // Payment Method Breakdown
            const method = tx.payment_method || 'Cash';
            if (!paymentMethods[method]) paymentMethods[method] = 0;
            paymentMethods[method] += parseFloat(tx.total_amount || 0);

            // Line Item Analysis for Cost & Category
            if (tx.items && Array.isArray(tx.items)) {
                tx.items.forEach(lineItem => {
                    const itemDef = itemMap.get(lineItem.id);
                    // fallback to lineItem.cost if stored snapshot exists, else current cost
                    const cost = parseFloat(lineItem.cost || (itemDef ? itemDef.cost_price : 0) || 0);
                    const qty = parseFloat(lineItem.qty || 0);
                    const lineTotal = (parseFloat(lineItem.price || 0) * qty);

                    totalCost += (cost * qty);

                    // Category aggregation
                    const cat = (itemDef ? itemDef.category : 'Uncategorized') || 'Uncategorized';
                    if (!categorySales[cat]) categorySales[cat] = 0;
                    categorySales[cat] += lineTotal;
                });
            }
        }
    });

    const grossProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
        summary: {
            totalRevenue,
            totalCost,
            grossProfit,
            margin,
            transactionCount,
            avgTicket: transactionCount > 0 ? totalRevenue / transactionCount : 0
        },
        paymentMethods,
        categorySales
    };
}

function generateShiftReports(payload) {
    const { shifts, startDate, endDate } = payload;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Filter shifts by date range
    const filteredShifts = shifts.filter(s => {
        const d = new Date(s.start_time);
        return d >= start && d <= end;
    });

    // Sort by Date Descending
    filteredShifts.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    // Calculate Aggregates
    const totalShifts = filteredShifts.length;
    let totalVariance = 0;
    let totalCashout = 0;

    filteredShifts.forEach(s => {
        if (s.status === 'closed') {
            // Variance logic matching shift.js
            const expected = s.expected_cash || 0;
            // Note: In shift.js, expected is calculated dynamically based on transactions. 
            // Here we rely on the stored 'expected_cash' snapshot if available, 
            // or we might receive it pre-calculated if the main thread does it.
            // For report historical accuracy, we should probably rely on the snapshot in the shift record.

            const closing = s.closing_cash || 0;
            const cashout = s.cashout || 0;
            const receipts = s.closing_receipts || [];
            const expenses = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);

            // Re-verify logic from shift.js:
            // updatedShift.closing_cash = closing;
            // updatedShift.expected_cash = expected;
            // summary.difference = closing - expected;

            // Wait, in shift.js render loop:
            // turnover = closing + expenses + cashout;
            // variance = turnover - expected;
            // This suggests 'closing_cash' in DB is just the drawer count.
            // But 'expected_cash' usually includes opening + sales - cashouts + adjustments.

            // Let's stick to the stored snapshot variance if possible, or calculate it.
            // If the shift record has 'variance', use it. If not, calculate.
            // Looking at shift.js, it doesn't seem to store 'variance' explicitly in the root object, 
            // but return it in the summary.

            // Calculation:
            const turnover = closing + expenses + cashout;
            const variance = turnover - expected;

            totalVariance += variance;
            totalCashout += cashout;
            s._calculatedVariance = variance; // Attach for display
            s._calculatedTurnover = turnover;
        } else {
            s._calculatedVariance = 0;
            s._calculatedTurnover = 0;
        }
    });

    return {
        shifts: filteredShifts.map(s => ({
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
            status: s.status,
            user_id: s.user_id,
            opening_cash: s.opening_cash,
            closing_cash: s.closing_cash,
            expected_cash: s.expected_cash,
            cashout: s.cashout,
            adjustment_count: (s.adjustments || []).length,
            variance: s._calculatedVariance,
            turnover: s._calculatedTurnover,
            forced_closed: s.forced_closed,
            remittance_total: (s.remittances || []).reduce((sum, r) => sum + r.amount, 0)
        })),
        summary: {
            totalShifts,
            totalVariance,
            totalCashout
        }
    };
}
