// --- PWA Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    });
}

// --- General Modal Control ---
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    
    // Auto-focus logic for forms
    if(modalId === 'addCustomerModal') setTimeout(() => document.getElementById('newCustomerName').focus(), 100);
    if(modalId === 'addProductModal') setTimeout(() => document.getElementById('newProductName').focus(), 100);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}


// --- Dynamic Master Catalog (Frequency Tracked) ---
function getCatalogItems() {
    let items = JSON.parse(localStorage.getItem('pos_master_items'));
    if (!items) {
        items = []; 
        localStorage.setItem('pos_master_items', JSON.stringify(items));
    }
    return items.map(i => typeof i === 'string' ? { name: i, count: 0 } : i);
}

function saveCatalogItems(items) {
    localStorage.setItem('pos_master_items', JSON.stringify(items));
}

// --- State Management ---
let currentCustomerId = null;

// --- View Router ---
function switchView(viewName) {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-details').classList.add('hidden');
    document.getElementById('view-pos').classList.add('hidden');

    document.getElementById(`view-${viewName}`).classList.remove('hidden');

    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'details') {
        document.getElementById('searchTx').value = '';
        renderCustomerDetails();
    }
    if (viewName === 'pos') {
        const customer = getCustomer(currentCustomerId);
        document.getElementById('posCustomerName').innerText = customer.name;
        
        document.getElementById('posDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('posItemsSummary').value = '';
        document.getElementById('posPurchaseAmount').value = '';
        document.getElementById('posCashGiven').value = '';
        document.getElementById('searchInput').value = '';
        
        filterItems();
    }
}

// --- Database Operations ---
function getCustomers() { return JSON.parse(localStorage.getItem('pos_customers')) || []; }
function saveCustomers(customers) { localStorage.setItem('pos_customers', JSON.stringify(customers)); }
function getCustomer(id) { return getCustomers().find(c => c.id === id); }
function getTransactions(customerId) { return JSON.parse(localStorage.getItem(`pos_tx_${customerId}`)) || []; }
function saveTransactions(customerId, transactions) {
    localStorage.setItem(`pos_tx_${customerId}`, JSON.stringify(transactions));
    recalculateBalance(customerId);
}

function recalculateBalance(customerId) {
    const txs = getTransactions(customerId);
    const newBalance = txs.reduce((sum, tx) => sum + (tx.purchaseAmount - tx.cashGiven), 0);
    
    let customers = getCustomers();
    const index = customers.findIndex(c => c.id === customerId);
    if (index > -1) {
        customers[index].balance = newBalance;
        
        const sortedDates = txs.map(t => new Date(t.date)).sort((a,b) => b - a);
        customers[index].lastEntry = sortedDates.length > 0 ? sortedDates[0].toISOString() : '-';
        saveCustomers(customers);
    }
}

// --- Dashboard View (Prioritized by Entries) ---
function renderDashboard() {
    let customers = getCustomers();
    const query = document.getElementById('searchCustomer').value.toLowerCase();
    const sort = document.getElementById('sortCustomer').value;

    if (query) customers = customers.filter(c => c.name.toLowerCase().includes(query));

    // Calculate txCount temporarily for rendering and sorting
    customers.forEach(c => {
        c.txCount = getTransactions(c.id).length;
    });

    customers.sort((a, b) => {
        if (sort === 'entries') return b.txCount - a.txCount;
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'balanceDesc') return b.balance - a.balance;
        if (sort === 'recent') {
            if (a.lastEntry === '-') return 1;
            if (b.lastEntry === '-') return -1;
            return new Date(b.lastEntry) - new Date(a.lastEntry);
        }
        return 0;
    });

    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = customers.map(c => `
        <tr class="hover:bg-gray-700 transition-colors">
            <td class="p-4">
                <div class="font-medium text-gray-200">${c.name}</div>
                <div class="text-xs text-blue-400 mt-1 font-bold">${c.txCount} entries</div>
            </td>
            <td class="p-4 font-bold ${c.balance > 0 ? 'text-red-400' : 'text-green-400'}">₹${c.balance}</td>
            <td class="p-4 text-gray-400 text-sm hidden sm:table-cell">${formatDate(c.lastEntry)}</td>
            <td class="p-4 text-center">
                <button onclick="openDetails('${c.id}')" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm shadow">Details</button>
            </td>
        </tr>
    `).join('');

    if(customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">No customers found. Click + New Customer to start.</td></tr>`;
    }
}

function saveNewCustomer() {
    const inputField = document.getElementById('newCustomerName');
    const name = inputField.value.trim();
    
    if (!name) return alert('Please enter a valid name.');
    
    let customers = getCustomers();
    customers.push({ id: 'CUST_' + Date.now(), name: name, balance: 0, lastEntry: '-' });
    saveCustomers(customers);
    
    inputField.value = ''; // Reset
    closeModal('addCustomerModal');
    renderDashboard();
}

// --- Customer Details & Monthly Accordion View ---
function openDetails(customerId) {
    currentCustomerId = customerId;
    switchView('details');
}

function toggleMonthAccordion(targetId) {
    document.querySelectorAll('.month-content').forEach(el => {
        if (el.id === targetId) {
            el.classList.toggle('hidden');
        } else {
            el.classList.add('hidden'); 
        }
    });
}

// --- Updated Customer Details & Monthly Accordion View ---
function renderCustomerDetails() {
    const customer = getCustomer(currentCustomerId);
    if(!customer) return switchView('dashboard');

    document.getElementById('detailCustomerName').innerText = customer.name;
    const balEl = document.getElementById('detailCustomerBalance');
    balEl.innerText = '₹' + customer.balance;
    balEl.className = customer.balance > 0 ? 'text-xl font-bold text-red-400' : 'text-xl font-bold text-green-400';

    const searchQ = document.getElementById('searchTx').value.toLowerCase();
    let txs = getTransactions(currentCustomerId);
    
    if (searchQ) {
        txs = txs.filter(tx => (tx.itemsSummary || '').toLowerCase().includes(searchQ));
    }
    
    // Sort descending for the UI accordion
    txs.sort((a, b) => new Date(b.date) - new Date(a.date));

    const groups = {};
    txs.forEach(tx => {
        const d = new Date(tx.date);
        const mKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const mName = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        if(!groups[mKey]) groups[mKey] = { name: mName, txs: [], totalPurchases: 0, totalCash: 0 };
        groups[mKey].txs.push(tx);
        groups[mKey].totalPurchases += tx.purchaseAmount || 0;
        groups[mKey].totalCash += tx.cashGiven || 0;
    });

    const sortedMonths = Object.keys(groups).sort((a,b) => b.localeCompare(a));
    const container = document.getElementById('transactionAccordion');

    if (sortedMonths.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 bg-gray-800 rounded-xl border border-gray-700">No transactions found.</div>`;
        return;
    }

    container.innerHTML = sortedMonths.map((mKey, index) => {
        const g = groups[mKey];
        const isOpen = index === 0;
        
        let txRows = g.txs.map(tx => `
            <tr class="hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0">
                <td class="p-4 text-sm text-gray-300 w-24">${new Date(tx.date).getDate()} ${g.name.split(' ')[0].substring(0,3)}</td>
                <td class="p-4 text-sm text-gray-300 min-w-[150px]">${tx.itemsSummary || '-'}</td>
                <td class="p-4 font-bold text-red-400">${tx.purchaseAmount > 0 ? '₹'+tx.purchaseAmount : '-'}</td>
                <td class="p-4 font-bold text-green-400">${tx.cashGiven > 0 ? '₹'+tx.cashGiven : '-'}</td>
                <td class="p-4 text-right">
                    <button onclick="openEditModal('${tx.id}')" class="text-blue-400 hover:text-blue-300 text-sm font-semibold underline">Edit</button>
                </td>
            </tr>
        `).join('');

        return `
        <div class="border border-gray-700 rounded-xl overflow-hidden bg-gray-800 shadow">
            <button onclick="toggleMonthAccordion('month-${mKey}')" class="w-full bg-gray-900 p-4 flex justify-between items-center text-white hover:bg-gray-800 transition">
                <span class="font-bold text-lg">${g.name}</span>
                <div class="text-sm flex items-center gap-3">
                    <span class="text-red-400 hidden sm:inline">Total: ₹${g.totalPurchases}</span>
                    <span class="text-green-400 hidden sm:inline">Cash: ₹${g.totalCash}</span>
                    <!-- NEW PDF BUTTON -->
                    <div onclick="event.stopPropagation(); generateMonthPDF('${mKey}', '${g.name}')" class="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-bold shadow active:scale-95 transition-transform flex items-center gap-1">
                        Download PDF
                    </div>
                </div>
            </button>
            <div id="month-${mKey}" class="month-content ${isOpen ? 'block' : 'hidden'}">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <tbody class="divide-y divide-gray-700">${txRows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- NEW FUNCTION: Generate PDF ---
function generateMonthPDF(monthKey, monthName) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const customer = getCustomer(currentCustomerId);
    
    // Sort all transactions chronologically (oldest first) to calculate accurate running balances
    const allTxs = getTransactions(currentCustomerId).sort((a, b) => new Date(a.date) - new Date(b.date));

    let previousBalance = 0;
    let monthTransactions = [];

    // Calculate Previous Balance and separate this month's transactions
    allTxs.forEach(tx => {
        const d = new Date(tx.date);
        const txMonthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        
        if (txMonthKey < monthKey) {
            previousBalance += (tx.purchaseAmount - tx.cashGiven);
        } else if (txMonthKey === monthKey) {
            monthTransactions.push(tx);
        }
    });

    // PDF Header Configuration
    doc.setFontSize(20);
    doc.text("Customer Balance Sheet", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Customer Name: ${customer.name}`, 14, 30);
    doc.text(`Billing Month: ${monthName}`, 14, 37);
    
    // Setup Table Data
    const tableColumn = ["Date", "Description", "Purchase (Rs)", "Cash Paid (Rs)", "Running Balance"];
    const tableRows = [];
    
    let currentBalance = previousBalance;

    // Add Previous Balance Row
    tableRows.push([
        "-", 
        "PREVIOUS BALANCE BROUGHT FORWARD", 
        "-", 
        "-", 
        `Rs ${currentBalance.toFixed(2)}`
    ]);

    // Add Transactions for the selected month
    monthTransactions.forEach(tx => {
        const d = new Date(tx.date);
        const dateStr = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
        
        currentBalance += (tx.purchaseAmount - tx.cashGiven);
        
        tableRows.push([
            dateStr,
            tx.itemsSummary || '-',
            tx.purchaseAmount > 0 ? tx.purchaseAmount : '-',
            tx.cashGiven > 0 ? tx.cashGiven : '-',
            `Rs ${currentBalance.toFixed(2)}`
        ]);
    });

    // Add Final Balance Row
    tableRows.push([
        "", 
        "FINAL BALANCE DUE", 
        "", 
        "", 
        `Rs ${currentBalance.toFixed(2)}`
    ]);

    // Generate AutoTable
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        theme: 'grid',
        headStyles: { fillColor: [31, 41, 55] }, // Dark Gray header
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        },
        willDrawCell: function(data) {
            // Highlight the Final Balance row
            if (data.row.index === tableRows.length - 1 && data.section === 'body') {
                doc.setFillColor(220, 252, 231); // Light green background
                doc.setFont("helvetica", "bold");
            }
            // Highlight Previous Balance row
            if (data.row.index === 0 && data.section === 'body') {
                doc.setFont("helvetica", "italic");
            }
        }
    });

    // Save the PDF
    const filename = `${customer.name.replace(/\s+/g, '_')}_${monthName}.pdf`;
    doc.save(filename);
}

// --- POS / Ledger Entry Logic ---
function renderItems(itemsArray) {
    itemsArray.sort((a, b) => b.count - a.count);
    
    document.getElementById('itemGrid').innerHTML = itemsArray.map(item => `
        <button onclick="openQuantityModal('${item.name}')" 
            class="flex items-center justify-center p-4 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-xl active:scale-95 transition-all shadow">
            <span class="font-semibold text-gray-100 text-sm text-center">${item.name}</span>
        </button>
    `).join('');
}

function filterItems() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    renderItems(getCatalogItems().filter(i => i.name.toLowerCase().includes(query)));
}

function saveNewProduct() {
    const inputField = document.getElementById('newProductName');
    const name = inputField.value.trim();
    if (!name) return alert('Please enter a valid product name.');
    
    let items = getCatalogItems();
    if (!items.find(i => i.name.toLowerCase() === name.toLowerCase())) {
        items.push({ name: name, count: 0 });
        saveCatalogItems(items);
    }
    
    inputField.value = ''; // Reset
    document.getElementById('searchInput').value = '';
    closeModal('addProductModal');
    filterItems();
}

// --- Quantity Modal Logic ---
function openQuantityModal(itemName) {
    document.getElementById('quantityItemName').value = itemName;
    document.getElementById('quantityItemDisplay').innerText = `Product: ${itemName}`;
    document.getElementById('itemQuantity').value = '1';
    
    document.getElementById('quantityModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('itemQuantity').focus(), 100);
}

function confirmQuantity() {
    const itemName = document.getElementById('quantityItemName').value;
    const qty = document.getElementById('itemQuantity').value;
    
    if (!qty || parseFloat(qty) <= 0) return alert('Enter a valid quantity.');

    // Format text: if qty is 1, just item name. If more/less, append (xQty)
    const summaryText = parseFloat(qty) === 1 ? itemName : `${itemName} (x${qty})`;
    appendItemToSummary(summaryText);
    closeModal('quantityModal');
}

function appendItemToSummary(textToAdd) {
    const textArea = document.getElementById('posItemsSummary');
    if (textArea.value.trim().length > 0) {
        textArea.value += ', ' + textToAdd;
    } else {
        textArea.value = textToAdd;
    }
}

function saveTransaction() {
    const dateInput = document.getElementById('posDate').value; 
    const itemsSummary = document.getElementById('posItemsSummary').value.trim();
    const purchaseAmount = parseFloat(document.getElementById('posPurchaseAmount').value) || 0;
    const cashGiven = parseFloat(document.getElementById('posCashGiven').value) || 0;

    if (purchaseAmount === 0 && cashGiven === 0) {
        return alert("Please enter either a Purchase Amount or Cash Given.");
    }

    const finalIsoDate = dateInput ? `${dateInput}T${new Date().toISOString().split('T')[1]}` : new Date().toISOString();

    const txs = getTransactions(currentCustomerId);
    txs.push({
        id: 'TX_' + Date.now(),
        date: finalIsoDate,
        itemsSummary: itemsSummary,
        purchaseAmount: purchaseAmount,
        cashGiven: cashGiven
    });

    saveTransactions(currentCustomerId, txs);

    let catalog = getCatalogItems();
    let summaryLower = itemsSummary.toLowerCase();
    catalog.forEach(item => {
        // Find if base item name is in the summary block (ignores the x1.5 part attached to it)
        if (summaryLower.includes(item.name.toLowerCase())) {
            item.count++;
        }
    });
    saveCatalogItems(catalog);

    if(navigator.vibrate) navigator.vibrate(50);
    switchView('details'); 
}

// --- Edit Transaction Modal Logic ---
function openEditModal(txId) {
    const tx = getTransactions(currentCustomerId).find(t => t.id === txId);
    if(!tx) return;

    document.getElementById('editTxId').value = tx.id;
    document.getElementById('editDate').value = tx.date.split('T')[0];
    document.getElementById('editItemsText').value = tx.itemsSummary;
    document.getElementById('editPurchase').value = tx.purchaseAmount;
    document.getElementById('editCash').value = tx.cashGiven;
    
    openModal('editModal');
}

function saveEditModal() {
    const txId = document.getElementById('editTxId').value;
    let txs = getTransactions(currentCustomerId);
    const index = txs.findIndex(t => t.id === txId);
    
    if (index > -1) {
        const oldTime = txs[index].date.split('T')[1] || '00:00:00.000Z';
        const newDate = document.getElementById('editDate').value;
        
        txs[index].date = `${newDate}T${oldTime}`;
        txs[index].itemsSummary = document.getElementById('editItemsText').value;
        txs[index].purchaseAmount = parseFloat(document.getElementById('editPurchase').value) || 0;
        txs[index].cashGiven = parseFloat(document.getElementById('editCash').value) || 0;
        
        saveTransactions(currentCustomerId, txs);
    }
    closeModal('editModal');
    renderCustomerDetails();
}

function deleteCurrentTransaction() {
    if(!confirm("Delete this entry permanently?")) return;
    let txs = getTransactions(currentCustomerId).filter(t => t.id !== document.getElementById('editTxId').value);
    saveTransactions(currentCustomerId, txs);
    closeModal('editModal');
    renderCustomerDetails();
}

// --- Utils ---
function formatDate(isoString) {
    if (!isoString || isoString === '-') return '-';
    const d = new Date(isoString);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

// --- Database Backup & Restore ---

function exportDatabase() {
    const dbExport = {};
    
    // Loop through localStorage and grab only the keys belonging to our POS app
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('pos_')) {
            dbExport[key] = localStorage.getItem(key);
        }
    }
    
    if (Object.keys(dbExport).length === 0) {
        return alert("No data found to backup.");
    }

    // Convert to JSON and create a downloadable file
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbExport));
    const downloadAnchorNode = document.createElement('a');
    
    const date = new Date().toISOString().split('T')[0];
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `QuickPOS_Backup_${date}.json`);
    
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("WARNING: This will overwrite your current data with the backup. Do you want to proceed?")) {
        event.target.value = ''; // Reset input
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Validate it's our backup file
            let validKeysFound = 0;
            for (const key in importedData) {
                if (key.startsWith('pos_')) {
                    localStorage.setItem(key, importedData[key]);
                    validKeysFound++;
                }
            }

            if (validKeysFound > 0) {
                alert(`Success! Restored database successfully.`);
                renderDashboard();
            } else {
                alert("Invalid backup file. No data restored.");
            }
        } catch (err) {
            alert("Error reading the backup file.");
        }
        event.target.value = ''; // Reset input
    };
    reader.readAsText(file);
}

// Init
window.addEventListener('DOMContentLoaded', () => renderDashboard());