// Load data and pagination state from phone storage
let cylindersData = JSON.parse(localStorage.getItem('cylindersData')) || [];
let downloadedPages = JSON.parse(localStorage.getItem('downloadedPages')) || [];
let currentPage = 1;
const rowsPerPage = 50;

function saveAndRender() {
    localStorage.setItem('cylindersData', JSON.stringify(cylindersData));
    checkAndAutoDownload();
    
    // Maintain current search filters when re-rendering
    const searchInput = document.getElementById('searchInput');
    const searchColumn = document.getElementById('searchColumn');
    renderTable(searchInput ? searchInput.value : "", searchColumn ? searchColumn.value : "all");
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// 1. Dynamic UI Updates (Adjusts form based on cylinder status)
document.getElementById('cylNum').addEventListener('input', function(e) {
    const cylNum = e.target.value.trim().toUpperCase();
    const existingRecords = cylindersData.filter(c => c.cylNum === cylNum);
    const lastRecord = existingRecords.length > 0 ? existingRecords[existingRecords.length - 1] : null;
    
    const customerDiv = document.getElementById('customerInputDiv');
    const returnDiv = document.getElementById('returnStatusDiv');
    const gasSelect = document.getElementById('gasType');
    const submitBtn = document.getElementById('submitBtn');

    if (lastRecord) {
        gasSelect.value = lastRecord.gasType;
    }

    if (lastRecord && lastRecord.status === 'In Shop') {
        customerDiv.classList.remove('hidden');
        returnDiv.classList.add('hidden');
        submitBtn.innerText = "Send to Customer";
        submitBtn.className = "mt-4 w-full bg-orange-500 text-white p-2 rounded font-bold shadow hover:bg-orange-600 transition";
    } else if (lastRecord && lastRecord.status === 'With Customer') {
        customerDiv.classList.add('hidden');
        returnDiv.classList.remove('hidden');
        submitBtn.innerText = "Confirm Return";
        submitBtn.className = "mt-4 w-full bg-green-600 text-white p-2 rounded font-bold shadow hover:bg-green-700 transition";
    } else {
        customerDiv.classList.add('hidden');
        returnDiv.classList.add('hidden');
        submitBtn.innerText = "Log New Refill (In Shop)";
        submitBtn.className = "mt-4 w-full bg-blue-600 text-white p-2 rounded font-bold shadow hover:bg-blue-700 transition";
    }
});

// 2. Form Submission & State Machine Logic
document.getElementById('cylinderForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const cylNum = document.getElementById('cylNum').value.trim().toUpperCase();
    const gasType = document.getElementById('gasType').value;
    const customerName = document.getElementById('customerName').value.trim();
    const returnFillLevel = document.getElementById('returnFillLevel') ? document.getElementById('returnFillLevel').value : 'Empty';
    
    const existingRecords = cylindersData.filter(c => c.cylNum === cylNum);
    const lastRecord = existingRecords.length > 0 ? existingRecords[existingRecords.length - 1] : null;

    if (!lastRecord || lastRecord.status === 'Completed') {
        if (lastRecord && lastRecord.status === 'Completed') {
            lastRecord.nextRefillDate = getTodayDate();
        }
        
        cylindersData.push({
            cylNum: cylNum,
            gasType: lastRecord ? lastRecord.gasType : gasType,
            fillLevel: 'Full',
            refillDate: getTodayDate(),
            customer: '',
            dateSent: '',
            dateReturned: '',
            nextRefillDate: '',
            status: 'In Shop'
        });
    } else if (lastRecord.status === 'In Shop') {
        if(!customerName) {
            alert("Please enter a customer name to send the cylinder.");
            return;
        }
        lastRecord.customer = customerName;
        lastRecord.dateSent = getTodayDate();
        lastRecord.status = 'With Customer';
    } else if (lastRecord.status === 'With Customer') {
        lastRecord.dateReturned = getTodayDate();
        lastRecord.status = 'Completed';
        lastRecord.fillLevel = returnFillLevel; 

        if (returnFillLevel === 'Half' || returnFillLevel === 'Full') {
            cylindersData.push({
                cylNum: cylNum,
                gasType: lastRecord.gasType,
                fillLevel: returnFillLevel,
                refillDate: getTodayDate(), 
                customer: '',
                dateSent: '',
                dateReturned: '',
                nextRefillDate: '',
                status: 'In Shop'
            });
        }
    }

    document.getElementById('cylNum').value = '';
    document.getElementById('customerName').value = '';
    if(document.getElementById('returnFillLevel')) document.getElementById('returnFillLevel').value = 'Empty';
    document.getElementById('customerInputDiv').classList.add('hidden');
    if(document.getElementById('returnStatusDiv')) document.getElementById('returnStatusDiv').classList.add('hidden');
    document.getElementById('submitBtn').innerText = "Log New Refill (In Shop)";
    document.getElementById('submitBtn').className = "mt-4 w-full bg-blue-600 text-white p-2 rounded font-bold shadow";
    
    saveAndRender();
});

// --- CSV EXPORT & AUTO-DOWNLOAD LOGIC ---
function downloadCSV(dataArray, filename) {
    const headers = ['Cylinder Number', 'Gas Type', 'Fill Level', 'Date Refilled', 'Customer Name', 'Date Sent', 'Date Returned', 'Next Refill', 'Status'];
    const csvRows = [headers.join(',')];

    dataArray.forEach(row => {
        const rowValues = [
            row.cylNum,
            row.gasType,
            row.fillLevel || 'Full',
            row.refillDate,
            row.customer || '-',
            row.dateSent || '-',
            row.dateReturned || '-',
            row.nextRefillDate || '-',
            row.status
        ];
        csvRows.push(rowValues.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.getElementById('exportCsvBtn').addEventListener('click', function() {
    if (cylindersData.length === 0) {
        alert("No data to export.");
        return;
    }
    downloadCSV([...cylindersData].reverse(), `Cylinder_Register_Full_${getTodayDate()}`);
});

function checkAndAutoDownload() {
    const totalPages = Math.floor(cylindersData.length / rowsPerPage);
    
    for (let i = 0; i < totalPages; i++) {
        if (!downloadedPages.includes(i)) {
            const chunk = cylindersData.slice(i * rowsPerPage, (i + 1) * rowsPerPage);
            const isPageCompleted = chunk.length === rowsPerPage && chunk.every(row => row.status === 'Completed');
            
            if (isPageCompleted) {
                downloadCSV(chunk, `Completed_Register_Sheet_${i + 1}_${getTodayDate()}`);
                downloadedPages.push(i);
                localStorage.setItem('downloadedPages', JSON.stringify(downloadedPages));
            }
        }
    }
}

// --- SEARCH & PAGINATION LOGIC ---
function handleSearch() {
    currentPage = 1; 
    const searchTerm = document.getElementById('searchInput').value;
    const searchColumn = document.getElementById('searchColumn') ? document.getElementById('searchColumn').value : 'all';
    renderTable(searchTerm, searchColumn);
}

document.getElementById('searchInput').addEventListener('input', handleSearch);
if(document.getElementById('searchColumn')) {
    document.getElementById('searchColumn').addEventListener('change', handleSearch);
}

document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        const searchTerm = document.getElementById('searchInput').value;
        const searchColumn = document.getElementById('searchColumn') ? document.getElementById('searchColumn').value : 'all';
        renderTable(searchTerm, searchColumn);
    }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
    currentPage++;
    const searchTerm = document.getElementById('searchInput').value;
    const searchColumn = document.getElementById('searchColumn') ? document.getElementById('searchColumn').value : 'all';
    renderTable(searchTerm, searchColumn);
});

// 4. Render Table (Filters + Pagination)
function renderTable(searchTerm = "", searchColumn = "all") {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    const displayData = [...cylindersData].reverse();
    const filteredData = [];

    displayData.forEach(row => {
        const searchLower = String(searchTerm).toLowerCase().trim();
        const cylStr = String(row.cylNum).toLowerCase();
        const gasStr = String(row.gasType).toLowerCase();
        const custStr = String(row.customer || '').toLowerCase();
        const statusStr = String(row.status).toLowerCase();

        if (searchLower) {
            let isMatch = false;
            if (searchColumn === 'all') {
                const matchesCyl = cylStr.includes(searchLower);
                const matchesCustomer = custStr.includes(searchLower);
                const isSearchNumber = !isNaN(searchLower) && searchLower !== '';
                const matchesGas = !isSearchNumber && gasStr.includes(searchLower);
                const matchesStatus = statusStr.includes(searchLower);
                isMatch = matchesCyl || matchesCustomer || matchesGas || matchesStatus;
            } else if (searchColumn === 'cylNum') isMatch = cylStr.includes(searchLower);
            else if (searchColumn === 'gasType') isMatch = gasStr.includes(searchLower);
            else if (searchColumn === 'customer') isMatch = custStr.includes(searchLower);
            else if (searchColumn === 'status') isMatch = statusStr.includes(searchLower);

            if (!isMatch) return; 
        }
        filteredData.push(row);
    });

    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

    document.getElementById('pageInfo').innerText = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;

    paginatedData.forEach(row => {
        let statusColor = 'text-blue-600';
        if (row.status === 'With Customer') statusColor = 'text-orange-600';
        if (row.status === 'Completed') statusColor = 'text-gray-500';

        let fillLevelDisplay = row.fillLevel || 'Full';
        if (row.status === 'Completed' && fillLevelDisplay === 'Empty') {
            fillLevelDisplay = '<span class="text-red-500 font-bold">Empty</span>';
        }

        const tr = document.createElement('tr');
        tr.className = "border-b text-sm bg-white hover:bg-gray-50";
        tr.innerHTML = `
            <td class="p-3 border-r font-bold">${row.cylNum}</td>
            <td class="p-3 border-r">${row.gasType}</td>
            <td class="p-3 border-r">${fillLevelDisplay}</td>
            <td class="p-3 border-r">${row.refillDate}</td>
            <td class="p-3 border-r">${row.customer || '-'}</td>
            <td class="p-3 border-r">${row.dateSent || '-'}</td>
            <td class="p-3 border-r">${row.dateReturned || '-'}</td>
            <td class="p-3 border-r">${row.nextRefillDate || '-'}</td>
            <td class="p-3 font-bold ${statusColor}">${row.status}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 5. Backup (Export) Data to JSON
document.getElementById('exportBtn').addEventListener('click', function() {
    if (cylindersData.length === 0) {
        alert("No data to backup.");
        return;
    }
    const dataStr = JSON.stringify(cylindersData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const fileName = `Cylinder_Register_Backup_${getTodayDate()}.json`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// 6. Restore (Import) Data from JSON
document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedData = JSON.parse(event.target.result);
            if (Array.isArray(importedData)) {
                if (confirm("This will overwrite your current data with the backup. Proceed?")) {
                    cylindersData = importedData;
                    saveAndRender();
                    alert("Backup restored successfully!");
                }
            } else {
                alert("Invalid backup file format.");
            }
        } catch (err) {
            alert("Error reading the file. Make sure it is a valid JSON backup.");
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});

// Initial load
handleSearch();