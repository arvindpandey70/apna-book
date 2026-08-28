const express = require("express");
const router = express.Router();
const db = require("../db");

const { getFinancialYear } = require("../utils/financialYear");
const { generateVoucherNumber, renumberVouchers } = require("../utils/generateVoucherNumber");

// =========================================
// PURCHASE EXCEL IMPORT (JSON DATA)
// =========================================

router.post("/purchase_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;
        console.log("rows", rows, companyId, ownerType, ownerId);

        // ================= VALIDATION =================

        if (!rows || !rows.length) {
            return res.status(400).json({
                success: false,
                message: "No data received",
            });
        }

        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // ================= LOAD MASTER DATA =================

        const [ledgers] = await db.execute(
            "SELECT id, name FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const [items] = await db.execute(
            "SELECT id, name FROM stock_items WHERE company_id=?",
            [companyId]
        );

        const ledgerMap = {};
        const itemMap = {};

        ledgers.forEach((l) => {
            ledgerMap[l.name.toLowerCase().trim()] = l.id;
        });

        items.forEach((i) => {
            itemMap[i.name.toLowerCase().trim()] = i.id;
        });

        // ================= GROUP BY DATE + SUPPLIER =================

        const groups = {};

        rows.forEach((row, i) => {
            const supplierName = row["Supplier Name"] ? String(row["Supplier Name"]).toLowerCase().trim() : "";
            const date = row.Date || "";

            if (!supplierName || !date) {
                errors.push(`Row ${i + 2}: Missing Date or Supplier Name`);
                return;
            }

            const key = date + "|" + supplierName;

            if (!groups[key]) {
                groups[key] = {
                    header: row,
                    items: [],
                    rowNos: [],
                };
            }

            groups[key].items.push(row);
            groups[key].rowNos.push(i + 2);
        });

        const errors = [];
        const saved = [];

        // ================= PROCESS EACH GROUP =================

        for (const key in groups) {
            const group = groups[key];
            const header = group.header;

            // ---------- SUPPLIER ----------

            const supplierName = header["Supplier Name"]
                .toLowerCase()
                .trim();

            const partyId = ledgerMap[supplierName];

            if (!partyId) {
                errors.push(`Supplier not found: ${header["Supplier Name"]}`);
                continue;
            }

            // ---------- PURCHASE LEDGER ----------

            const purchaseLedgerId =
                ledgerMap[header["Purchase Ledger"]?.toLowerCase().trim()];

            if (!purchaseLedgerId) {
                errors.push(`Purchase Ledger not found: ${header["Purchase Ledger"]}`);
                continue;
            }

            let subtotal = 0;
            let cgstTotal = 0;
            let sgstTotal = 0;
            let igstTotal = 0;

            const entries = [];

            // ---------- ITEMS LOOP ----------

            for (const row of group.items) {
                // Item

                const itemName = row["Item Name"]
                    .toLowerCase()
                    .trim();

                const itemId = itemMap[itemName];

                if (!itemId) {
                    errors.push(`Item not found: ${row["Item Name"]}`);
                    continue;
                }

                const qty = Number(row.Quantity || 0);
                const rate = Number(row.Rate || 0);
                const amount = Number(row.Amount || qty * rate);

                if (!qty || !rate) {
                    errors.push(`Invalid qty/rate: ${row["Item Name"]}`);
                    continue;
                }

                // ---------- GST ----------

                const cgst = +row["CGST Rate"] || 0;
                const sgst = +row["SGST Rate"] || 0;
                const igst = +row["IGST Rate"] || 0;

                // Rule: Either IGST or CGST+SGST

                if (igst && (cgst || sgst)) {
                    errors.push(`GST Error (Both) at ${row["Item Name"]}`);
                    continue;
                }

                if (!igst && (!cgst || !sgst)) {
                    errors.push(`GST Missing at ${row["Item Name"]}`);
                    continue;
                }

                subtotal += amount;

                if (igst) {
                    igstTotal += (amount * igst) / 100;
                } else {
                    cgstTotal += (amount * cgst) / 100;
                    sgstTotal += (amount * sgst) / 100;
                }

                // ---------- LEDGERS ----------

                const cgstLedgerId =
                    ledgerMap[row["CGST Ledger"]?.toLowerCase().trim()] || 0;

                const sgstLedgerId =
                    ledgerMap[row["SGST Ledger"]?.toLowerCase().trim()] || 0;

                const gstLedgerId =
                    ledgerMap[row["IGST Ledger"]?.toLowerCase().trim()] || 0;

                entries.push({
                    itemId,
                    quantity: qty,
                    rate,
                    amount,

                    cgstLedgerId,
                    sgstLedgerId,
                    gstLedgerId,

                    purchaseLedgerId,
                    batchNumber: row["Batch No"] ? String(row["Batch No"]).trim() : "",
                });
            }

            if (!entries.length) continue;

            // ---------- TOTAL ----------

            const total =
                subtotal + cgstTotal + sgstTotal + igstTotal;

            // ---------- GENERATE VOUCHER ----------

            const voucherNumber = await generateVoucherNumber({
                companyId,
                ownerType,
                ownerId,
                voucherType: "purchase",
                date: header.Date,
            });

            // ---------- SAVE HEADER ----------

            const [voucherResult] = await db.execute(
                `
        INSERT INTO purchase_vouchers (
          number, date, supplierInvoiceDate, narration, partyId, referenceNo,
          dispatchDocNo, dispatchThrough, destination, purchaseLedgerId,
          subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal, tdsTotal, total,
          company_id, owner_type, owner_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
                [
                    voucherNumber,
                    header.Date,
                    header.Date, // supplierInvoiceDate
                    header.Narration || "",
                    partyId,
                    header["Reference No"] || "", // referenceNo

                    null, // dispatchDocNo
                    null, // dispatchThrough
                    null, // destination

                    purchaseLedgerId,

                    subtotal,
                    cgstTotal,
                    sgstTotal,
                    igstTotal,
                    0, // discountTotal
                    0, // tdsTotal
                    total,

                    companyId,
                    ownerType,
                    ownerId,
                ]
            );

            const voucherId = voucherResult.insertId;

            // ---------- SAVE ITEMS ----------

            const itemValues = entries.map((e) => [
                voucherId,
                e.itemId,
                e.quantity,
                e.rate,
                0, // discount

                e.cgstLedgerId,
                e.sgstLedgerId,
                e.gstLedgerId,

                e.amount,
                0, // tdsRate
                null, // godownId

                e.purchaseLedgerId,
            ]);

            await db.query(
                `
        INSERT INTO purchase_voucher_items
        (voucherId,itemId,quantity,rate,discount,
         cgstRate,sgstRate,igstRate,
         amount,tdsRate,godownId,purchaseLedgerId)
        VALUES ?
      `,
                [itemValues]
            );

            // ---------- SAVE HISTORY (Batches) ----------
            const historyValues = [];
            for (const row of group.items) {
                const batchNo = row["Batch No"] ? String(row["Batch No"]).trim() : "";
                if (row["Item Name"]) {
                    historyValues.push([
                        row["Item Name"] || "",
                        row["HSN Code"] || "",
                        batchNo || "",
                        Number(row.Quantity || 0),
                        header.Date, // purchaseDate
                        companyId,
                        ownerType,
                        ownerId,
                        "purchase",
                        Number(row.Rate || 0),
                        voucherNumber,
                        null // godownId
                    ]);
                }
            }

            if (historyValues.length > 0) {
                await db.query(
                    `INSERT INTO purchase_history 
                      (itemName, hsnCode, batchNumber, purchaseQuantity, purchaseDate, companyId, ownerType, ownerId, type, rate, voucherNumber, godownId)
                      VALUES ?`,
                    [historyValues]
                );
            }

            saved.push(voucherNumber);
        }

        // ================= RESPONSE =================

        return res.json({
            success: errors.length === 0,
            imported: saved.length,
            vouchers: saved,
            errors,
        });
    } catch (error) {
        console.error("Purchase Import Error:", error);

        return res.status(500).json({
            success: false,
            message: "Import failed",
            error: error.message,
        });
    }
});



// =========================================
// SALES EXCEL IMPORT (JSON DATA)
// =========================================

router.post("/sales_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;
        console.log("rows", rows, companyId, ownerType, ownerId);

        // ================= VALIDATION =================

        if (!rows || !rows.length) {
            return res.status(400).json({
                success: false,
                message: "No data received",
            });
        }

        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // ================= LOAD MASTER DATA =================

        const [ledgers] = await db.execute(
            "SELECT id, name FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const [items] = await db.execute(
            "SELECT id, name FROM stock_items WHERE company_id=?",
            [companyId]
        );

        const ledgerMap = {};
        const itemMap = {};

        ledgers.forEach((l) => {
            ledgerMap[l.name.toLowerCase().trim()] = l.id;
        });

        items.forEach((i) => {
            itemMap[i.name.toLowerCase().trim()] = i.id;
        });

        // ================= GROUP BY DATE + CUSTOMER =================

        const groups = {};

        const errors = [];
        const saved = [];

        rows.forEach((row, i) => {
            const customerName = row["Party Name"] ? String(row["Party Name"]).toLowerCase().trim() : "";
            const date = row.Date || "";

            if (!customerName || !date) {
                errors.push(`Row ${i + 2}: Missing Date or Party Name`);
                return;
            }

            const key = date + "|" + customerName;

            if (!groups[key]) {
                groups[key] = {
                    header: row,
                    items: [],
                    rowNos: [],
                };
            }

            groups[key].items.push(row);
            groups[key].rowNos.push(i + 2);
        });

        // ================= PROCESS EACH GROUP =================

        for (const key in groups) {
            const group = groups[key];
            const header = group.header;

            // ---------- PARTY ----------

            const customerName = header["Party Name"]
                .toLowerCase()
                .trim();

            const partyId = ledgerMap[customerName];

            if (!partyId) {
                errors.push(`Party not found: ${header["Party Name"]}`);
                continue;
            }

            // ---------- SALES LEDGER ----------

            const salesLedgerId =
                ledgerMap[header["Sales Ledger"]?.toLowerCase().trim()];

            if (!salesLedgerId) {
                errors.push(`Sales Ledger not found: ${header["Sales Ledger"]}`);
                continue;
            }

            let subtotal = 0;
            let cgstTotal = 0;
            let sgstTotal = 0;
            let igstTotal = 0;
            let discountTotal = 0;

            const entries = [];

            // ---------- ITEMS LOOP ----------

            for (const row of group.items) {
                // Item

                const itemName = row["Item Name"]
                    .toLowerCase()
                    .trim();

                const itemId = itemMap[itemName];

                if (!itemId) {
                    errors.push(`Item not found: ${row["Item Name"]}`);
                    continue;
                }

                const qty = Number(row.Quantity || 0);
                const rate = Number(row.Rate || 0);
                const amount = Number(row.Amount || qty * rate);

                if (!qty || !rate) {
                    errors.push(`Invalid qty/rate: ${row["Item Name"]}`);
                    continue;
                }

                // ---------- GST ----------

                const cgst = +row["CGST Rate"] || 0;
                const sgst = +row["SGST Rate"] || 0;
                const igst = +row["IGST Rate"] || 0;

                // Rule: Either IGST or CGST+SGST

                if (igst && (cgst || sgst)) {
                    errors.push(`GST Error (Both) at ${row["Item Name"]}`);
                    continue;
                }

                if (!igst && (!cgst || !sgst)) {
                    errors.push(`GST Missing at ${row["Item Name"]}`);
                    continue;
                }

                subtotal += amount;

                if (igst) {
                    igstTotal += (amount * igst) / 100;
                } else {
                    cgstTotal += (amount * cgst) / 100;
                    sgstTotal += (amount * sgst) / 100;
                }

                // ---------- LEDGERS ----------

                const cgstLedgerId =
                    ledgerMap[row["CGST Ledger"]?.toLowerCase().trim()] || 0;

                const sgstLedgerId =
                    ledgerMap[row["SGST Ledger"]?.toLowerCase().trim()] || 0;

                const gstLedgerId =
                    ledgerMap[row["IGST Ledger"]?.toLowerCase().trim()] || 0;


                entries.push({
                    itemId,
                    quantity: qty,
                    rate,
                    amount,

                    cgstLedgerId,
                    sgstLedgerId,
                    gstLedgerId,

                    salesLedgerId,
                    cgstRate: cgst,
                    sgstRate: sgst,
                    igstRate: igst,
                    batchNumber: row["Batch No"] ? String(row["Batch No"]).trim() : "",
                });
            }

            if (!entries.length) continue;

            // ---------- TOTAL ----------

            const total =
                subtotal + cgstTotal + sgstTotal + igstTotal - discountTotal;

            // ---------- GENERATE VOUCHER ----------

            const voucherNumber = await generateVoucherNumber({
                companyId,
                ownerType,
                ownerId,
                voucherType: "sales",
                date: header.Date,
            });

            // ---------- SAVE HEADER ----------

            const [voucherResult] = await db.execute(
                `
        INSERT INTO sales_vouchers (
          number, date, narration, partyId, referenceNo,
          dispatchDocNo, dispatchThrough, destination, approxDistance,
          subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal, total,
          type, isQuotation, salesLedgerId, supplierInvoiceDate,
          company_id, owner_type, owner_id, sales_type_id, bill_no
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
                [
                    voucherNumber,
                    header.Date,
                    header.Narration || "",
                    partyId,
                    header["Reference No"] || "", // referenceNo

                    null, // dispatchDocNo
                    null, // dispatchThrough
                    null, // destination
                    null, // approxDistance

                    subtotal,
                    cgstTotal,
                    sgstTotal,
                    igstTotal,
                    discountTotal,
                    total,
                    "sales",
                    0, // isQuotation
                    salesLedgerId,
                    header.Date, // supplierInvoiceDate

                    companyId,
                    ownerType,
                    ownerId,
                    null, // sales_type_id
                    null, // bill_no
                ]
            );

            const voucherId = voucherResult.insertId;

            // ---------- SAVE ITEMS ----------

            const itemValues = entries.map((e) => [
                voucherId,
                e.itemId,
                e.quantity,
                e.rate,
                e.amount,
                e.cgstLedgerId || 0,
                e.sgstLedgerId || 0,
                e.gstLedgerId || 0,
                0, // discount
                "", // hsnCode
                e.batchNumber || "", // batchNumber
                null, // godownId
                e.salesLedgerId
            ]);

            await db.query(
                `
        INSERT INTO sales_voucher_items
        (voucherId,itemId,quantity,rate,amount,
         cgstRate,sgstRate,igstRate,
         discount,hsnCode,batchNumber,godownId,salesLedgerId)
        VALUES ?
      `,
                [itemValues]
            );

            // ---------- SAVE HISTORY (Batches) ----------
            const historyValues = [];
            for (const row of group.items) {
                const batchNo = row["Batch No"] ? String(row["Batch No"]).trim() : "";
                if (row["Item Name"]) {
                    historyValues.push([
                        row["Item Name"] || "",
                        row["HSN Code"] || "",
                        batchNo || "",
                        Number(row.Quantity || 0), // qtyChange
                        Number(row.Rate || 0),
                        header.Date, // movementDate
                        null, // godownId
                        voucherNumber,
                        companyId,
                        ownerType,
                        ownerId
                    ]);
                }
            }

            if (historyValues.length > 0) {
                await db.query(
                    `INSERT INTO sale_history 
                      (itemName, hsnCode, batchNumber, qtyChange, rate, movementDate, godownId, voucherNumber, companyId, ownerType, ownerId)
                      VALUES ?`,
                    [historyValues]
                );
            }

            saved.push(voucherNumber);
        }

        // ================= RESPONSE =================

        return res.json({
            success: errors.length === 0,
            imported: saved.length,
            vouchers: saved,
            errors,
        });
    } catch (error) {
        console.error("Sales Import Error:", error);

        return res.status(500).json({
            success: false,
            message: "Import failed",
            error: error.message,
        });
    }
});

// =========================================
// PAYMENT EXCEL IMPORT
// =========================================

router.post("/payment_import", async (req, res) => {

    try {
        const { rows, companyId, ownerType, ownerId } = req.body;

        // ================= VALIDATION =================

        if (!rows || !rows.length) {
            return res.status(400).json({
                success: false,
                message: "No data received",
            });
        }

        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // ================= LOAD LEDGERS =================

        const [ledgers] = await db.execute(
            "SELECT id, name FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const ledgerMap = {};

        ledgers.forEach((l) => {
            ledgerMap[l.name.toLowerCase().trim()] = l.id;
        });

        const errors = [];
        const saved = [];

        // ================= PROCESS ROWS =================

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const date = row.Date;

            const referenceNo =
                row["Reference No"] || row["Voucher No"] || null;

            const paidToName = row["Paid To"]
                ? String(row["Paid To"]).toLowerCase().trim()
                : "";

            const modeName = row["Payment Mode"]
                ? String(row["Payment Mode"]).toLowerCase().trim()
                : "";

            const amount = Number(row.Amount || 0);

            const chequeNo = row["Cheque Number"] || null;
            const bankName = row["Bank Name"] || null;

            // ================= BASIC VALIDATION =================

            if (!date || !paidToName || !modeName || !amount) {
                errors.push(
                    `Row ${i + 2}: Date, Paid To, Payment Mode, Amount are required`
                );
                continue;
            }

            // ================= LEDGER MATCH =================

            const debitLedgerId = ledgerMap[paidToName];
            const creditLedgerId = ledgerMap[modeName];

            if (!debitLedgerId) {
                errors.push(
                    `Row ${i + 2}: Paid To ledger not found (${row["Paid To"]})`
                );
                continue;
            }

            if (!creditLedgerId) {
                errors.push(
                    `Row ${i + 2}: Payment Mode ledger not found (${row["Payment Mode"]})`
                );
                continue;
            }

            // ================= GENERATE VOUCHER =================

            const voucherNumber = await generateVoucherNumber({
                companyId,
                ownerType,
                ownerId,
                voucherType: "payment",
                date,
            });

            // ================= INSERT MAIN =================

            const [mainResult] = await db.execute(
                `
        INSERT INTO voucher_main
        (
          voucher_type,
          voucher_number,
          date,
          narration,
          reference_no,
          supplier_invoice_date,
          owner_type,
          owner_id,
          company_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
                [
                    "payment",
                    voucherNumber,
                    date,

                    row.Narration || null, // ✅ With narration

                    referenceNo,

                    date, // ✅ SAME DATE → supplier_invoice_date

                    ownerType,
                    ownerId,
                    companyId,
                ]
            );

            const voucherId = mainResult.insertId;

            // ================= INSERT ENTRIES =================
            // Payment = Debit Party + Credit Cash/Bank

            const entryValues = [
                // -------- Debit (Party) --------
                [
                    voucherId,
                    debitLedgerId,
                    row["Paid To"],

                    amount,
                    "debit",

                    null, // narration

                    null,
                    null,
                    null,
                ],

                // -------- Credit (Cash/Bank) --------
                [
                    voucherId,
                    creditLedgerId,
                    row["Payment Mode"],

                    amount,
                    "credit",

                    null, // narration

                    bankName,
                    chequeNo,
                    null,
                ],
            ];

            await db.query(
                `
        INSERT INTO voucher_entries
        (
          voucher_id,
          ledger_id,
          ledger_name,
          amount,
          entry_type,
          narration,
          bank_name,
          cheque_number,
          cost_centre_id
        )
        VALUES ?
        `,
                [entryValues]
            );

            saved.push(voucherNumber);
        }

        // ================= RESPONSE =================

        return res.json({
            success: errors.length === 0,
            imported: saved.length,
            vouchers: saved,
            errors,
        });
    } catch (error) {
        console.error("❌ Payment Import Error:", error);

        return res.status(500).json({
            success: false,
            message: "Import failed",
            error: error.message,
        });
    }
});


// =========================================
// RECEIPT EXCEL IMPORT
// =========================================


router.post("/receipt_import", async (req, res) => {


    try {
        const { rows, companyId, ownerType, ownerId } = req.body;

        console.log("Rows:", rows?.length);

        // ================= VALIDATION =================

        if (!rows || !rows.length) {
            return res.status(400).json({
                success: false,
                message: "No data received",
            });
        }

        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // ================= LOAD LEDGERS =================

        const [ledgers] = await db.execute(
            "SELECT id, name FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const ledgerMap = {};

        ledgers.forEach((l) => {
            ledgerMap[l.name.toLowerCase().trim()] = l.id;
        });

        const errors = [];
        const saved = [];

        // ================= PROCESS ROWS =================

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const date = row.Date;

            const referenceNo =
                row["Reference No"] || row["Voucher No"] || null;

            const partyName = row["Paid To"]
                ? String(row["Paid To"]).toLowerCase().trim()
                : "";

            const modeName = row["Payment Mode"]
                ? String(row["Payment Mode"]).toLowerCase().trim()
                : "";

            const amount = Number(row.Amount || 0);

            // ================= BASIC VALIDATION =================

            if (!date || !partyName || !modeName || !amount) {
                errors.push(
                    `Row ${i + 2}: Date, Paid To, Payment Mode, Amount are required`
                );
                continue;
            }

            // ================= LEDGER MATCH =================

            // Receipt: Credit = Party | Debit = Cash/Bank

            const creditLedgerId = ledgerMap[partyName];
            const debitLedgerId = ledgerMap[modeName];

            if (!creditLedgerId) {
                errors.push(
                    `Row ${i + 2}: Party ledger not found (${row["Paid To"]})`
                );
                continue;
            }

            if (!debitLedgerId) {
                errors.push(
                    `Row ${i + 2}: Payment Mode ledger not found (${row["Payment Mode"]})`
                );
                continue;
            }

            // ================= GENERATE VOUCHER =================

            const voucherNumber = await generateVoucherNumber({
                companyId,
                ownerType,
                ownerId,
                voucherType: "receipt",
                date,
            });

            // ================= INSERT MAIN =================

            const [mainResult] = await db.execute(
                `
        INSERT INTO voucher_main
        (
          voucher_type,
          voucher_number,
          date,
          narration,
          reference_no,
          supplier_invoice_date,
          owner_type,
          owner_id,
          company_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
                [
                    "receipt",
                    voucherNumber,
                    date,

                    row.Narration || null, // ✅ With narration

                    referenceNo,

                    date, // ✅ Same date → supplier_invoice_date

                    ownerType,
                    ownerId,
                    companyId,
                ]
            );

            const voucherId = mainResult.insertId;

            // ================= INSERT ENTRIES =================
            // Receipt = Credit Party + Debit Cash/Bank

            const entryValues = [
                // -------- Credit (Party) --------
                [
                    voucherId,
                    creditLedgerId,
                    row["Paid To"],

                    amount,
                    "credit",

                    null, // narration

                    null,
                    null,
                    null,
                ],

                // -------- Debit (Cash/Bank) --------
                [
                    voucherId,
                    debitLedgerId,
                    row["Payment Mode"],

                    amount,
                    "debit",

                    null, // narration

                    null,
                    null,
                    null,
                ],
            ];

            await db.query(
                `
        INSERT INTO voucher_entries
        (
          voucher_id,
          ledger_id,
          ledger_name,
          amount,
          entry_type,
          narration,
          bank_name,
          cheque_number,
          cost_centre_id
        )
        VALUES ?
        `,
                [entryValues]
            );

            saved.push(voucherNumber);
        }

        // ================= RESPONSE =================

        return res.json({
            success: errors.length === 0,
            imported: saved.length,
            vouchers: saved,
            errors,
        });
    } catch (error) {
        console.error("❌ Receipt Import Error:", error);

        return res.status(500).json({
            success: false,
            message: "Import failed",
            error: error.message,
        });
    }
});


// =========================================
// BANK EXCEL IMPORT (Exact Receipt Mode)
// =========================================

router.post("/bank_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;
        console.log("Bank Rows:", rows?.length);

        if (!rows || !rows.length) {
            return res.status(400).json({
                success: false,
                message: "No data received",
            });
        }

        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const [ledgers] = await db.execute(
            "SELECT id, name FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const ledgerMap = {};
        ledgers.forEach((l) => {
            ledgerMap[l.name.toLowerCase().trim()] = l.id;
        });

        const errors = [];
        const saved = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const date = row.Date;
            const referenceNo = row["Reference No"] || row["Voucher No"] || null;
            const partyName = row["Paid To"] ? String(row["Paid To"]).toLowerCase().trim() : "";
            const modeName = row["Payment Mode"] ? String(row["Payment Mode"]).toLowerCase().trim() : "";
            const amount = Number(row.Amount || 0);

            if (!date || !partyName || !modeName || !amount) {
                errors.push(`Row ${i + 2}: Date, Paid To, Payment Mode, Amount are required`);
                continue;
            }

            // Bank Voucher (Receipt Mode): Credit = Party | Debit = Bank
            const creditLedgerId = ledgerMap[partyName];
            const debitLedgerId = ledgerMap[modeName];

            if (!creditLedgerId) {
                errors.push(`Row ${i + 2}: Party ledger not found (${row["Paid To"]})`);
                continue;
            }
            if (!debitLedgerId) {
                errors.push(`Row ${i + 2}: Payment Mode ledger not found (${row["Payment Mode"]})`);
                continue;
            }

            const voucherNumber = await generateVoucherNumber({
                companyId,
                ownerType,
                ownerId,
                voucherType: "bank",
                date,
            });

            const [mainResult] = await db.execute(
                `
                INSERT INTO voucher_main
                (voucher_type, voucher_number, date, narration, reference_no,
                 supplier_invoice_date, owner_type, owner_id, company_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    "bank",
                    voucherNumber,
                    date,
                    null,
                    referenceNo,
                    date,
                    ownerType,
                    ownerId,
                    companyId,
                ]
            );

            const voucherId = mainResult.insertId;

            const entryValues = [
                // Credit (Party)
                [voucherId, creditLedgerId, row["Paid To"], amount, "credit", null, null, null, null],
                // Debit (Bank)
                [voucherId, debitLedgerId, row["Payment Mode"], amount, "debit", null, null, null, null],
            ];

            await db.query(
                `
                INSERT INTO voucher_entries
                (voucher_id, ledger_id, ledger_name, amount, entry_type,
                 narration, bank_name, cheque_number, cost_centre_id)
                VALUES ?
                `,
                [entryValues]
            );

            saved.push(voucherNumber);
        }

        return res.json({
            success: errors.length === 0,
            imported: saved.length,
            vouchers: saved,
            errors,
        });
    } catch (error) {
        console.error("❌ Bank Import Error:", error);
        return res.status(500).json({
            success: false,
            message: "Import failed",
            error: error.message,
        });
    }
});





// =========================================
// CONTRA EXCEL IMPORT
// =========================================

router.post("/contra_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;

        if (!rows || !rows.length) {
            return res.status(400).json({ success: false, message: "No data received" });
        }
        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const [ledgers] = await db.execute("SELECT id, name FROM ledgers WHERE company_id=?", [companyId]);
        const ledgerMap = {};
        ledgers.forEach((l) => { ledgerMap[l.name.toLowerCase().trim()] = l.id; });

        const errors = [];
        const saved = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const date = row.Date;
            const referenceNo = row["Reference No"] || row["Voucher No"] || null;
            const debitLedgerName = row["Debit Ledger"] ? String(row["Debit Ledger"]).toLowerCase().trim() : "";
            const creditLedgerName = row["Credit Ledger"] ? String(row["Credit Ledger"]).toLowerCase().trim() : "";
            const amount = Number(row.Amount || 0);
            const narration = row.Narration || null;

            if (!date || !debitLedgerName || !creditLedgerName || !amount) {
                errors.push(`Row ${i + 2}: Date, Debit Ledger, Credit Ledger, Amount are required`);
                continue;
            }

            const debitLedgerId = ledgerMap[debitLedgerName];
            const creditLedgerId = ledgerMap[creditLedgerName];

            if (!debitLedgerId) { errors.push(`Row ${i + 2}: Debit ledger not found (${row["Debit Ledger"]})`); continue; }
            if (!creditLedgerId) { errors.push(`Row ${i + 2}: Credit ledger not found (${row["Credit Ledger"]})`); continue; }

            const voucherNumber = await generateVoucherNumber({
                companyId, ownerType, ownerId, voucherType: "contra", date,
            });

            const [mainResult] = await db.execute(
                `INSERT INTO voucher_main (voucher_type, voucher_number, date, narration, reference_no, supplier_invoice_date, owner_type, owner_id, company_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ["contra", voucherNumber, date, narration, referenceNo, date, ownerType, ownerId, companyId]
            );

            const voucherId = mainResult.insertId;

            const entryValues = [
                [voucherId, debitLedgerId, row["Debit Ledger"], amount, "debit", null, null, null, null],
                [voucherId, creditLedgerId, row["Credit Ledger"], amount, "credit", null, null, null, null],
            ];

            await db.query(`INSERT INTO voucher_entries (voucher_id, ledger_id, ledger_name, amount, entry_type, narration, bank_name, cheque_number, cost_centre_id) VALUES ?`, [entryValues]);

            saved.push(voucherNumber);
        }

        return res.json({ success: errors.length === 0, imported: saved.length, vouchers: saved, errors });
    } catch (error) {
        console.error("❌ Contra Import Error:", error);
        return res.status(500).json({ success: false, message: "Import failed", error: error.message });
    }
});

// =========================================
// JOURNAL EXCEL IMPORT
// =========================================

router.post("/journal_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;

        if (!rows || !rows.length) {
            return res.status(400).json({ success: false, message: "No data received" });
        }
        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const [ledgers] = await db.execute("SELECT id, name FROM ledgers WHERE company_id=?", [companyId]);
        const ledgerMap = {};
        ledgers.forEach((l) => { ledgerMap[l.name.toLowerCase().trim()] = l.id; });

        const errors = [];
        const saved = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const date = row.Date;
            const referenceNo = row["Reference No"] || row["Voucher No"] || null;
            const debitLedgerName = row["Debit Ledger"] ? String(row["Debit Ledger"]).toLowerCase().trim() : "";
            const creditLedgerName = row["Credit Ledger"] ? String(row["Credit Ledger"]).toLowerCase().trim() : "";
            const amount = Number(row.Amount || 0);
            const narration = row.Narration || null;

            if (!date || !debitLedgerName || !creditLedgerName || !amount) {
                errors.push(`Row ${i + 2}: Date, Debit Ledger, Credit Ledger, Amount are required`);
                continue;
            }

            const debitLedgerId = ledgerMap[debitLedgerName];
            const creditLedgerId = ledgerMap[creditLedgerName];

            if (!debitLedgerId) { errors.push(`Row ${i + 2}: Debit ledger not found (${row["Debit Ledger"]})`); continue; }
            if (!creditLedgerId) { errors.push(`Row ${i + 2}: Credit ledger not found (${row["Credit Ledger"]})`); continue; }

            const voucherNumber = await generateVoucherNumber({
                companyId, ownerType, ownerId, voucherType: "journal", date,
            });

            const [mainResult] = await db.execute(
                `INSERT INTO voucher_main (voucher_type, voucher_number, date, narration, reference_no, supplier_invoice_date, owner_type, owner_id, company_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ["journal", voucherNumber, date, narration, referenceNo, date, ownerType, ownerId, companyId]
            );

            const voucherId = mainResult.insertId;

            const entryValues = [
                [voucherId, debitLedgerId, row["Debit Ledger"], amount, "debit", null, null, null, null],
                [voucherId, creditLedgerId, row["Credit Ledger"], amount, "credit", null, null, null, null],
            ];

            await db.query(`INSERT INTO voucher_entries (voucher_id, ledger_id, ledger_name, amount, entry_type, narration, bank_name, cheque_number, cost_centre_id) VALUES ?`, [entryValues]);

            saved.push(voucherNumber);
        }

        return res.json({ success: errors.length === 0, imported: saved.length, vouchers: saved, errors });
    } catch (error) {
        console.error("❌ Journal Import Error:", error);
        return res.status(500).json({ success: false, message: "Import failed", error: error.message });
    }
});


// =========================================
// CREDIT NOTE EXCEL IMPORT
// =========================================

router.post("/credit_note_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;

        if (!rows || !rows.length) {
            return res.status(400).json({ success: false, message: "No data received" });
        }
        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const [ledgers] = await db.execute("SELECT id, name FROM ledgers WHERE company_id=?", [companyId]);
        const ledgerMap = {};
        ledgers.forEach((l) => { ledgerMap[l.name.toLowerCase().trim()] = l.id; });

        const errors = [];
        const saved = [];
        const groups = {};

        let lastDate = "";
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let date = row.Date;
            if (!date) {
                date = lastDate;
            } else {
                lastDate = date;
            }
            const creditNoteNo = row["Credit Note No."] || row["Reference No"] || row["Voucher No"] || null;
            
            if (!date) {
                errors.push(`Row ${i + 2}: Date is required`);
                continue;
            }

            const key = creditNoteNo || date;

            if (!groups[key]) {
                groups[key] = {
                    date: date,
                    creditNoteNo: creditNoteNo,
                    items: [],
                    rowNos: []
                };
            }
            groups[key].items.push(row);
            groups[key].rowNos.push(i + 2);
        }

        // 2. Process Each Group
        for (const key in groups) {
            const group = groups[key];
            let totalDebit = 0;
            let totalCredit = 0;
            const cleanAccountingEntries = [];
            let mainPartyId = null; 
            let narration = "";
            let groupHasError = false;

            for (let i = 0; i < group.items.length; i++) {
                const row = group.items[i];
                const rowNo = group.rowNos[i];
                const ledgerName = row["Ledger Name"] ? String(row["Ledger Name"]).toLowerCase().trim() : "";
                const drCr = row["Dr/Cr"] ? String(row["Dr/Cr"]).toLowerCase().trim() : "";
                const amount = Number(row.Amount || 0);
                if (row.Narration && !narration) narration = row.Narration;

                if (!ledgerName || !drCr || !amount) {
                    errors.push(`Row ${rowNo}: Ledger Name, Dr/Cr, and Amount are required`);
                    groupHasError = true;
                    continue;
                }

                const ledgerId = ledgerMap[ledgerName];
                if (!ledgerId) {
                    errors.push(`Row ${rowNo}: Ledger not found (${row["Ledger Name"]})`);
                    groupHasError = true;
                    continue;
                }

                if (drCr === "dr" || drCr === "debit") {
                    totalDebit += amount;
                    cleanAccountingEntries.push({ ledgerId, type: "debit", amount });
                } else if (drCr === "cr" || drCr === "credit") {
                    totalCredit += amount;
                    cleanAccountingEntries.push({ ledgerId, type: "credit", amount });
                    if (!mainPartyId) mainPartyId = ledgerId; // Take first credit ledger as party
                } else {
                    errors.push(`Row ${rowNo}: Dr/Cr must be 'Dr' or 'Cr'`);
                    groupHasError = true;
                }
            }

            if (groupHasError) continue;

            // Check if balances match
            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                errors.push(`Group ${key} (Rows ${group.rowNos.join(",")}): Debit Total (${totalDebit}) and Credit Total (${totalCredit}) do not match`);
                continue;
            }

            const voucherNumber = group.creditNoteNo || await generateVoucherNumber({
                companyId, ownerType, ownerId, voucherType: "credit_note", date: group.date,
            });

            const finalNarration = JSON.stringify({
                accountingEntries: cleanAccountingEntries,
                note: narration || ""
            });

            const [result] = await db.query(
                `INSERT INTO credit_vouchers 
                 (company_id, owner_type, owner_id, date, number, mode, partyId, narration)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyId,
                    ownerType,
                    ownerId,
                    group.date,
                    voucherNumber,
                    "accounting-invoice",
                    mainPartyId,
                    finalNarration
                ]
            );

            saved.push(voucherNumber);
        }

        return res.json({ success: errors.length === 0, imported: saved.length, vouchers: saved, errors });
    } catch (error) {
        console.error("❌ Credit Note Import Error:", error);
        return res.status(500).json({ success: false, message: "Import failed", error: error.message });
    }
});



// =========================================
// DEBIT NOTE EXCEL IMPORT
// =========================================

router.post("/debit_note_import", async (req, res) => {
    try {
        const { rows, companyId, ownerType, ownerId } = req.body;

        if (!rows || !rows.length) {
            return res.status(400).json({ success: false, message: "No data received" });
        }
        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const [ledgers] = await db.execute("SELECT id, name FROM ledgers WHERE company_id=?", [companyId]);
        const ledgerMap = {};
        ledgers.forEach((l) => { ledgerMap[l.name.toLowerCase().trim()] = l.id; });

        const errors = [];
        const saved = [];
        const groups = {};

        let lastDate = "";
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let date = row.Date;
            if (!date) {
                date = lastDate;
            } else {
                lastDate = date;
            }
            const debitNoteNo = row["Debit Note No."] || row["Reference No"] || row["Voucher No"] || null;
            
            if (!date) {
                errors.push(`Row ${i + 2}: Date is required`);
                continue;
            }

            const key = debitNoteNo || date;

            if (!groups[key]) {
                groups[key] = {
                    date: date,
                    debitNoteNo: debitNoteNo,
                    items: [],
                    rowNos: []
                };
            }
            groups[key].items.push(row);
            groups[key].rowNos.push(i + 2);
        }

        // 2. Process Each Group
        for (const key in groups) {
            const group = groups[key];
            let totalDebit = 0;
            let totalCredit = 0;
            const cleanAccountingEntries = [];
            let mainPartyId = null; 
            let narration = "";
            let groupHasError = false;

            for (let i = 0; i < group.items.length; i++) {
                const row = group.items[i];
                const rowNo = group.rowNos[i];
                const ledgerName = row["Ledger Name"] ? String(row["Ledger Name"]).toLowerCase().trim() : "";
                const drCr = row["Dr/Cr"] ? String(row["Dr/Cr"]).toLowerCase().trim() : "";
                const amount = Number(row.Amount || 0);
                if (row.Narration && !narration) narration = row.Narration;

                if (!ledgerName || !drCr || !amount) {
                    errors.push(`Row ${rowNo}: Ledger Name, Dr/Cr, and Amount are required`);
                    groupHasError = true;
                    continue;
                }

                const ledgerId = ledgerMap[ledgerName];
                if (!ledgerId) {
                    errors.push(`Row ${rowNo}: Ledger not found (${row["Ledger Name"]})`);
                    groupHasError = true;
                    continue;
                }

                if (drCr === "dr" || drCr === "debit") {
                    totalDebit += amount;
                    cleanAccountingEntries.push({ ledgerId, type: "debit", amount });
                } else if (drCr === "cr" || drCr === "credit") {
                    totalCredit += amount;
                    cleanAccountingEntries.push({ ledgerId, type: "credit", amount });
                    if (!mainPartyId) mainPartyId = ledgerId; // Take first credit ledger as party
                } else {
                    errors.push(`Row ${rowNo}: Dr/Cr must be 'Dr' or 'Cr'`);
                    groupHasError = true;
                }
            }

            if (groupHasError) continue;

            // Check if balances match
            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                errors.push(`Group ${key} (Rows ${group.rowNos.join(",")}): Debit Total (${totalDebit}) and Credit Total (${totalCredit}) do not match`);
                continue;
            }

            const voucherNumber = group.debitNoteNo || await generateVoucherNumber({
                companyId, ownerType, ownerId, voucherType: "debit_note", date: group.date,
            });

            const finalNarration = JSON.stringify({
                accountingEntries: cleanAccountingEntries,
                note: narration || ""
            });

            const [result] = await db.query(
                `INSERT INTO debit_note_vouchers 
                 (company_id, owner_type, owner_id, date, number, mode, party_id, sales_ledger_id, narration)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyId,
                    ownerType,
                    ownerId,
                    group.date,
                    voucherNumber,
                    "accounting-invoice",
                    mainPartyId || null,
                    null, // sales_ledger_id (not required for accounting-invoice)
                    finalNarration
                ]
            );

            saved.push(voucherNumber);
        }

        return res.json({ success: errors.length === 0, imported: saved.length, vouchers: saved, errors });
    } catch (error) {
        console.error("❌ Debit Note Import Error:", error);
        return res.status(500).json({ success: false, message: "Import failed", error: error.message });
    }
});




// =========================================
// PURCHASE SUMMARY IMPORT (GST TEMPLATE)
// =========================================

let isDiscountLedgerCheckedInImport = false;
const ensureDiscountLedgerColumns = async () => {
    if (isDiscountLedgerCheckedInImport) return;
    try {
        const [vRows] = await db.execute(`SHOW COLUMNS FROM purchase_vouchers LIKE 'discountLedgerId'`);
        if (vRows.length === 0) {
            await db.execute(`ALTER TABLE purchase_vouchers ADD COLUMN discountLedgerId INT NULL`);
            console.log("✅ discountLedgerId column created in purchase_vouchers");
        }
        const [iRows] = await db.execute(`SHOW COLUMNS FROM purchase_voucher_items LIKE 'discountLedgerId'`);
        if (iRows.length === 0) {
            await db.execute(`ALTER TABLE purchase_voucher_items ADD COLUMN discountLedgerId INT NULL`);
            console.log("✅ discountLedgerId column created in purchase_voucher_items");
        }
    } catch (err) {
        console.error("ensureDiscountLedgerColumns error:", err);
    }
    isDiscountLedgerCheckedInImport = true;
};

router.post("/purchase_summary_import", async (req, res) => {
    try {
        await ensureDiscountLedgerColumns();
        const { voucher, companyId, ownerType, ownerId } = req.body;

        console.log("Received Grouped Purchase Import Request:", {
            invoiceNo: voucher?.["Invoice number"],
            itemsCount: voucher?.items?.length,
            companyId
        });

        if (!voucher) {
            return res.status(400).json({ success: false, message: "No voucher data received" });
        }
        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // LOAD LEDGERS & ITEMS
        const [ledgers] = await db.execute(
            "SELECT id, name, gst_number, state, group_id FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const [stockItems] = await db.execute(
            "SELECT id, name, batches, 0.00 AS openingBalance FROM stock_items WHERE company_id=?",
            [companyId]
        );

        const findPurchaseLedger = (inputName) => {
            if (!inputName) return null;
            const target = String(inputName).toLowerCase().replace(/\s+/g, ' ').trim();
            if (!target) return null;

            // 1. Exact match
            let found = ledgers.find(l => (l.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === target);
            if (found) return found;

            // 2. Includes match (either direction)
            found = ledgers.find(l => {
                const lName = (l.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
                return lName.includes(target) || target.includes(lName);
            });
            if (found) return found;

            // 3. Match by percentage and intra/inter state
            const matchPct = target.match(/(\d+(\.\d+)?)/);
            const pct = matchPct ? matchPct[1] : null;
            const isInter = target.includes("inter");
            const isIntra = target.includes("intra");

            found = ledgers.find(l => {
                const lName = (l.name || '').toLowerCase();
                if (pct && !lName.includes(pct)) return false;
                if (isInter && !lName.includes("inter")) return false;
                if (isIntra && !lName.includes("intra")) return false;
                return lName.includes("purchase");
            });
            return found || null;
        };

        const defaultPLedger = ledgers.find(l => l.name.toLowerCase().includes("purchase"));
        const defaultPurchaseLedgerId = defaultPLedger ? defaultPLedger.id : null;

        // Header Fields
        const partyName = voucher["Trade/Legal name of the Supplier"] ? String(voucher["Trade/Legal name of the Supplier"]).toLowerCase().trim() : "";
        const invoiceNo = voucher["Invoice number"] || null;
        const invoiceDateStr = voucher["Invoice Date"];

        // Determine Purchase Ledger for the whole voucher
        let purchaseLedgerId = defaultPurchaseLedgerId;
        const rawPLedgerName = voucher["Purchase Ledger"] || voucher["purchaseLedger"] || null;
        const matchedPLedger = findPurchaseLedger(rawPLedgerName);
        if (matchedPLedger) {
            purchaseLedgerId = matchedPLedger.id;
        }

        // DATE FORMATTING
        let rawDate = voucher["Invoice Date"] || voucher["Date"] || voucher["Invoice date"] || voucher["invoice_date"] || voucher["date"];
        let date = rawDate;

        if (typeof date === 'string') {
            // Normalize DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
            const dmyMatch = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (dmyMatch) {
                date = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
            } else {
                // Check if it's already YYYY-MM-DD
                const ymdMatch = date.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (ymdMatch) {
                    date = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
                }
            }
        }

        if (!date || date === 'undefined' || date === 'null' || isNaN(new Date(date).getTime())) {
            date = new Date().toISOString().split('T')[0];
        }

        console.log(`[purchase_summary_import] Processed date: ${date} (from raw: ${rawDate})`);

        // PARTY MATCH
        const importMode = voucher.importMode || 'item';
        let partyId = null;

        const matchedLedgerByName = ledgers.find(l => {
            const lName = l.name ? String(l.name).toLowerCase().replace(/\s+/g, " ").trim() : "";
            const pName = partyName.replace(/\s+/g, " ").trim();
            return partyName && lName === pName;
        });

        if (matchedLedgerByName) {
            partyId = matchedLedgerByName.id;
        } else if (importMode === 'accounting') {
            // Try to find supplier from accounting entries (the one with type 'credit')
            const creditEntry = (voucher.accountingEntries || []).find(ae => String(ae.Type || ae.type).toLowerCase().trim() === 'credit');
            if (creditEntry) {
                const sName = String(creditEntry["Particulars (Ledger Name)"] || creditEntry.ledgerName || "").toLowerCase().trim();
                const sLedger = ledgers.find(l => (l.name || "").toLowerCase().trim() === sName);
                if (sLedger) partyId = sLedger.id;
            }
        }

        if (!partyId) {
            return res.json({ success: false, errors: [`Supplier '${partyName || 'in entries'}' not found in ledgers`] });
        }

        // AGGREGATE TOTALS
        let subtotal = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;
        let discountTotal = 0;

        const processedItems = [];
        const processedAccountingEntries = [];

        if (importMode === 'item') {
            for (const item of (voucher.items || [])) {
                const taxable = Number(item["Taxable Value (₹)"] || 0);
                const cgst = Number(item["Central Tax (₹)"] || 0);
                const sgst = Number(item["State/UT tax (₹)"] || 0);
                const igst = Number(item["Integrated Tax (₹)"] || 0);
                const rate = Number(item["Rate (%)"] || 0);

                subtotal += taxable;
                cgstTotal += cgst;
                sgstTotal += sgst;
                igstTotal += igst;

                let finalItemId = 0;
                const itemName = item["Item Name"];
                if (itemName) {
                    const si = stockItems.find(it => it.name.toLowerCase().trim() === itemName.toLowerCase().trim());
                    if (si) finalItemId = si.id;
                }

                const findGstLedger = (type, pct) => {
                    let l = ledgers.find(ld => (ld.name || '').toLowerCase().includes(type) && (ld.name || '').includes(pct.toString()));
                    if (!l) l = ledgers.find(ld => (ld.name || '').toLowerCase().includes(type));
                    return l ? l.id : 0;
                };

                let itemCgstRate = 0;
                let itemSgstRate = 0;
                let itemIgstRate = 0;

                if (igst > 0 || (cgst === 0 && sgst === 0 && rate > 0)) {
                    const rawPct = igst > 0 && taxable > 0 ? Number(((igst / taxable) * 100).toFixed(2)) : rate;
                    const resolvedIgstId = findGstLedger("igst", rawPct);
                    itemIgstRate = resolvedIgstId > 0 ? resolvedIgstId : rawPct;
                } else {
                    let computedCgst = cgst > 0 && taxable > 0 ? Number(((cgst / taxable) * 100).toFixed(2)) : (rate > 0 ? rate / 2 : 0);
                    let computedSgst = sgst > 0 && taxable > 0 ? Number(((sgst / taxable) * 100).toFixed(2)) : (rate > 0 ? rate / 2 : 0);

                    if (computedCgst > 14 && (computedCgst === computedSgst || computedSgst === 0)) {
                        computedCgst = computedCgst / 2;
                        computedSgst = computedCgst;
                    } else if (computedSgst > 14 && computedCgst === 0) {
                        computedSgst = computedSgst / 2;
                        computedSgst = computedSgst;
                    }

                    const resolvedCgstId = findGstLedger("cgst", computedCgst);
                    const resolvedSgstId = findGstLedger("sgst", computedSgst);

                    itemCgstRate = resolvedCgstId > 0 ? resolvedCgstId : computedCgst;
                    itemSgstRate = resolvedSgstId > 0 ? resolvedSgstId : computedSgst;
                }

                const discount = Number(item["Discount"] || item["Discount (₹)"] || item["Discount (%)"] || 0);
                discountTotal += discount;

                processedItems.push({
                    itemId: finalItemId,
                    itemName: itemName,
                    quantity: parseFloat(item["Quantity"]) || 1,
                    rate: parseFloat(item["Item Rate (₹)"]) || taxable,
                    discount: discount,
                    amount: taxable,
                    cgstRate: itemCgstRate,
                    sgstRate: itemSgstRate,
                    igstRate: itemIgstRate,
                    hsnCode: item["HSN Code"] || "",
                    batchNo: item["Batch No"] || ""
                });
            }

            const payloadDiscount = Number(voucher["Discount"] || voucher.discountTotal || 0);
            if (payloadDiscount > 0 && discountTotal === 0) {
                discountTotal = payloadDiscount;
            }
        } else {
            // accounting-mode
            for (const ae of (voucher.accountingEntries || [])) {
                const amount = Number(ae["Amount (₹)"] || 0);
                const cgst = Number(ae["Central Tax (₹)"] || 0);
                const sgst = Number(ae["State/UT tax (₹)"] || 0);
                const igst = Number(ae["Integrated Tax (₹)"] || 0);
                const particulars = ae["Particulars (Ledger Name)"];
                const type = ae["Type"] || "debit";

                if (type === 'debit') {
                    const lName = String(particulars || "").toLowerCase();
                    if (lName.includes("cgst")) {
                        cgstTotal += amount;
                    } else if (lName.includes("sgst") || lName.includes("utgst")) {
                        sgstTotal += amount;
                    } else if (lName.includes("igst")) {
                        igstTotal += amount;
                    } else if (lName.includes("discount")) {
                        // Usually discount in purchase is a credit, but handle if debited
                        discountTotal -= amount;
                    } else {
                        subtotal += amount;
                    }
                } else if (type === 'credit' && particulars) {
                    const lName = String(particulars || "").toLowerCase();
                    if (lName.includes("discount")) {
                        discountTotal += amount;
                    }
                }

                let finalLedgerId = 0;
                if (particulars) {
                    const l = ledgers.find(ld => ld.name.toLowerCase().trim() === particulars.toLowerCase().trim());
                    if (l) finalLedgerId = l.id;
                }

                processedAccountingEntries.push({
                    ledgerId: finalLedgerId,
                    ledgerName: particulars,
                    amount: amount,
                    type: type,
                    cgst: cgst,
                    sgst: sgst,
                    igst: igst
                });
            }
        }

        const totalVal = subtotal + cgstTotal + sgstTotal + igstTotal;

        let discountLedgerId = null;
        if (discountTotal > 0) {
            const rebDL = ledgers.find(l => {
                const lName = (l.name || "").toLowerCase();
                return lName.includes("rebate") || lName.includes("discount");
            });
            if (rebDL) discountLedgerId = rebDL.id;
        }

        // GENERATE VOUCHER NUMBER
        const voucherNumber = await generateVoucherNumber({
            companyId,
            ownerType,
            ownerId,
            voucherType: "purchase",
            date,
        });

        // INSERT MAIN
        const [mainResult] = await db.execute(
            `INSERT INTO purchase_vouchers (
                number, date, supplierInvoiceDate, narration, partyId, referenceNo, 
                subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal, total, 
                company_id, owner_type, owner_id, mode, purchaseLedgerId, discountLedgerId
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                voucherNumber, date, date, voucher.narration || `Imported ${importMode === 'item' ? 'Multi-item' : 'Accounting'}`, partyId, invoiceNo,
                subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal, totalVal,
                companyId, ownerType, ownerId, importMode === 'item' ? 'item-invoice' : 'accounting-invoice', purchaseLedgerId, discountLedgerId
            ]
        );

        const voucherId = mainResult.insertId;

        if (importMode === 'item') {
            // INSERT ITEMS
            for (const pi of processedItems) {
                await db.execute(
                    `INSERT INTO purchase_voucher_items (
                        voucherId, itemId, quantity, rate, discount, amount, 
                        cgstRate, sgstRate, igstRate, purchaseLedgerId
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        voucherId, pi.itemId, pi.quantity, pi.rate, pi.discount || 0, pi.amount,
                        pi.cgstRate, pi.sgstRate, pi.igstRate, purchaseLedgerId
                    ]
                );

                if (pi.itemId) {
                    // Update Stock Balance and Batches
                    const stockItem = stockItems.find(si => si.id === pi.itemId);
                    if (stockItem) {
                        let dbBatches = [];
                        try {
                            dbBatches = stockItem.batches ? (typeof stockItem.batches === 'string' ? JSON.parse(stockItem.batches) : stockItem.batches) : [];
                            if (!Array.isArray(dbBatches)) dbBatches = [];
                        } catch (e) { dbBatches = []; }

                        const batchNameLower = pi.batchNo ? String(pi.batchNo).trim().toLowerCase() : "";
                        const existingBatchIndex = dbBatches.findIndex(b => {
                            const dbName = b.batchName ? String(b.batchName).trim().toLowerCase() : "";
                            return dbName === batchNameLower;
                        });

                        if (existingBatchIndex > -1) {
                            dbBatches[existingBatchIndex].batchQuantity = (Number(dbBatches[existingBatchIndex].batchQuantity) || 0) + pi.quantity;
                            dbBatches[existingBatchIndex].mode = "purchase";
                        } else {
                            dbBatches.push({
                                batchName: pi.batchNo || "",
                                batchQuantity: pi.quantity,
                                openingRate: pi.rate,
                                openingValue: pi.quantity * pi.rate,
                                mode: "purchase"
                            });
                        }

                        await db.execute("UPDATE stock_items SET batches = ? WHERE id = ?", [JSON.stringify(dbBatches), pi.itemId]);
                    }
                }

                if (pi.itemId) {
                    // 2. Insert into purchase_history
                    const historyValues = [[
                        pi.itemName, pi.hsnCode, pi.batchNo || "", pi.quantity, date,
                        companyId, ownerType, ownerId, "purchase", pi.rate, voucherNumber, null
                    ]];
                    await db.query(`INSERT INTO purchase_history (itemName, hsnCode, batchNumber, purchaseQuantity, purchaseDate, companyId, ownerType, ownerId, type, rate, voucherNumber, godownId) VALUES ?`, [historyValues]);
                }
            }
        } else {
            // accounting-mode
            const entryValues = processedAccountingEntries.map(ae => [
                voucherId, ae.ledgerId, ae.ledgerName, ae.amount, ae.type, null, null, null, null
            ]);

            if (entryValues.length > 0) {
                await db.query(
                    `INSERT INTO voucher_entries (voucher_id, ledger_id, ledger_name, amount, entry_type, narration, bank_name, cheque_number, cost_centre_id) VALUES ?`,
                    [entryValues]
                );
            }
        }

        return res.json({
            success: true,
            imported: 1,
            vouchers: [voucherNumber]
        });

    } catch (error) {
        console.error("❌ Purchase Summary Import Error:", error);
        return res.status(500).json({ success: false, message: "Import failed: " + error.message });
    }
});




// =========================================
// SALES SUMMARY IMPORT (GST TEMPLATE)
// =========================================

router.post("/sales_summary_import", async (req, res) => {
    try {
        const { voucher, companyId, ownerType, ownerId } = req.body;

        console.log("Received Grouped Sales Import Request:", {
            invoiceNo: voucher?.["Invoice number"],
            itemsCount: voucher?.items?.length,
            companyId
        });

        if (!voucher) {
            return res.status(400).json({ success: false, message: "No voucher data received" });
        }
        if (!companyId || !ownerType || !ownerId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // LOAD LEDGERS & ITEMS
        const [ledgers] = await db.execute(
            "SELECT id, name, gst_number, state, group_id FROM ledgers WHERE company_id=?",
            [companyId]
        );

        const [stockItems] = await db.execute(
            "SELECT id, name, batches, 0.00 AS openingBalance FROM stock_items WHERE company_id=?",
            [companyId]
        );

        const defaultSLedger = ledgers.find(l => l.name.toLowerCase().includes("sales"));
        const defaultSalesLedgerId = defaultSLedger ? defaultSLedger.id : null;

        // Header Fields
        const partyName = voucher["Trade/Legal name of the Supplier"] ? String(voucher["Trade/Legal name of the Supplier"]).toLowerCase().trim() : "";
        const invoiceNo = voucher["Invoice number"] || null;

        // DATE FORMATTING
        let rawDate = voucher["Invoice Date"] || voucher["Date"] || voucher["Invoice date"] || voucher["invoice_date"] || voucher["date"];
        let date = rawDate;

        if (typeof date === 'string') {
            const dmyMatch = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (dmyMatch) {
                date = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
            } else {
                const ymdMatch = date.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (ymdMatch) {
                    date = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
                }
            }
        }

        if (!date || date === 'undefined' || date === 'null' || isNaN(new Date(date).getTime())) {
            date = new Date().toISOString().split('T')[0];
        }

        // Determine Sales Ledger
        let salesLedgerId = defaultSalesLedgerId;
        const firstRowSalesLedgerName = (voucher["Sales Ledger"] || voucher["Purchase Ledger"]) ? String(voucher["Sales Ledger"] || voucher["Purchase Ledger"]).toLowerCase().trim() : null;
        if (firstRowSalesLedgerName) {
            const sLedger = ledgers.find(l => l.name.toLowerCase().includes(firstRowSalesLedgerName));
            if (sLedger) salesLedgerId = sLedger.id;
        }

        // PARTY MATCH
        const importMode = voucher.importMode || 'item';
        let partyId = null;

        const matchedLedgerByName = ledgers.find(l => {
            const lName = l.name ? String(l.name).toLowerCase().replace(/\s+/g, " ").trim() : "";
            const pName = partyName.replace(/\s+/g, " ").trim();
            return partyName && lName === pName;
        });

        if (matchedLedgerByName) {
            partyId = matchedLedgerByName.id;
        } else if (importMode === 'accounting') {
            const debitEntry = (voucher.accountingEntries || []).find(ae => String(ae.Type || ae.type).toLowerCase().trim() === 'debit');
            if (debitEntry) {
                const sName = String(debitEntry["Particulars (Ledger Name)"] || debitEntry.ledgerName || "").toLowerCase().trim();
                const sLedger = ledgers.find(l => (l.name || "").toLowerCase().trim() === sName);
                if (sLedger) partyId = sLedger.id;
            }
        }

        if (!partyId) {
            return res.json({ success: false, errors: [`Customer '${partyName || 'in entries'}' not found in ledgers`] });
        }

        // AGGREGATE TOTALS
        let subtotal = 0;
        let cgstTotal = 0;
        let sgstTotal = 0;
        let igstTotal = 0;
        let discountTotal = 0;

        const processedItems = [];
        const processedAccountingEntries = [];

        if (importMode === 'item') {
            for (const item of (voucher.items || [])) {
                const taxable = Number(item["Taxable Value (₹)"] || 0);
                const cgst = Number(item["Central Tax (₹)"] || 0);
                const sgst = Number(item["State/UT tax (₹)"] || 0);
                const igst = Number(item["Integrated Tax (₹)"] || 0);
                const rate = Number(item["Rate (%)"] || 0);

                subtotal += taxable;
                cgstTotal += cgst;
                sgstTotal += sgst;
                igstTotal += igst;

                let finalItemId = 0;
                const itemName = item["Item Name"];
                if (itemName) {
                    const si = stockItems.find(it => it.name.toLowerCase().trim() === itemName.toLowerCase().trim());
                    if (si) finalItemId = si.id;
                }

                const findGstLedger = (type, pct) => {
                    let l = ledgers.find(ld => ld.name.toLowerCase().includes(type) && ld.name.includes(pct.toString()));
                    if (!l) l = ledgers.find(ld => ld.name.toLowerCase().includes(type));
                    return l ? l.id : 0;
                };

                const discountPct = Number(item["Discount (%)"] || 0);
                const discountAmt = Number(item["Discount (₹)"] || 0);

                let discountLedgerId = 0;
                if (discountAmt > 0) {
                    discountTotal += discountAmt;
                    let l = ledgers.find(ld => ld.name.toLowerCase().includes("discount") && ld.name.includes(discountPct.toString()));
                    if (!l) l = ledgers.find(ld => ld.name.toLowerCase().includes("discount"));
                    if (l) discountLedgerId = l.id;
                }

                let itemCgstRate = 0;
                let itemSgstRate = 0;
                let itemIgstRate = 0;

                if (igst > 0 || (cgst === 0 && sgst === 0 && rate > 0)) {
                    itemIgstRate = igst > 0 && taxable > 0 ? Number(((igst / taxable) * 100).toFixed(2)) : rate;
                } else {
                    itemCgstRate = cgst > 0 && taxable > 0 ? Number(((cgst / taxable) * 100).toFixed(2)) : (rate > 0 ? rate / 2 : 0);
                    itemSgstRate = sgst > 0 && taxable > 0 ? Number(((sgst / taxable) * 100).toFixed(2)) : (rate > 0 ? rate / 2 : 0);
                }

                processedItems.push({
                    itemId: finalItemId,
                    itemName: itemName,
                    quantity: parseFloat(item["Quantity"]) || 1,
                    rate: parseFloat(item["Item Rate (₹)"]) || taxable,
                    amount: taxable,
                    cgstRate: itemCgstRate,
                    sgstRate: itemSgstRate,
                    igstRate: itemIgstRate,
                    hsnCode: item["HSN Code"] || "",
                    batchNo: item["Batch No"] || "",
                    discount: discountAmt,
                    discountLedgerId: discountLedgerId
                });
            }
        } else {
            for (const ae of (voucher.accountingEntries || [])) {
                const amount = Number(ae["Amount (₹)"] || 0);
                const particulars = ae["Particulars (Ledger Name)"];
                const type = ae["Type"] || "credit";

                if (type === 'credit') {
                    const lName = String(particulars || "").toLowerCase();
                    if (lName.includes("cgst")) cgstTotal += amount;
                    else if (lName.includes("sgst") || lName.includes("utgst")) sgstTotal += amount;
                    else if (lName.includes("igst")) igstTotal += amount;
                    else if (lName.includes("discount")) discountTotal -= amount;
                    else subtotal += amount;
                } else if (type === 'debit' && particulars) {
                    const lName = String(particulars || "").toLowerCase();
                    if (lName.includes("discount")) discountTotal += amount;
                }

                let finalLedgerId = 0;
                if (particulars) {
                    const l = ledgers.find(ld => ld.name.toLowerCase().trim() === particulars.toLowerCase().trim());
                    if (l) finalLedgerId = l.id;
                }

                processedAccountingEntries.push({
                    ledgerId: finalLedgerId,
                    ledgerName: particulars,
                    amount: amount,
                    type: type
                });
            }
        }
        const overallDiscountAmt = Number(voucher.overallDiscount || 0);
        const totalVal = subtotal + cgstTotal + sgstTotal + igstTotal - discountTotal - overallDiscountAmt;

        // 🔹 DETERMINE B2B VS B2C SALES TYPE ID Strictly Based on Excel Data
        const importGstin = voucher["GSTIN of supplier"] ? String(voucher["GSTIN of supplier"]).toUpperCase().replace(/\s+/g, "").trim() : "";
        
        let hasGst = false;
        if (importGstin && importGstin !== "NULL" && importGstin !== "UNDEFINED" && importGstin !== "NAN") {
            hasGst = true;
        }

        const [salesTypes] = await db.execute(
            "SELECT id, sales_type FROM sales_types WHERE company_id = ? AND owner_type = ? AND owner_id = ?",
            [companyId, ownerType, ownerId]
        );

        const targetKeyword = hasGst ? "b2b" : "b2c";
        let matchedSalesType = salesTypes.find(st => String(st.sales_type).toLowerCase().includes(targetKeyword));
        
        if (!matchedSalesType) {
            const secondaryKeywords = hasGst 
                ? ["regular", "gst", "business", "tax"] 
                : ["consumer", "retail", "cash", "unregistered"];
            
            for (const kw of secondaryKeywords) {
                matchedSalesType = salesTypes.find(st => String(st.sales_type).toLowerCase().includes(kw));
                if (matchedSalesType) break;
            }
        }

        let salesTypeId = null;
        if (matchedSalesType) {
            salesTypeId = matchedSalesType.id;
        } else if (salesTypes.length > 0) {
            salesTypeId = salesTypes[0].id;
        }

        // GENERATE VOUCHER NUMBER
        const voucherNumber = await generateVoucherNumber({
            companyId, ownerType, ownerId, voucherType: "sales", date, salesTypeId
        });

        let overallDiscountLedgerId = null;
        if (overallDiscountAmt > 0) {
            let discountLedger = ledgers.find(ld => ld.name.toLowerCase() === "discount to customer") 
                                 || ledgers.find(ld => ld.name.toLowerCase().includes("discount to customer"))
                                 || ledgers.find(ld => ld.name.toLowerCase().includes("discount"));
            overallDiscountLedgerId = discountLedger ? discountLedger.id : null;
        }

        // INSERT MAIN
        const [mainResult] = await db.execute(
            `INSERT INTO sales_vouchers (
                number, date, narration, partyId, referenceNo, 
                subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal, total, 
                company_id, owner_type, owner_id, mode, salesLedgerId, type, isQuotation, sales_type_id,
                overallDiscountAmount, overallDiscountLedgerId
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                voucherNumber, date, voucher.narration || `Imported Sales ${importMode === 'item' ? 'Multi-item' : 'Accounting'}`, partyId, invoiceNo,
                subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal, totalVal,
                companyId, ownerType, ownerId, importMode === 'item' ? 'item-invoice' : 'accounting-invoice', salesLedgerId, 'sales', 0, salesTypeId,
                overallDiscountAmt, overallDiscountLedgerId
            ]
        );

        const voucherId = mainResult.insertId;

        if (importMode === 'item') {
            for (const pi of processedItems) {
                await db.execute(
                    `INSERT INTO sales_voucher_items (
                        voucherId, itemId, quantity, rate, amount, 
                        cgstRate, sgstRate, igstRate, salesLedgerId, hsnCode, batchNumber, discount, discountLedgerId
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        voucherId, pi.itemId, pi.quantity, pi.rate, pi.amount,
                        pi.cgstRate, pi.sgstRate, pi.igstRate, salesLedgerId, pi.hsnCode, pi.batchNo, pi.discount, pi.discountLedgerId
                    ]
                );

                if (pi.itemId) {
                    const stockItem = stockItems.find(si => si.id === pi.itemId);
                    if (stockItem) {
                        let dbBatches = [];
                        try {
                            dbBatches = stockItem.batches ? (typeof stockItem.batches === 'string' ? JSON.parse(stockItem.batches) : stockItem.batches) : [];
                            if (!Array.isArray(dbBatches)) dbBatches = [];
                        } catch (e) { dbBatches = []; }

                        const batchNameLower = pi.batchNo ? String(pi.batchNo).trim().toLowerCase() : "";
                        const existingBatchIndex = dbBatches.findIndex(b => {
                            const dbName = b.batchName ? String(b.batchName).trim().toLowerCase() : "";
                            return dbName === batchNameLower;
                        });

                        if (existingBatchIndex > -1) {
                            dbBatches[existingBatchIndex].batchQuantity = (Number(dbBatches[existingBatchIndex].batchQuantity) || 0) - pi.quantity;
                        }

                        await db.execute("UPDATE stock_items SET batches = ? WHERE id = ?", [JSON.stringify(dbBatches), pi.itemId]);
                    }
                }

                if (pi.itemId) {
                    const historyValues = [[
                        pi.itemName, pi.hsnCode, pi.batchNo || "", pi.quantity, pi.rate, date,
                        null, voucherNumber, companyId, ownerType, ownerId
                    ]];
                    await db.query(`INSERT INTO sale_history (itemName, hsnCode, batchNumber, qtyChange, rate, movementDate, godownId, voucherNumber, companyId, ownerType, ownerId) VALUES ?`, [historyValues]);
                }
            }
        } else {
            const entryValues = processedAccountingEntries.map(ae => [
                voucherId, ae.ledgerId, ae.ledgerName, ae.amount, ae.type, null, null, null, null
            ]);

            if (entryValues.length > 0) {
                await db.query(
                    `INSERT INTO voucher_entries (voucher_id, ledger_id, ledger_name, amount, entry_type, narration, bank_name, cheque_number, cost_centre_id) VALUES ?`,
                    [entryValues]
                );
            }
        }

        if (overallDiscountAmt > 0) {
            let discountLedger = ledgers.find(ld => ld.name.toLowerCase() === "discount to customer") 
                                 || ledgers.find(ld => ld.name.toLowerCase().includes("discount to customer"))
                                 || ledgers.find(ld => ld.name.toLowerCase().includes("discount"));
            
            const ledgerId = discountLedger ? discountLedger.id : null;
            const ledgerName = discountLedger ? discountLedger.name : "Discount to Customer";

            await db.execute(
                `INSERT INTO voucher_entries (voucher_id, ledger_id, ledger_name, amount, entry_type, narration, bank_name, cheque_number, cost_centre_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [voucherId, ledgerId, ledgerName, overallDiscountAmt, "debit", null, null, null, null]
            );
        }


        if (salesTypeId) {
            try {
                await renumberVouchers({
                    companyId,
                    ownerType,
                    ownerId,
                    voucherType: "sales",
                    date,
                    salesTypeId
                });
            } catch (renumberErr) {
                console.error("⚠️ Failed to renumber sales vouchers post-import:", renumberErr.message);
            }
        }

        return res.json({
            success: true,
            imported: 1,
            vouchers: [voucherNumber]
        });

    } catch (error) {
        console.error("❌ Sales Summary Import Error:", error);
        return res.status(500).json({ success: false, message: "Import failed: " + error.message });
    }
});

module.exports = router;

