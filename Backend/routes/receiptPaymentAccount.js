const express = require('express');
const router = express.Router();
const pool = require('../db');

const normalizeStr = (v, maxLen = 64) => {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, maxLen);
};

const toYmdDate = (v) => {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Resolve all Cash-in-Hand (-112) and Bank Accounts (-113 / -114) groups and their child groups,
 * then return all ledgers belonging to Cash or Bank for the given tenant.
 */
async function resolveCashAndBankLedgers(companyId, ownerType, ownerId) {
  const [groupRows] = await pool.query(
    `SELECT id, name, parent, type
     FROM ledger_groups
     WHERE company_id = ? OR company_id = 0 OR id < 0`,
    [companyId]
  );

  const cashGroupIds = new Set([-112]);
  const bankGroupIds = new Set([-113, -114]);

  for (const g of groupRows || []) {
    const gid = Number(g.id);
    const name = String(g.name || '').trim().toLowerCase();
    const gtype = String(g.type || '').trim().toLowerCase();
    const pid = g.parent != null ? Number(g.parent) : null;

    if (
      gid === -112 ||
      pid === -112 ||
      gtype === 'cash' ||
      name === 'cash' ||
      name.includes('cash-in-hand') ||
      name.includes('cash in hand') ||
      name.includes('petty cash')
    ) {
      cashGroupIds.add(gid);
    }

    if (
      gid === -113 ||
      gid === -114 ||
      pid === -113 ||
      pid === -114 ||
      gtype === 'bank' ||
      name.includes('bank account') ||
      name.includes('bank od') ||
      name.includes('bank occ') ||
      name === 'bank'
    ) {
      bankGroupIds.add(gid);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groupRows || []) {
      const gid = Number(g.id);
      const pid = g.parent != null ? Number(g.parent) : null;
      if (pid === null) continue;
      if (cashGroupIds.has(pid) && !cashGroupIds.has(gid)) {
        cashGroupIds.add(gid);
        changed = true;
      }
      if (bankGroupIds.has(pid) && !bankGroupIds.has(gid)) {
        bankGroupIds.add(gid);
        changed = true;
      }
    }
  }

  const allGroupIds = Array.from(new Set([...cashGroupIds, ...bankGroupIds]));

  let ledgerSql = `
    SELECT id, name, group_id, opening_balance, balance_type
    FROM ledgers
    WHERE company_id = ?
      AND group_id IN (?)
  `;
  const ledgerParams = [companyId, allGroupIds];

  if (ownerType && ownerId) {
    ledgerSql += ` AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0)`;
    ledgerParams.push(ownerType, ownerId);
  }

  ledgerSql += ` ORDER BY name ASC, id ASC`;

  const [rows] = await pool.query(ledgerSql, ledgerParams);
  const ledgerMap = new Map();

  for (const l of rows || []) {
    const id = Number(l.id);
    if (!Number.isFinite(id)) continue;
    const gid = Number(l.group_id);
    const kind = cashGroupIds.has(gid) ? 'cash' : 'bank';
    const rawOpening = Math.abs(Number(l.opening_balance) || 0);
    const signedOpening =
      String(l.balance_type || 'debit').toLowerCase() === 'credit'
        ? -rawOpening
        : rawOpening;

    ledgerMap.set(id, {
      id,
      name: String(l.name || (kind === 'cash' ? 'Cash' : 'Bank')),
      groupId: gid,
      kind,
      baseOpening: signedOpening,
    });
  }

  return ledgerMap;
}

/**
 * GET /api/receipt-payment-account
 * Returns Tally-standard Receipt and Payment Account summary, account-wise balances,
 * and linked Cash/Bank voucher entries (Receipt, Payment, Cash Sales, Cash Purchase, Contra, Journal).
 */
router.get('/api/receipt-payment-account', async (req, res) => {
  try {
    const company_id = normalizeStr(req.query.company_id || req.query.companyId, 64);
    const owner_type = normalizeStr(req.query.owner_type || req.query.ownerType, 32) || null;
    const owner_id = normalizeStr(req.query.owner_id || req.query.ownerId, 64) || null;
    const fromDate = toYmdDate(req.query.fromDate || req.query.from_date);
    const toDate = toYmdDate(req.query.toDate || req.query.to_date);
    const accountScope = normalizeStr(req.query.accountScope || req.query.account_scope || 'all', 64).toLowerCase();
    const includeContraParam = normalizeStr(req.query.includeContra || req.query.include_contra, 16).toLowerCase();
    const includeContra = includeContraParam === 'true' || includeContraParam === '1';

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const ledgerMap = await resolveCashAndBankLedgers(company_id, owner_type, owner_id);
    const allLedgers = Array.from(ledgerMap.values());

    if (allLedgers.length === 0) {
      return res.json({
        success: true,
        summary: {
          openingCash: 0,
          openingBank: 0,
          openingTotal: 0,
          totalReceipts: 0,
          totalPayments: 0,
          closingCash: 0,
          closingBank: 0,
          closingTotal: 0,
          leftGrandTotal: 0,
          rightGrandTotal: 0,
          contraExcludedCount: 0,
          contraExcludedAmount: 0,
        },
        accounts: [],
        receipts: [],
        payments: [],
        voucherBreakdown: {
          receipt: { count: 0, amount: 0 },
          payment: { count: 0, amount: 0 },
          sales: { count: 0, amount: 0 },
          purchase: { count: 0, amount: 0 },
          contra: { count: 0, amount: 0 },
          journal: { count: 0, amount: 0 },
        },
      });
    }

    // Determine which Cash/Bank ledgers are in the requested scope
    const selectedLedgerIds = new Set();
    if (accountScope === 'cash') {
      allLedgers.filter((l) => l.kind === 'cash').forEach((l) => selectedLedgerIds.add(l.id));
    } else if (accountScope === 'bank') {
      allLedgers.filter((l) => l.kind === 'bank').forEach((l) => selectedLedgerIds.add(l.id));
    } else if (accountScope && accountScope !== 'all') {
      const specificId = Number(accountScope.replace(/^ledger:/, ''));
      if (ledgerMap.has(specificId)) {
        selectedLedgerIds.add(specificId);
      }
    }
    if (selectedLedgerIds.size === 0 && accountScope === 'all') {
      allLedgers.forEach((l) => selectedLedgerIds.add(l.id));
    }

    const allCashBankIds = allLedgers.map((l) => l.id);

    // Track per-ledger movements: before period (opening adj) and within period (receipts/payments)
    const ledgerStats = new Map();
    for (const l of allLedgers) {
      ledgerStats.set(l.id, {
        ...l,
        opening: l.baseOpening,
        receipts: 0,
        payments: 0,
        closing: l.baseOpening,
      });
    }

    // Collect normalized Cash/Bank events across all voucher sources
    // Each event: { id, voucherId, date, voucherNo, voucherType, accountLedgerId, accountHead, accountKind, particulars, narration, entryType ('debit'|'credit'), amount, isInternalContra }
    const allEvents = [];

    // -------------------------------------------------------------------------
    // 1. ACCOUNTING VOUCHERS (voucher_main + voucher_entries)
    //    Includes: receipt, payment, contra, journal (whenever Cash/Bank ledger is hit)
    // -------------------------------------------------------------------------
    let vmSql = `
      SELECT
        ve.id AS entryId,
        ve.voucher_id AS voucherId,
        ve.ledger_id AS ledgerId,
        ve.ledger_name AS entryLedgerName,
        ve.amount,
        ve.entry_type AS entryType,
        ve.narration AS entryNarration,
        vm.voucher_type AS voucherType,
        vm.voucher_number AS voucherNumber,
        DATE_FORMAT(vm.date, '%Y-%m-%d') AS date,
        vm.reference_no AS referenceNo,
        vm.narration AS voucherNarration
      FROM voucher_entries ve
      INNER JOIN voucher_main vm ON vm.id = ve.voucher_id
      WHERE ve.ledger_id IN (?)
        AND vm.company_id = ?
        AND LOWER(TRIM(vm.voucher_type)) IN ('receipt', 'payment', 'contra', 'journal')
        AND (ve.voucher_type IS NULL OR LOWER(TRIM(ve.voucher_type)) IN ('accounting', 'journal', 'contra', 'receipt', 'payment', ''))
    `;
    const vmParams = [allCashBankIds, company_id];
    if (owner_type && owner_id) {
      vmSql += ` AND vm.owner_type = ? AND vm.owner_id = ?`;
      vmParams.push(owner_type, owner_id);
    }
    if (toDate) {
      vmSql += ` AND vm.date <= ?`;
      vmParams.push(toDate);
    }
    vmSql += ` ORDER BY vm.date ASC, vm.id ASC, ve.id ASC`;

    const [vmRows] = await pool.query(vmSql, vmParams);
    const vmIds = Array.from(new Set((vmRows || []).map((r) => r.voucherId).filter(Boolean)));
    const linesByVm = new Map();

    if (vmIds.length > 0) {
      const [allLines] = await pool.query(
        `SELECT ve.id AS entryId, ve.voucher_id AS voucherId, ve.ledger_id AS ledgerId,
                COALESCE(l.name, ve.ledger_name) AS ledgerName, ve.entry_type AS entryType
         FROM voucher_entries ve
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         WHERE ve.voucher_id IN (?)
           AND (ve.voucher_type IS NULL OR LOWER(TRIM(ve.voucher_type)) IN ('accounting', 'journal', 'contra', 'receipt', 'payment', ''))`,
        [vmIds]
      );
      for (const line of allLines || []) {
        if (!linesByVm.has(line.voucherId)) linesByVm.set(line.voucherId, []);
        linesByVm.get(line.voucherId).push(line);
      }
    }

    for (const r of vmRows || []) {
      const lid = Number(r.ledgerId);
      const acct = ledgerMap.get(lid);
      if (!acct) continue;

      const vType = String(r.voucherType || '').trim().toLowerCase();
      const entryType = String(r.entryType || 'debit').trim().toLowerCase() === 'credit' ? 'credit' : 'debit';
      const amt = Math.abs(Number(r.amount) || 0);
      if (amt <= 0) continue;

      const allLines = linesByVm.get(r.voucherId) || [];
      const oppositeLines = allLines.filter(
        (l) => l.entryId !== r.entryId && String(l.entryType || '').toLowerCase() !== entryType
      );
      const oppositeNames = Array.from(
        new Set(oppositeLines.map((l) => String(l.ledgerName || '').trim()).filter(Boolean))
      );

      // Contra is internal to the active scope if every opposite line is also inside selectedLedgerIds
      const isInternalContra =
        vType === 'contra' &&
        oppositeLines.length > 0 &&
        oppositeLines.every((l) => selectedLedgerIds.has(Number(l.ledgerId)));

      allEvents.push({
        id: `vm-${r.entryId}`,
        voucherId: String(r.voucherId),
        date: toYmdDate(r.date),
        voucherNo: String(r.voucherNumber || '-'),
        voucherType: vType,
        accountLedgerId: lid,
        accountHead: acct.name,
        accountKind: acct.kind,
        particulars:
          oppositeNames.join(', ') ||
          String(r.entryNarration || r.voucherNarration || `${vType.toUpperCase()} Voucher`),
        narration: String(r.entryNarration || r.voucherNarration || r.referenceNo || ''),
        entryType,
        amount: amt,
        isInternalContra,
      });
    }

    // -------------------------------------------------------------------------
    // 2. CASH / BANK SALES VOUCHERS (sales_vouchers)
    //    - Item-invoice: partyId is Cash/Bank -> Debit (Receipt)
    //    - Accounting-invoice: voucher_entries on Cash/Bank (fallback to partyId if no entries)
    // -------------------------------------------------------------------------
    let svSql = `
      SELECT
        sv.id AS voucherId,
        sv.number AS voucherNumber,
        DATE_FORMAT(sv.date, '%Y-%m-%d') AS date,
        sv.partyId,
        sv.salesLedgerId,
        sv.total,
        sv.mode,
        sv.narration,
        sv.referenceNo,
        ls.name AS salesLedgerName
      FROM sales_vouchers sv
      LEFT JOIN ledgers ls ON ls.id = sv.salesLedgerId
      WHERE sv.company_id = ?
        AND sv.type = 'sales'
        AND sv.isQuotation = 0
    `;
    const svParams = [company_id];
    if (owner_type && owner_id) {
      svSql += ` AND sv.owner_type = ? AND sv.owner_id = ?`;
      svParams.push(owner_type, owner_id);
    }
    if (toDate) {
      svSql += ` AND sv.date <= ?`;
      svParams.push(toDate);
    }

    const [svRows] = await pool.query(svSql, svParams);
    const accSalesIds = (svRows || [])
      .filter((sv) => String(sv.mode || '').toLowerCase() === 'accounting-invoice')
      .map((sv) => sv.voucherId);

    const salesEntriesByVoucher = new Map();
    if (accSalesIds.length > 0) {
      const [svEntryRows] = await pool.query(
        `SELECT ve.id AS entryId, ve.voucher_id AS voucherId, ve.ledger_id AS ledgerId,
                COALESCE(l.name, ve.ledger_name) AS ledgerName, ve.amount, ve.entry_type AS entryType,
                ve.narration
         FROM voucher_entries ve
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         WHERE ve.voucher_id IN (?)
           AND (ve.voucher_type IS NULL OR LOWER(TRIM(ve.voucher_type)) IN ('sales', 'accounting', ''))`,
        [accSalesIds]
      );
      for (const e of svEntryRows || []) {
        if (!salesEntriesByVoucher.has(e.voucherId)) salesEntriesByVoucher.set(e.voucherId, []);
        salesEntriesByVoucher.get(e.voucherId).push(e);
      }
    }

    for (const sv of svRows || []) {
      const mode = String(sv.mode || 'item-invoice').toLowerCase();
      const svDate = toYmdDate(sv.date);
      const svNo = String(sv.voucherNumber || '-');

      if (mode === 'accounting-invoice') {
        const entries = salesEntriesByVoucher.get(sv.voucherId) || [];
        const cbEntries = entries.filter((e) => ledgerMap.has(Number(e.ledgerId)));
        if (cbEntries.length > 0) {
          for (const e of cbEntries) {
            const lid = Number(e.ledgerId);
            const acct = ledgerMap.get(lid);
            const entryType = String(e.entryType || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit';
            const amt = Math.abs(Number(e.amount) || 0);
            if (!acct || amt <= 0) continue;

            const oppNames = Array.from(
              new Set(
                entries
                  .filter((x) => x.entryId !== e.entryId && String(x.entryType || '').toLowerCase() !== entryType)
                  .map((x) => String(x.ledgerName || '').trim())
                  .filter(Boolean)
              )
            );
            allEvents.push({
              id: `sv-acc-${e.entryId}`,
              voucherId: String(sv.voucherId),
              date: svDate,
              voucherNo: svNo,
              voucherType: 'sales',
              accountLedgerId: lid,
              accountHead: acct.name,
              accountKind: acct.kind,
              particulars: oppNames.join(', ') || sv.salesLedgerName || 'Cash Sales',
              narration: String(e.narration || sv.narration || sv.referenceNo || ''),
              entryType,
              amount: amt,
              isInternalContra: false,
            });
          }
          continue;
        }
      }

      // Item-invoice (or accounting-invoice fallback when no voucher_entries exist)
      const partyLid = Number(sv.partyId);
      const acct = ledgerMap.get(partyLid);
      const amt = Math.abs(Number(sv.total) || 0);
      if (acct && amt > 0) {
        allEvents.push({
          id: `sv-${sv.voucherId}`,
          voucherId: String(sv.voucherId),
          date: svDate,
          voucherNo: svNo,
          voucherType: 'sales',
          accountLedgerId: partyLid,
          accountHead: acct.name,
          accountKind: acct.kind,
          particulars: sv.salesLedgerName ? `Cash Sales (${sv.salesLedgerName})` : 'Cash Sales',
          narration: String(sv.narration || sv.referenceNo || ''),
          entryType: 'debit',
          amount: amt,
          isInternalContra: false,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 3. CASH / BANK PURCHASE VOUCHERS (purchase_vouchers)
    //    - Item-invoice: partyId is Cash/Bank -> Credit (Payment)
    //    - Accounting-invoice: voucher_entries on Cash/Bank (fallback to partyId if no entries)
    // -------------------------------------------------------------------------
    let pvSql = `
      SELECT
        pv.id AS voucherId,
        pv.number AS voucherNumber,
        DATE_FORMAT(pv.date, '%Y-%m-%d') AS date,
        pv.partyId,
        pv.purchaseLedgerId,
        pv.total,
        pv.mode,
        pv.narration,
        pv.referenceNo,
        lp.name AS purchaseLedgerName
      FROM purchase_vouchers pv
      LEFT JOIN ledgers lp ON lp.id = pv.purchaseLedgerId
      WHERE pv.company_id = ?
    `;
    const pvParams = [company_id];
    if (owner_type && owner_id) {
      pvSql += ` AND pv.owner_type = ? AND pv.owner_id = ?`;
      pvParams.push(owner_type, owner_id);
    }
    if (toDate) {
      pvSql += ` AND pv.date <= ?`;
      pvParams.push(toDate);
    }

    const [pvRows] = await pool.query(pvSql, pvParams);
    const accPurchaseIds = (pvRows || [])
      .filter((pv) => String(pv.mode || '').toLowerCase() === 'accounting-invoice')
      .map((pv) => pv.voucherId);

    const purchaseEntriesByVoucher = new Map();
    if (accPurchaseIds.length > 0) {
      const [pvEntryRows] = await pool.query(
        `SELECT ve.id AS entryId, ve.voucher_id AS voucherId, ve.ledger_id AS ledgerId,
                COALESCE(l.name, ve.ledger_name) AS ledgerName, ve.amount, ve.entry_type AS entryType,
                ve.narration
         FROM voucher_entries ve
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         WHERE ve.voucher_id IN (?)
           AND (ve.voucher_type IS NULL OR LOWER(TRIM(ve.voucher_type)) IN ('purchase', 'accounting', ''))`,
        [accPurchaseIds]
      );
      for (const e of pvEntryRows || []) {
        if (!purchaseEntriesByVoucher.has(e.voucherId)) purchaseEntriesByVoucher.set(e.voucherId, []);
        purchaseEntriesByVoucher.get(e.voucherId).push(e);
      }
    }

    for (const pv of pvRows || []) {
      const mode = String(pv.mode || 'item-invoice').toLowerCase();
      const pvDate = toYmdDate(pv.date);
      const pvNo = String(pv.voucherNumber || '-');

      if (mode === 'accounting-invoice') {
        const entries = purchaseEntriesByVoucher.get(pv.voucherId) || [];
        const cbEntries = entries.filter((e) => ledgerMap.has(Number(e.ledgerId)));
        if (cbEntries.length > 0) {
          for (const e of cbEntries) {
            const lid = Number(e.ledgerId);
            const acct = ledgerMap.get(lid);
            const entryType = String(e.entryType || 'credit').toLowerCase() === 'credit' ? 'credit' : 'debit';
            const amt = Math.abs(Number(e.amount) || 0);
            if (!acct || amt <= 0) continue;

            const oppNames = Array.from(
              new Set(
                entries
                  .filter((x) => x.entryId !== e.entryId && String(x.entryType || '').toLowerCase() !== entryType)
                  .map((x) => String(x.ledgerName || '').trim())
                  .filter(Boolean)
              )
            );
            allEvents.push({
              id: `pv-acc-${e.entryId}`,
              voucherId: String(pv.voucherId),
              date: pvDate,
              voucherNo: pvNo,
              voucherType: 'purchase',
              accountLedgerId: lid,
              accountHead: acct.name,
              accountKind: acct.kind,
              particulars: oppNames.join(', ') || pv.purchaseLedgerName || 'Cash Purchase',
              narration: String(e.narration || pv.narration || pv.referenceNo || ''),
              entryType,
              amount: amt,
              isInternalContra: false,
            });
          }
          continue;
        }
      }

      // Item-invoice (or accounting-invoice fallback)
      const partyLid = Number(pv.partyId);
      const acct = ledgerMap.get(partyLid);
      const amt = Math.abs(Number(pv.total) || 0);
      if (acct && amt > 0) {
        allEvents.push({
          id: `pv-${pv.voucherId}`,
          voucherId: String(pv.voucherId),
          date: pvDate,
          voucherNo: pvNo,
          voucherType: 'purchase',
          accountLedgerId: partyLid,
          accountHead: acct.name,
          accountKind: acct.kind,
          particulars: pv.purchaseLedgerName ? `Cash Purchase (${pv.purchaseLedgerName})` : 'Cash Purchase',
          narration: String(pv.narration || pv.referenceNo || ''),
          entryType: 'credit',
          amount: amt,
          isInternalContra: false,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 4. AGGREGATE OPENING BALANCES, IN-PERIOD RECEIPTS/PAYMENTS, CLOSING BALANCES
    // -------------------------------------------------------------------------
    const receipts = [];
    const payments = [];
    let contraExcludedCount = 0;
    let contraExcludedAmount = 0;

    const voucherBreakdown = {
      receipt: { count: 0, amount: 0 },
      payment: { count: 0, amount: 0 },
      sales: { count: 0, amount: 0 },
      purchase: { count: 0, amount: 0 },
      contra: { count: 0, amount: 0 },
      journal: { count: 0, amount: 0 },
    };

    for (const ev of allEvents) {
      const stat = ledgerStats.get(ev.accountLedgerId);
      if (!stat) continue;

      const signedDelta = ev.entryType === 'debit' ? ev.amount : -ev.amount;

      // Before requested fromDate -> rolls into Opening Balance (and Closing Balance)
      if (fromDate && ev.date && ev.date < fromDate) {
        stat.opening += signedDelta;
        stat.closing += signedDelta;
        continue;
      }

      // Within requested period: ALWAYS updates individual ledger's closing balance
      stat.closing += signedDelta;

      // Only include in Receipts/Payments tables if the ledger is in selectedLedgerIds
      if (!selectedLedgerIds.has(ev.accountLedgerId)) {
        continue;
      }

      // For combined scope, internal Contra nets to 0; skip unless user requested includeContra
      if (ev.isInternalContra && !includeContra) {
        if (ev.entryType === 'debit') {
          contraExcludedCount += 1;
          contraExcludedAmount += ev.amount;
        }
        continue;
      }

      if (ev.entryType === 'debit') {
        stat.receipts += ev.amount;
      } else {
        stat.payments += ev.amount;
      }

      if (voucherBreakdown[ev.voucherType]) {
        voucherBreakdown[ev.voucherType].count += 1;
        voucherBreakdown[ev.voucherType].amount = round2(
          voucherBreakdown[ev.voucherType].amount + ev.amount
        );
      }

      const rowItem = {
        id: ev.id,
        voucherId: ev.voucherId,
        date: ev.date,
        voucherNo: ev.voucherNo,
        voucherType: ev.voucherType,
        particulars: ev.particulars,
        head: ev.accountHead,
        accountKind: ev.accountKind,
        narration: ev.narration,
        type: ev.entryType === 'debit' ? 'Receipt' : 'Payment',
        amount: round2(ev.amount),
        editPath: ev.voucherId
          ? `/app/vouchers/${ev.voucherType}/edit/${ev.voucherId}?returnUrl=${encodeURIComponent(
              '/app/reports/receipt-payment-account'
            )}`
          : '',
      };

      if (rowItem.type === 'Receipt') receipts.push(rowItem);
      else payments.push(rowItem);
    }

    receipts.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.voucherNo.localeCompare(b.voucherNo)));
    payments.sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.voucherNo.localeCompare(b.voucherNo)));

    const accounts = Array.from(ledgerStats.values()).map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      opening: round2(a.opening),
      receipts: round2(a.receipts),
      payments: round2(a.payments),
      closing: round2(a.closing),
    }));

    const scopedAccounts = accounts.filter((a) => selectedLedgerIds.has(a.id));
    const openingCash = round2(
      scopedAccounts.filter((a) => a.kind === 'cash').reduce((s, a) => s + a.opening, 0)
    );
    const openingBank = round2(
      scopedAccounts.filter((a) => a.kind === 'bank').reduce((s, a) => s + a.opening, 0)
    );
    const openingTotal = round2(openingCash + openingBank);

    const closingCash = round2(
      scopedAccounts.filter((a) => a.kind === 'cash').reduce((s, a) => s + a.closing, 0)
    );
    const closingBank = round2(
      scopedAccounts.filter((a) => a.kind === 'bank').reduce((s, a) => s + a.closing, 0)
    );
    const closingTotal = round2(closingCash + closingBank);

    const totalReceipts = round2(receipts.reduce((s, r) => s + r.amount, 0));
    const totalPayments = round2(payments.reduce((s, p) => s + p.amount, 0));

    res.json({
      success: true,
      summary: {
        openingCash,
        openingBank,
        openingTotal,
        totalReceipts,
        totalPayments,
        closingCash,
        closingBank,
        closingTotal,
        leftGrandTotal: round2(openingTotal + totalReceipts),
        rightGrandTotal: round2(totalPayments + closingTotal),
        contraExcludedCount,
        contraExcludedAmount: round2(contraExcludedAmount),
      },
      accounts,
      receipts,
      payments,
      voucherBreakdown,
    });
  } catch (error) {
    console.error('Error in GET /api/receipt-payment-account:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load Receipt and Payment Account',
    });
  }
});

module.exports = router;
