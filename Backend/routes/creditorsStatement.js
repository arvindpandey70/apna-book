const express = require("express");
const router = express.Router();
const db = require("../db");
const { syncAllPendingSalesVouchers } = require("../utils/gstTransactionSync");

/**
 * Clean & normalize GST number
 */
function normalizeGst(gst) {
  return String(gst || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Helper to safely format Date to YYYY-MM-DD
 */
function formatDate(d) {
  if (!d) return "";
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return String(d).split("T")[0] || "";
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Helper to calculate ageing bucket
 */
function getAgeBucket(days) {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/**
 * GET /api/creditors-statement
 * Fetches real Sundry Creditors, Statement Transactions, Multi-Company Synced records, and Ageing Bills.
 * Automatically synchronizes any cross-company transactions on load.
 */
router.get("/", async (req, res) => {
  try {
    const { company_id, fromDate, toDate, creditorId } = req.query;

    if (!company_id) {
      return res.status(400).json({ success: false, message: "company_id parameter is required" });
    }

    // 1. Fetch Company Master Info
    const [coRows] = await db.execute(
      "SELECT id, name, gst_number, address, pin, state, phone_number, email FROM tbcompanies WHERE id = ?",
      [company_id]
    );
    const company = coRows.length > 0 ? coRows[0] : { id: company_id, name: "Company" };

    // 2. Fetch Other Companies for cross-company GST sync detection
    const [otherCompanies] = await db.execute(
      `SELECT id, name, gst_number, state, address, phone_number, email 
       FROM tbcompanies 
       WHERE id != ? AND gst_number IS NOT NULL AND TRIM(gst_number) != ''`,
      [company_id]
    );

    // 3. Fetch All Sundry Creditors for this company
    // Criteria: group_id IN (-109, 14) OR name contains 'supplier'/'creditor' OR partyId in purchase_vouchers
    const [creditorRows] = await db.execute(
      `SELECT 
         l.id, 
         l.name, 
         l.group_id AS groupId, 
         COALESCE(l.opening_balance, 0) AS openingBalance, 
         COALESCE(l.balance_type, 'credit') AS balanceType,
         COALESCE(l.address, '') AS address, 
         COALESCE(l.district, '') AS city, 
         COALESCE(l.state, '') AS state, 
         COALESCE(l.phone, '') AS phone, 
         COALESCE(l.email, '') AS email,
         COALESCE(l.gst_number, '') AS gstNumber, 
         COALESCE(l.pan_number, '') AS panNumber
       FROM ledgers l
       WHERE l.company_id = ?
         AND (
           l.group_id IN (-109, 14)
           OR LOWER(l.name) LIKE '%supplier%'
           OR LOWER(l.name) LIKE '%creditor%'
           OR l.id IN (SELECT DISTINCT partyId FROM purchase_vouchers WHERE company_id = ?)
         )
       ORDER BY l.name ASC`,
      [company_id, company_id]
    );

    // 4. Fetch all synced vouchers involving this company
    const [syncedVoucherRows] = await db.execute(
      `SELECT *,
              DATE_FORMAT(synced_at, '%Y-%m-%d %H:%i') as formatted_sync_date,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as formatted_date
       FROM company_gst_synced_vouchers 
       WHERE target_company_id = ? OR source_company_id = ?
       ORDER BY id DESC`,
      [company_id, company_id]
    );

    // 5. Pre-aggregate purchases, payments, and multi-company status for each creditor
    const [allPurchases] = await db.execute(
      `SELECT pv.id, pv.number, pv.date, pv.partyId, pv.total, pv.referenceNo, 
              pv.supplierInvoiceDate, pv.narration, pv.synced_from_sales_voucher_id, pv.synced_from_company_id,
              COALESCE(pv.subtotal, 0) AS subtotal,
              COALESCE(pv.cgstTotal, 0) AS cgst,
              COALESCE(pv.sgstTotal, 0) AS sgst,
              COALESCE(pv.igstTotal, 0) AS igst
       FROM purchase_vouchers pv
       WHERE pv.company_id = ?`,
      [company_id]
    );

    const [allPayments] = await db.execute(
      `SELECT vm.id, vm.voucher_number, vm.date, vm.narration, vm.reference_no, 
              ve.ledger_id, ve.amount, ve.entry_type
       FROM voucher_main vm
       JOIN voucher_entries ve ON ve.voucher_id = vm.id
       WHERE vm.company_id = ? AND vm.voucher_type = 'payment'`,
      [company_id]
    );

    const [allDebitNotes] = await db.execute(
      `SELECT dnv.id, dnv.number, dnv.date, dnv.party_id, dnv.narration,
              COALESCE(SUM(dne.amount), 0) AS total
       FROM debit_note_vouchers dnv
       LEFT JOIN debit_note_entries dne ON dne.voucher_id = dnv.id
       WHERE dnv.company_id = ?
       GROUP BY dnv.id`,
      [company_id]
    );

    const [allJournals] = await db.execute(
      `SELECT vm.id, vm.voucher_number, vm.date, vm.narration, vm.reference_no,
              ve.ledger_id, ve.amount, ve.entry_type
       FROM voucher_main vm
       JOIN voucher_entries ve ON ve.voucher_id = vm.id
       WHERE vm.company_id = ? AND vm.voucher_type = 'journal'`,
      [company_id]
    );

    // Build enriched Creditor summaries
    const ownCompanyGst = normalizeGst(company.gst_number);
    const ownCompanyName = String(company.name || "").trim().toLowerCase();
    const creditorsList = creditorRows.map((cred) => {
      const normCredGst = normalizeGst(cred.gstNumber);
      const rawCredName = String(cred.name || "").trim().toLowerCase();

      // Check multi-company match
      let linkedCompany = null;
      let isMultiCompanySynced = false;

      // 1) Match against other companies by GST or embedded GST in name
      for (const comp of otherCompanies) {
        const normCompGst = normalizeGst(comp.gst_number);
        const rawCompName = String(comp.name || "").trim().toLowerCase();
        if (normCompGst) {
          if (normCredGst && normCredGst === normCompGst) {
            linkedCompany = comp;
            isMultiCompanySynced = true;
            break;
          }
          if (rawCredName.includes(normCompGst.toLowerCase()) || String(cred.name || "").toUpperCase().includes(normCompGst)) {
            linkedCompany = comp;
            isMultiCompanySynced = true;
            break;
          }
        }
        if (rawCompName && (rawCredName === rawCompName || rawCredName.startsWith(rawCompName))) {
          linkedCompany = comp;
          isMultiCompanySynced = true;
          break;
        }
      }

      // 2) Check if creditor has purchase vouchers with synced_from_sales_voucher_id
      const credPurchases = allPurchases.filter((p) => Number(p.partyId) === Number(cred.id));
      const hasSyncedPv = credPurchases.some((p) => p.synced_from_sales_voucher_id != null);
      if (hasSyncedPv) {
        isMultiCompanySynced = true;
      }

      // Check sync records
      const syncRowsForCred = syncedVoucherRows.filter((s) => {
        return (
          Number(s.target_company_id) === Number(company_id) &&
          (normCredGst && normalizeGst(s.source_company_gst) === normCredGst)
        );
      });
      if (syncRowsForCred.length > 0) {
        isMultiCompanySynced = true;
        if (!linkedCompany) {
          linkedCompany = {
            name: syncRowsForCred[0].source_company_name,
            gst_number: syncRowsForCred[0].source_company_gst
          };
        }
      }

      const totalPurchasesAmount = credPurchases.reduce((sum, p) => sum + Number(p.total || 0), 0);

      const credPayments = allPayments.filter((p) => Number(p.ledger_id) === Number(cred.id) && p.entry_type === "debit");
      const totalPaymentsAmount = credPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const credDebitNotes = allDebitNotes.filter((d) => Number(d.party_id) === Number(cred.id));
      const totalDebitNotesAmount = credDebitNotes.reduce((sum, d) => sum + Number(d.total || 0), 0);

      const opBal = Number(cred.openingBalance || 0);
      const isOpCr = cred.balanceType.toLowerCase() === "credit" || cred.balanceType.toLowerCase() === "cr";
      const signedOp = isOpCr ? opBal : -opBal;

      const closingNet = signedOp + totalPurchasesAmount - totalPaymentsAmount - totalDebitNotesAmount;
      const closingBalance = Math.abs(closingNet);
      const closingBalanceType = closingNet >= 0 ? "Cr" : "Dr";

      return {
        id: String(cred.id),
        name: cred.name,
        alias: "",
        contactPerson: "Accounts Dept",
        phone: cred.phone || "-",
        email: cred.email || "-",
        address: cred.address || "-",
        city: cred.city || cred.state || "India",
        state: cred.state || "-",
        gstNumber: cred.gstNumber || "-",
        panNumber: cred.panNumber || "-",
        creditPeriodDays: 30,
        creditLimit: 500000,
        openingBalance: opBal,
        openingBalanceType: isOpCr ? "Cr" : "Dr",
        totalPurchases: totalPurchasesAmount,
        totalPayments: totalPaymentsAmount,
        totalAdjustments: totalDebitNotesAmount,
        closingBalance,
        closingBalanceType,
        isMultiCompanySynced,
        linkedCompanyName: linkedCompany?.name || null,
        linkedCompanyGst: linkedCompany?.gst_number || null,
        syncedVouchersCount: credPurchases.filter((p) => p.synced_from_sales_voucher_id != null).length
      };
    }).filter((creditor) => {
      const matchesOwnGst = ownCompanyGst && normalizeGst(creditor.gstNumber) === ownCompanyGst;
      const matchesOwnName = ownCompanyName && String(creditor.name || "").trim().toLowerCase() === ownCompanyName;
      return creditor.isMultiCompanySynced && !matchesOwnGst && !matchesOwnName;
    });

    // 6. Selected Creditor resolution
    let selectedCreditor = null;
    if (creditorId) {
      selectedCreditor = creditorsList.find((c) => String(c.id) === String(creditorId)) || null;
    }
    if (!selectedCreditor && creditorsList.length > 0) {
      // Prefer multi-company synced creditor or creditor with purchase vouchers
      const preferred = creditorsList.find((c) => c.isMultiCompanySynced || c.totalPurchases > 0);
      selectedCreditor = preferred || creditorsList[0];
    }

    // 7. If no creditor found, return empty payload cleanly
    if (!selectedCreditor) {
      return res.json({
        success: true,
        company,
        creditors: [],
        selectedCreditor: null,
        statementTransactions: [],
        pendingBills: [],
        statementSummary: {
          openingBalance: 0,
          openingBalanceType: "Cr",
          totalPurchases: 0,
          totalPayments: 0,
          totalDebitNotes: 0,
          totalDebits: 0,
          totalCredits: 0,
          closingBalance: 0,
          closingBalanceType: "Cr",
          transactionCount: 0
        },
        ageingBreakdown: {
          b0_30: 0,
          b31_60: 0,
          b61_90: 0,
          b90_plus: 0,
          totalPending: 0
        },
        syncedTransactions: syncedVoucherRows,
        connectedCompanies: otherCompanies
      });
    }

    // 8. Assemble Full Chronological Transactions for the Selected Creditor
    const targetCredId = Number(selectedCreditor.id);
    const rawTransactions = [];

    // A) Purchases (Credit)
    const selPurchases = allPurchases.filter((p) => Number(p.partyId) === targetCredId);
    selPurchases.forEach((p) => {
      const isSynced = p.synced_from_sales_voucher_id != null;
      let syncedCompany = selectedCreditor.linkedCompanyName || "Sister Company";
      let syncedGst = selectedCreditor.linkedCompanyGst || "";

      // Lookup in synced vouchers table for exact original invoice details
      const syncInfo = syncedVoucherRows.find((s) => Number(s.target_voucher_id) === Number(p.id));
      if (syncInfo) {
        syncedCompany = syncInfo.source_company_name;
        syncedGst = syncInfo.source_company_gst;
      }

      const pDate = formatDate(p.date);
      const dueDate = formatDate(p.supplierInvoiceDate || p.date);

      rawTransactions.push({
        id: `pv-${p.id}`,
        voucherId: p.id,
        date: pDate,
        voucherType: "Purchase",
        voucherNo: p.number,
        refNo: p.referenceNo || "-",
        dueDate: dueDate || "-",
        igst: Number(p.igst || 0),
        cgst: Number(p.cgst || 0),
        sgst: Number(p.sgst || 0),
        debit: 0,
        credit: Number(p.total || 0),
        narration: p.narration || (isSynced ? `Auto-synced from Sales Inv #${p.referenceNo} (${syncedCompany})` : ""),
        isMultiCompanySynced: isSynced,
        syncedFromCompany: isSynced ? syncedCompany : null,
        syncedFromGst: isSynced ? syncedGst : null,
        originalSalesInvoice: isSynced ? (p.referenceNo || syncInfo?.source_voucher_number) : null,
        particulars: isSynced
          ? `To Purchase A/c (Auto-synced from ${syncedCompany})`
          : "To Purchase A/c"
      });
    });

    // B) Payments (Debit)
    const selPayments = allPayments.filter((p) => Number(p.ledger_id) === targetCredId && p.entry_type === "debit");
    selPayments.forEach((p) => {
      rawTransactions.push({
        id: `pay-${p.id}`,
        voucherId: p.id,
        date: formatDate(p.date),
        voucherType: "Payment",
        voucherNo: p.voucher_number,
        refNo: p.reference_no || "-",
        dueDate: "-",
        igst: 0,
        cgst: 0,
        sgst: 0,
        debit: Number(p.amount || 0),
        credit: 0,
        narration: p.narration || "Supplier payment disbursement",
        isMultiCompanySynced: false,
        syncedFromCompany: null,
        syncedFromGst: null,
        originalSalesInvoice: null,
        particulars: "By Bank / Cash Settlement"
      });
    });

    // C) Debit Notes (Debit)
    const selDebitNotes = allDebitNotes.filter((d) => Number(d.party_id) === targetCredId);
    selDebitNotes.forEach((d) => {
      rawTransactions.push({
        id: `dn-${d.id}`,
        voucherId: d.id,
        date: formatDate(d.date),
        voucherType: "Debit Note",
        voucherNo: d.number,
        refNo: "-",
        dueDate: "-",
        igst: 0,
        cgst: 0,
        sgst: 0,
        debit: Number(d.total || 0),
        credit: 0,
        narration: d.narration || "Goods return / rate adjustment",
        isMultiCompanySynced: false,
        syncedFromCompany: null,
        syncedFromGst: null,
        originalSalesInvoice: null,
        particulars: "By Purchase Return / Debit Note"
      });
    });

    // D) Journal Entries
    const selJournals = allJournals.filter((j) => Number(j.ledger_id) === targetCredId);
    selJournals.forEach((j) => {
      const isDebit = j.entry_type === "debit";
      rawTransactions.push({
        id: `jv-${j.id}`,
        voucherId: j.id,
        date: formatDate(j.date),
        voucherType: "Journal",
        voucherNo: j.voucher_number,
        refNo: j.reference_no || "-",
        dueDate: "-",
        igst: 0,
        cgst: 0,
        sgst: 0,
        debit: isDebit ? Number(j.amount || 0) : 0,
        credit: !isDebit ? Number(j.amount || 0) : 0,
        narration: j.narration || "Journal adjustment",
        isMultiCompanySynced: false,
        syncedFromCompany: null,
        syncedFromGst: null,
        originalSalesInvoice: null,
        particulars: "By Journal Adjustment"
      });
    });

    // Sort all raw transactions ascending by date
    rawTransactions.sort((a, b) => {
      if (a.date === b.date) return 0;
      return a.date < b.date ? -1 : 1;
    });

    // 9. Process Date Filtering & Running Balance
    let initialOp = selectedCreditor.openingBalance;
    if (selectedCreditor.openingBalanceType === "Dr") {
      initialOp = -initialOp;
    }

    let runningBalance = initialOp;
    let periodOpening = initialOp;
    const finalTransactions = [];

    let totalPeriodPurchases = 0;
    let totalPeriodPayments = 0;
    let totalPeriodDebitNotes = 0;
    let totalPeriodDebits = 0;
    let totalPeriodCredits = 0;
    let totalPeriodIgst = 0;
    let totalPeriodCgst = 0;
    let totalPeriodSgst = 0;

    for (const tx of rawTransactions) {
      if (fromDate && tx.date < fromDate) {
        // Prior to fromDate -> rolls into periodOpening
        runningBalance = runningBalance + tx.credit - tx.debit;
        periodOpening = runningBalance;
      } else if (!toDate || tx.date <= toDate) {
        // Within requested period
        runningBalance = runningBalance + tx.credit - tx.debit;
        const isCr = runningBalance >= 0;

        if (tx.voucherType === "Purchase") totalPeriodPurchases += tx.credit;
        else if (tx.voucherType === "Payment") totalPeriodPayments += tx.debit;
        else if (tx.voucherType === "Debit Note") totalPeriodDebitNotes += tx.debit;

        totalPeriodDebits += tx.debit;
        totalPeriodCredits += tx.credit;
        totalPeriodIgst += Number(tx.igst || 0);
        totalPeriodCgst += Number(tx.cgst || 0);
        totalPeriodSgst += Number(tx.sgst || 0);

        let status = "Unpaid";
        if (tx.voucherType === "Payment") status = "Paid";
        else if (tx.voucherType === "Debit Note" || tx.voucherType === "Journal") status = "Adjusted";

        finalTransactions.push({
          ...tx,
          balance: Math.abs(runningBalance),
          balanceType: isCr ? "Cr" : "Dr",
          status
        });
      }
    }

    const periodClosingNet = runningBalance;
    const periodClosingBalance = Math.abs(periodClosingNet);
    const periodClosingType = periodClosingNet >= 0 ? "Cr" : "Dr";

    // 10. Generate Real Pending Bills & Ageing for Selected Creditor
    const today = new Date();
    let totalPaidToCreditor = selPayments.reduce((s, p) => s + Number(p.amount || 0), 0) +
                            selDebitNotes.reduce((s, d) => s + Number(d.total || 0), 0);

    const pendingBills = [];
    let b0_30 = 0;
    let b31_60 = 0;
    let b61_90 = 0;
    let b90_plus = 0;

    // Allocate payments FIFO across purchase vouchers
    for (const pv of selPurchases) {
      const origAmt = Number(pv.total || 0);
      let paidAgainstThis = 0;

      if (totalPaidToCreditor >= origAmt) {
        paidAgainstThis = origAmt;
        totalPaidToCreditor -= origAmt;
      } else if (totalPaidToCreditor > 0) {
        paidAgainstThis = totalPaidToCreditor;
        totalPaidToCreditor = 0;
      }

      const pendingAmount = origAmt - paidAgainstThis;
      if (pendingAmount > 0) {
        const billDateStr = formatDate(pv.date);
        const dueDateStr = formatDate(pv.supplierInvoiceDate || pv.date);
        const dueDateTime = new Date(dueDateStr).getTime();
        const diffMs = today.getTime() - dueDateTime;
        const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        const bracket = getAgeBucket(daysOverdue);

        if (bracket === "0-30") b0_30 += pendingAmount;
        else if (bracket === "31-60") b31_60 += pendingAmount;
        else if (bracket === "61-90") b61_90 += pendingAmount;
        else b90_plus += pendingAmount;

        const isSynced = pv.synced_from_sales_voucher_id != null;

        pendingBills.push({
          billNo: pv.number,
          refNo: pv.referenceNo || "-",
          billDate: billDateStr,
          dueDate: dueDateStr,
          originalAmount: origAmt,
          paidAmount: paidAgainstThis,
          pendingAmount,
          daysOverdue,
          ageBracket: bracket,
          isMultiCompanySynced: isSynced,
          syncedFromCompany: isSynced ? (selectedCreditor.linkedCompanyName || "Sister Company") : null
        });
      }
    }

    const totalPending = b0_30 + b31_60 + b61_90 + b90_plus;

    return res.json({
      success: true,
      company,
      creditors: creditorsList,
      selectedCreditor,
      statementTransactions: finalTransactions,
      pendingBills,
      statementSummary: {
        openingBalance: Math.abs(periodOpening),
        openingBalanceType: periodOpening >= 0 ? "Cr" : "Dr",
        totalPurchases: totalPeriodPurchases,
        totalPayments: totalPeriodPayments,
        totalDebitNotes: totalPeriodDebitNotes,
        totalDebits: totalPeriodDebits,
        totalCredits: totalPeriodCredits,
        totalIgst: totalPeriodIgst,
        totalCgst: totalPeriodCgst,
        totalSgst: totalPeriodSgst,
        closingBalance: periodClosingBalance,
        closingBalanceType: periodClosingType,
        transactionCount: finalTransactions.length
      },
      ageingBreakdown: {
        b0_30,
        b31_60,
        b61_90,
        b90_plus,
        totalPending
      },
      syncedTransactions: syncedVoucherRows,
      connectedCompanies: otherCompanies
    });
  } catch (err) {
    console.error("🔥 Creditors Statement Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/creditors-statement/sync-now
 * Triggers full multi-company GST sync immediately for this company
 */
router.post("/sync-now", async (req, res) => {
  try {
    const { company_id } = req.body;
    const result = await syncAllPendingSalesVouchers(null);
    return res.json({
      success: true,
      result,
      message: `Multi-Company GST Sync completed: ${result.syncedCount} vouchers synchronized.`
    });
  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
