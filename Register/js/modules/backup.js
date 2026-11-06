import {
    getAllCylinders,
    getMetadata,
    setMetadata,
    isValidCylinder,
    replaceAllCylinders
} from '../db.js';

import { getTodayDate } from './cylinderService.js';

// ======================================================
// CONFIGURATION
// ======================================================

const BACKUP_FORMAT = 'cylinder-register-backup';
const BACKUP_VERSION = 1;
const DEFAULT_ROWS_PER_PAGE = 50;

const CSV_HEADERS = [
    'Cylinder Number',
    'Gas Type',
    'Fill Level',
    'Date Refilled',
    'Customer Name',
    'Date Sent',
    'Date Returned',
    'Next Refill',
    'Status'
];

// ======================================================
// DOWNLOAD HELPER
// ======================================================

/**
 * Downloads a Blob as a file.
 *
 * Returns true when the browser accepts the download
 * initiation. This does not guarantee that the file
 * has finished downloading.
 */
function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob)) {
        throw new Error('Invalid file data.');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    try {
        link.href = url;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();

        return true;

    } catch (error) {
        throw new Error(`Unable to initiate download: ${error.message}`);

    } finally {
        link.remove();

        // Allow the browser time to begin processing the download.
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    }
}

// ======================================================
// BACKUP VALIDATION
// ======================================================

/**
 * Validates the complete JSON backup structure.
 *
 * Checks:
 * - Backup format
 * - Backup version
 * - Cylinder array
 * - Individual cylinder records
 * - Duplicate record IDs
 */
function validateBackup(backup) {
    if (
        !backup ||
        typeof backup !== 'object' ||
        Array.isArray(backup)
    ) {
        throw new Error('Invalid backup file structure.');
    }

    if (backup.format !== BACKUP_FORMAT) {
        throw new Error('Unrecognized backup format.');
    }

    if (backup.version !== BACKUP_VERSION) {
        throw new Error(
            `Unsupported backup version: ${backup.version}`
        );
    }

    if (!Array.isArray(backup.cylinders)) {
        throw new Error('Backup does not contain valid cylinder records.');
    }

    if (!backup.cylinders.every(isValidCylinder)) {
        throw new Error(
            'Backup contains invalid cylinder records.'
        );
    }

    // Check duplicate IDs.
    const ids = backup.cylinders
        .filter(record => record.id !== undefined)
        .map(record => record.id);

    if (
        ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== ids.length
    ) {
        throw new Error(
            'Backup contains invalid or duplicate cylinder IDs.'
        );
    }

    // Validate optional export metadata is not required
    // because older backups may not contain it.

    return true;
}

// ======================================================
// JSON BACKUP EXPORT
// ======================================================

/**
 * Exports all cylinder records into a versioned JSON file.
 */
export async function exportJSONBackup() {
    const records = await getAllCylinders();

    if (!records.length) {
        alert('No data to backup.');
        return;
    }

    const backup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        cylinders: records
    };

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        {
            type: 'application/json;charset=utf-8'
        }
    );

    downloadBlob(
        blob,
        `Cylinder_Register_Backup_${getTodayDate()}.json`
    );
}

// ======================================================
// JSON BACKUP IMPORT / RESTORE
// ======================================================

/**
 * Imports and validates a JSON backup.
 *
 * Existing cylinder records are replaced only after
 * confirmation and successful validation.
 *
 * Returns:
 * - Restored cylinder records on success.
 * - null when the user cancels.
 */
export async function importJSONBackup(file) {
    if (!file) {
        return null;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Please select a JSON backup file.');
    }

    let backup;

    try {
        const fileText = await file.text();
        backup = JSON.parse(fileText);

    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('The selected JSON backup file is corrupted.');
        }

        throw new Error(`Unable to read backup file: ${error.message}`);
    }

    // Validate before touching existing database records.
    validateBackup(backup);

    if (
        !confirm(
            `This backup contains ${backup.cylinders.length} cylinder records.\n\n` +
            'All existing cylinder records will be replaced.\n\n' +
            'Do you want to continue?'
        )
    ) {
        return null;
    }

    // Replace all cylinder records atomically.
    await replaceAllCylinders(backup.cylinders);

    // Reset automatic CSV export tracking because
    // the restored dataset may be completely different.
    await setMetadata('downloadedPages', []);

    // Reload the restored records from IndexedDB.
    return await getAllCylinders();
}

// ======================================================
// CSV SECURITY
// ======================================================

/**
 * Escapes CSV values.
 *
 * Also prevents spreadsheet formula injection.
 * This protects exported customer names and other
 * text fields when opened in Excel or similar software.
 */
function csvEscape(value) {
    let text = String(value ?? '');

    // Prevent formulas from being interpreted by spreadsheets.
    // A lone "-" is the empty-cell placeholder, not a formula.
    if (text !== '-' && /^[\s]*[=+\-@]/.test(text)) {
        text = `'${text}`;
    }

    // Escape double quotes.
    text = text.replaceAll('"', '""');

    return `"${text}"`;
}

/**
 * Converts an array of rows into CSV text.
 */
function createCSV(rows) {
    return rows
        .map(row => row.map(csvEscape).join(','))
        .join('\r\n');
}

/**
 * Creates a CSV Blob with UTF-8 BOM.
 * UTF-8 BOM improves compatibility with Excel.
 */
function createCSVBlob(rows) {
    const csv = createCSV(rows);

    return new Blob(
        ['\uFEFF', csv],
        {
            type: 'text/csv;charset=utf-8'
        }
    );
}

// ======================================================
// COMPLETED PAGE AUTOMATIC EXPORT
// ======================================================

/**
 * Exports complete pages when all records on a page
 * have reached Completed status.
 *
 * Default page size: 50 records.
 *
 * Metadata stores page numbers for which a download
 * was initiated.
 */
export async function exportCompletedPagesIfReady(
    records,
    rowsPerPage = DEFAULT_ROWS_PER_PAGE
) {
    if (!Array.isArray(records)) {
        throw new Error('Invalid cylinder records for automatic export.');
    }

    if (
        !Number.isSafeInteger(rowsPerPage) ||
        rowsPerPage <= 0
    ) {
        throw new Error('Invalid page size.');
    }

    if (!records.length) {
        return;
    }

    // Ensure metadata is a valid array.
    const storedPages = await getMetadata('downloadedPages');

    const downloadedPages = Array.isArray(storedPages)
        ? storedPages.filter(
            page =>
                Number.isSafeInteger(page) &&
                page >= 0
        )
        : [];

    const totalCompletePages = Math.floor(
        records.length / rowsPerPage
    );

    let changed = false;

    for (
        let pageIndex = 0;
        pageIndex < totalCompletePages;
        pageIndex += 1
    ) {
        if (downloadedPages.includes(pageIndex)) {
            continue;
        }

        const pageRecords = records.slice(
            pageIndex * rowsPerPage,
            (pageIndex + 1) * rowsPerPage
        );

        // Only export pages containing entirely completed records.
        const isCompletedPage =
            pageRecords.length === rowsPerPage &&
            pageRecords.every(
                record => record.status === 'Completed'
            );

        if (!isCompletedPage) {
            continue;
        }

        const rows = [
            CSV_HEADERS,

            ...pageRecords.map(record => [
                record.cylNum,
                record.gasType,
                record.fillLevel || 'Full',
                record.refillDate,
                record.customer || '-',
                record.dateSent || '-',
                record.dateReturned || '-',
                record.nextRefillDate || '-',
                record.status
            ])
        ];

        const blob = createCSVBlob(rows);

        const filename =
            `Completed_Register_Sheet_${pageIndex + 1}_${getTodayDate()}.csv`;

        // Initiate download before marking the page.
        downloadBlob(blob, filename);

        downloadedPages.push(pageIndex);
        changed = true;
    }

    // Save tracking metadata only after downloads were initiated.
    if (changed) {
        await setMetadata(
            'downloadedPages',
            [...new Set(downloadedPages)]
        );
    }
}

// ======================================================
// MANUAL CSV EXPORT
// ======================================================

/**
 * Exports all cylinder records into one CSV file.
 *
 * Newest records appear first.
 */
export async function exportCSV() {
    const records = await getAllCylinders();

    if (!records.length) {
        alert('No data to export.');
        return;
    }

    // Newest records first.
    const sortedRecords = [...records].sort(
        (a, b) => b.id - a.id
    );

    const rows = [
        CSV_HEADERS,

        ...sortedRecords.map(record => [
            record.cylNum,
            record.gasType,
            record.fillLevel || 'Full',
            record.refillDate,
            record.customer || '-',
            record.dateSent || '-',
            record.dateReturned || '-',
            record.nextRefillDate || '-',
            record.status
        ])
    ];

    const blob = createCSVBlob(rows);

    downloadBlob(
        blob,
        `Cylinder_Register_${getTodayDate()}.csv`
    );
}