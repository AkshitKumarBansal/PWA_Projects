// State management - LOAD FROM LOCALSTORAGE IF EXISTS
let transactions = JSON.parse(localStorage.getItem('finance-transactions')) || [];
let editId = null; 
let sortConfig = { column: 'date', order: 'desc' }; 

// Save to LocalStorage function
function saveToLocal() {
  localStorage.setItem('finance-transactions', JSON.stringify(transactions));
}

// DOM Elements
const btnShowDashboard = document.getElementById('btn-show-dashboard');
const btnShowIncome = document.getElementById('btn-show-income');
const btnShowExpense = document.getElementById('btn-show-expense');
const btnShowReport = document.getElementById('btn-show-report');

// Download & Backup Buttons
const btnDownloadAll = document.getElementById('btn-download-all');
const btnDownloadIncome = document.getElementById('btn-download-income');
const btnDownloadExpense = document.getElementById('btn-download-expense');
const btnBackupData = document.getElementById('btn-backup-data');
const fileRestoreData = document.getElementById('file-restore-data');

const sectionDashboard = document.getElementById('section-dashboard');
const sectionIncome = document.getElementById('section-income');
const sectionExpense = document.getElementById('section-expense');
const sectionReport = document.getElementById('section-report');

const incomeForm = document.getElementById('income-form');
const expenseForm = document.getElementById('expense-form');
const incomeDateInput = document.getElementById('income-date');
const expenseDateInput = document.getElementById('expense-date');

const incomeList = document.getElementById('income-list');
const expenseList = document.getElementById('expense-list');
const monthlySummaryContainer = document.getElementById('monthly-summary-container');
const noDataMsg = document.getElementById('no-data-msg');

const dashTotalIncome = document.getElementById('dash-total-income');
const dashTotalExpense = document.getElementById('dash-total-expense');

// Set default dates and RENDER EXISTING DATA on load
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  incomeDateInput.value = localDate;
  expenseDateInput.value = localDate;
  
  // Render data loaded from localStorage
  renderData();
});

// Styling constants for buttons
const activeClasses = {
  dashboard: "w-28 sm:w-32 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm focus:outline-none ring-2 ring-indigo-500 ring-offset-2",
  income: "w-28 sm:w-32 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm focus:outline-none ring-2 ring-green-500 ring-offset-2",
  expense: "w-28 sm:w-32 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm focus:outline-none ring-2 ring-red-500 ring-offset-2",
  report: "w-28 sm:w-32 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm focus:outline-none ring-2 ring-blue-500 ring-offset-2"
};
const inactiveClass = "w-28 sm:w-32 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm focus:outline-none";

// Tab Switching Logic
function resetViews() {
  sectionDashboard.classList.add('hidden');
  sectionIncome.classList.add('hidden');
  sectionExpense.classList.add('hidden');
  sectionReport.classList.add('hidden');
  
  btnShowDashboard.className = inactiveClass;
  btnShowIncome.className = inactiveClass;
  btnShowExpense.className = inactiveClass;
  btnShowReport.className = inactiveClass;
  
  if(editId !== null) cancelEdit(transactions.find(t => t.id === editId)?.type || 'income');
}

btnShowDashboard.addEventListener('click', () => { resetViews(); sectionDashboard.classList.remove('hidden'); btnShowDashboard.className = activeClasses.dashboard; renderData(); });
btnShowIncome.addEventListener('click', () => { resetViews(); sectionIncome.classList.remove('hidden'); btnShowIncome.className = activeClasses.income; renderData(); });
btnShowExpense.addEventListener('click', () => { resetViews(); sectionExpense.classList.remove('hidden'); btnShowExpense.className = activeClasses.expense; renderData(); });
btnShowReport.addEventListener('click', () => { resetViews(); sectionReport.classList.remove('hidden'); btnShowReport.className = activeClasses.report; renderData(); });

// Form Submissions
function handleFormSubmit(e, type) {
  e.preventDefault();
  const date = document.getElementById(`${type}-date`).value;
  const desc = document.getElementById(`${type}-desc`).value;
  const amount = parseFloat(document.getElementById(`${type}-amount`).value);

  if (editId !== null) {
    const index = transactions.findIndex(t => t.id === editId);
    if (index !== -1) {
      transactions[index] = { ...transactions[index], date, desc, amount };
    }
    cancelEdit(type); 
  } else {
    transactions.push({ id: Date.now(), type, date, desc, amount });
    document.getElementById(`${type}-desc`).value = '';
    document.getElementById(`${type}-amount`).value = '';
  }
  
  // SAVE AFTER MODIFICATION
  saveToLocal();
  renderData();
}

incomeForm.addEventListener('submit', (e) => handleFormSubmit(e, 'income'));
expenseForm.addEventListener('submit', (e) => handleFormSubmit(e, 'expense'));

// Global Actions (Edit & Delete)
window.deleteTransaction = function(id) {
  if(editId === id) cancelEdit(transactions.find(t => t.id === id).type);
  transactions = transactions.filter(t => t.id !== id);
  
  // SAVE AFTER DELETION
  saveToLocal();
  renderData();
};

window.editTransaction = function(id) {
  const t = transactions.find(t => t.id === id);
  if (!t) return;
  
  editId = id;
  const type = t.type;
  
  if (type === 'income') btnShowIncome.click();
  else btnShowExpense.click();

  document.getElementById(`${type}-date`).value = t.date;
  document.getElementById(`${type}-desc`).value = t.desc;
  document.getElementById(`${type}-amount`).value = t.amount;
  
  document.getElementById(`${type}-form-title`).innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg> Edit ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  document.getElementById(`${type}-submit-btn`).innerText = 'Update';
  document.getElementById(`${type}-cancel-btn`).classList.remove('hidden');
};

window.cancelEdit = function(type) {
  editId = null;
  const form = document.getElementById(`${type}-form`);
  form.reset();
  
  const now = new Date();
  document.getElementById(`${type}-date`).value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  
  const path = type === 'income' ? 'M12 6v6m0 0v6m0-6h6m-6 0H6' : 'M20 12H4';
  
  document.getElementById(`${type}-form-title`).innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${path}"></path></svg> Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  document.getElementById(`${type}-submit-btn`).innerText = 'Save';
  document.getElementById(`${type}-cancel-btn`).classList.add('hidden');
};

// Filtering & Sorting Controls
window.clearFilters = function(type) {
  document.getElementById(`search-${type}`).value = '';
  document.getElementById(`filter-month-${type}`).value = '';
  document.getElementById(`filter-date-${type}`).value = '';
  renderData();
};

window.toggleSort = function(column) {
  if (sortConfig.column === column) {
    sortConfig.order = sortConfig.order === 'asc' ? 'desc' : 'asc';
  } else {
    sortConfig.column = column;
    sortConfig.order = 'desc'; 
  }
  renderData();
};

// Main render function
window.renderData = function() {
  const searchInc = document.getElementById('search-income').value.toLowerCase();
  const searchExp = document.getElementById('search-expense').value.toLowerCase();
  const monthInc = document.getElementById('filter-month-income').value; 
  const monthExp = document.getElementById('filter-month-expense').value; 
  const exactDateInc = document.getElementById('filter-date-income').value;
  const exactDateExp = document.getElementById('filter-date-expense').value;

  const sortFn = (a, b) => {
    let valA = a[sortConfig.column];
    let valB = b[sortConfig.column];
    if (sortConfig.column === 'date') {
      valA = new Date(valA).getTime();
      valB = new Date(valB).getTime();
    }
    if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
    return 0;
  };

  // Process Income Data
  let incomes = transactions.filter(t => t.type === 'income');
  if (searchInc) incomes = incomes.filter(t => t.desc.toLowerCase().includes(searchInc));
  if (monthInc) incomes = incomes.filter(t => t.date.startsWith(monthInc));
  if (exactDateInc) incomes = incomes.filter(t => t.date === exactDateInc);
  incomes.sort(sortFn);

  // Process Expense Data
  let expenses = transactions.filter(t => t.type === 'expense');
  if (searchExp) expenses = expenses.filter(t => t.desc.toLowerCase().includes(searchExp));
  if (monthExp) expenses = expenses.filter(t => t.date.startsWith(monthExp));
  if (exactDateExp) expenses = expenses.filter(t => t.date === exactDateExp);
  expenses.sort(sortFn);

  const arrow = sortConfig.order === 'asc' ? '↑' : '↓';
  ['inc', 'exp'].forEach(prefix => {
    document.getElementById(`sort-${prefix}-date`).innerText = sortConfig.column === 'date' ? arrow : '';
    document.getElementById(`sort-${prefix}-amount`).innerText = sortConfig.column === 'amount' ? arrow : '';
  });

  let totalFilteredInc = 0;
  let totalFilteredExp = 0;

  // Render Income Table
  incomeList.innerHTML = '';
  if (incomes.length === 0) {
    incomeList.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 text-sm">No records found.</td></tr>`;
  } else {
    incomes.forEach(t => {
      totalFilteredInc += t.amount;
      const isEditing = editId === t.id ? 'bg-yellow-50' : 'hover:bg-gray-50';
      incomeList.innerHTML += `
        <tr class="transition-colors group ${isEditing}">
          <td class="p-4 text-sm text-gray-500">${t.date}</td>
          <td class="p-4 font-medium text-gray-900">${t.desc}</td>
          <td class="p-4 font-bold text-green-600 text-right">+${t.amount.toFixed(2)}</td>
          <td class="p-4 text-center">
            <div class="flex justify-center gap-3">
              <button onclick="editTransaction(${t.id})" class="text-blue-400 hover:text-blue-600 transition-colors" title="Edit">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
              <button onclick="deleteTransaction(${t.id})" class="text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>`;
    });
  }

  // Render Expense Table
  expenseList.innerHTML = '';
  if (expenses.length === 0) {
    expenseList.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500 text-sm">No records found.</td></tr>`;
  } else {
    expenses.forEach(t => {
      totalFilteredExp += t.amount;
      const isEditing = editId === t.id ? 'bg-yellow-50' : 'hover:bg-gray-50';
      expenseList.innerHTML += `
        <tr class="transition-colors group ${isEditing}">
          <td class="p-4 text-sm text-gray-500">${t.date}</td>
          <td class="p-4 font-medium text-gray-900">${t.desc}</td>
          <td class="p-4 font-bold text-red-600 text-right">-${t.amount.toFixed(2)}</td>
          <td class="p-4 text-center">
            <div class="flex justify-center gap-3">
              <button onclick="editTransaction(${t.id})" class="text-blue-400 hover:text-blue-600 transition-colors" title="Edit">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
              <button onclick="deleteTransaction(${t.id})" class="text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </td>
        </tr>`;
    });
  }

  dashTotalIncome.innerText = totalFilteredInc.toFixed(2);
  dashTotalExpense.innerText = totalFilteredExp.toFixed(2);
  
  let allTimeInc = 0;
  let allTimeExp = 0;
  transactions.forEach(t => {
    if(t.type === 'income') allTimeInc += t.amount;
    else allTimeExp += t.amount;
  });

  const allTimeNet = allTimeInc - allTimeExp;
  document.getElementById('report-income').innerText = allTimeInc.toFixed(2);
  document.getElementById('report-expense').innerText = allTimeExp.toFixed(2);
  
  const reportNet = document.getElementById('report-net');
  const reportNetCard = document.getElementById('report-net-card');
  
  if (allTimeNet < 0) {
    reportNet.innerText = allTimeNet.toFixed(2);
    reportNet.className = "text-2xl font-bold text-red-700";
    reportNetCard.className = "bg-red-50 border border-red-200 p-6 rounded-xl shadow-sm text-center";
  } else {
    reportNet.innerText = allTimeNet.toFixed(2);
    reportNet.className = "text-2xl font-bold text-blue-700";
    reportNetCard.className = "bg-blue-50 border border-blue-200 p-6 rounded-xl shadow-sm text-center";
  }

  renderDashboard();
};

function renderDashboard() {
  monthlySummaryContainer.innerHTML = '';
  
  if (transactions.length === 0) {
    noDataMsg.classList.remove('hidden');
    monthlySummaryContainer.classList.add('hidden');
    return;
  }
  
  noDataMsg.classList.add('hidden');
  monthlySummaryContainer.classList.remove('hidden');

  const monthlyData = transactions.reduce((acc, t) => {
    const monthKey = t.date.substring(0, 7); 
    if (!acc[monthKey]) acc[monthKey] = { income: 0, expense: 0 };
    if (t.type === 'income') acc[monthKey].income += t.amount;
    else acc[monthKey].expense += t.amount;
    return acc;
  }, {});

  const sortedMonths = Object.keys(monthlyData).sort((a, b) => b.localeCompare(a));

  sortedMonths.forEach(monthKey => {
    const data = monthlyData[monthKey];
    const net = data.income - data.expense;
    const dateObj = new Date(monthKey + "-02");
    const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
    const netClass = net < 0 ? "text-red-700" : "text-blue-700";
    
    monthlySummaryContainer.innerHTML += `
      <div class="bg-white border border-gray-200 p-5 rounded-xl shadow-sm flex flex-col justify-between">
        <h3 class="text-lg font-bold text-gray-800 mb-4 border-b pb-2">${monthName}</h3>
        <div class="flex justify-between text-sm mb-2">
          <span class="text-gray-500">Income</span>
          <span class="font-medium text-green-600">${data.income.toFixed(2)}</span>
        </div>
        <div class="flex justify-between text-sm mb-4">
          <span class="text-gray-500">Expense</span>
          <span class="font-medium text-red-600">${data.expense.toFixed(2)}</span>
        </div>
        <div class="flex justify-between pt-3 border-t border-gray-100 mt-auto">
          <span class="font-bold text-gray-700">Net Balance</span>
          <span class="font-bold ${netClass}">${net.toFixed(2)}</span>
        </div>
      </div>
    `;
  });
}

// -----------------------------------------
// CSV EXPORT LOGIC
// -----------------------------------------
function downloadCSV(filterType) {
  let filteredData = transactions;
  let filename = "Finance_Report.csv";
  
  if (filterType === 'income') {
    filteredData = transactions.filter(t => t.type === 'income');
    filename = "Income_Report.csv";
  } else if (filterType === 'expense') {
    filteredData = transactions.filter(t => t.type === 'expense');
    filename = "Expense_Report.csv";
  }

  if (filteredData.length === 0) {
    alert("No data available to download for this selection.");
    return;
  }

  const sortedTransactions = [...filteredData].sort((a, b) => new Date(a.date) - new Date(b.date));

  let csvContent = "Date,Type,Description,Amount\n";
  let totalIncome = 0;
  let totalExpense = 0;

  sortedTransactions.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    if (t.type === 'expense') totalExpense += t.amount;
    const cleanDesc = t.desc.replace(/"/g, '""');
    csvContent += `${t.date},${t.type},"${cleanDesc}",${t.amount.toFixed(2)}\n`;
  });

  csvContent += `,,,\n`; 
  if (filterType === 'all' || filterType === 'income') csvContent += `,,Total Income,${totalIncome.toFixed(2)}\n`;
  if (filterType === 'all' || filterType === 'expense') csvContent += `,,Total Expense,${totalExpense.toFixed(2)}\n`;
  if (filterType === 'all') csvContent += `,,Net Balance,${(totalIncome - totalExpense).toFixed(2)}\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

btnDownloadAll.addEventListener('click', () => downloadCSV('all'));
btnDownloadIncome.addEventListener('click', () => downloadCSV('income'));
btnDownloadExpense.addEventListener('click', () => downloadCSV('expense'));

// -----------------------------------------
// NEW: JSON DATA BACKUP & RESTORE
// -----------------------------------------

// Export JSON Backup
btnBackupData.addEventListener('click', () => {
  if (transactions.length === 0) {
    alert("No data available to backup.");
    return;
  }
  
  // Convert transactions array to JSON string
  const dataStr = JSON.stringify(transactions, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  
  // Create dynamic filename with today's date
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute("download", `Finance_Backup_${dateStr}.json`);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Import JSON Backup
fileRestoreData.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // Basic validation to ensure it's the correct format
      if (!Array.isArray(importedData)) {
        throw new Error("Uploaded file is not a valid backup array.");
      }
      
      const confirmRestore = confirm("WARNING: Restoring will overwrite your current data with the data from this backup file.\n\nAre you sure you want to proceed?");
      
      if (confirmRestore) {
         transactions = importedData;
         saveToLocal();
         renderData();
         alert("Data restored successfully!");
      }
    } catch (error) {
      alert("Error restoring data. Please ensure you selected a valid Finance Backup JSON file.");
      console.error(error);
    }
    
    // Clear the file input so the same file can be selected again if needed
    fileRestoreData.value = "";
  };
  
  reader.readAsText(file);
});