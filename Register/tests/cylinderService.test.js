import { describe, it, expect, vi, beforeEach } from "vitest";

// Initialize mocks before module imports.
const mocks = vi.hoisted(() => ({
  getAllCylinders: vi.fn(),
  transactCylinders: vi.fn(),
  isValidCylinder: vi.fn(() => true),
}));

// Mock the actual database module.
vi.mock("../js/db.js", () => ({
  getAllCylinders: mocks.getAllCylinders,
  transactCylinders: mocks.transactCylinders,
  isValidCylinder: mocks.isValidCylinder,
}));

import {
  getTodayDate,
  loadCylinders,
  processCylinderAction,
} from "../js/modules/cylinderService.js";

// Reset mocks before each test.
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Cylinder Service Tests", () => {
  // =========================================
  // 1. DATE TESTS
  // =========================================

  describe("getTodayDate()", () => {
    it("should return date in YYYY-MM-DD format", () => {
      const result = getTodayDate();

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should return the correct local date", () => {
      const now = new Date();

      const expected = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      expect(getTodayDate()).toBe(expected);
    });
  });

  // =========================================
  // 2. LOAD CYLINDER TESTS
  // =========================================

  describe("loadCylinders()", () => {
    it("should retrieve and sort cylinders by ID", async () => {
      mocks.getAllCylinders.mockResolvedValue([
        { id: 3, cylNum: "O2-103" },
        { id: 1, cylNum: "O2-101" },
        { id: 2, cylNum: "O2-102" },
      ]);

      const result = await loadCylinders();

      expect(result.map((c) => c.id)).toEqual([1, 2, 3]);
    });

    it("should return an empty array when no cylinders exist", async () => {
      mocks.getAllCylinders.mockResolvedValue([]);

      const result = await loadCylinders();

      expect(result).toEqual([]);
    });

    it("should propagate database errors", async () => {
      mocks.getAllCylinders.mockRejectedValue(
        new Error("Database unavailable"),
      );

      await expect(loadCylinders()).rejects.toThrow("Database unavailable");
    });
  });

  // =========================================
  // 3. CYLINDER INPUT TESTS
  // =========================================

  describe("processCylinderAction() input validation", () => {
    it("should reject an empty cylinder number", async () => {
      await expect(
        processCylinderAction({
          cylNum: "",
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("Please enter a valid cylinder number.");

      expect(mocks.transactCylinders).not.toHaveBeenCalled();
    });

    it("should reject a whitespace-only cylinder number", async () => {
      await expect(
        processCylinderAction({
          cylNum: "   ",
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("Please enter a valid cylinder number.");
    });

    it("should reject an unregistered cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("This cylinder is not registered.");
    });
  });

  // =========================================
  // 4. CUSTOMER DISPATCH TESTS
  // =========================================

  describe("Customer Dispatch", () => {
    const cylinder = {
      id: 1,
      cylNum: "O2-101",
      gasType: "O2",
      fillLevel: "Full",
      refillDate: "2026-10-20",
      customer: "",
      dateSent: "",
      dateReturned: "",
      status: "In Shop",
    };

    it("should successfully dispatch a Full cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        customerName: "ABC Hospital",
        action: "customer-dispatch",
      });

      expect(result.updates[0].status).toBe("With Customer");
      expect(result.updates[0].customer).toBe("ABC Hospital");
      expect(result.updates[0].dateSent).toBe(getTodayDate());
    });

    it("should successfully dispatch a Half cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, fillLevel: "Half" }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        customerName: "ABC Hospital",
        action: "customer-dispatch",
      });

      expect(result.updates[0].status).toBe("With Customer");
    });

    it("should reject dispatch of an Empty cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, fillLevel: "Empty" }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          customerName: "ABC Hospital",
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("This cylinder is empty.");
    });

    it("should reject dispatch without customer name", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("Please enter the customer name.");
    });

    it("should reject dispatch when cylinder is already with customer", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, status: "With Customer" }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          customerName: "ABC Hospital",
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("Only cylinders available in the shop");
    });
  });
  // =========================================
  // 5. CUSTOMER RETURN TESTS
  // =========================================

  describe("Customer Return", () => {
    const cylinder = {
      id: 1,
      cylNum: "O2-101",
      gasType: "O2",
      fillLevel: "Full",
      refillDate: "2026-10-20",
      customer: "ABC Hospital",
      dateSent: "2026-11-01",
      dateReturned: "",
      status: "With Customer",
    };

    it("should return an Empty cylinder to shop processing", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "customer-return",
        returnFillLevel: "Empty",
      });

      expect(result.updates[0].status).toBe("Completed");
      expect(result.inserts).toHaveLength(1);

      expect(result.inserts[0].status).toBe("Returned to Shop");
      expect(result.inserts[0].fillLevel).toBe("Empty");
    });

    it("should make a Half cylinder available when selected", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "customer-return",
        returnFillLevel: "Half",
        halfReturnAction: "available",
      });

      expect(result.updates[0].status).toBe("Completed");
      expect(result.inserts[0].status).toBe("In Shop");
      expect(result.inserts[0].fillLevel).toBe("Half");
    });

    it("should send a Half cylinder for refilling when selected", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "customer-return",
        returnFillLevel: "Half",
        halfReturnAction: "send-for-refill",
      });

      expect(result.inserts[0].status).toBe("Returned to Shop");
    });

    it("should make a Full returned cylinder available", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "customer-return",
        returnFillLevel: "Full",
      });

      expect(result.updates[0].status).toBe("Completed");
      expect(result.inserts[0].status).toBe("In Shop");
      expect(result.inserts[0].fillLevel).toBe("Full");
    });

    it("should reject a Half return without a decision", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "customer-return",
          returnFillLevel: "Half",
        }),
      ).rejects.toThrow("For a half-filled cylinder, choose whether");
    });

    it("should reject a return without fill level", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "customer-return",
        }),
      ).rejects.toThrow("Please select the returned cylinder fill level.");
    });

    it("should preserve the previous actual refill date", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "customer-return",
        returnFillLevel: "Full",
      });

      expect(result.inserts[0].refillDate).toBe("2026-10-20");
    });
  });

  // =========================================
  // 6. SUPPLIER DISPATCH TESTS
  // =========================================

  describe("Supplier Dispatch", () => {
    const cylinder = {
      id: 2,
      cylNum: "O2-101",
      gasType: "O2",
      fillLevel: "Empty",
      refillDate: "2026-10-20",
      status: "Returned to Shop",
    };

    it("should successfully dispatch an Empty cylinder to supplier", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "supplier-dispatch",
      });

      expect(result.updates[0].status).toBe("Sent for Refilling");
      expect(result.updates[0].supplierSentDate).toBe(getTodayDate());
    });

    it("should reject supplier dispatch of a Full cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, fillLevel: "Full" }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "supplier-dispatch",
        }),
      ).rejects.toThrow("This cylinder is already full.");
    });

    it("should reject supplier dispatch of an In Shop cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, status: "In Shop" }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "supplier-dispatch",
        }),
      ).rejects.toThrow("Only cylinders returned to the shop");
    });
  });

  // =========================================
  // 7. SUPPLIER RETURN TESTS
  // =========================================

  describe("Supplier Return", () => {
    const cylinder = {
      id: 2,
      cylNum: "O2-101",
      gasType: "O2",
      fillLevel: "Empty",
      refillDate: "2026-10-20",
      status: "Sent for Refilling",
      supplierSentDate: "2026-11-03",
      supplierReturnedDate: "",
    };

    it("should successfully receive a refilled cylinder", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        action: "supplier-return",
      });

      expect(result.updates[0].status).toBe("In Shop");
      expect(result.updates[0].fillLevel).toBe("Full");
      expect(result.updates[0].supplierReturnedDate).toBe(getTodayDate());
      expect(result.updates[0].refillDate).toBe(getTodayDate());
    });

    it("should reject supplier return without dispatch date", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, supplierSentDate: "" }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "supplier-return",
        }),
      ).rejects.toThrow("Supplier dispatch date is missing.");
    });

    it("should reject supplier return when cylinder was not sent", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...cylinder, status: "In Shop" }]),
      );

      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          action: "supplier-return",
        }),
      ).rejects.toThrow("This cylinder has not been sent to the supplier");
    });
  });

  // =========================================
  // 8. ADDITIONAL EDGE CASES
  // =========================================

  describe("Additional validation and status branches", () => {
    const baseCylinder = {
      id: 10,
      cylNum: "O2-101",
      gasType: "O2",
      fillLevel: "Full",
      refillDate: "2026-10-20",
      customer: "",
      dateSent: "",
      dateReturned: "",
      status: "In Shop",
      supplierSentDate: "",
      supplierReturnedDate: "",
    };

    const runWith = (record, input) => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...record }]),
      );
      return processCylinderAction({
        cylNum: "O2-101",
        ...input,
      });
    };

    it("should reject a non-string cylinder number", async () => {
      await expect(
        processCylinderAction({
          cylNum: 123,
          action: "customer-dispatch",
        }),
      ).rejects.toThrow("Please enter a valid cylinder number.");

      expect(mocks.transactCylinders).not.toHaveBeenCalled();
    });

    it("should reject an unsupported return fill level before starting a transaction", async () => {
      await expect(
        processCylinderAction({
          cylNum: "O2-101",
          returnFillLevel: "Quarter",
          action: "customer-return",
        }),
      ).rejects.toThrow("Invalid cylinder fill level.");

      expect(mocks.transactCylinders).not.toHaveBeenCalled();
    });

    it("should normalize cylinder number and trim customer name", async () => {
      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([{ ...baseCylinder }]),
      );

      const result = await processCylinderAction({
        cylNum: "  o2-101  ",
        customerName: "  ABC Hospital  ",
        action: "customer-dispatch",
      });

      expect(result.updates[0].cylNum).toBe("O2-101");
      expect(result.updates[0].customer).toBe("ABC Hospital");
    });

    it("should use the default action to dispatch a cylinder in shop", async () => {
      const result = await runWith(baseCylinder, {
        customerName: "ABC Hospital",
      });

      expect(result.updates[0].status).toBe("With Customer");
    });

    it("should use the default action to return a cylinder with a customer", async () => {
      const result = await runWith(
        { ...baseCylinder, status: "With Customer", customer: "ABC Hospital" },
        { returnFillLevel: "Full" },
      );

      expect(result.updates[0].status).toBe("Completed");
      expect(result.inserts[0].status).toBe("In Shop");
    });

    it("should reject customer return when the cylinder is not with a customer", async () => {
      await expect(
        runWith(baseCylinder, {
          action: "customer-return",
          returnFillLevel: "Full",
        }),
      ).rejects.toThrow("This cylinder is not currently with a customer.");
    });

    it("should reject an unsupported half-return action", async () => {
      await expect(
        runWith(
          { ...baseCylinder, status: "With Customer" },
          {
            action: "customer-return",
            returnFillLevel: "Half",
            halfReturnAction: "invalid",
          },
        ),
      ).rejects.toThrow("For a half-filled cylinder, choose whether");
    });

    it("should reject supplier dispatch when the cylinder is with a customer", async () => {
      await expect(
        runWith(
          { ...baseCylinder, status: "With Customer" },
          { action: "supplier-dispatch" },
        ),
      ).rejects.toThrow("Only cylinders returned to the shop can be sent");
    });

    it("should reject supplier return when the cylinder is not with the supplier", async () => {
      await expect(
        runWith(baseCylinder, { action: "supplier-return" }),
      ).rejects.toThrow("This cylinder has not been sent to the supplier");
    });

    it("should block customer dispatch while the cylinder is with the supplier", async () => {
      await expect(
        runWith(
          { ...baseCylinder, status: "Sent for Refilling" },
          {
            action: "unknown-action",
            customerName: "ABC Hospital",
          },
        ),
      ).rejects.toThrow("This cylinder is currently with the supplier.");
    });

    it("should block customer dispatch while the cylinder awaits processing", async () => {
      await expect(
        runWith(
          { ...baseCylinder, status: "Returned to Shop", fillLevel: "Empty" },
          {
            action: "unknown-action",
            customerName: "ABC Hospital",
          },
        ),
      ).rejects.toThrow("This cylinder is awaiting processing.");
    });

    it("should reject actions on completed historical records", async () => {
      await expect(
        runWith(
          { ...baseCylinder, status: "Completed" },
          { action: "some-unknown-action" },
        ),
      ).rejects.toThrow("This is a completed historical record.");
    });

    it("should report unsupported statuses", async () => {
      await expect(
        runWith(
          { ...baseCylinder, status: "Quarantined" },
          { action: "some-unknown-action" },
        ),
      ).rejects.toThrow(
        "Unsupported cylinder operation for status: Quarantined",
      );
    });

    it("should select the latest cylinder record when multiple historical records exist", async () => {
      const olderRecord = {
        id: 10,
        cylNum: "O2-101",
        gasType: "O2",
        fillLevel: "Empty",
        refillDate: "2026-10-20",
        customer: "",
        dateSent: "",
        dateReturned: "",
        status: "Completed",
        supplierSentDate: "",
        supplierReturnedDate: "",
      };

      const latestRecord = {
        id: 20,
        cylNum: "O2-101",
        gasType: "O2",
        fillLevel: "Full",
        refillDate: "2026-11-01",
        customer: "",
        dateSent: "",
        dateReturned: "",
        status: "In Shop",
        supplierSentDate: "",
        supplierReturnedDate: "",
      };

      mocks.transactCylinders.mockImplementation(async (callback) =>
        callback([olderRecord, latestRecord]),
      );

      const result = await processCylinderAction({
        cylNum: "O2-101",
        customerName: "ABC Hospital",
        action: "customer-dispatch",
      });

      expect(result.updates).toHaveLength(1);
      expect(result.updates[0].id).toBe(20);
      expect(result.updates[0].status).toBe("With Customer");
    });
  });
});
