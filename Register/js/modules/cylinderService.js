import { getAllCylinders, transactCylinders, isValidCylinder } from '../db.js';

// Fetches the current date in YYYY-MM-DD format.
export function getTodayDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

// Sorts and returns all cylinder records by their ID in ascending order.
export async function loadCylinders() {
    const records = await getAllCylinders();

    return records.sort((a, b) => a.id - b.id);
}

// Validates the input for cylinder operations and normalizes the cylinder number. 
function validateCylinderInput({
    cylNum,
    gasType,
    customerName,
    returnFillLevel
}) {
    if (
        typeof cylNum !== 'string' ||
        !cylNum.trim()
    ) {
        throw new Error('Please enter a cylinder number.');
    }

    const normalizedNumber = cylNum.trim().toUpperCase();

    const validGasTypes = ['O2', 'CO2', 'Ar', 'N'];

    if (!validGasTypes.includes(gasType)) {
        throw new Error('Please select a valid gas type.');
    }

    if (typeof customerName !== 'string') {
        throw new Error('Invalid customer name.');
    }

    if (typeof returnFillLevel !== 'string') {
        throw new Error('Invalid return fill level.');
    }

    return {
        normalizedNumber,
        gasType,
        customerName: customerName.trim(),
        returnFillLevel: returnFillLevel.trim()
    };
}

// Creates a new cylinder refill record with default values and validates it.
function createRefillRecord({
    cylNum,
    gasType,
    fillLevel = 'Full',
    refillDate
}) {
    const record = {
        cylNum,
        gasType,
        fillLevel,
        refillDate,
        customer: '',
        dateSent: '',
        dateReturned: '',
        nextRefillDate: '',
        status: 'In Shop'
    };

    if (!isValidCylinder(record)) {
        throw new Error(
            'Unable to create a valid cylinder record.'
        );
    }

    return record;
}


/**
 * Registers a cylinder for the first time as initial inventory.
 *
 * @param {Object} params
 * @param {string} params.cylNum
 * @param {string} params.gasType
 * @param {string} params.fillLevel
 * @param {string} params.refillDate
 */
export async function registerInitialStock({
    cylNum,
    gasType,
    fillLevel,
    refillDate
}) {
    // 1. Validate cylinder number
    if (typeof cylNum !== 'string' || !cylNum.trim()) {
        throw new Error('Please enter a valid cylinder number.');
    }

    const normalizedNumber = cylNum.trim().toUpperCase();

    // 2. Validate gas type
    const validGasTypes = ['O2', 'CO2', 'Ar', 'N'];

    if (!validGasTypes.includes(gasType)) {
        throw new Error('Please select a valid gas type.');
    }

    // 3. Validate initial fill level
    const validFillLevels = ['Empty', 'Half', 'Full'];

    if (!validFillLevels.includes(fillLevel)) {
        throw new Error('Please select a valid initial fill level.');
    }

    // 4. Require refill date
    if (
        typeof refillDate !== 'string' ||
        !refillDate.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(refillDate)
    ) {
        throw new Error('Please enter a valid refill date.');
    }

    // 5. Register atomically
    const result = await transactCylinders((records) => {

        // Prevent duplicate cylinder registration
        const alreadyExists = records.some(
            record =>
                String(record.cylNum).trim().toUpperCase() ===
                normalizedNumber
        );

        if (alreadyExists) {
            throw new Error(
                'This cylinder is already registered.'
            );
        }

        // Create initial inventory record
        const newRecord = createRefillRecord({
            cylNum: normalizedNumber,
            gasType,
            fillLevel,
            refillDate
        });

        return {
            updates: [],
            inserts: [newRecord],
            value: 'Initial cylinder stock registered successfully.'
        };
    });

    return result;
}

// Normalizes a cylinder number the same way the UI does.
function normalizeCylNum(value) {
    return String(value ?? '').trim().toUpperCase();
}

// Finds the latest record for a given cylinder number from a list of records.
function findLatestCylinderRecord(records, cylNum) {
    const target = normalizeCylNum(cylNum);
    return records
        .filter(record => normalizeCylNum(record.cylNum) === target)
        .sort((a, b) => (b.id || 0) - (a.id || 0))[0] || null;
}

// Processes a cylinder action (dispatch, return, supplier operations) with validation and atomic database transaction.
export async function processCylinderAction({
    cylNum,
    gasType,
    customerName = '',
    returnFillLevel = '',
    halfReturnAction = '',
    action = ''
}) {
    const today = getTodayDate();

    if (!cylNum || typeof cylNum !== 'string' || !cylNum.trim()) {
        throw new Error('Please enter a valid cylinder number.');
    }

    cylNum = cylNum.trim().toUpperCase();
    customerName = customerName.trim();

    const validFillLevels = ['Empty', 'Half', 'Full'];

    if (
        returnFillLevel &&
        !validFillLevels.includes(returnFillLevel)
    ) {
        throw new Error('Invalid cylinder fill level.');
    }

    const result = await transactCylinders((records) => {

        const existingRecords = records
            .filter(record => record.cylNum === cylNum)
            .sort((a, b) => (b.id || 0) - (a.id || 0));

        const latest = existingRecords[0] || null;

        if (!latest) {
            throw new Error(
                'This cylinder is not registered. Register its initial stock with a verified fill level and refill date first.'
            );
        }

        if (
            action === 'customer-dispatch' ||
            (!action && latest.status === 'In Shop')
        ) {
            if (latest.status !== 'In Shop') {
                throw new Error(
                    'Only cylinders available in the shop can be sent to customers.'
                );
            }

            if (latest.fillLevel === 'Empty') {
                throw new Error(
                    'This cylinder is empty. It cannot be sent to a customer.'
                );
            }

            if (!customerName) {
                throw new Error(
                    'Please enter the customer name.'
                );
            }

            const updatedRecord = {
                ...latest,
                customer: customerName,
                dateSent: today,
                dateReturned: '',
                status: 'With Customer'
            };

            return {
                updates: [updatedRecord],
                inserts: [],
                value: 'Cylinder successfully sent to customer.'
            };
        }

        if (
            action === 'customer-return' ||
            (!action && latest.status === 'With Customer')
        ) {
            if (latest.status !== 'With Customer') {
                throw new Error(
                    'This cylinder is not currently with a customer.'
                );
            }

            if (!validFillLevels.includes(returnFillLevel)) {
                throw new Error(
                    'Please select the returned cylinder fill level.'
                );
            }

            if (
                returnFillLevel === 'Half' &&
                !['available', 'send-for-refill'].includes(halfReturnAction)
            ) {
                throw new Error(
                    'For a half-filled cylinder, choose whether to make it available or send it for refilling.'
                );
            }

            const completedRecord = {
                ...latest,
                dateReturned: today,
                status: 'Completed',
                fillLevel: returnFillLevel
            };

            let nextStatus;
            let nextFillLevel = returnFillLevel;

            if (returnFillLevel === 'Empty') {
                nextStatus = 'Returned to Shop';
            } else if (returnFillLevel === 'Half') {
                nextStatus =
                    halfReturnAction === 'available'
                        ? 'In Shop'
                        : 'Returned to Shop';
            } else {
                nextStatus = 'In Shop';
            }

            const inventoryRecord = {
                cylNum,
                gasType: latest.gasType,
                fillLevel: nextFillLevel,
                refillDate: latest.refillDate || '',
                customer: '',
                dateSent: '',
                dateReturned: '',
                nextRefillDate: '',
                supplierSentDate: '',
                supplierReturnedDate: '',
                status: nextStatus
            };

            return {
                updates: [completedRecord],
                inserts: [inventoryRecord],
                value:
                    nextStatus === 'In Shop'
                        ? 'Cylinder returned and made available in the shop.'
                        : 'Cylinder returned to the shop. It must be processed before customer dispatch.'
            };
        }

        if (action === 'supplier-dispatch') {

            const awaitingProcessing = latest.status === 'Returned to Shop';
            const inShopNeedsRefill =
                latest.status === 'In Shop' && latest.fillLevel !== 'Full';

            if (!awaitingProcessing && !inShopNeedsRefill) {
                throw new Error(
                    'Only cylinders returned to the shop, or in the shop but not full, can be sent to the supplier.'
                );
            }

            if (latest.fillLevel === 'Full') {
                throw new Error(
                    'This cylinder is already full. It does not need refilling.'
                );
            }

            const updatedRecord = {
                ...latest,
                status: 'Sent for Refilling',
                supplierSentDate: today,
                supplierReturnedDate: ''
            };

            return {
                updates: [updatedRecord],
                inserts: [],
                value: 'Cylinder successfully sent to the external supplier.'
            };
        }

        if (action === 'supplier-return') {

            if (latest.status !== 'Sent for Refilling') {
                throw new Error(
                    'This cylinder has not been sent to the supplier for refilling.'
                );
            }

            if (!latest.supplierSentDate) {
                throw new Error(
                    'Supplier dispatch date is missing. Cannot confirm supplier return.'
                );
            }

            const updatedRecord = {
                ...latest,
                status: 'In Shop',
                fillLevel: 'Full',

                supplierReturnedDate: today,
                refillDate: today
            };

            // Stamp the previous Completed record with the date of its next refill.
            const previousCompleted = existingRecords.find(
                record =>
                    record.status === 'Completed' &&
                    !record.nextRefillDate &&
                    (record.id || 0) < (latest.id || 0)
            );

            const updates = [updatedRecord];

            if (previousCompleted) {
                updates.push({
                    ...previousCompleted,
                    nextRefillDate: today
                });
            }

            return {
                updates,
                inserts: [],
                value: 'Supplier returned the cylinder. Refill successfully recorded.'
            };
        }

        if (latest.status === 'Sent for Refilling') {
            throw new Error(
                'This cylinder is currently with the supplier. It cannot be dispatched to a customer.'
            );
        }

        if (latest.status === 'Returned to Shop') {
            throw new Error(
                'This cylinder is awaiting processing. Send it for refilling before making it available.'
            );
        }

        if (latest.status === 'Completed') {
            throw new Error(
                'This is a completed historical record. No stock action is allowed on it.'
            );
        }

        throw new Error(
            `Unsupported cylinder operation for status: ${latest.status}`
        );
    });

    return result;
}