const express = require('express');
const router = express.Router();
const db = require('../db'); // your mysql2 connection pool

router.get('/employee-financial-report', async (req, res) => {
  const { employee_id, ca_id, ca_employee_id, user_type } = req.query;
  if (!employee_id && !ca_id && !ca_employee_id) {
    return res.status(400).json({ message: "Missing identifier" });
  }

  const connection = await db.getConnection();
  try {
    // --- Assigned companies
    let companies = [];
    if (user_type === 'ca' && ca_id) {
      const [caRows] = await connection.query('SELECT fdname FROM tbca WHERE fdSiNo = ?', [ca_id]);
      const caName = caRows.length > 0 ? caRows[0].fdname.trim() : null;
      const [rows] = await connection.query(
        `SELECT id, name FROM tbcompanies WHERE (fdAccountantName = ?) OR (employee_id = ?)`,
        [caName, ca_id]
      );
      companies = rows;
    } else if (user_type === 'ca_employee' && ca_employee_id) {
      const [rows] = await connection.query(
        `SELECT c.id, c.name FROM tbcompanies c INNER JOIN tbcaemployeecompanies a ON c.id = a.company_id WHERE a.ca_employee_id = ?`,
        [ca_employee_id]
      );
      companies = rows;
    } else {
      const fetchId = employee_id || ca_id || ca_employee_id;
      if (fetchId) {
        const [rows] = await connection.query(
          `SELECT id, name FROM tbcompanies WHERE employee_id = ?`,
          [fetchId]
        );
        companies = rows;
      }
    }

    let balanceRowsMap = {};
    let tradingRowsMap = {};
    let plRowsMap = {};
    let allBalanceGroups = new Set();
    let allPAndLHeads = new Set();

    // --- Balance Sheet with opening balance + transactions ---
    for (const company of companies) {
      const [rows] = await connection.query(
        `SELECT lg.name AS group_name, lg.nature, 
           SUM(l.opening_balance) AS total_opening_balance,
           IFNULL(SUM(CASE WHEN ve.entry_type = 'debit' THEN ve.amount ELSE 0 END),0) -
           IFNULL(SUM(CASE WHEN ve.entry_type = 'credit' THEN ve.amount ELSE 0 END),0) AS net_transaction_amount
         FROM ledgers l
         JOIN ledger_groups lg ON l.group_id = lg.id
         LEFT JOIN voucher_entries ve ON ve.ledger_id = l.id
         WHERE l.company_id = ?
         GROUP BY lg.name, lg.nature`,
        [company.id]
      );

      rows.forEach(r => {
        r.total = Number(r.total_opening_balance) + Number(r.net_transaction_amount);
        allBalanceGroups.add(r.group_name);
      });

      balanceRowsMap[company.id] = rows;
    }

    // --- Trading Account ---
    for (const company of companies) {
      const [sales] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), SUM(total), 0) AS total FROM sales_vouchers WHERE company_id = ?`,
        [company.id]
      );
      const [purchases] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), SUM(total), 0) AS total FROM purchase_vouchers WHERE company_id = ?`,
        [company.id]
      );
      tradingRowsMap[company.id] = {
        sales: sales[0].total || 0,
        purchases: purchases[0].total || 0
      };
    }

    // --- Profit & Loss: Heads ---
    const pl_heads = [
      { key: "grossProfit", label: "By Gross Profit" },
      { key: "auditFee", label: "To Audit Fee" },
      { key: "accountancyCharges", label: "To Accountancy Charges" },
      { key: "bankCharges", label: "To Bank Charges" },
    ];

    for (const company of companies) {
      let plData = {};
      const grossProfit = (tradingRowsMap[company.id]?.sales || 0) - (tradingRowsMap[company.id]?.purchases || 0);

      const [[auditFee]] = await connection.query(
        `SELECT SUM(ve.amount) as total
         FROM voucher_entries ve
         JOIN ledgers l ON ve.ledger_id = l.id
         WHERE l.company_id = ? AND l.name LIKE '%Audit Fee%'`,
        [company.id]
      );

      const [[accountancyCharges]] = await connection.query(
        `SELECT SUM(ve.amount) as total
         FROM voucher_entries ve
         JOIN ledgers l ON ve.ledger_id = l.id
         WHERE l.company_id = ? AND l.name LIKE '%Accountancy%'`,
        [company.id]
      );

      const [[bankCharges]] = await connection.query(
        `SELECT SUM(ve.amount) as total
         FROM voucher_entries ve
         JOIN ledgers l ON ve.ledger_id = l.id
         WHERE l.company_id = ? AND l.name LIKE '%Bank Charges%'`,
        [company.id]
      );

      plData.grossProfit = grossProfit;
      plData.auditFee = auditFee?.total || 0;
      plData.accountancyCharges = accountancyCharges?.total || 0;
      plData.bankCharges = bankCharges?.total || 0;

      plRowsMap[company.id] = plData;
      Object.keys(plData).forEach(k => allPAndLHeads.add(k));
    }

    // --- Format for frontend ---

    const balanceRows = Array.from(allBalanceGroups).map(group => {
      let nature;
      const companyTotals = {};
      companies.forEach(company => {
        const grp = (balanceRowsMap[company.id] || []).find(r => r.group_name === group);
        if (grp) nature = grp.nature;
        companyTotals[company.id] = grp ? Number(grp.total) : 0;
      });
      return { group_name: group, nature, companyTotals };
    });

    const tradingRows = [
      { name: "Sales", companyTotals: {}, key: "sales" },
      { name: "Purchases", companyTotals: {}, key: "purchases" },
      { name: "Gross Profit", companyTotals: {}, key: "grossProfit" },
    ];
    companies.forEach(company => {
      const ta = tradingRowsMap[company.id] || { sales: 0, purchases: 0 };
      tradingRows[0].companyTotals[company.id] = ta.sales;
      tradingRows[1].companyTotals[company.id] = ta.purchases;
      tradingRows[2].companyTotals[company.id] = ta.sales - ta.purchases;
    });

    const plRows = pl_heads.map(head => ({
      label: head.label,
      key: head.key,
      companyTotals: Object.fromEntries(
        companies.map(c => [c.id, plRowsMap[c.id]?.[head.key] || 0])
      )
    }));

    connection.release();

    res.json({
      companies,
      balanceRows,
      tradingRows,
      plRows
    });

  } catch (err) {
    connection.release();
    res.status(500).json({ message: err.message });
  }
});

router.get('/employee-financial-report-consolidated', async (req, res) => {
  const { employee_id, ca_id, ca_employee_id, user_type } = req.query;
  if (!employee_id && !ca_id && !ca_employee_id) {
    return res.status(400).json({ message: "Missing identifier" });
  }

  const connection = await db.getConnection();
  try {
    let companies = [];
    if (user_type === 'ca' && ca_id) {
      const [caRows] = await connection.query('SELECT fdname FROM tbca WHERE fdSiNo = ?', [ca_id]);
      const caName = caRows.length > 0 ? caRows[0].fdname.trim() : null;
      const [rows] = await connection.query(
        `SELECT id, name FROM tbcompanies WHERE (fdAccountantName = ?) OR (employee_id = ?)`,
        [caName, ca_id]
      );
      companies = rows;
    } else if (user_type === 'ca_employee' && ca_employee_id) {
      const [rows] = await connection.query(
        `SELECT c.id, c.name FROM tbcompanies c INNER JOIN tbcaemployeecompanies a ON c.id = a.company_id WHERE a.ca_employee_id = ?`,
        [ca_employee_id]
      );
      companies = rows;
    } else {
      const fetchId = employee_id || ca_id || ca_employee_id;
      if (fetchId) {
        const [rows] = await connection.query(
          `SELECT id, name FROM tbcompanies WHERE employee_id = ?`,
          [fetchId]
        );
        companies = rows;
      }
    }

    // Generic helper for ledger groups
    async function getSectionData(companyId, ledgerNameLike) {
      const [rows] = await connection.query(
        `SELECT l.name, 
          SUM(l.opening_balance) AS total_opening_balance,
          IFNULL(SUM(CASE WHEN ve.entry_type = 'debit' THEN ve.amount ELSE 0 END),0) -
          IFNULL(SUM(CASE WHEN ve.entry_type = 'credit' THEN ve.amount ELSE 0 END),0) AS net_transaction_amount
         FROM ledgers l
         LEFT JOIN voucher_entries ve ON ve.ledger_id = l.id
         WHERE l.company_id = ? AND l.name LIKE ?
         GROUP BY l.name`,
        [companyId, ledgerNameLike]
      );

      return rows.map(r => ({
        name: r.name,
        amount: Number(r.total_opening_balance) + Number(r.net_transaction_amount)
      }));
    }

    const capitalRowsMap = {};
    for (const c of companies) {
      capitalRowsMap[c.id] = await getSectionData(c.id, '%Capital%');
    }

    const creditorsRowsMap = {};
    for (const c of companies) {
      creditorsRowsMap[c.id] = await getSectionData(c.id, '%Creditor%');
    }

    const payablesRowsMap = {};
    for (const c of companies) {
      payablesRowsMap[c.id] = await getSectionData(c.id, '%Payable%');
    }

    const cashBankRowsMap = {};
    for (const c of companies) {
      cashBankRowsMap[c.id] = await getSectionData(c.id, '%Cash%');
    }

    const debtorsRowsMap = {};
    for (const c of companies) {
      debtorsRowsMap[c.id] = await getSectionData(c.id, '%Debtor%');
    }

    const loansRowsMap = {};
    for (const c of companies) {
      loansRowsMap[c.id] = await getSectionData(c.id, '%Loan%');
    }

    connection.release();

    res.json({
      companies,
      capitalAccounts: capitalRowsMap,
      sundryCreditors: creditorsRowsMap,
      sundryPayables: payablesRowsMap,
      cashBankBalances: cashBankRowsMap,
      sundryDebtors: debtorsRowsMap,
      loansAdvances: loansRowsMap
    });

  } catch (err) {
    connection.release();
    res.status(500).json({ message: err.message });
  }
});

// GET /api/consolidated-balance-sheet - For consolidated balance sheet view (all employee's companies)
router.get('/consolidated-balance-sheet', async (req, res) => {
  const { employee_id, startDate, endDate, ca_id, ca_employee_id, user_type } = req.query;
  if (!employee_id && !ca_id && !ca_employee_id) {
    return res.status(400).json({ message: "Missing identifier (employee_id, ca_id, or ca_employee_id)" });
  }

  const connection = await db.getConnection();
  try {
    // Determine if date filtering is needed
    const dateFilter = startDate && endDate ? ` AND v.date BETWEEN ? AND ?` : '';
    const dateParams = startDate && endDate ? [startDate, endDate] : [];

    const voucherDateFilter = startDate && endDate ? ` AND vm.date BETWEEN ? AND ?` : '';
    const voucherDateParams = startDate && endDate ? [startDate, endDate] : [];

    const pvDateFilter = startDate && endDate ? ` AND pv.date BETWEEN ? AND ?` : '';
    const pvDateParams = startDate && endDate ? [startDate, endDate] : [];

    const svDateFilter = startDate && endDate ? ` AND sv.date BETWEEN ? AND ?` : '';
    const svDateParams = startDate && endDate ? [startDate, endDate] : [];

    // Get all companies assigned to this user based on role/type
    let companies = [];
    if (user_type === 'ca' && ca_id) {
      const [caRows] = await connection.query('SELECT fdname FROM tbca WHERE fdSiNo = ?', [ca_id]);
      const caName = caRows.length > 0 ? caRows[0].fdname.trim() : null;
      const [rows] = await connection.query(
        `SELECT id, name FROM tbcompanies WHERE (fdAccountantName = ?) OR (employee_id = ?)`,
        [caName, ca_id]
      );
      companies = rows;
    } else if (user_type === 'ca_employee' && ca_employee_id) {
      const [rows] = await connection.query(
        `SELECT c.id, c.name FROM tbcompanies c INNER JOIN tbcaemployeecompanies a ON c.id = a.company_id WHERE a.ca_employee_id = ?`,
        [ca_employee_id]
      );
      companies = rows;
    } else {
      const fetchId = employee_id || ca_id || ca_employee_id;
      if (fetchId) {
        const [rows] = await connection.query(
          `SELECT id, name FROM tbcompanies WHERE employee_id = ?`,
          [fetchId]
        );
        companies = rows;
      }
    }

    if (companies.length === 0) {
      connection.release();
      return res.json({ companies: [], ledgers: [], ledgerGroups: [], debitCreditData: {}, profitLossData: {} });
    }

    const companyIds = companies.map(c => c.id);
    const placeholders = companyIds.map(() => '?').join(',');

    // Fetch all ledger groups for all companies
    const [ledgerGroups] = await connection.query(
      `SELECT id, name, type, parent, company_id 
       FROM ledger_groups 
       WHERE company_id IN (${placeholders})`,
      companyIds
    );

    // Fetch all ledgers for all companies with company name
    const [ledgers] = await connection.query(
      `SELECT 
        l.id, 
        l.name, 
        l.group_id AS groupId,
        CAST(l.opening_balance AS DECIMAL(15,2)) AS openingBalance,
        l.balance_type AS balanceType,
        l.closing_balance,
        g.name AS groupName,
        g.type AS groupType,
        l.company_id AS companyId,
        c.name AS companyName
       FROM ledgers l
       LEFT JOIN ledger_groups g ON l.group_id = g.id
       LEFT JOIN tbcompanies c ON l.company_id = c.id
       WHERE l.company_id IN (${placeholders})
       ORDER BY l.company_id, g.type, g.name, l.name`,
      companyIds
    );

    // Fetch debit/credit data for all ledgers across all companies
    const ledgerIds = ledgers.map(l => l.id);
    let debitCreditData = {};

    if (ledgerIds.length > 0) {
      const ledgerPlaceholders = ledgerIds.map(() => '?').join(',');
      const [dcRows] = await connection.query(
        `SELECT 
          ledgerId, 
          SUM(debit) AS debit, 
          SUM(credit) AS credit
        FROM (
          SELECT 
            ve.ledger_id AS ledgerId,
            SUM(CASE WHEN ve.entry_type = 'debit' THEN ve.amount ELSE 0 END) AS debit,
            SUM(CASE WHEN ve.entry_type = 'credit' THEN ve.amount ELSE 0 END) AS credit
          FROM voucher_entries ve
          JOIN voucher_main vm ON ve.voucher_id = vm.id
          WHERE ve.ledger_id IN (${ledgerPlaceholders}) ${voucherDateFilter}
          GROUP BY ve.ledger_id

          UNION ALL

          SELECT
            pvi.tdsLedgerId AS ledgerId,
            SUM(pv.tdsTotal) AS debit,
            0 AS credit
          FROM (
             SELECT voucherId, MAX(tdsRate) AS tdsLedgerId 
             FROM purchase_voucher_items 
             WHERE tdsRate > 0 
             GROUP BY voucherId
          ) pvi
          JOIN purchase_vouchers pv ON pv.id = pvi.voucherId
          WHERE pvi.tdsLedgerId IN (${ledgerPlaceholders})
            AND pv.company_id IN (${placeholders}) ${pvDateFilter}
          GROUP BY pvi.tdsLedgerId

          UNION ALL

          SELECT 
            pvi.purchaseLedgerId AS ledgerId,
            SUM(pvi.amount) AS debit,
            0 AS credit
          FROM purchase_voucher_items pvi
          JOIN purchase_vouchers pv ON pv.id = pvi.voucherId
          WHERE pvi.purchaseLedgerId IN (${ledgerPlaceholders})
            AND pv.company_id IN (${placeholders}) ${pvDateFilter}
          GROUP BY pvi.purchaseLedgerId

          UNION ALL

          SELECT 
            svi.salesLedgerId AS ledgerId,
            0 AS debit,
            SUM(svi.amount) AS credit
          FROM sales_voucher_items svi
          JOIN sales_vouchers sv ON sv.id = svi.voucherId
          WHERE svi.salesLedgerId IN (${ledgerPlaceholders})
            AND sv.company_id IN (${placeholders}) ${svDateFilter}
          GROUP BY svi.salesLedgerId
        ) AS combined_data
        GROUP BY ledgerId`,
        [
          ...ledgerIds, ...voucherDateParams, // 1st query
          ...ledgerIds, ...companyIds, ...pvDateParams, // 2nd query
          ...ledgerIds, ...companyIds, ...pvDateParams, // 3rd query
          ...ledgerIds, ...companyIds, ...svDateParams  // 4th query
        ]
      );

      // Map debitCreditData with companyId_ledgerId as key
      dcRows.forEach(row => {
        const rowLedgerId = Number(row.ledgerId);
        const ledger = ledgers.find(l => Number(l.id) === rowLedgerId);
        if (ledger) {
          const key = `${ledger.companyId}_${rowLedgerId}`;
          debitCreditData[key] = {
            debit: Number(row.debit) || 0,
            credit: Number(row.credit) || 0
          };
        }
      });
    }

    // Fetch P&L data for each company
    const profitLossData = {};
    for (const company of companies) {
      // Get net profit/loss from localStorage values (stored in voucher_entries narration)
      const [transferredEntries] = await connection.query(
        `SELECT ve.narration FROM voucher_entries ve
         JOIN voucher_main vm ON ve.voucher_id = vm.id
         WHERE (ve.narration LIKE 'PROFIT_TR:%' OR ve.narration LIKE 'LOSS_TR:%')
         AND vm.company_id = ? ${voucherDateFilter}`,
        [company.id, ...voucherDateParams]
      );

      let transferredProfit = 0;
      let transferredLoss = 0;
      transferredEntries.forEach(entry => {
        if (entry.narration.startsWith('PROFIT_TR:')) {
          transferredProfit = Math.max(transferredProfit, parseFloat(entry.narration.split(':')[1]) || 0);
        } else if (entry.narration.startsWith('LOSS_TR:')) {
          transferredLoss = Math.max(transferredLoss, parseFloat(entry.narration.split(':')[1]) || 0);
        }
      });

      // Calculate net profit/loss from sales and purchases (Base amounts without tax)
      const [[salesResult]] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), SUM(total), 0) AS total FROM sales_vouchers sv WHERE sv.company_id = ? ${svDateFilter}`,
        [company.id, ...svDateParams]
      );
      const [[purchasesResult]] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), SUM(total), 0) AS total FROM purchase_vouchers pv WHERE pv.company_id = ? ${pvDateFilter}`,
        [company.id, ...pvDateParams]
      );

      // Get expenses from indirect expenses group
      const [[expensesResult]] = await connection.query(
        `SELECT COALESCE(SUM(ve.amount), 0) AS total
         FROM voucher_entries ve
         JOIN voucher_main vm ON ve.voucher_id = vm.id
         JOIN ledgers l ON ve.ledger_id = l.id
         JOIN ledger_groups g ON l.group_id = g.id
         WHERE l.company_id = ? 
         AND (g.id = -11 OR g.parent = -11 OR g.name LIKE '%Indirect Expenses%')
         AND ve.entry_type = 'debit' ${voucherDateFilter}`,
        [company.id, ...voucherDateParams]
      );

      const sales = Number(salesResult?.total) || 0;
      const purchases = Number(purchasesResult?.total) || 0;
      const expenses = Number(expensesResult?.total) || 0;
      const grossProfit = sales - purchases;
      const netPL = grossProfit - expenses;

      profitLossData[company.id] = {
        netProfit: netPL > 0 ? netPL : 0,
        netLoss: netPL < 0 ? Math.abs(netPL) : 0,
        transferredProfit,
        transferredLoss
      };
    }

    // Fetch Sales and Purchase data for each company
    const salesData = {};
    const purchaseData = {};
    for (const company of companies) {
      const [[salesResult]] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), SUM(total), 0) AS total FROM sales_vouchers sv WHERE sv.company_id = ? ${svDateFilter}`,
        [company.id, ...svDateParams]
      );
      const [[purchasesResult]] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), SUM(total), 0) AS total FROM purchase_vouchers pv WHERE pv.company_id = ? ${pvDateFilter}`,
        [company.id, ...pvDateParams]
      );
      salesData[company.id] = Number(salesResult?.total) || 0;
      purchaseData[company.id] = Number(purchasesResult?.total) || 0;
    }

    connection.release();

    res.json({
      companies,
      ledgers,
      ledgerGroups,
      debitCreditData,
      profitLossData,
      salesData,
      purchaseData
    });

  } catch (err) {
    connection.release();
    console.error("Consolidated Balance Sheet Error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
