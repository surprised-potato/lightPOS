import { getSystemSettings } from "./settings.js";

export async function printTransactionReceipt(tx, isReplacement = false, isReprint = true) {
    const settings = await getSystemSettings();
    const store = settings.store || { name: "LightPOS", data: "" };

    const printWindow = window.open('', '_blank', 'width=300,height=600');

    let itemsHtml = "";
    let total = 0;

    if (tx.items) {
        tx.items.forEach(item => {
            const qty = isReplacement ? (item.qty - (item.returned_qty || 0)) : item.qty;
            if (qty <= 0 && isReplacement) return;

            const lineTotal = qty * item.selling_price;
            total += lineTotal;

            itemsHtml += `
            <tr>
                <td colspan="2" style="padding-top: 5px;">${item.name}</td>
            </tr>
            <tr>
                <td style="font-size: 10px;">${qty} x ${item.selling_price.toFixed(2)}</td>
                <td style="text-align: right;">${lineTotal.toFixed(2)}</td>
            </tr>
        `;
        });
    }

    const receiptHtml = `
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                @page { margin: 0; }
                body { 
                    width: 76mm; 
                    font-family: 'Courier New', Courier, monospace; 
                    font-size: 12px; 
                    padding: 5mm;
                    margin: 0;
                    color: #000;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .bold { font-weight: bold; }
                .hr { border-bottom: 1px dashed #000; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; }
                .footer { margin-top: 20px; font-size: 10px; }
                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 40px;
                    color: rgba(0, 0, 0, 0.1);
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: -1;
                    font-weight: bold;
                }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${isReprint && !isReplacement ? '<div class="watermark">REPRINT</div>' : ''}
            <div class="text-center">
                ${isReplacement ? '<div class="bold" style="font-size: 14px; border: 1px solid #000; margin-bottom: 5px;">REPLACEMENT RECEIPT</div>' : ''}
                ${store.logo ? `<img src="${store.logo}" style="max-width: 40mm; max-height: 20mm; margin-bottom: 5px; filter: grayscale(1);"><br>` : ''}
                <div class="bold" style="font-size: 16px;">${store.name}</div>
                <div style="white-space: pre-wrap; font-size: 10px;">${store.data}</div>
            </div>
            <div class="hr"></div>
            <div style="font-size: 10px;">
                Date: ${new Date(tx.timestamp).toLocaleString()}<br>
                Trans: #${tx.id}<br>
                Cashier: ${tx.user_email}<br>
                Customer: ${tx.customer_name}
            </div>
            <div class="hr"></div>
            <table>
                ${itemsHtml}
            </table>
            <div class="hr"></div>
            <table>
                <tr><td class="bold">TOTAL</td><td class="text-right bold">₱${total.toFixed(2)}</td></tr>
                ${!isReplacement ? `
                    <tr><td>Payment (${tx.payment_method})</td><td class="text-right">₱${tx.amount_tendered.toFixed(2)}</td></tr>
                    <tr><td>Change</td><td class="text-right">₱${tx.change ? tx.change.toFixed(2) : '0.00'}</td></tr>
                ` : `
                    <tr><td colspan="2" style="font-size: 9px; font-style: italic;">* Adjusted for returns</td></tr>
                `}
            </table>
            <div class="footer text-center">
                THIS IS NOT AN OFFICIAL RECEIPT<br>
                Thank you for shopping!
            </div>
        </body>
        </html>
    `;
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
}
