
// Utility to help with date math since we might not have full moment.js if not bundled
// But if we use type="module", we can import stuff usually.
// For safety/simplicity in this environment, I'll use native Date for standard things
// or expect the main thread to pass time-zone adjusted timestamps if critical.

self.onmessage = function (e) {
    const { type, payload } = e.data;

    try {
        if (type === 'GENERATE') {
            const result = generateReportData(payload);
            self.postMessage({ type: 'Re:GENERATE', success: true, data: result });
        } else if (type === 'CALC_AFFINITY') {
            const result = calculateAffinity(payload);
            self.postMessage({ type: 'Re:CALC_AFFINITY', success: true, data: result });
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', message: error.message, stack: error.stack });
    }
};

function generateReportData(payload) {
    const {
        transactions, allItems, returns, filteredAdjustments, filteredMovements,
        filteredStockIn, filteredExpenses, userStats, suppliers,
        startDate, endDate, taxRate
    } = payload;

    // --- Basic Aggregation ---
    let grossSales = 0;
    let totalOutputTax = 0;
    let totalInputTax = 0; // Needs expense tax logic if applicable, currently 0 in main code logic shown
    let cogs = 0;

    // Aggregates
    const productStats = {};
    const itemTxCounts = {}; // itemId -> count of tx it appeared in
    const paymentStats = {};
    const hourlySales = new Array(24).fill(0);
    const hourlyTrend = new Array(24).fill(0); // For insights
    const dailyCashflow = {};

    // Initialize Cashflow Dates
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
        const dStr = curr.toISOString().split('T')[0];
        dailyCashflow[dStr] = { inflow: 0, outflow: 0 };
        curr.setDate(curr.getDate() + 1);
    }

    // Process Transactions
    const validTxs = [];

    transactions.forEach(data => {
        if (data.is_voided) return;
        validTxs.push(data);

        grossSales += data.total_amount || 0;

        // Tax Calc
        const calculatedTax = (data.total_amount || 0) - ((data.total_amount || 0) / (1 + taxRate));
        totalOutputTax += calculatedTax;

        const hour = new Date(data.timestamp).getHours();
        hourlySales[hour] += data.total_amount || 0;

        const dStr = new Date(data.timestamp).toISOString().split('T')[0];
        if (dailyCashflow[dStr]) dailyCashflow[dStr].inflow += data.total_amount;

        if (data.items && Array.isArray(data.items)) {
            const uniqueItemIds = [...new Set(data.items.map(i => i.id))];
            uniqueItemIds.forEach(id => {
                itemTxCounts[id] = (itemTxCounts[id] || 0) + 1;
            });

            data.items.forEach(item => {
                const itemMaster = allItems.find(i => i.id === item.id) || {};
                const cost = itemMaster.cost_price || 0;
                // If profit is stored in item
                // const profit = item.profit || 0; 
                // In main code: cogs += (item.cost_price * item.qty) usually
                // Checks: main code uses itemMaster.cost_price

                cogs += (cost * (item.qty || 0));

                if (!productStats[item.id]) {
                    productStats[item.id] = {
                        id: item.id,
                        name: item.name,
                        qty: 0,
                        revenue: 0,
                        cost: 0,
                        txIds: new Set(), // Will convert to size later
                        // Initialize other stats
                    };
                }
                productStats[item.id].qty += (item.qty || 0);
                productStats[item.id].revenue += ((item.qty || 0) * (item.selling_price || 0)); // Approx revenue
                productStats[item.id].cost += ((item.qty || 0) * cost);
                productStats[item.id].txIds.add(data.id);
            });
        }

        // Payments
        const method = data.payment_method || 'Cash';
        if (!paymentStats[method]) paymentStats[method] = { count: 0, total: 0 };
        paymentStats[method].count++;
        paymentStats[method].total += data.total_amount;
    });

    // Populate Hourly Trend (Avg)
    const dayCount = Math.max(1, (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
    for (let i = 0; i < 24; i++) {
        hourlyTrend[i] = hourlySales[i] / dayCount;
    }

    // Process Expenses
    filteredExpenses.forEach(e => {
        const dStr = new Date(e.date).toISOString().split('T')[0];
        if (dailyCashflow[dStr]) dailyCashflow[dStr].outflow += e.amount;
    });

    // --- Optimization Maps ---
    const reasonStats = {};
    const defectiveBySupplier = {};
    const returnsMap = new Map();
    returns.forEach(ret => {
        reasonStats[ret.reason] = (reasonStats[ret.reason] || 0) + 1;
        if (ret.reason === 'Defective') {
            const item = allItems.find(i => i.id === ret.item_id);
            const supplierId = item?.supplier_id;
            const supplierName = suppliers.find(s => s.id === supplierId)?.name || 'Unknown';
            defectiveBySupplier[supplierName] = (defectiveBySupplier[supplierName] || 0) + ret.qty;
        }
        const current = returnsMap.get(ret.item_id) || 0;
        returnsMap.set(ret.item_id, current + (ret.qty || 0));
    });

    const shrinkageMap = new Map();
    const shrinkageStats = { Theft: 0, 'Admin Error': 0, 'Vendor Fraud': 0, Other: 0 };
    filteredAdjustments.forEach(a => {
        if (a.difference < 0) {
            const qty = Math.abs(a.difference);
            const r = a.reason || 'Other';
            if (shrinkageStats[r] !== undefined) shrinkageStats[r] += qty;
            else shrinkageStats.Other += qty;

            const current = shrinkageMap.get(a.item_id) || 0;
            shrinkageMap.set(a.item_id, current + qty);
        }
    });

    const totalTxCount = validTxs.length;

    // Finalize Products
    const products = Object.values(productStats).map(p => {
        const itemMaster = allItems.find(i => i.id === p.id);
        const currentStock = itemMaster ? itemMaster.stock_level : 0;
        const costPrice = itemMaster ? itemMaster.cost_price : 0;
        const avgInvCost = Math.max(1, currentStock * costPrice);

        const returnedUnits = returnsMap.get(p.id) || 0;
        const shrinkageQty = shrinkageMap.get(p.id) || 0;
        const txCountSize = p.txIds.size; // Get size before stripped

        return {
            ...p,
            margin: p.revenue - p.cost,
            marginPct: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0,
            gmroi: (p.revenue - p.cost) / avgInvCost,
            returnedUnits,
            shrinkageQty,
            str: (p.qty + currentStock) > 0 ? (p.qty / (p.qty + currentStock) * 100) : 0,
            penetration: totalTxCount > 0 ? (txCountSize / totalTxCount * 100) : 0,
            // Strip Sets/Maps for transfer
            txIds: null
        };
    });

    // Helper for Matrix
    const avgRev = products.reduce((sum, p) => sum + p.revenue, 0) / (products.length || 1);
    const avgMargin = products.reduce((sum, p) => sum + p.marginPct, 0) / (products.length || 1);
    const matrix = { winners: [], cows: [], sleepers: [], dogs: [] };
    products.forEach(prod => {
        if (prod.revenue >= avgRev && prod.marginPct >= avgMargin) matrix.winners.push(prod);
        else if (prod.revenue >= avgRev && prod.marginPct < avgMargin) matrix.cows.push(prod);
        else if (prod.revenue < avgRev && prod.marginPct >= avgMargin) matrix.sleepers.push(prod);
        else matrix.dogs.push(prod);
    });

    // Vendor Stats
    const vendorPerf = suppliers.map(s => {
        // Simplified Logic: pass necessary data if needed to be perfect, 
        // strictly following reference imp
        const bought = filteredStockIn.reduce((sum, entry) => {
            if (!entry.items) return sum;
            return sum + entry.items.filter(i => {
                const m = allItems.find(x => x.id === i.item_id); // Note: item_id vs id in diff contexts
                return m && m.supplier_id === s.id;
            }).reduce((s2, i) => s2 + (i.quantity || 0), 0);
        }, 0);

        // sold calc needs scanning tx items again?
        // We can optimize this by tracking supplier sales in main loop if needed
        // For now, doing the reduce here is OK for worker
        const sold = validTxs.reduce((sum, tx) => {
            if (!tx.items) return sum;
            return sum + tx.items.filter(i => {
                const m = allItems.find(x => x.id === i.id);
                return m && m.supplier_id === s.id;
            }).reduce((s2, i) => s2 + (i.qty || 0), 0);
        }, 0);

        return { name: s.name, bought, sold };
    });

    // --- Movement Synthesis (Moved from Main Thread) ---
    const salesMovements = validTxs.flatMap(t =>
        (t.items || []).map(item => ({
            id: `sale-${t.id}-${item.id}`,
            item_id: item.id,
            item_name: item.name,
            timestamp: t.timestamp,
            type: 'Sale',
            qty: -item.qty,
            user: t.user_email,
            transaction_id: t.id,
            reason: "POS Sale"
        }))
    );

    const returnMovements = returns.filter(r => r.condition === 'Restock').flatMap(r => {
        return [{
            id: `return-${r.id}`,
            item_id: r.item_id,
            item_name: r.item_name,
            timestamp: r.timestamp,
            type: 'Return',
            qty: r.qty,
            user: r.processed_by,
            transaction_id: r.transaction_id,
            reason: `${r.reason} (${r.condition})`
        }];
    });

    const otherMovements = filteredMovements.filter(m => {
        const type = m.type;
        return type !== 'Sale' && type !== 'Return' && type !== 'Shrinkage';
    });
    const allMovements = [...otherMovements, ...salesMovements, ...returnMovements];

    // Sort and re-assign
    const sortedMovements = allMovements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));


    return {
        grossSales,
        totalOutputTax,
        totalInputTax,
        cogs,
        products,
        matrix,
        dailyCashflow: Object.entries(dailyCashflow).map(([date, vals]) => ({ date, ...vals })),
        hourlyTrend,
        hourlySales,
        paymentStats: Object.entries(paymentStats).map(([method, d]) => ({ method, ...d })),
        shrinkage: Object.entries(shrinkageStats).map(([reason, qty]) => ({ reason, qty })),
        returnReasons: Object.entries(reasonStats).map(([reason, count]) => ({ reason, count })),
        defectiveSuppliers: Object.entries(defectiveBySupplier).map(([name, count]) => ({ name, count })),
        vendorPerf,
        itemTxCounts,
        movements: sortedMovements,
        hourlySales,
        paymentStats: Object.entries(paymentStats).map(([method, d]) => ({ method, ...d })),
        shrinkage: Object.entries(shrinkageStats).map(([reason, qty]) => ({ reason, qty })),
        returnReasons: Object.entries(reasonStats).map(([reason, count]) => ({ reason, count })),
        defectiveSuppliers: Object.entries(defectiveBySupplier).map(([name, count]) => ({ name, count })),
        vendorPerf,
        // Send back processed lists that were filtered if needed, or rely on main thread having them?
        // Main thread passed them in, so it has them. 
        // But we might have augmented them? No, mostly separate stats.
        // We return the computed stats.
        itemTxCounts // Return for Affinity
    };
}

function calculateAffinity(payload) {
    const { transactions, itemTxCounts, allItems } = payload;
    const pairCounts = {};

    transactions.forEach(data => {
        if (!data.is_voided && data.items && Array.isArray(data.items)) {
            const uniqueItemIds = [...new Set(data.items.map(i => i.id))];
            if (uniqueItemIds.length > 1) {
                for (let i = 0; i < uniqueItemIds.length; i++) {
                    for (let j = i + 1; j < uniqueItemIds.length; j++) {
                        const idA = uniqueItemIds[i];
                        const idB = uniqueItemIds[j];
                        const pairKey = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
                        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
                    }
                }
            }
        }
    });

    return Object.entries(pairCounts).map(([key, count]) => {
        const [idA, idB] = key.split('|');
        const itemA = allItems.find(i => i.id === idA);
        const itemB = allItems.find(i => i.id === idB);
        return {
            itemAName: itemA ? itemA.name : 'Unknown',
            itemBName: itemB ? itemB.name : 'Unknown',
            count,
            attachRateA: (count / (itemTxCounts[idA] || 1)) * 100,
            attachRateB: (count / (itemTxCounts[idB] || 1)) * 100
        };
    }).sort((a, b) => b.count - a.count);
}
