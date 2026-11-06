const DB_NAME = 'CylinderRegisterDB';
const DB_VERSION = 1;

let dbPromise;

// --------------------------------------------------
// 1. OPEN DATABASE
// --------------------------------------------------

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            dbPromise = null;
            reject(new Error('IndexedDB is not supported by this browser.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('cylinders')) {
                const store = db.createObjectStore('cylinders', {
                    keyPath: 'id',
                    autoIncrement: true
                });

                store.createIndex('cylNum', 'cylNum', {
                    unique: false
                });

                store.createIndex('status', 'status', {
                    unique: false
                });
            }

            if (!db.objectStoreNames.contains('metadata')) {
                db.createObjectStore('metadata', {
                    keyPath: 'key'
                });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            db.onversionchange = () => {
                db.close();
                dbPromise = null;
            };

            resolve(db);
        };

        request.onerror = () => {
            dbPromise = null;
            reject(request.error || new Error('Could not open IndexedDB.'));
        };

        request.onblocked = () => {
            console.warn(
                'IndexedDB upgrade is blocked. Close other tabs using this application.'
            );
        };
    });

    return dbPromise;
}

// --------------------------------------------------
// 2. VALIDATION HELPERS
// --------------------------------------------------

const GAS_TYPES = ['O2', 'CO2', 'Ar', 'N'];
const FILL_LEVELS = ['Empty', 'Half', 'Full'];
const STATUSES = ['In Shop', 'With Customer', 'Completed', 'Returned to Shop', 'Sent for Refilling'];
const OPTIONAL_STRING_FIELDS = [
    'customer',
    'dateSent',
    'dateReturned',
    'nextRefillDate',
    'supplierSentDate',
    'supplierReturnedDate'
];

function isValidId(id) {
    return Number.isSafeInteger(id) && id > 0;
}


function isValidDate(value) {
    if (
        typeof value !== 'string' ||
        value.trim() === ''
    ) {
        return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

export function isValidCylinder(record) {
    if (
        !record ||
        typeof record !== 'object' ||
        Array.isArray(record)
    ) {
        return false;
    }

    if (
        typeof record.cylNum !== 'string' ||
        record.cylNum.trim().length === 0
    ) {
        return false;
    }

    if (!GAS_TYPES.includes(record.gasType)) {
        return false;
    }

    const fillLevel = record.fillLevel ?? 'Full';

    if (!FILL_LEVELS.includes(fillLevel)) {
        return false;
    }

    if (!STATUSES.includes(record.status)) {
        return false;
    }

    if (
        record.refillDate !== undefined &&
        record.refillDate !== null &&
        record.refillDate !== '' &&
        !isValidDate(record.refillDate)
    ) {
        return false;
    }

    for (const field of OPTIONAL_STRING_FIELDS) {
        if (
            record[field] !== undefined &&
            record[field] !== null &&
            typeof record[field] !== 'string'
        ) {
            return false;
        }
    }

    if (
        record.supplierSentDate &&
        !isValidDate(record.supplierSentDate)
    ) {
        return false;
    }

    if (
        record.supplierReturnedDate &&
        !isValidDate(record.supplierReturnedDate)
    ) {
        return false;
    }

    if (
        record.status === 'Sent for Refilling' &&
        !isValidDate(record.supplierSentDate)
    ) {
        return false;
    }

    if (
        record.supplierReturnedDate &&
        !isValidDate(record.supplierSentDate)
    ) {
        return false;
    }

    if (record.supplierReturnedDate) {
        if (
            !isValidDate(record.supplierSentDate) ||
            !isValidDate(record.supplierReturnedDate) ||
            !isValidDate(record.refillDate) ||
            record.fillLevel !== 'Full'
        ) {
            return false;
        }

        if (
            record.supplierReturnedDate < record.supplierSentDate
        ) {
            return false;
        }
    }

    if (
        record.status === 'Sent for Refilling' &&
        record.supplierReturnedDate
    ) {
        return false;
    }

    if (
        record.id !== undefined &&
        !isValidId(record.id)
    ) {
        return false;
    }

    return true;
}

function validateCylinderArray(records) {
    if (
        !Array.isArray(records) ||
        !records.every(isValidCylinder)
    ) {
        throw new Error('One or more cylinder records are invalid.');
    }
}

function validateUniqueIds(records) {
    const ids = new Set();

    for (const record of records) {
        if (record.id === undefined) continue;

        if (!isValidId(record.id)) {
            throw new Error('Backup contains an invalid cylinder ID.');
        }

        if (ids.has(record.id)) {
            throw new Error(
                `Backup contains duplicate cylinder ID: ${record.id}`
            );
        }

        ids.add(record.id);
    }
}

// --------------------------------------------------
// 3. GET ALL CYLINDERS
// --------------------------------------------------

export async function getAllCylinders() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            'cylinders',
            'readonly'
        );

        const request = transaction
            .objectStore('cylinders')
            .getAll();

        let records;

        request.onsuccess = () => {
            records = request.result;
        };

        transaction.oncomplete = () => {
            resolve(records || []);
        };

        transaction.onerror = () => {
            reject(
                transaction.error ||
                new Error('Could not retrieve cylinder records.')
            );
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error('Reading cylinder records was aborted.')
            );
        };
    });
}

// --------------------------------------------------
// 4. ATOMIC CYLINDER TRANSACTION
// --------------------------------------------------

/*
    IMPORTANT:

    The mutator callback must be synchronous.

    It receives the latest database records while the
    read-write transaction is active.

    It must return:

    {
        updates: [],
        inserts: [],
        value: any
    }

    Do not use await, fetch, timers, or other asynchronous
    operations inside the mutator.

    All related updates and inserts are committed atomically.
*/

export async function transactCylinders(mutator) {
    if (typeof mutator !== 'function') {
        throw new Error('A transaction callback is required.');
    }

    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            'cylinders',
            'readwrite'
        );

        const store = transaction.objectStore('cylinders');
        const request = store.getAll();

        let transactionValue;
        let insertedRecords = [];
        let customError = null;

        request.onsuccess = () => {
            try {
                const latestRecords = request.result;

                // This callback must complete synchronously.
                const result = mutator(latestRecords);

                if (
                    !result ||
                    typeof result !== 'object' ||
                    Array.isArray(result)
                ) {
                    throw new Error(
                        'Transaction callback must return an object.'
                    );
                }

                const updates = result.updates ?? [];
                const inserts = result.inserts ?? [];

                if (!Array.isArray(updates) || !Array.isArray(inserts)) {
                    throw new Error(
                        'Transaction updates and inserts must be arrays.'
                    );
                }

                if (!updates.every(
                    (record) =>
                        isValidCylinder(record) &&
                        isValidId(record.id)
                )) {
                    throw new Error(
                        'One or more cylinder updates are invalid.'
                    );
                }

                if (!inserts.every(isValidCylinder)) {
                    throw new Error(
                        'One or more new cylinder records are invalid.'
                    );
                }

                const existingIds = new Set(
                    latestRecords.map((record) => record.id)
                );

                const updatedIds = new Set();

                for (const record of updates) {
                    if (!existingIds.has(record.id)) {
                        throw new Error(
                            `Cylinder record ${record.id} no longer exists.`
                        );
                    }

                    if (updatedIds.has(record.id)) {
                        throw new Error(
                            `Cylinder record ${record.id} was updated more than once.`
                        );
                    }

                    updatedIds.add(record.id);
                }

                // Queue all writes while the transaction is active.
                updates.forEach((record) => {
                    store.put({ ...record });
                });

                insertedRecords = inserts.map((record) => ({
                    ...record
                }));

                insertedRecords.forEach((record) => {
                    const addRequest = store.add(record);

                    addRequest.onsuccess = () => {
                        record.id = addRequest.result;
                    };
                });

                transactionValue = result.value;

            } catch (error) {
                customError = error;

                try {
                    transaction.abort();
                } catch {
                    // The transaction may already have aborted.
                }
            }
        };

        request.onerror = () => {
            customError = request.error;
        };

        transaction.oncomplete = () => {
            resolve({
                value: transactionValue,
                inserted: insertedRecords
            });
        };

        transaction.onerror = () => {
            reject(
                customError ||
                transaction.error ||
                new Error('Cylinder transaction failed.')
            );
        };

        transaction.onabort = () => {
            reject(
                customError ||
                transaction.error ||
                new Error('Cylinder transaction was aborted.')
            );
        };
    });
}

// --------------------------------------------------
// 5. SAVE CHANGES
// --------------------------------------------------

/*
    Retained for compatibility with the existing
    cylinderService.js.

    Updates must refer to existing database IDs.
*/

export async function saveChanges({
    updates = [],
    inserts = []
} = {}) {
    const result = await transactCylinders(() => ({
        updates,
        inserts
    }));

    return result;
}

// --------------------------------------------------
// 6. REPLACE ALL CYLINDERS
// --------------------------------------------------

export async function replaceAllCylinders(records) {
    validateCylinderArray(records);
    validateUniqueIds(records);

    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            'cylinders',
            'readwrite'
        );

        const store = transaction.objectStore('cylinders');

        store.clear();

        records.forEach((record) => {
            const copy = { ...record };

            if (copy.id !== undefined) {
                store.put(copy);
            } else {
                store.add(copy);
            }
        });

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(
                transaction.error ||
                new Error('Could not restore cylinder records.')
            );
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error('Restore transaction was aborted.')
            );
        };
    });
}

// --------------------------------------------------
// 7. METADATA
// --------------------------------------------------

export async function getMetadata(key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            'metadata',
            'readonly'
        );

        const request = transaction
            .objectStore('metadata')
            .get(key);

        request.onsuccess = () => {
            resolve(request.result?.value);
        };

        request.onerror = () => {
            reject(
                request.error ||
                new Error('Could not retrieve metadata.')
            );
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error('Metadata read was aborted.')
            );
        };
    });
}

export async function setMetadata(key, value) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            'metadata',
            'readwrite'
        );

        transaction
            .objectStore('metadata')
            .put({ key, value });

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(
                transaction.error ||
                new Error('Could not save metadata.')
            );
        };

        transaction.onabort = () => {
            reject(
                transaction.error ||
                new Error('Metadata transaction was aborted.')
            );
        };
    });
}

// --------------------------------------------------
// 8. LOCALSTORAGE MIGRATION
// --------------------------------------------------

export async function migrateLocalStorage() {
    /*
        Read old LocalStorage data first.
        Do not delete it after migration.
        It remains available as a recovery copy.
    */

    let rawData;
    let rawDownloadedPages;

    try {
        rawData = localStorage.getItem('cylindersData');
        rawDownloadedPages = localStorage.getItem('downloadedPages');
    } catch (error) {
        throw new Error(
            `Cannot read old browser data: ${error.message}`
        );
    }

    let oldRecords = [];
    let oldDownloadedPages = [];

    if (rawData) {
        try {
            oldRecords = JSON.parse(rawData);
        } catch {
            throw new Error(
                'Old LocalStorage JSON is corrupted. ' +
                'Migration stopped; original data was retained.'
            );
        }

        validateCylinderArray(oldRecords);

        // Old LocalStorage IDs are deliberately discarded.
        // IndexedDB will generate new IDs.
    }

    if (rawDownloadedPages) {
        try {
            const parsed = JSON.parse(rawDownloadedPages);

            if (
                Array.isArray(parsed) &&
                parsed.every(
                    (page) =>
                        Number.isSafeInteger(page) &&
                        page >= 1
                )
            ) {
                oldDownloadedPages = parsed;
            }
        } catch (error) {
            console.warn(
                'Could not migrate downloaded-pages metadata:',
                error
            );
        }
    }

    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            ['cylinders', 'metadata'],
            'readwrite'
        );

        const cylinderStore = transaction.objectStore('cylinders');
        const metadataStore = transaction.objectStore('metadata');

        let customError = null;
        let migrationSkipped = false;

        /*
            Check the migration flag inside the same transaction.
            This prevents two tabs from migrating simultaneously.
        */

        const metadataRequest = metadataStore.get(
            'localStorageMigrated'
        );

        metadataRequest.onsuccess = () => {
            if (metadataRequest.result?.value === true) {
                migrationSkipped = true;
                return;
            }

            const recordsRequest = cylinderStore.getAll();

            recordsRequest.onsuccess = () => {
                if (recordsRequest.result.length > 0) {
                    customError = new Error(
                        'IndexedDB already contains records. ' +
                        'Migration stopped to prevent duplicate records.'
                    );

                    try {
                        transaction.abort();
                    } catch {
                        // Transaction may already be inactive.
                    }

                    return;
                }

                try {
                    oldRecords.forEach((record) => {
                        const copy = { ...record };

                        delete copy.id;

                        cylinderStore.add(copy);
                    });

                    metadataStore.put({
                        key: 'downloadedPages',
                        value: oldDownloadedPages
                    });

                    metadataStore.put({
                        key: 'localStorageMigrated',
                        value: true
                    });

                } catch (error) {
                    customError = error;

                    try {
                        transaction.abort();
                    } catch {
                        // Transaction may already be inactive.
                    }
                }
            };

            recordsRequest.onerror = () => {
                customError = recordsRequest.error;

                try {
                    transaction.abort();
                } catch {
                    // Transaction may already be inactive.
                }
            };
        };

        metadataRequest.onerror = () => {
            customError = metadataRequest.error;

            try {
                transaction.abort();
            } catch {
                // Transaction may already be inactive.
            }
        };

        transaction.oncomplete = () => {
            resolve({
                migrated: !migrationSkipped,
                recordCount: migrationSkipped ? 0 : oldRecords.length
            });
        };

        transaction.onerror = () => {
            reject(
                customError ||
                transaction.error ||
                new Error('LocalStorage migration failed.')
            );
        };

        transaction.onabort = () => {
            reject(
                customError ||
                transaction.error ||
                new Error('LocalStorage migration was aborted.')
            );
        };
    });
}