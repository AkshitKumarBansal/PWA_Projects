const ROWS_PER_PAGE = 50;

function createCell(value, className = 'p-3 border-r') {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = value ?? '-';
    return cell;
}

export function renderTable({ cylinders, searchTerm = '', searchColumn = 'all', currentPage = 1 }) {
    const tbody = document.getElementById('tableBody');
    const pageInfo = document.getElementById('pageInfo');
    const prevButton = document.getElementById('prevPageBtn');
    const nextButton = document.getElementById('nextPageBtn');

    if (!tbody || !pageInfo || !prevButton || !nextButton) return { currentPage: 1, totalPages: 1 };

    const term = searchTerm.trim().toLowerCase();
    const filtered = [...cylinders].reverse().filter((row) => {
        if (!term) return true;
        const values = {
            cylNum: row.cylNum,
            gasType: row.gasType,
            customer: row.customer || '',
            status: row.status
        };
        if (searchColumn !== 'all') {
            return String(values[searchColumn] ?? '').toLowerCase().includes(term);
        }
        return Object.values(values).some((value) => String(value).toLowerCase().includes(term));
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (safePage - 1) * ROWS_PER_PAGE;
    const pageRows = filtered.slice(start, start + ROWS_PER_PAGE);

    tbody.replaceChildren();

    pageRows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b text-sm bg-white hover:bg-gray-50';

        tr.append(
            createCell(row.cylNum, 'p-3 border-r font-bold'),
            createCell(row.gasType),
            createCell(row.fillLevel || 'Full'),
            createCell(row.refillDate),
            createCell(row.customer || '-'),
            createCell(row.dateSent || '-'),
            createCell(row.dateReturned || '-'),
            createCell(row.nextRefillDate || '-')
        );

        const statusCell = createCell(row.status, 'p-3 font-bold');
        if (row.status === 'With Customer') statusCell.classList.add('text-orange-600');
        else if (row.status === 'Completed') statusCell.classList.add('text-gray-500');
        else statusCell.classList.add('text-blue-600');
        tr.append(statusCell);
        tbody.append(tr);
    });

    pageInfo.textContent = `Page ${safePage} of ${totalPages}`;
    prevButton.disabled = safePage === 1;
    nextButton.disabled = safePage === totalPages;

    return { currentPage: safePage, totalPages };
}

export function updateFormForCylinder(cylinders, cylinderNumber) {
    const normalized = cylinderNumber.trim().toUpperCase();
    const lastRecord = cylinders.filter((record) => record.cylNum === normalized).at(-1);

    const customerDiv = document.getElementById('customerInputDiv');
    const returnDiv = document.getElementById('returnStatusDiv');
    const gasSelect = document.getElementById('gasType');
    const submitButton = document.getElementById('submitBtn');

    if (!customerDiv || !returnDiv || !gasSelect || !submitButton) return;

    customerDiv.classList.add('hidden');
    returnDiv.classList.add('hidden');

    if (lastRecord) gasSelect.value = lastRecord.gasType;

    if (lastRecord?.status === 'In Shop') {
        customerDiv.classList.remove('hidden');
        submitButton.textContent = 'Send to Customer';
        submitButton.className = 'mt-4 w-full bg-orange-500 text-white p-2 rounded font-bold shadow hover:bg-orange-600 transition';
    } else if (lastRecord?.status === 'With Customer') {
        returnDiv.classList.remove('hidden');
        submitButton.textContent = 'Confirm Return';
        submitButton.className = 'mt-4 w-full bg-green-600 text-white p-2 rounded font-bold shadow hover:bg-green-700 transition';
    } else {
        submitButton.textContent = 'Log New Refill (In Shop)';
        submitButton.className = 'mt-4 w-full bg-blue-600 text-white p-2 rounded font-bold shadow hover:bg-blue-700 transition';
    }
}
