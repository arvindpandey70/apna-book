const db = require("../db");
const { getFinancialYear } = require("./financialYear");

/**
 * 🔹 Voucher type → { Prefix, Table, Column } mapping
 */
const CONFIG_MAP = {
  payment: { prefix: "PV", table: "voucher_main", column: "voucher_number", typeCol: "voucher_type" },
  receipt: { prefix: "RV", table: "voucher_main", column: "voucher_number", typeCol: "voucher_type" },
  contra: { prefix: "CV", table: "voucher_main", column: "voucher_number", typeCol: "voucher_type" },
  journal: { prefix: "JV", table: "voucher_main", column: "voucher_number", typeCol: "voucher_type" },
  purchase: { prefix: "PRV", table: "purchase_vouchers", column: "number" },
  purchase_rcm: { prefix: "RCM", table: "purchase_vouchers", column: "number" },
  rcm: { prefix: "RCM", table: "purchase_vouchers", column: "number" },
  sales: { prefix: "SLV", table: "sales_vouchers", column: "number" },
  purchase_order: { prefix: "PO", table: "purchase_orders", column: "number" },
  sales_order: { prefix: "SO", table: "sales_orders", column: "number" },
  bank: { prefix: "BV", table: "voucher_main", column: "voucher_number", typeCol: "voucher_type" },
  debit_note: { prefix: "DNV", table: "debit_note_vouchers", column: "number" },
  credit_note: { prefix: "CNV", table: "credit_vouchers", column: "number" },
  stock_journal: { prefix: "STKJ", table: "stock_journal_vouchers", column: "number" },
  'stock-journal': { prefix: "STKJ", table: "stock_journal_vouchers", column: "number" },
};

/**
 * 🔹 Helper to resolve Sales Type Config (System types or Custom DB types)
 */
async function resolveSalesTypeConfig(
  { salesTypeId, companyId, ownerType, ownerId },
  executor = db
) {
  if (!salesTypeId || salesTypeId === "custom") return null;

  const upperId = String(salesTypeId).trim().toUpperCase();

  let systemCode = null;
  if (upperId === "SALES" || upperId === "-1") systemCode = "SALES";
  else if (upperId === "B2C" || upperId === "-2") systemCode = "B2C";
  else if (upperId === "B2B" || upperId === "-3") systemCode = "B2B";

  if (systemCode) {
    let prefix = systemCode === "B2B" ? "b2b/" : "";
    let suffix = systemCode === "B2B" ? "/26-27" : "";
    const idsToMatch = [salesTypeId, systemCode, systemCode.toLowerCase()];

    try {
      const [settings] = await executor.execute(
        "SELECT prefix, suffix FROM sales_type_settings WHERE company_id = ? AND owner_type = ? AND owner_id = ? AND system_code = ?",
        [companyId, ownerType, ownerId, systemCode]
      );
      if (settings.length > 0) {
        prefix = settings[0].prefix || "";
        suffix = settings[0].suffix || "";
      } else {
        const [legacy] = await executor.execute(
          "SELECT id, prefix, suffix FROM sales_types WHERE company_id = ? AND owner_type = ? AND owner_id = ? AND LOWER(sales_type) = LOWER(?)",
          [companyId, ownerType, ownerId, systemCode]
        );
        if (legacy.length > 0) {
          prefix = legacy[0].prefix || prefix;
          suffix = legacy[0].suffix || suffix;
          idsToMatch.push(legacy[0].id, String(legacy[0].id));
        }
      }
    } catch (err) {
      console.error("Error resolving system sales type config:", err);
    }

    return { prefix, suffix, systemCode, idsToMatch };
  }

  // Check DB custom type
  try {
    const [stRows] = await executor.execute(
      "SELECT id, sales_type, prefix, suffix FROM sales_types WHERE id = ?",
      [salesTypeId]
    );
    if (stRows.length > 0) {
      const nameUpper = (stRows[0].sales_type || "").trim().toUpperCase();
      if (["SALES", "B2C", "B2B"].includes(nameUpper)) {
        return resolveSalesTypeConfig(
          { salesTypeId: nameUpper, companyId, ownerType, ownerId },
          executor
        );
      }
      return {
        prefix: stRows[0].prefix || "",
        suffix: stRows[0].suffix || "",
        systemCode: null,
        idsToMatch: [salesTypeId, String(salesTypeId)],
      };
    }
  } catch (err) {
    console.error("Error resolving custom sales type config:", err);
  }

  return null;
}

/**
 * 🔹 Generate voucher number (Tally-style)
 */
async function generateVoucherNumber({
  companyId,
  ownerType,
  ownerId,
  voucherType,
  date,
  salesTypeId,
}) {
  const config = CONFIG_MAP[voucherType];
  if (!config) {
    throw new Error(`Unsupported voucher type: ${voucherType}`);
  }

  const { table, column, typeCol } = config;
  let prefix = config.prefix;
  let suffix = "";
  let useTypeFilter = false;
  let salesTypeConfig = null;

  // 🔹 Fetch custom or system prefix/suffix if salesTypeId is provided
  if (voucherType === "sales" && salesTypeId && salesTypeId !== "custom") {
    salesTypeConfig = await resolveSalesTypeConfig({
      salesTypeId,
      companyId,
      ownerType,
      ownerId,
    });
    if (salesTypeConfig) {
      prefix = salesTypeConfig.prefix;
      suffix = salesTypeConfig.suffix;
      useTypeFilter = true;
    }
  }

  const fy = getFinancialYear(date);
  const searchPattern = useTypeFilter ? null : `${prefix}/${fy}/%`;

  let sql = `
    SELECT ${column} as lastNumber
    FROM ${table}
    WHERE company_id = ? AND owner_type = ? AND owner_id = ?
  `;

  const params = [companyId, ownerType, ownerId];

  if (useTypeFilter && salesTypeConfig && salesTypeConfig.idsToMatch.length > 0) {
    const placeholders = salesTypeConfig.idsToMatch.map(() => "?").join(",");
    sql += ` AND sales_type_id IN (${placeholders})`;
    params.push(...salesTypeConfig.idsToMatch);
  } else {
    sql += ` AND ${column} LIKE ?`;
    params.push(searchPattern);
  }

  if (typeCol) {
    sql += ` AND ${typeCol} = ?`;
    params.push(voucherType);
  }

  sql += ` ORDER BY ${column} DESC LIMIT 1`;

  try {
    const [rows] = await db.execute(sql, params);
    let nextNo = 1;
    if (rows.length > 0) {
      const lastNumber = rows[0].lastNumber;
      if (lastNumber) {
        const parts = lastNumber.split("/");
        const lastSeq = parseInt(parts[parts.length - 1]);
        nextNo = (isNaN(lastSeq) ? 0 : lastSeq) + 1;
      }
    }

    if (useTypeFilter) {
      return `${prefix}${suffix}/${nextNo}`;
    }

    return `${prefix}/${fy}/${String(nextNo).padStart(6, "0")}`;
  } catch (err) {
    console.error("Error generating voucher number:", err);
    throw err;
  }
}

/**
 * 🔹 Chronological Renumbering Logic
 */
async function renumberVouchers(
  { companyId, ownerType, ownerId, voucherType, date, salesTypeId },
  connection = null
) {
  const config = CONFIG_MAP[voucherType];
  if (!config) return;

  const executor = connection || db;
  const { table, column, typeCol } = config;
  let prefix = config.prefix;
  let suffix = "";
  let useTypeFilter = false;
  let salesTypeConfig = null;

  if (voucherType === "sales" && salesTypeId && salesTypeId !== "custom") {
    salesTypeConfig = await resolveSalesTypeConfig(
      { salesTypeId, companyId, ownerType, ownerId },
      executor
    );
    if (salesTypeConfig) {
      prefix = salesTypeConfig.prefix;
      suffix = salesTypeConfig.suffix;
      useTypeFilter = true;
    }
  }

  const fy = getFinancialYear(date);
  const searchPattern = useTypeFilter ? null : `${prefix}/${fy}/%`;

  let sql = `
    SELECT id, date, ${column} as oldNumber 
    FROM ${table} 
    WHERE company_id = ? AND owner_type = ? AND owner_id = ? 
  `;
  const params = [companyId, ownerType, ownerId];

  if (useTypeFilter && salesTypeConfig && salesTypeConfig.idsToMatch.length > 0) {
    const placeholders = salesTypeConfig.idsToMatch.map(() => "?").join(",");
    sql += ` AND sales_type_id IN (${placeholders})`;
    params.push(...salesTypeConfig.idsToMatch);
  } else {
    sql += ` AND ${column} LIKE ?`;
    params.push(searchPattern);
  }

  if (typeCol) {
    sql += ` AND ${typeCol} = ?`;
    params.push(voucherType);
  }

  sql += ` ORDER BY date ASC, id ASC`;

  try {
    const [vouchers] = await executor.execute(sql, params);

    if (vouchers.length === 0) return;

    const updatesNeeded = [];
    for (let i = 0; i < vouchers.length; i++) {
      const newSeq = i + 1;
      let newNumber;

      if (useTypeFilter) {
        newNumber = `${prefix}${suffix}/${newSeq}`;
      } else {
        newNumber = `${prefix}/${fy}/${String(newSeq).padStart(6, "0")}`;
      }

      if (vouchers[i].oldNumber !== newNumber) {
        updatesNeeded.push({
          id: vouchers[i].id,
          oldNumber: vouchers[i].oldNumber,
          newNumber,
        });
      }
    }

    if (updatesNeeded.length === 0) {
      return;
    }

    for (const v of updatesNeeded) {
      await executor.execute(
        `UPDATE ${table} SET ${column} = CONCAT(${column}, '_TEMP') WHERE id = ?`,
        [v.id]
      );
    }

    for (const v of updatesNeeded) {
      const { id, oldNumber, newNumber } = v;
      await executor.execute(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [
        newNumber,
        id,
      ]);

      if (table === "purchase_vouchers") {
        await executor.execute(
          `UPDATE purchase_history SET voucherNumber = ? WHERE voucherNumber = ? AND companyId = ?`,
          [newNumber, oldNumber, companyId]
        );
      } else if (table === "sales_vouchers") {
        await executor.execute(
          `UPDATE sale_history SET voucherNumber = ? WHERE voucherNumber = ? AND companyId = ?`,
          [newNumber, oldNumber, companyId]
        );
      }
    }
  } catch (err) {
    console.error(`[renumberVouchers] ERROR:`, err);
    throw err;
  }
}

module.exports = { generateVoucherNumber, renumberVouchers, resolveSalesTypeConfig };
