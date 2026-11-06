import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// db.js checks for IndexedDB through window.
globalThis.window = globalThis;

let db;

const validCylinder = (overrides = {}) => ({
  cylNum: "O2-101",
  gasType: "O2",
  fillLevel: "Full",
  refillDate: "2026-11-01",
  customer: "",
  dateSent: "",
  dateReturned: "",
  nextRefillDate: "",
  supplierSentDate: "",
  supplierReturnedDate: "",
  status: "In Shop",
  ...overrides,
});

describe("IndexedDB Database Tests", () => {
  beforeAll(async () => {
    db = await import("../js/db.js");
  });

  beforeEach(async () => {
    // Clear cylinder records before each independent test.
    await db.replaceAllCylinders([]);
  });

  // =========================================
  // 1. DATABASE INITIALIZATION
  // =========================================

  describe("Database Initialization", () => {
    it("should close and reset the connection when database version changes", async () => {
      const requests = [];

      const mockIndexedDB = {
        open: vi.fn(() => {
          const request = {
            error: new Error("Simulated opening failure"),
            onblocked: null,
            onerror: null,
            onupgradeneeded: null,
            onsuccess: null,
          };

          requests.push(request);
          return request;
        }),
      };

      const closeSpy = vi.fn();

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: closeSpy,
        transaction: () => {
          throw new Error("Stop after testing database connection");
        },
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        // First connection.
        const firstOperation = isolatedDb.getAllCylinders();

        requests[0].result = mockDatabase;
        requests[0].onsuccess();

        await expect(firstOperation).rejects.toThrow(
          "Stop after testing database connection",
        );

        // Simulate a database version change.
        mockDatabase.onversionchange();

        expect(closeSpy).toHaveBeenCalledOnce();

        // The next operation must attempt a fresh connection.
        const secondOperation = isolatedDb.getAllCylinders();

        expect(mockIndexedDB.open).toHaveBeenCalledTimes(2);

        requests[1].onerror();

        await expect(secondOperation).rejects.toThrow(
          "Simulated opening failure",
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should initialize the database successfully", async () => {
      const records = await db.getAllCylinders();

      expect(records).toEqual([]);
    });

    it("should reject when IndexedDB is not supported", async () => {
      const indexedDBDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "indexedDB",
      );

      try {
        // Load a fresh db.js module with no cached database promise.
        await vi.resetModules();

        // Simulate a browser without IndexedDB.
        delete globalThis.indexedDB;

        const isolatedDb = await import("../js/db.js");

        await expect(isolatedDb.getAllCylinders()).rejects.toThrow(
          "IndexedDB is not supported by this browser.",
        );
      } finally {
        // Restore the original IndexedDB implementation.
        if (indexedDBDescriptor) {
          Object.defineProperty(globalThis, "indexedDB", indexedDBDescriptor);
        }
      }
    });

    it("should log a warning when database upgrade is blocked", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const mockRequest = {
        error: new Error("Mock database opening failure"),
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => mockRequest),
      };

      try {
        await vi.resetModules();

        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const databasePromise = isolatedDb.getAllCylinders();

        // Simulate the blocked event.
        mockRequest.onblocked();

        expect(warnSpy).toHaveBeenCalledWith(
          "IndexedDB upgrade is blocked. Close other tabs using this application.",
        );

        // Finish the mocked request with an error so the promise settles.
        mockRequest.onerror();

        await expect(databasePromise).rejects.toThrow(
          "Mock database opening failure",
        );
      } finally {
        vi.unstubAllGlobals();
        warnSpy.mockRestore();
      }
    });

    it("should reject when opening IndexedDB fails", async () => {
      const mockError = new Error("Simulated IndexedDB opening failure");

      const mockRequest = {
        error: mockError,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => mockRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const databasePromise = isolatedDb.getAllCylinders();

        mockRequest.onerror();

        await expect(databasePromise).rejects.toThrow(
          "Simulated IndexedDB opening failure",
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // =========================================
  // 2. CYLINDER VALIDATION
  // =========================================

  describe("isValidCylinder()", () => {
    it("should accept a valid cylinder", () => {
      expect(db.isValidCylinder(validCylinder())).toBe(true);
    });

    it("should reject an empty cylinder number", () => {
      expect(db.isValidCylinder(validCylinder({ cylNum: " " }))).toBe(false);
    });

    it("should reject an invalid gas type", () => {
      expect(db.isValidCylinder(validCylinder({ gasType: "XYZ" }))).toBe(false);
    });

    it("should reject an invalid fill level", () => {
      expect(db.isValidCylinder(validCylinder({ fillLevel: "Quarter" }))).toBe(
        false,
      );
    });

    it("should reject an invalid status", () => {
      expect(db.isValidCylinder(validCylinder({ status: "Unknown" }))).toBe(
        false,
      );
    });

    it("should reject an invalid refill date", () => {
      expect(
        db.isValidCylinder(validCylinder({ refillDate: "2026-02-31" })),
      ).toBe(false);
    });

    it("should reject an invalid supplier dispatch date", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            supplierSentDate: "invalid-date",
          }),
        ),
      ).toBe(false);
    });

    it("should reject Sent for Refilling without dispatch date", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            status: "Sent for Refilling",
          }),
        ),
      ).toBe(false);
    });

    it("should reject duplicate or invalid IDs through validation", () => {
      expect(db.isValidCylinder(validCylinder({ id: 0 }))).toBe(false);
    });

    it("should reject null and non-string refill dates", () => {
      expect(db.isValidCylinder(validCylinder({ refillDate: null }))).toBe(
        true,
      );

      expect(db.isValidCylinder(validCylinder({ refillDate: 123 }))).toBe(
        false,
      );
    });

    it("should accept valid leap-year dates", () => {
      expect(
        db.isValidCylinder(validCylinder({ refillDate: "2024-02-29" })),
      ).toBe(true);
    });

    it("should reject incorrectly formatted dates", () => {
      const invalidDates = [
        "04-11-2026",
        "2026/11/04",
        "2026-2-04",
        "not-a-date",
        " ",
      ];

      invalidDates.forEach((date) => {
        expect(db.isValidCylinder(validCylinder({ refillDate: date }))).toBe(
          false,
        );
      });
    });

    it("should accept valid supplier return information", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            status: "In Shop",
            fillLevel: "Full",
            supplierSentDate: "2026-11-01",
            supplierReturnedDate: "2026-11-04",
            refillDate: "2026-11-04",
          }),
        ),
      ).toBe(true);
    });

    it("should reject supplier return information when the cylinder is not full", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            fillLevel: "Half",
            supplierSentDate: "2026-11-01",
            supplierReturnedDate: "2026-11-04",
            refillDate: "2026-11-04",
          }),
        ),
      ).toBe(false);
    });

    it("should reject a returned cylinder marked as Sent for Refilling", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            status: "Sent for Refilling",
            supplierSentDate: "2026-11-01",
            supplierReturnedDate: "2026-11-04",
            refillDate: "2026-11-04",
            fillLevel: "Full",
          }),
        ),
      ).toBe(false);
    });

    it("should reject an invalid supplier return date", () => {
      const record = validCylinder({
        status: "In Shop",
        fillLevel: "Full",
        supplierSentDate: "2026-11-01",
        supplierReturnedDate: "not-a-date",
        refillDate: "2026-11-04",
      });

      expect(db.isValidCylinder(record)).toBe(false);
    });
  });

  // =========================================
  // 3. READ OPERATIONS
  // =========================================

  describe("getAllCylinders()", () => {
    it("should return an empty array initially", async () => {
      const result = await db.getAllCylinders();

      expect(result).toEqual([]);
    });

    it("should retrieve all inserted cylinders", async () => {
      await db.transactCylinders(() => ({
        inserts: [
          validCylinder(),
          validCylinder({
            cylNum: "CO2-101",
            gasType: "CO2",
          }),
        ],
      }));

      const result = await db.getAllCylinders();

      expect(result).toHaveLength(2);

      expect(result.map((record) => record.cylNum)).toContain("O2-101");

      expect(result.map((record) => record.cylNum)).toContain("CO2-101");
    });

    it("should reject when the read transaction fails", async () => {
      const mockError = new Error("Simulated read transaction failure");

      const mockTransaction = {
        error: mockError,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          getAll: vi.fn(() => ({
            onsuccess: null,
            onerror: null,
          })),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const mockRequest = {
        result: null,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => mockRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.getAllCylinders();

        mockRequest.result = mockDatabase;
        mockRequest.onsuccess();

        await Promise.resolve();

        expect(mockTransaction.onerror).toBeTypeOf("function");

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "Simulated read transaction failure"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject with a fallback error when the read transaction is aborted", async () => {
      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          getAll: vi.fn(() => ({
            onsuccess: null,
            onerror: null,
          })),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const mockRequest = {
        result: null,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => mockRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.getAllCylinders();

        mockRequest.result = mockDatabase;
        mockRequest.onsuccess();

        await Promise.resolve();

        expect(mockTransaction.onabort).toBeTypeOf("function");

        mockTransaction.onabort();

        await expect(operation).rejects.toThrow(
          "Reading cylinder records was aborted."
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // =========================================
  // 4. INSERT OPERATIONS
  // =========================================

  describe("Cylinder Insert Operations", () => {
    it("should insert a cylinder successfully", async () => {
      const result = await db.transactCylinders(() => ({
        inserts: [validCylinder()],
        value: "Inserted successfully",
      }));

      expect(result.value).toBe("Inserted successfully");
      expect(result.inserted).toHaveLength(1);
      expect(result.inserted[0].id).toBeGreaterThan(0);

      const records = await db.getAllCylinders();

      expect(records).toHaveLength(1);
      expect(records[0].cylNum).toBe("O2-101");
    });

    it("should generate unique auto-increment IDs", async () => {
      const result = await db.transactCylinders(() => ({
        inserts: [
          validCylinder(),
          validCylinder({ cylNum: "O2-102" }),
          validCylinder({ cylNum: "O2-103" }),
        ],
      }));

      const ids = result.inserted.map((record) => record.id);

      expect(new Set(ids).size).toBe(3);
    });

    it("should reject invalid inserted records", async () => {
      await expect(
        db.transactCylinders(() => ({
          inserts: [
            validCylinder({
              gasType: "INVALID",
            }),
          ],
        })),
      ).rejects.toThrow("One or more new cylinder records are invalid.");

      expect(await db.getAllCylinders()).toHaveLength(0);
    });
  });

  // =========================================
  // 5. UPDATE OPERATIONS
  // =========================================

  describe("Cylinder Update Operations", () => {
    it("should update an existing cylinder", async () => {
      const inserted = await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      const cylinder = inserted.inserted[0];

      const result = await db.transactCylinders((records) => ({
        updates: [
          {
            ...records[0],
            status: "With Customer",
            customer: "ABC Hospital",
            dateSent: "2026-11-04",
          },
        ],
      }));

      const records = await db.getAllCylinders();

      expect(result.inserted).toEqual([]);
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("With Customer");
      expect(records[0].customer).toBe("ABC Hospital");
      expect(records[0].id).toBe(cylinder.id);
    });

    it("should reject an update without a valid ID", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      await expect(
        db.transactCylinders((records) => ({
          updates: [
            {
              ...records[0],
              id: undefined,
              status: "With Customer",
            },
          ],
        })),
      ).rejects.toThrow("One or more cylinder updates are invalid.");

      const records = await db.getAllCylinders();

      expect(records[0].status).toBe("In Shop");
    });

    it("should reject updating a record that does not exist", async () => {
      await expect(
        db.transactCylinders(() => ({
          updates: [validCylinder({ id: 999 })],
        })),
      ).rejects.toThrow("Cylinder record 999 no longer exists.");
    });

    it("should reject updating the same record twice", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      await expect(
        db.transactCylinders((records) => ({
          updates: [records[0], records[0]],
        })),
      ).rejects.toThrow("was updated more than once");
    });
  });

  // =========================================
  // 6. ATOMIC TRANSACTION TESTS
  // =========================================

  describe("Atomic Transactions", () => {
    it("should perform updates and inserts together", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      const result = await db.transactCylinders((records) => ({
        updates: [
          {
            ...records[0],
            status: "With Customer",
            customer: "ABC Hospital",
            dateSent: "2026-11-04",
          },
        ],
        inserts: [
          validCylinder({
            cylNum: "O2-102",
          }),
        ],
        value: "Transaction completed",
      }));

      const records = await db.getAllCylinders();

      expect(result.value).toBe("Transaction completed");
      expect(records).toHaveLength(2);

      expect(records.find((r) => r.cylNum === "O2-101").status).toBe(
        "With Customer",
      );

      expect(records.find((r) => r.cylNum === "O2-102")).toBeDefined();
    });

    it("should rollback when the transaction callback throws", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      await expect(
        db.transactCylinders(() => {
          throw new Error("Simulated business failure");
        }),
      ).rejects.toThrow("Simulated business failure");

      const records = await db.getAllCylinders();

      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("In Shop");
    });

    it("should reject a transaction with an invalid callback", async () => {
      await expect(db.transactCylinders(null)).rejects.toThrow(
        "A transaction callback is required.",
      );
    });

    it("should reject an invalid transaction result", async () => {
      await expect(db.transactCylinders(() => null)).rejects.toThrow(
        "Transaction callback must return an object.",
      );
    });

    it("should rollback all changes when a write fails", async () => {
      // Insert an initial record.
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      // Attempt to update the existing record and insert
      // two records with the same primary key.
      await expect(
        db.transactCylinders((records) => ({
          updates: [
            {
              ...records[0],
              status: "With Customer",
              customer: "ABC Hospital",
              dateSent: "2026-11-04",
            },
          ],

          inserts: [
            validCylinder({
              cylNum: "O2-102",
              id: 500,
            }),

            validCylinder({
              cylNum: "O2-103",
              id: 500,
            }),
          ],
        })),
      ).rejects.toThrow();

      // Verify that the entire transaction was rolled back.
      const records = await db.getAllCylinders();

      expect(records).toHaveLength(1);

      expect(records[0].status).toBe("In Shop");

      expect(records[0].customer).toBe("");
    });

    it("should reject when the initial read request fails", async () => {
      const mockError = new Error("Simulated transaction read failure");

      const mockRequest = {
        result: [],
        error: mockError,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          getAll: vi.fn(() => mockRequest),
        })),
        abort: vi.fn(),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.transactCylinders(() => ({
          inserts: [],
          updates: [],
        }));

        openRequest.onsuccess();

        await Promise.resolve();

        expect(mockRequest.onerror).toBeTypeOf("function");

        mockRequest.onerror();

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "Simulated transaction read failure"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // =========================================
  // 7. REPLACE ALL CYLINDERS
  // =========================================

  describe("replaceAllCylinders()", () => {
    it("should replace all existing records", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder(), validCylinder({ cylNum: "O2-102" })],
      }));

      await db.replaceAllCylinders([validCylinder({ cylNum: "CO2-101" })]);

      const records = await db.getAllCylinders();

      expect(records).toHaveLength(1);
      expect(records[0].cylNum).toBe("CO2-101");
    });

    it("should reject invalid replacement records", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      await expect(
        db.replaceAllCylinders([
          validCylinder({
            gasType: "INVALID",
          }),
        ]),
      ).rejects.toThrow("One or more cylinder records are invalid.");

      const records = await db.getAllCylinders();

      expect(records).toHaveLength(1);
      expect(records[0].cylNum).toBe("O2-101");
    });

    it("should reject duplicate IDs in backup data", async () => {
      await expect(
        db.replaceAllCylinders([
          validCylinder({ id: 1 }),
          validCylinder({ id: 1, cylNum: "O2-102" }),
        ]),
      ).rejects.toThrow("Backup contains duplicate cylinder ID: 1");
    });

    it("should restore records while preserving existing IDs", async () => {
      const backupRecords = [
        validCylinder({
          id: 101,
          cylNum: "O2-101",
        }),
        validCylinder({
          id: 102,
          cylNum: "O2-102",
        }),
      ];

      await db.replaceAllCylinders(backupRecords);

      const records = await db.getAllCylinders();

      expect(records).toHaveLength(2);

      expect(records.map((record) => record.id).sort()).toEqual([101, 102]);

      expect(records.map((record) => record.cylNum)).toContain("O2-101");
      expect(records.map((record) => record.cylNum)).toContain("O2-102");
    });

    it("should reject when the restore transaction fails", async () => {
      const mockError = new Error("Simulated restore failure");

      const mockTransaction = {
        error: mockError,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          clear: vi.fn(),
          add: vi.fn(),
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.replaceAllCylinders([]);

        openRequest.onsuccess();

        await Promise.resolve();

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "Simulated restore failure"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject when the restore transaction is aborted", async () => {
      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          clear: vi.fn(),
          add: vi.fn(),
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.replaceAllCylinders([]);

        openRequest.onsuccess();

        await Promise.resolve();

        mockTransaction.onabort();

        await expect(operation).rejects.toThrow(
          "Restore transaction was aborted."
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // =========================================
  // 8. METADATA OPERATIONS
  // =========================================

  describe("Metadata Operations", () => {
    it("should save and retrieve metadata", async () => {
      await db.setMetadata("testKey", [1, 2, 3]);

      const result = await db.getMetadata("testKey");

      expect(result).toEqual([1, 2, 3]);
    });

    it("should return undefined for missing metadata", async () => {
      const result = await db.getMetadata("missingKey");

      expect(result).toBeUndefined();
    });

    it("should reject when the metadata request fails", async () => {
      const mockError = new Error("Simulated metadata request failure");

      const mockRequest = {
        result: undefined,
        error: mockError,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          get: vi.fn(() => mockRequest),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.getMetadata("test-key");

        openRequest.onsuccess();

        await Promise.resolve();

        expect(mockRequest.onerror).toBeTypeOf("function");

        mockRequest.onerror();

        await expect(operation).rejects.toThrow(
          "Simulated metadata request failure"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject when the metadata read transaction is aborted", async () => {
      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          get: vi.fn(() => ({
            result: undefined,
            error: null,
            onsuccess: null,
            onerror: null,
          })),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.getMetadata("test-key");

        openRequest.onsuccess();

        await Promise.resolve();

        expect(mockTransaction.onabort).toBeTypeOf("function");

        mockTransaction.onabort();

        await expect(operation).rejects.toThrow(
          "Metadata read was aborted."
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject when the metadata write transaction fails", async () => {
      const mockError = new Error("Simulated metadata write failure");

      const mockTransaction = {
        error: mockError,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.setMetadata("test-key", "test-value");

        openRequest.onsuccess();

        await Promise.resolve();

        expect(mockTransaction.onerror).toBeTypeOf("function");

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "Simulated metadata write failure"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject when the metadata write transaction is aborted", async () => {
      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: {
          contains: () => true,
        },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      const mockIndexedDB = {
        open: vi.fn(() => openRequest),
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", mockIndexedDB);

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.setMetadata("test-key", "test-value");

        openRequest.onsuccess();

        await Promise.resolve();

        expect(mockTransaction.onabort).toBeTypeOf("function");

        mockTransaction.onabort();

        await expect(operation).rejects.toThrow(
          "Metadata transaction was aborted."
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // =========================================
  // 9. LOCALSTORAGE MIGRATION
  // =========================================

  describe("LocalStorage Migration", () => {
    it("should migrate valid LocalStorage records", async () => {
      // Reset database and migration flag.
      await db.replaceAllCylinders([]);
      await db.setMetadata("localStorageMigrated", false);

      const oldData = [
        validCylinder({
          cylNum: "O2-MIGRATION-001",
        }),
        validCylinder({
          cylNum: "CO2-MIGRATION-001",
          gasType: "CO2",
        }),
      ];

      globalThis.localStorage = {
        getItem(key) {
          if (key === "cylindersData") {
            return JSON.stringify(oldData);
          }

          if (key === "downloadedPages") {
            return JSON.stringify([1, 2, 3]);
          }

          return null;
        },
      };

      const result = await db.migrateLocalStorage();

      expect(result.migrated).toBe(true);
      expect(result.recordCount).toBe(2);

      const records = await db.getAllCylinders();

      expect(records).toHaveLength(2);
      expect(records.every((record) => record.id > 0)).toBe(true);

      expect(await db.getMetadata("downloadedPages")).toEqual([1, 2, 3]);

      expect(await db.getMetadata("localStorageMigrated")).toBe(true);

      // Running migration again must be safe and must not duplicate records.
      const secondResult = await db.migrateLocalStorage();

      expect(secondResult.migrated).toBe(false);
      expect(secondResult.recordCount).toBe(0);

      const finalRecords = await db.getAllCylinders();
      expect(finalRecords).toHaveLength(2);
    });

    it("should reject corrupted cylinder JSON", async () => {
      globalThis.localStorage = {
        getItem(key) {
          return key === "cylindersData" ? "{invalid-json" : null;
        },
      };

      await expect(db.migrateLocalStorage()).rejects.toThrow(
        "Old LocalStorage JSON is corrupted.",
      );
    });

    it("should safely migrate when no old LocalStorage data exists", async () => {
      await db.replaceAllCylinders([]);
      await db.setMetadata("localStorageMigrated", false);

      globalThis.localStorage = {
        getItem() {
          return null;
        },
      };

      const result = await db.migrateLocalStorage();

      expect(result).toEqual({
        migrated: true,
        recordCount: 0,
      });

      expect(await db.getAllCylinders()).toEqual([]);

      expect(await db.getMetadata("downloadedPages")).toEqual([]);

      expect(await db.getMetadata("localStorageMigrated")).toBe(true);
    });
  });

  // =========================================
  // 10. ADDITIONAL VALIDATION AND API TESTS
  // =========================================

  describe("Additional validation and API edge cases", () => {
    it("should reject null, primitive, and array records", () => {
      expect(db.isValidCylinder(null)).toBe(false);
      expect(db.isValidCylinder("cylinder")).toBe(false);
      expect(db.isValidCylinder([])).toBe(false);
    });

    it("should accept the default Full fill level when omitted", () => {
      const record = validCylinder();
      delete record.fillLevel;
      expect(db.isValidCylinder(record)).toBe(true);
    });

    it("should reject non-string optional fields", () => {
      expect(db.isValidCylinder(validCylinder({ customer: 123 }))).toBe(false);
    });

    it("should reject supplier return metadata without a dispatch date", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            supplierReturnedDate: "2026-11-04",
            supplierSentDate: "",
          }),
        ),
      ).toBe(false);
    });

    it("should reject a supplier return date earlier than dispatch", () => {
      expect(
        db.isValidCylinder(
          validCylinder({
            fillLevel: "Full",
            status: "In Shop",
            supplierSentDate: "2026-11-04",
            supplierReturnedDate: "2026-11-03",
            refillDate: "2026-11-03",
          }),
        ),
      ).toBe(false);
    });

    it("should reject unsafe and negative IDs", () => {
      expect(db.isValidCylinder(validCylinder({ id: -1 }))).toBe(false);

      expect(
        db.isValidCylinder(validCylinder({ id: Number.MAX_SAFE_INTEGER + 1 })),
      ).toBe(false);
    });

    it("should reject non-array transaction updates", async () => {
      await expect(
        db.transactCylinders(() => ({ updates: {}, inserts: [] })),
      ).rejects.toThrow("Transaction updates and inserts must be arrays.");
    });

    it("should reject non-array transaction inserts", async () => {
      await expect(
        db.transactCylinders(() => ({ updates: [], inserts: {} })),
      ).rejects.toThrow("Transaction updates and inserts must be arrays.");
    });

    it("should allow omitted updates and inserts in a transaction result", async () => {
      const result = await db.transactCylinders(() => ({
        value: "No-op transaction",
      }));

      expect(result.value).toBe("No-op transaction");
      expect(result.inserted).toEqual([]);
    });

    it("should save records through saveChanges()", async () => {
      const result = await db.saveChanges({
        inserts: [validCylinder()],
      });

      expect(result.inserted).toHaveLength(1);
      expect(await db.getAllCylinders()).toHaveLength(1);
    });

    it("should replace the database with an empty backup", async () => {
      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      await db.replaceAllCylinders([]);

      expect(await db.getAllCylinders()).toEqual([]);
    });

    it("should reject a non-array backup", async () => {
      await expect(db.replaceAllCylinders(null)).rejects.toThrow(
        "One or more cylinder records are invalid.",
      );
    });

    it("should update existing records through saveChanges()", async () => {
      const inserted = await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      const cylinder = inserted.inserted[0];

      const result = await db.saveChanges({
        updates: [
          {
            ...cylinder,
            status: "With Customer",
            customer: "ABC Hospital",
            dateSent: "2026-11-04",
          },
        ],
      });

      const records = await db.getAllCylinders();

      expect(result.inserted).toEqual([]);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(cylinder.id);
      expect(records[0].status).toBe("With Customer");
      expect(records[0].customer).toBe("ABC Hospital");
    });
  });

  // =========================================
  // 11. ADDITIONAL LOCALSTORAGE MIGRATION TESTS
  // =========================================

  describe("Additional LocalStorage Migration branches", () => {
    it("should report a LocalStorage access error", async () => {
      globalThis.localStorage = {
        getItem() {
          throw new Error("Storage access denied");
        },
      };

      await expect(db.migrateLocalStorage()).rejects.toThrow(
        "Cannot read old browser data: Storage access denied",
      );
    });

    it("should stop migration when IndexedDB already contains records", async () => {
      await db.setMetadata("localStorageMigrated", false);

      await db.transactCylinders(() => ({
        inserts: [validCylinder()],
      }));

      globalThis.localStorage = {
        getItem() {
          return null;
        },
      };

      await expect(db.migrateLocalStorage()).rejects.toThrow(
        "IndexedDB already contains records.",
      );

      expect(await db.getAllCylinders()).toHaveLength(1);
    });

    it("should ignore malformed downloaded-pages metadata and continue migration", async () => {
      await db.replaceAllCylinders([]);
      await db.setMetadata("localStorageMigrated", false);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      globalThis.localStorage = {
        getItem(key) {
          if (key === "cylindersData") {
            return JSON.stringify([validCylinder()]);
          }

          if (key === "downloadedPages") {
            return "{invalid-json";
          }

          return null;
        },
      };

      try {
        const result = await db.migrateLocalStorage();

        expect(result.migrated).toBe(true);
        expect(result.recordCount).toBe(1);
        expect(await db.getMetadata("downloadedPages")).toEqual([]);
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("should ignore invalid downloaded-page values", async () => {
      await db.replaceAllCylinders([]);
      await db.setMetadata("localStorageMigrated", false);

      globalThis.localStorage = {
        getItem(key) {
          if (key === "cylindersData") {
            return JSON.stringify([validCylinder()]);
          }

          if (key === "downloadedPages") {
            return JSON.stringify([1, 0, -2, "3"]);
          }

          return null;
        },
      };

      const result = await db.migrateLocalStorage();

      expect(result.migrated).toBe(true);
      expect(await db.getMetadata("downloadedPages")).toEqual([]);
    });

    it("should reject when the migration metadata request fails", async () => {
      const mockError = new Error("Migration metadata read failed");

      const mockRequest = {
        result: undefined,
        error: mockError,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: vi.fn(),
        objectStore: vi.fn(() => ({
          get: vi.fn(() => mockRequest),
          getAll: vi.fn(),
          add: vi.fn(),
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: { contains: () => true },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", { open: vi.fn(() => openRequest) });

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.migrateLocalStorage();

        openRequest.onsuccess();

        await Promise.resolve();

        expect(mockRequest.onerror).toBeTypeOf("function");

        mockRequest.onerror();

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "Migration metadata read failed"
        );

        expect(mockTransaction.abort).toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject when the migration cylinder read request fails", async () => {
      const mockError = new Error("Migration cylinder read failed");

      const metadataRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
      };

      const recordsRequest = {
        result: [],
        error: mockError,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: vi.fn(),
        objectStore: vi.fn((storeName) => {
          if (storeName === "metadata") {
            return {
              get: vi.fn(() => metadataRequest),
              put: vi.fn(),
            };
          }

          return {
            getAll: vi.fn(() => recordsRequest),
            add: vi.fn(),
          };
        }),
      };

      const mockDatabase = {
        objectStoreNames: { contains: () => true },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", { open: vi.fn(() => openRequest) });

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.migrateLocalStorage();

        openRequest.onsuccess();

        await Promise.resolve();

        metadataRequest.onsuccess();

        expect(recordsRequest.onerror).toBeTypeOf("function");

        recordsRequest.onerror();

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "Migration cylinder read failed"
        );

        expect(mockTransaction.abort).toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject with a fallback error when migration transaction fails", async () => {
      const metadataRequest = {
        result: { value: true },
        error: null,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: vi.fn(),
        objectStore: vi.fn(() => ({
          get: vi.fn(() => metadataRequest),
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: { contains: () => true },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", { open: vi.fn(() => openRequest) });

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.migrateLocalStorage();

        openRequest.onsuccess();

        await Promise.resolve();

        metadataRequest.onsuccess();

        expect(mockTransaction.onerror).toBeTypeOf("function");

        mockTransaction.onerror();

        await expect(operation).rejects.toThrow(
          "LocalStorage migration failed."
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("should reject with a fallback error when migration transaction is aborted", async () => {
      const metadataRequest = {
        result: { value: true },
        error: null,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: vi.fn(),
        objectStore: vi.fn(() => ({
          get: vi.fn(() => metadataRequest),
          put: vi.fn(),
        })),
      };

      const mockDatabase = {
        objectStoreNames: { contains: () => true },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      try {
        await vi.resetModules();
        vi.stubGlobal("indexedDB", { open: vi.fn(() => openRequest) });

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.migrateLocalStorage();

        openRequest.onsuccess();

        await Promise.resolve();

        metadataRequest.onsuccess();

        expect(mockTransaction.onabort).toBeTypeOf("function");

        mockTransaction.onabort();

        await expect(operation).rejects.toThrow(
          "LocalStorage migration was aborted."
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
    
    it("should reject when a cylinder insert request fails during migration", async () => {
      const mockError = new Error("Migration cylinder insert failed");

      const metadataRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
      };

      const recordsRequest = {
        result: [],
        error: null,
        onsuccess: null,
        onerror: null,
      };

      const insertRequest = {
        error: mockError,
        onsuccess: null,
        onerror: null,
      };

      const mockTransaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort: vi.fn(),
        objectStore: vi.fn((storeName) => {
          if (storeName === "metadata") {
            return {
              get: vi.fn(() => metadataRequest),
              put: vi.fn(() => ({
                onsuccess: null,
                onerror: null,
              })),
            };
          }

          return {
            getAll: vi.fn(() => recordsRequest),
            add: vi.fn(() => insertRequest),
          };
        }),
      };

      const mockDatabase = {
        objectStoreNames: { contains: () => true },
        close: vi.fn(),
        transaction: vi.fn(() => mockTransaction),
      };

      const openRequest = {
        result: mockDatabase,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null,
      };

      try {
        await vi.resetModules();

        vi.stubGlobal("indexedDB", {
          open: vi.fn(() => openRequest),
        });

        vi.stubGlobal("localStorage", {
          getItem: vi.fn((key) =>
            key === "cylindersData"
              ? JSON.stringify([validCylinder()])
              : null
          ),
        });

        const isolatedDb = await import("../js/db.js");

        const operation = isolatedDb.migrateLocalStorage();

        openRequest.onsuccess();

        await Promise.resolve();

        // Trigger the migration metadata read.
        metadataRequest.onsuccess();

        // Trigger the existing cylinder records read.
        recordsRequest.onsuccess();

        // Confirm that the insert operation was attempted.
        expect(mockTransaction.objectStore).toHaveBeenCalled();

        // Simulate the failed write causing a transaction abort.
        mockTransaction.error = mockError;

        mockTransaction.onabort();

        await expect(operation).rejects.toThrow(
          "Migration cylinder insert failed"
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
