import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach
} from 'vitest';

const mocks = vi.hoisted(() => ({
    getAllCylinders: vi.fn(),
    getMetadata: vi.fn(),
    setMetadata: vi.fn(),
    isValidCylinder: vi.fn(() => true),
    replaceAllCylinders: vi.fn(),
    getTodayDate: vi.fn(() => '2026-11-04')
}));

vi.mock('../js/db.js', () => ({
    getAllCylinders: mocks.getAllCylinders,
    getMetadata: mocks.getMetadata,
    setMetadata: mocks.setMetadata,
    isValidCylinder: mocks.isValidCylinder,
    replaceAllCylinders: mocks.replaceAllCylinders
}));

vi.mock('../js/modules/cylinderService.js', () => ({
    getTodayDate: mocks.getTodayDate
}));

import {
    exportJSONBackup,
    importJSONBackup,
    exportCSV,
    exportCompletedPagesIfReady
} from '../js/modules/backup.js';

const validCylinder = (overrides = {}) => ({
    id: 1,
    cylNum: 'O2-101',
    gasType: 'O2',
    fillLevel: 'Full',
    refillDate: '2026-11-01',
    customer: '',
    dateSent: '',
    dateReturned: '',
    nextRefillDate: '',
    supplierSentDate: '',
    supplierReturnedDate: '',
    status: 'In Shop',
    ...overrides
});

const createBackup = (cylinders = [validCylinder()], overrides = {}) => ({
    format: 'cylinder-register-backup',
    version: 1,
    exportedAt: '2026-11-04T10:00:00.000Z',
    cylinders,
    ...overrides
});

const createFile = (name, content) => ({
    name,
    text: vi.fn().mockResolvedValue(
        typeof content === 'string'
            ? content
            : JSON.stringify(content)
    )
});

let clickedLink;
let downloadedBlob;

beforeEach(() => {
    vi.clearAllMocks();

    mocks.getAllCylinders.mockResolvedValue([
        validCylinder()
    ]);

    mocks.getMetadata.mockResolvedValue([]);
    mocks.setMetadata.mockResolvedValue(undefined);
    mocks.replaceAllCylinders.mockResolvedValue(undefined);

    mocks.isValidCylinder.mockReturnValue(true);

    clickedLink = null;
    downloadedBlob = null;

    clickedLink = {
        href: '',
        download: '',
        style: {},
        click: vi.fn(),
        remove: vi.fn()
    };

    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));

    vi.stubGlobal('document', {
        createElement: vi.fn(() => clickedLink),
        body: {
            appendChild: vi.fn()
        }
    });

    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
        downloadedBlob = blob;
        return 'blob:test-download';
    });

    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// =============================================
// 1. JSON BACKUP EXPORT
// =============================================

describe('exportJSONBackup()', () => {

    it('should alert when there are no records', async () => {
        mocks.getAllCylinders.mockResolvedValue([]);

        await exportJSONBackup();

        expect(alert).toHaveBeenCalledWith('No data to backup.');
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should export all cylinder records as JSON', async () => {
        const records = [
            validCylinder(),
            validCylinder({
                id: 2,
                cylNum: 'CO2-101',
                gasType: 'CO2'
            })
        ];

        mocks.getAllCylinders.mockResolvedValue(records);

        await exportJSONBackup();

        expect(downloadedBlob).toBeInstanceOf(Blob);
        expect(downloadedBlob.type).toBe('application/json;charset=utf-8');

        const content = JSON.parse(await downloadedBlob.text());

        expect(content.format).toBe('cylinder-register-backup');
        expect(content.version).toBe(1);
        expect(content.cylinders).toEqual(records);
    });

    it('should use the current date in the JSON filename', async () => {
        await exportJSONBackup();

        expect(clickedLink.download).toBe(
            'Cylinder_Register_Backup_2026-11-04.json'
        );
    });

    it('should initiate the browser download', async () => {
        await exportJSONBackup();

        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(document.body.appendChild).toHaveBeenCalledWith(clickedLink);
        expect(clickedLink.click).toHaveBeenCalledOnce();
        expect(clickedLink.remove).toHaveBeenCalledOnce();
    });

});

// =============================================
// 2. JSON BACKUP IMPORT
// =============================================

describe('importJSONBackup()', () => {

    it('should return null when no file is provided', async () => {
        const result = await importJSONBackup(null);

        expect(result).toBeNull();
        expect(mocks.replaceAllCylinders).not.toHaveBeenCalled();
    });

    it('should reject a file that is not JSON', async () => {
        const file = createFile('backup.txt', '{}');

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow('Please select a JSON backup file.');

    });

    it('should reject corrupted JSON', async () => {
        const file = createFile('backup.json', '{invalid-json');

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow(
            'The selected JSON backup file is corrupted.'
        );
    });

    it('should report a file reading error', async () => {
        const file = {
            name: 'backup.json',
            text: vi.fn().mockRejectedValue(
                new Error('File access denied')
            )
        };

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow(
            'Unable to read backup file: File access denied'
        );
    });

    it('should reject an invalid backup structure', async () => {
        const file = createFile('backup.json', null);

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow('Invalid backup file structure.');
    });

    it('should reject an unrecognized backup format', async () => {
        const file = createFile(
            'backup.json',
            createBackup([], { format: 'unknown-format' })
        );

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow('Unrecognized backup format.');
    });

    it('should reject an unsupported backup version', async () => {
        const file = createFile(
            'backup.json',
            createBackup([], { version: 99 })
        );

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow('Unsupported backup version: 99');
    });

    it('should reject a backup without a cylinder array', async () => {
        const backup = createBackup();
        delete backup.cylinders;

        const file = createFile('backup.json', backup);

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow(
            'Backup does not contain valid cylinder records.'
        );
    });

    it('should reject invalid cylinder records', async () => {
        mocks.isValidCylinder.mockReturnValue(false);

        const file = createFile(
            'backup.json',
            createBackup([validCylinder()])
        );

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow(
            'Backup contains invalid cylinder records.'
        );
    });

    it('should reject duplicate cylinder IDs', async () => {
        const file = createFile(
            'backup.json',
            createBackup([
                validCylinder({ id: 1 }),
                validCylinder({
                    id: 1,
                    cylNum: 'O2-102'
                })
            ])
        );

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow(
            'Backup contains invalid or duplicate cylinder IDs.'
        );
    });

    it('should reject invalid cylinder IDs', async () => {
        const file = createFile(
            'backup.json',
            createBackup([
                validCylinder({ id: -1 })
            ])
        );

        await expect(
            importJSONBackup(file)
        ).rejects.toThrow(
            'Backup contains invalid or duplicate cylinder IDs.'
        );
    });

    it('should cancel restoration when the user declines confirmation', async () => {
        confirm.mockReturnValue(false);

        const file = createFile(
            'backup.json',
            createBackup()
        );

        const result = await importJSONBackup(file);

        expect(result).toBeNull();
        expect(confirm).toHaveBeenCalledOnce();
        expect(mocks.replaceAllCylinders).not.toHaveBeenCalled();
        expect(mocks.setMetadata).not.toHaveBeenCalled();
    });

    it('should restore valid records after confirmation', async () => {
        const records = [
            validCylinder(),
            validCylinder({
                id: 2,
                cylNum: 'O2-102'
            })
        ];

        mocks.getAllCylinders.mockResolvedValue(records);

        const file = createFile(
            'backup.json',
            createBackup(records)
        );

        const result = await importJSONBackup(file);

        expect(confirm).toHaveBeenCalledOnce();
        expect(mocks.replaceAllCylinders).toHaveBeenCalledWith(records);
        expect(mocks.setMetadata).toHaveBeenCalledWith(
            'downloadedPages',
            []
        );
        expect(result).toEqual(records);
    });

});

// =============================================
// 3. CSV EXPORT
// =============================================

describe('exportCSV()', () => {

    it('should alert when there are no records', async () => {
        mocks.getAllCylinders.mockResolvedValue([]);

        await exportCSV();

        expect(alert).toHaveBeenCalledWith('No data to export.');
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should export records in newest-first order', async () => {
        mocks.getAllCylinders.mockResolvedValue([
            validCylinder({
                id: 1,
                cylNum: 'O2-101'
            }),
            validCylinder({
                id: 3,
                cylNum: 'O2-103'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102'
            })
        ]);

        await exportCSV();

        const csv = await downloadedBlob.text();

        expect(csv.indexOf('O2-103')).toBeLessThan(
            csv.indexOf('O2-102')
        );

        expect(csv.indexOf('O2-102')).toBeLessThan(
            csv.indexOf('O2-101')
        );
    });

    it('should include the expected CSV headers', async () => {
        await exportCSV();

        const csv = await downloadedBlob.text();

        expect(csv).toContain('Cylinder Number');
        expect(csv).toContain('Gas Type');
        expect(csv).toContain('Fill Level');
        expect(csv).toContain('Date Refilled');
        expect(csv).toContain('Customer Name');
        expect(csv).toContain('Status');
    });

    it('should create a UTF-8 BOM CSV file', async () => {
        await exportCSV();

        const buffer = await downloadedBlob.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        expect(Array.from(bytes.slice(0, 3))).toEqual([
            0xEF,
            0xBB,
            0xBF
        ]);

        expect(downloadedBlob.type).toBe('text/csv;charset=utf-8');
    });

    it('should use the current date in the CSV filename', async () => {
        await exportCSV();

        expect(clickedLink.download).toBe(
            'Cylinder_Register_2026-11-04.csv'
        );
    });

    it('should use default values for missing optional fields', async () => {
        mocks.getAllCylinders.mockResolvedValue([
            validCylinder({
                fillLevel: '',
                customer: '',
                dateSent: '',
                dateReturned: '',
                nextRefillDate: ''
            })
        ]);

        await exportCSV();

        const csv = await downloadedBlob.text();

        expect(csv).toContain('"Full"');
        expect(csv).toContain('"\'-"');
    });

    it('should escape quotes in CSV values', async () => {
        mocks.getAllCylinders.mockResolvedValue([
            validCylinder({
                customer: 'ABC "Medical" Hospital'
            })
        ]);

        await exportCSV();

        const csv = await downloadedBlob.text();

        expect(csv).toContain(
            '"ABC ""Medical"" Hospital"'
        );
    });

    it.each([
        ['=1+1'],
        ['+SUM(A1:A2)'],
        ['-1+2'],
        ['@SUM(A1:A2)'],
        ['   =1+1']
    ])('should protect formula-like customer values: %s', async value => {
        mocks.getAllCylinders.mockResolvedValue([
            validCylinder({
                customer: value
            })
        ]);

        await exportCSV();

        const csv = await downloadedBlob.text();

        expect(csv).toContain(
            `"\'${value}"`
        );
    });

    it('should initiate the CSV download', async () => {
        await exportCSV();

        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(clickedLink.click).toHaveBeenCalledOnce();
        expect(clickedLink.remove).toHaveBeenCalledOnce();
    });

});

// =============================================
// 4. AUTOMATIC COMPLETED-PAGE EXPORT
// =============================================

describe('exportCompletedPagesIfReady()', () => {

    it('should reject non-array records', async () => {
        await expect(
            exportCompletedPagesIfReady(null)
        ).rejects.toThrow(
            'Invalid cylinder records for automatic export.'
        );
    });

    it('should reject a zero page size', async () => {
        await expect(
            exportCompletedPagesIfReady([], 0)
        ).rejects.toThrow('Invalid page size.');
    });

    it('should reject a negative page size', async () => {
        await expect(
            exportCompletedPagesIfReady([], -1)
        ).rejects.toThrow('Invalid page size.');
    });

    it('should reject a fractional page size', async () => {
        await expect(
            exportCompletedPagesIfReady([], 1.5)
        ).rejects.toThrow('Invalid page size.');
    });

    it('should reject an unsafe page size', async () => {
        await expect(
            exportCompletedPagesIfReady([], Number.MAX_SAFE_INTEGER + 1)
        ).rejects.toThrow('Invalid page size.');
    });

    it('should return without reading metadata for empty records', async () => {
        await exportCompletedPagesIfReady([]);

        expect(mocks.getMetadata).not.toHaveBeenCalled();
        expect(mocks.setMetadata).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should not export an incomplete page', async () => {
        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102',
                status: 'In Shop'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(mocks.setMetadata).not.toHaveBeenCalled();
    });

    it('should not export a partial page', async () => {
        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(mocks.setMetadata).not.toHaveBeenCalled();
    });

    it('should export a page when every record is completed', async () => {
        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102',
                status: 'Completed'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).toHaveBeenCalledOnce();
        expect(clickedLink.click).toHaveBeenCalledOnce();

        expect(clickedLink.download).toBe(
            'Completed_Register_Sheet_1_2026-11-04.csv'
        );

        expect(mocks.setMetadata).toHaveBeenCalledWith(
            'downloadedPages',
            [0]
        );
    });

    it('should not export a page that has already been downloaded', async () => {
        mocks.getMetadata.mockResolvedValue([0]);

        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102',
                status: 'Completed'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(mocks.setMetadata).not.toHaveBeenCalled();
    });

    it('should export multiple completed pages', async () => {
        const records = Array.from({ length: 4 }, (_, index) =>
            validCylinder({
                id: index + 1,
                cylNum: `O2-${101 + index}`,
                status: 'Completed'
            })
        );

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).toHaveBeenCalledTimes(2);

        expect(mocks.setMetadata).toHaveBeenCalledWith(
            'downloadedPages',
            [0, 1]
        );
    });

    it('should skip completed pages that are not full', async () => {
        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102',
                status: 'Completed'
            }),
            validCylinder({
                id: 3,
                cylNum: 'O2-103',
                status: 'Completed'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).toHaveBeenCalledOnce();

        expect(mocks.setMetadata).toHaveBeenCalledWith(
            'downloadedPages',
            [0]
        );
    });

    it('should handle invalid stored metadata safely', async () => {
        mocks.getMetadata.mockResolvedValue('invalid-metadata');

        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102',
                status: 'Completed'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).toHaveBeenCalledOnce();

        expect(mocks.setMetadata).toHaveBeenCalledWith(
            'downloadedPages',
            [0]
        );
    });

    it('should filter invalid page numbers from stored metadata', async () => {
        mocks.getMetadata.mockResolvedValue([
            0,
            -1,
            1.5,
            '2',
            Number.MAX_SAFE_INTEGER + 1
        ]);

        const records = [
            validCylinder({
                id: 1,
                status: 'Completed'
            }),
            validCylinder({
                id: 2,
                cylNum: 'O2-102',
                status: 'Completed'
            })
        ];

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(mocks.setMetadata).not.toHaveBeenCalled();
    });

    it('should preserve existing valid page numbers when exporting another page', async () => {
        mocks.getMetadata.mockResolvedValue([0]);

        const records = Array.from({ length: 4 }, (_, index) =>
            validCylinder({
                id: index + 1,
                cylNum: `O2-${101 + index}`,
                status: 'Completed'
            })
        );

        await exportCompletedPagesIfReady(records, 2);

        expect(URL.createObjectURL).toHaveBeenCalledOnce();

        expect(mocks.setMetadata).toHaveBeenCalledWith(
            'downloadedPages',
            [0, 1]
        );
    });

});