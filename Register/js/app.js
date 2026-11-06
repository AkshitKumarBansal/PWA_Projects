import { getAllCylinders, migrateLocalStorage, transactCylinders, isValidCylinder } from './db.js';
import { registerInitialStock, processCylinderAction, getTodayDate } from './modules/cylinderService.js';

import {
    exportJSONBackup,
    importJSONBackup,
    exportCSV,
    exportCompletedPagesIfReady
} from './modules/backup.js';

const ROWS_PER_PAGE = 50;

console.log("Hello");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

function formatValue(value) {
  return value ? escapeHtml(value) : "-";
}

/**
 * Returns the latest record for a cylinder.
 * Uses the highest ID instead of assuming array order.
 */
function getLatestCylinder(cylinders, cylinderNumber) {
  const normalizedNumber = String(cylinderNumber ?? "")
    .trim()
    .toUpperCase();

  return cylinders
    .filter(
      (c) =>
        String(c.cylNum ?? "")
          .trim()
          .toUpperCase() === normalizedNumber,
    )
    .reduce((latest, current) => {
      if (!latest) return current;

      return Number(current.id || 0) >= Number(latest.id || 0)
        ? current
        : latest;
    }, null);
}

// --------------------------------------------------
// 2. STATUS STYLING
// --------------------------------------------------

function getStatusClasses(status) {
  const styles = {
    "In Shop": "bg-blue-100 text-blue-700",
    "With Customer": "bg-orange-100 text-orange-700",
    "Returned to Shop": "bg-yellow-100 text-yellow-800",
    "Sent for Refilling": "bg-purple-100 text-purple-700",
    Completed: "bg-gray-100 text-gray-600",
  };

  return styles[status] || "bg-gray-100 text-gray-700";
}

function getFillClasses(fillLevel) {
  switch (fillLevel) {
    case "Full":
      return "text-green-700 font-semibold";

    case "Half":
      return "text-yellow-700 font-semibold";

    case "Empty":
      return "text-red-600 font-semibold";

    default:
      return "text-gray-600";
  }
}

// --------------------------------------------------
// 3. UPDATE CYLINDER FORM
// --------------------------------------------------


export function updateFormForCylinder(cylinders, cylinderNumber) {
    // ----------------------------------------------
    // 1. GET DOM ELEMENTS
    // ----------------------------------------------

    const initialStockDiv = document.getElementById('initialStockDiv');
    const initialFillLevel = document.getElementById('initialFillLevel');
    const initialRefillDate = document.getElementById('initialRefillDate');

    const customerDiv = document.getElementById('customerInputDiv');
    const returnDiv = document.getElementById('returnStatusDiv');
    const halfReturnDiv = document.getElementById('halfReturnActionDiv');

    const gasSelect = document.getElementById('gasType');
    const customerInput = document.getElementById('customerName');
    const returnFillLevel = document.getElementById('returnFillLevel');
    const halfReturnAction = document.getElementById('halfReturnAction');

    const submitBtn = document.getElementById('submitBtn');

    // Required elements must exist.
    if (!customerDiv || !returnDiv || !submitBtn) {
        return;
    }

    // ----------------------------------------------
    // 2. NORMALIZE CYLINDER NUMBER
    // ----------------------------------------------

    const normalizedNumber = String(cylinderNumber ?? '')
        .trim()
        .toUpperCase();

    // ----------------------------------------------
    // 3. RESET UI AND VALIDATION
    // ----------------------------------------------

    customerDiv.classList.add('hidden');
    returnDiv.classList.add('hidden');
    halfReturnDiv?.classList.add('hidden');
    initialStockDiv?.classList.add('hidden');

    if (gasSelect) {
        gasSelect.disabled = false;
    }

    if (customerInput) {
        customerInput.required = false;
    }

    if (returnFillLevel) {
        returnFillLevel.required = false;
    }

    if (initialFillLevel) {
        initialFillLevel.required = false;
    }

    if (initialRefillDate) {
        initialRefillDate.required = false;
    }

    // ----------------------------------------------
    // 4. NO CYLINDER NUMBER ENTERED
    // ----------------------------------------------

    if (!normalizedNumber) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enter Cylinder Number';

        submitBtn.className =
            'mt-4 w-full bg-gray-400 text-white p-2 rounded font-bold cursor-not-allowed';

        return;
    }

    // ----------------------------------------------
    // 5. FIND EXISTING CYLINDER
    // ----------------------------------------------

    const latest = getLatestCylinder(cylinders, normalizedNumber);

    // ----------------------------------------------
    // 6. NEW CYLINDER: INITIAL STOCK REGISTRATION
    // ----------------------------------------------

    if (!latest) {
        initialStockDiv?.classList.remove('hidden');

        // Allow gas type selection for new cylinders.
        if (gasSelect) {
            gasSelect.disabled = false;
        }

        // Initial fill level is mandatory.
        if (initialFillLevel) {
            initialFillLevel.required = true;
        }

        // Initial refill date is mandatory.
        if (initialRefillDate) {
            initialRefillDate.required = true;
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Register Initial Stock';

        submitBtn.className =
            'mt-4 w-full bg-blue-600 text-white p-2 rounded font-bold shadow hover:bg-blue-700 transition';

        return;
    }

    // ----------------------------------------------
    // 7. EXISTING CYLINDER
    // ----------------------------------------------

    // Use the registered gas type.
    if (gasSelect) {
        gasSelect.value = latest.gasType || '';
        gasSelect.disabled = true;
    }

    submitBtn.disabled = false;

    // ----------------------------------------------
    // 8. IN SHOP: DISPATCH TO CUSTOMER
    // ----------------------------------------------

    if (latest.status === 'In Shop') {
        customerDiv.classList.remove('hidden');

        if (customerInput) {
            customerInput.required = true;
        }

        submitBtn.textContent = 'Send to Customer';

        submitBtn.className =
            'mt-4 w-full bg-orange-500 text-white p-2 rounded font-bold shadow hover:bg-orange-600 transition';

        return;
    }

    // ----------------------------------------------
    // 9. WITH CUSTOMER: CONFIRM CUSTOMER RETURN
    // ----------------------------------------------

    if (latest.status === 'With Customer') {
        returnDiv.classList.remove('hidden');

        if (returnFillLevel) {
            returnFillLevel.required = true;

            const updateHalfVisibility = () => {
                const isHalf = returnFillLevel.value === 'Half';

                halfReturnDiv?.classList.toggle('hidden', !isHalf);

                if (!isHalf && halfReturnAction) {
                    halfReturnAction.value = '';
                }
            };

            updateHalfVisibility();
        }

        submitBtn.textContent = 'Confirm Return';

        submitBtn.className =
            'mt-4 w-full bg-green-600 text-white p-2 rounded font-bold shadow hover:bg-green-700 transition';

        return;
    }

    // ----------------------------------------------
    // 10. RETURNED TO SHOP: SUPPLIER DISPATCH REQUIRED
    // ----------------------------------------------

    if (latest.status === 'Returned to Shop') {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Send Through Supplier Operations';

        submitBtn.className =
            'mt-4 w-full bg-yellow-500 text-white p-2 rounded font-bold cursor-not-allowed';

        return;
    }

    // ----------------------------------------------
    // 11. SENT FOR REFILLING: WAIT FOR SUPPLIER
    // ----------------------------------------------

    if (latest.status === 'Sent for Refilling') {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Waiting for Supplier Return';

        submitBtn.className =
            'mt-4 w-full bg-purple-500 text-white p-2 rounded font-bold cursor-not-allowed';

        return;
    }

    // ----------------------------------------------
    // 12. COMPLETED: NO FURTHER OPERATIONS
    // ----------------------------------------------

    if (latest.status === 'Completed') {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Completed Record';

        submitBtn.className =
            'mt-4 w-full bg-gray-400 text-white p-2 rounded font-bold cursor-not-allowed';

        return;
    }

    // ----------------------------------------------
    // 13. UNKNOWN STATUS
    // ----------------------------------------------

    submitBtn.disabled = true;
    submitBtn.textContent = 'Unsupported Cylinder Status';

    submitBtn.className =
        'mt-4 w-full bg-gray-400 text-white p-2 rounded font-bold cursor-not-allowed';
}

// --------------------------------------------------
// 4. SEARCH FILTER
// --------------------------------------------------

function filterCylinders(cylinders, searchTerm, searchColumn) {
  const term = String(searchTerm ?? "")
    .trim()
    .toLowerCase();

  if (!term) return [...cylinders];

  return cylinders.filter((row) => {
    const searchableFields = {
      cylNum: row.cylNum,
      gasType: row.gasType,
      fillLevel: row.fillLevel || "Full",
      customer: row.customer,
      status: row.status,
      refillDate: row.refillDate,
      dateSent: row.dateSent,
      dateReturned: row.dateReturned,
      nextRefillDate: row.nextRefillDate,
      supplierSentDate: row.supplierSentDate,
      supplierReturnedDate: row.supplierReturnedDate,
    };

    if (searchColumn === "all") {
      return Object.values(searchableFields).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      );
    }

    return String(searchableFields[searchColumn] ?? "")
      .toLowerCase()
      .includes(term);
  });
}

// --------------------------------------------------
// 5. RENDER TABLE
// --------------------------------------------------

export function renderTable({
  cylinders = [],
  searchTerm = "",
  searchColumn = "all",
  currentPage = 1,
}) {
  const tbody = document.getElementById("tableBody");
  const pageInfo = document.getElementById("pageInfo");
  const prevButton = document.getElementById("prevPageBtn");
  const nextButton = document.getElementById("nextPageBtn");

  if (!tbody) {
    throw new Error("Table body element #tableBody was not found.");
  }

  // Filter records.
  const filteredData = filterCylinders(cylinders, searchTerm, searchColumn);

  // Newest record first.
  filteredData.sort((a, b) => {
    return Number(b.id || 0) - Number(a.id || 0);
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredData.length / ROWS_PER_PAGE),
  );

  currentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);

  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;

  const paginatedData = filteredData.slice(
    startIndex,
    startIndex + ROWS_PER_PAGE,
  );

  // Clear existing rows.
  tbody.innerHTML = "";

  if (paginatedData.length === 0) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
            <td colspan="9"
                class="p-5 text-center text-gray-500">
                No cylinder records found.
            </td>
        `;

    tbody.appendChild(tr);
  }

  // Render each record.
  paginatedData.forEach((row) => {
    const status = row.status || "Unknown";
    const fillLevel = row.fillLevel || "Full";

    const statusClasses = getStatusClasses(status);
    const fillClasses = getFillClasses(fillLevel);

    const supplierDetails = [];

    if (row.supplierSentDate) {
      supplierDetails.push(
        `Supplier sent: ${escapeHtml(row.supplierSentDate)}`,
      );
    }

    if (row.supplierReturnedDate) {
      supplierDetails.push(
        `Supplier returned: ${escapeHtml(row.supplierReturnedDate)}`,
      );
    }

    const supplierInfo = supplierDetails.length
      ? `<div class="text-xs text-gray-500 mt-1">${supplierDetails.join("<br>")}</div>`
      : "";

    const tr = document.createElement("tr");

    tr.className = "border-b text-sm bg-white hover:bg-gray-50 transition";

    tr.innerHTML = `
            <td class="p-3 border-r font-bold">
                ${formatValue(row.cylNum)}
            </td>

            <td class="p-3 border-r">
                ${formatValue(row.gasType)}
            </td>

            <td class="p-3 border-r">
                <span class="${fillClasses}">
                    ${escapeHtml(fillLevel)}
                </span>
            </td>

            <td class="p-3 border-r">
                ${formatValue(row.refillDate)}
                ${supplierInfo}
            </td>

            <td class="p-3 border-r">
                ${formatValue(row.customer)}
            </td>

            <td class="p-3 border-r">
                ${formatValue(row.dateSent)}
            </td>

            <td class="p-3 border-r">
                ${formatValue(row.dateReturned)}
            </td>

            <td class="p-3 border-r">
                ${formatValue(row.nextRefillDate)}
            </td>

            <td class="p-3 font-bold">
                <span class="inline-block px-2 py-1 rounded text-xs ${statusClasses}">
                    ${escapeHtml(status)}
                </span>
            </td>
        `;

    tbody.appendChild(tr);
  });

  // Update pagination.
  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${filteredData.length} records)`;
  }

  if (prevButton) {
    prevButton.disabled = currentPage === 1;
    prevButton.classList.toggle("opacity-50", prevButton.disabled);
    prevButton.classList.toggle("cursor-not-allowed", prevButton.disabled);
  }

  if (nextButton) {
    nextButton.disabled = currentPage === totalPages;
    nextButton.classList.toggle("opacity-50", nextButton.disabled);
    nextButton.classList.toggle("cursor-not-allowed", nextButton.disabled);
  }

  return {
    currentPage,
    totalPages,
    totalRecords: filteredData.length,
  };
}

// --------------------------------------------------
// APPLICATION CONTROLLER / BOOTSTRAP
// --------------------------------------------------

let cylinders = [];
let currentPage = 1;
let isSubmitting = false;

function el(id) {
  return document.getElementById(id);
}

function showMessage(message, isError = false) {
  let node = el("appMessage");
  if (!node) {
    node = document.createElement("div");
    node.id = "appMessage";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    document.querySelector("h1")?.insertAdjacentElement("afterend", node);
  }
  node.className = isError
    ? "mb-4 p-3 rounded bg-red-100 text-red-700"
    : "mb-4 p-3 rounded bg-green-100 text-green-700";
  node.textContent = message;
}

function renderCurrentPage() {
  const result = renderTable({
    cylinders,
    searchTerm: el("searchInput")?.value || "",
    searchColumn: el("searchColumn")?.value || "all",
    currentPage,
  });
  currentPage = result.currentPage;
}

async function refreshCylinders(resetPage = false) {
  cylinders = await getAllCylinders();
  if (resetPage) currentPage = 1;
  renderCurrentPage();
  updateFormForCylinder(cylinders, el("cylNum")?.value || "");
}

// async function registerInitialCylinder(cylNum, gasType) {
//   const number = cylNum.trim().toUpperCase();
//   const today = getTodayDate();

//   const result = await transactCylinders((records) => {
//     if (records.some((r) => r.cylNum.trim().toUpperCase() === number)) {
//       throw new Error("This cylinder number is already registered.");
//     }

//     const record = {
//       cylNum: number,
//       gasType,
//       fillLevel: "Full",
//       refillDate: today,
//       customer: "",
//       dateSent: "",
//       dateReturned: "",
//       nextRefillDate: "",
//       supplierSentDate: "",
//       supplierReturnedDate: "",
//       status: "In Shop",
//     };

//     if (!isValidCylinder(record))
//       throw new Error("Initial cylinder data is invalid.");

//     return {
//       updates: [],
//       inserts: [record],
//       value: "Initial cylinder stock registered successfully.",
//     };
//   });

//   return result.value;
// }

async function handleCylinderSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return;

  const cylNum = el("cylNum")?.value || "";
  const gasType = el("gasType")?.value || "";
  if (!cylNum.trim())
    return showMessage("Please enter a cylinder number.", true);

  isSubmitting = true;
  const button = el("submitBtn");
  if (button) button.disabled = true;

  try {
    const latest = getLatestCylinder(cylinders, cylNum);
    let message;

    if (!latest) {
      const result = await registerInitialStock({
        cylNum,
        gasType,
        fillLevel: el("initialFillLevel")?.value || "",
        refillDate: el("initialRefillDate")?.value || "",
      });
      message = result.value;
    } else {
      const action =
        latest.status === "In Shop"
          ? "customer-dispatch"
          : latest.status === "With Customer"
            ? "customer-return"
            : null;

      if (!action)
        throw new Error(
          `No customer operation is available for status "${latest.status}".`,
        );

      const result = await processCylinderAction({
        cylNum,
        gasType: latest.gasType,
        customerName: el("customerName")?.value || "",
        returnFillLevel: el("returnFillLevel")?.value || "",
        halfReturnAction: el("halfReturnAction")?.value || "",
        action,
      });
      message = result.value;
    }

    showMessage(message);
    el("cylinderForm")?.reset();
    await refreshCylinders(true);

    try {
      await exportCompletedPagesIfReady(cylinders);
    } catch (error) {
      console.warn("Automatic CSV export failed:", error);
    }
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Cylinder operation failed.", true);
  } finally {
    isSubmitting = false;
    if (button) button.disabled = false;
    updateFormForCylinder(cylinders, el("cylNum")?.value || "");
  }
}

async function handleSupplierAction(action) {
  const cylNum = el("supplierCylinderNumber")?.value || "";
  if (!cylNum.trim()) return showMessage("Enter a cylinder number.", true);

  try {
    const result = await processCylinderAction({ cylNum, action });
    showMessage(result.value);
    el("supplierCylinderNumber").value = "";
    await refreshCylinders(true);
    try {
      await exportCompletedPagesIfReady(cylinders);
    } catch (error) {
      console.warn("Automatic CSV export failed:", error);
    }
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Supplier operation failed.", true);
  }
}

function bindEvents() {
  el("cylinderForm")?.addEventListener("submit", handleCylinderSubmit);

  el("cylNum")?.addEventListener("input", (event) => {
    updateFormForCylinder(cylinders, event.currentTarget.value);
  });

  el("returnFillLevel")?.addEventListener("change", (event) => {
    const isHalf = event.currentTarget.value === "Half";
    el("halfReturnActionDiv")?.classList.toggle("hidden", !isHalf);
    if (!isHalf && el("halfReturnAction")) el("halfReturnAction").value = "";
  });

  const search = () => {
    currentPage = 1;
    renderCurrentPage();
  };
  el("searchInput")?.addEventListener("input", search);
  el("searchColumn")?.addEventListener("change", search);

  el("prevPageBtn")?.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    renderCurrentPage();
  });
  el("nextPageBtn")?.addEventListener("click", () => {
    currentPage += 1;
    renderCurrentPage();
  });

  el("sendToSupplierBtn")?.addEventListener("click", () =>
    handleSupplierAction("supplier-dispatch"),
  );
  el("supplierReturnBtn")?.addEventListener("click", () =>
    handleSupplierAction("supplier-return"),
  );

  el("exportBtn")?.addEventListener("click", async () => {
    try {
      await exportJSONBackup();
      showMessage("JSON backup export started.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  el("exportCsvBtn")?.addEventListener("click", async () => {
    try {
      await exportCSV();
      showMessage("CSV export started.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  el("importBtn")?.addEventListener("click", () => el("importFile")?.click());
  el("importFile")?.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const restored = await importJSONBackup(file);
      if (restored) {
        showMessage(`Restored ${restored.length} cylinder records.`);
        await refreshCylinders(true);
      }
    } catch (error) {
      console.error(error);
      showMessage(error.message || "Backup restore failed.", true);
    } finally {
      input.value = "";
    }
  });
}

async function initializeApplication() {
  try {
    await migrateLocalStorage();
    bindEvents();
    await refreshCylinders(true);
    console.info("Cylinder Register initialized.");
  } catch (error) {
    console.error("Application initialization failed:", error);
    showMessage(`Application could not start: ${error.message}`, true);
    if (el("submitBtn")) el("submitBtn").disabled = true;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApplication, {
    once: true,
  });
} else {
  initializeApplication();
}
