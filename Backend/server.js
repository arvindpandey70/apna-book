// ✅ server.js (Updated without express-session) - Trigger restart to run migrations
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
// app.use(cors());
app.use(
  cors({
    origin: [
      "https://apnabook.com",
      "https://www.apnabook.com",
      "https://admin.apnabook.com",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:4173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));
// const authMiddleware = require('./middlewares/authMiddleware');
// const loadPermissions = require('./middlewares/loadPermissions');
const loginRoute = require("./routes/login");
app.use("/api/login", loginRoute);
const forgotPasswordRoute = require("./routes/forgotPassword");
app.use("/api/auth", forgotPasswordRoute);
const checkSubscription = require('./middlewares/checkSubscription');
// Install subscription check AFTER login route so status endpoint and login remain accessible
app.use(checkSubscription);
// const checkPermission = require('./middlewares/checkPermission');

// 1. JWT Authentication parses token and sets req.user
// app.use(authMiddleware);

// 2. Load Permissions based on req.user.id and req.user.userType
// app.use(loadPermissions);

// Your protected API routes go here, guarded by checkPermission

// ✅ Routes
const ledgerGroupRoutes = require("./routes/ledgerGroups");
app.use("/api/ledger-groups", ledgerGroupRoutes);

const attributeSummaryReport = require("./routes/attributeSummaryReport");
app.use("/api/attribute-summary-report", attributeSummaryReport);

const ledgerRoutes = require("./routes/ledger");
app.use("/api/ledger", ledgerRoutes);

const GroupRoutes = require("./routes/group");
app.use("/api/group", GroupRoutes);

const currencyRoutes = require("./routes/currency");
app.use("/api/currencies", currencyRoutes);

const budgetRoutes = require("./routes/budgets");
app.use("/api/budgets", budgetRoutes);

const voucherRoutes = require("./routes/vouchers");
app.use("/api/vouchers", voucherRoutes);

const saleVoucherRoutes = require("./routes/salevoucher");
app.use("/api/sale-vouchers", saleVoucherRoutes);

const purchaseVoucherRoutes = require("./routes/purchasevoucher");
app.use("/api/purchase-vouchers", purchaseVoucherRoutes);

const scenarioRoutes = require("./routes/scenarioRoutes");
app.use("/api/scenario", scenarioRoutes);

const costCenterRoutes = require("./routes/costCenterRoutes");
app.use("/api/cost-centers", costCenterRoutes);

const stockCategoriesRoutes = require("./routes/stockCategories");
app.use("/api/stock-categories", stockCategoriesRoutes);

const stockUnitsRoutes = require("./routes/stockUnits");
app.use("/api/stock-units", stockUnitsRoutes);

const stockGroupRoutes = require("./routes/stockGroupRoutes");
app.use("/api/stock-groups", stockGroupRoutes);

const godownRoutes = require("./routes/godownRoutes");
app.use("/api/godowns", godownRoutes);

const stockItemRoutes = require("./routes/stockItems");
app.use("/api/stock-items", stockItemRoutes);

const stockItemAttributesRoutes = require("./routes/stockItemAttributes");
app.use("/api/stock-item-attributes", stockItemAttributesRoutes);

const stockAttributesRoutes = require("./routes/stockAttributes");
app.use("/api/stock-attributes", stockAttributesRoutes);

const salesTypesRoutes = require("./routes/salesTypes");
app.use("/api/sales-types", salesTypesRoutes);

const gstr9Routes = require("./routes/gstr9");
app.use("/api/gstr9", gstr9Routes);

const geminiRoutes = require("./routes/gemini");
app.use("/api/gemini", geminiRoutes);

const signupRoute = require("./routes/SignUp");
app.use("/api/SignUp", signupRoute);

const companyRoutes = require("./routes/company");
app.use("/api/company", companyRoutes);

const adminloginRoute = require("./routes/adminlogin");
app.use("/api/admin", adminloginRoute);

const ledgerDropdown = require("./routes/ledgerDropdown");
app.use("/api/ledger-dropdown", ledgerDropdown);

const subscriptionRoutes = require("./routes/subscriptions");
app.use("/api/subscriptions", subscriptionRoutes);

const companySubscriptionRoutes = require("./routes/companySubscription");
app.use("/api/company-subscription", companySubscriptionRoutes);

const couponRoutes = require("./routes/coupons");
app.use("/api/coupons", couponRoutes);
const paymentsRoutes = require("./routes/payments");
app.use("/api/payments", paymentsRoutes);

const salesOrders = require("./routes/salesOrders");
app.use("/api/sales-orders", salesOrders);

const purchaseOrders = require("./routes/purchaseOrder");
app.use("/api/purchase-orders", purchaseOrders);

const salesVoucher = require("./routes/salevoucher");
app.use("/api/sales-vouchers", salesVoucher);
const DebitNoteVoucher = require("./routes/DebitNoteVoucher");
app.use("/api/DebitNoteVoucher", DebitNoteVoucher);

const CreditNotevoucher = require("./routes/CreditNotevoucher");
app.use("/api/CreditNotevoucher", CreditNotevoucher);

const StockJournal = require("./routes/StockJournal");
app.use("/api/StockJournal", StockJournal);

const DeliveryItem = require("./routes/DeliveryItem");
app.use("/api/DeliveryItem", DeliveryItem);

const DayBookCards = require("./routes/DayBookCards");
app.use("/api/DayBookCards", DayBookCards);

const daybookTable = require("./routes/daybookTable");
app.use("/api/daybookTable", daybookTable);
const daybookTable2 = require("./routes/daybookTable2");
app.use("/api/daybookTable2", daybookTable2);
const gstRoutes = require("./routes/gst");
app.use("/api/gst", gstRoutes);

const gstr3bRoutes = require("./routes/gstr3b");
app.use("/api/gstr3b", gstr3bRoutes);

const gstRatesRoutes = require("./routes/gstRates");
app.use("/api/gst-rates", gstRatesRoutes);

const aiRoutes = require("./routes/aiRoutes");
app.use("/api/ai", aiRoutes);

const bankStatementAiRoutes = require("./routes/bankStatementAiRoutes");
app.use("/api/ai", bankStatementAiRoutes);

// const stockSummaryRouter = require('./routes/stockSummary');
// app.use('/api', stockSummaryRouter);

const tds24qRoutes = require("./routes/tds_24q");
app.use("/api/tds24q", tds24qRoutes);
const tds26qRouter = require("./routes/tds_26q");
app.use(tds26qRouter);
const tds27qRouter = require("./routes/tds_27q");
app.use(tds27qRouter);

const tds27eqRouter = require("./routes/tds_27eq");
app.use(tds27eqRouter);

const deducteesRouter = require("./routes/deductees");
app.use(deducteesRouter);

const trialBalanceRouter = require("./routes/trialBalance");
app.use(trialBalanceRouter);

const profitLossRouter = require("./routes/profitloss"); // Assuming you saved route above as profitLoss.js
app.use(profitLossRouter);

const balanceSheetRouter = require("./routes/balanceSheet");
app.use(balanceSheetRouter);

// Remember to have your mysql2 pool connection in db.js and export it properly.
const groupSummaryRouter = require("./routes/groupSummary");
app.use(groupSummaryRouter);
// Remember to have your mysql2 pool connection in db.js and export it properly.
const cashflowRouter = require("./routes/cashFlow");
app.use(cashflowRouter);

const stockSummaryRouter = require("./routes/stockSummary");
app.use(stockSummaryRouter);

const movementAnalysisRouter = require("./routes/movementAnalysis");
app.use(movementAnalysisRouter);

const ageingAnalysisRouter = require("./routes/ageingAnalysis");
app.use(ageingAnalysisRouter);

const godownSummaryRouter = require("./routes/godownSummary");
app.use(godownSummaryRouter);



const fifoRouter = require("./routes/fifo");
app.use(fifoRouter);

const outstandingRouter = require("./routes/outstandingReceivables");
app.use(outstandingRouter);

const outstandingPayablesRouter = require("./routes/outstandingPayables");
app.use(outstandingPayablesRouter);

const billwiseReceivablesRouter = require("./routes/billwiseReceivables");
app.use(billwiseReceivablesRouter);

// in your app.js or server.js
const billwisePayablesRouter = require("./routes/billwisePayables");
app.use(billwisePayablesRouter);

const outstandingLedgerRouter = require("./routes/outstandingLedger");
app.use(outstandingLedgerRouter);

const outstandingSummaryRouter = require("./routes/outstandingSummary");
app.use(outstandingSummaryRouter);

const bulkStockItemsRouter = require("./routes/bulk-stock-items"); // the above file
app.use("/api/stock-items", bulkStockItemsRouter);

const ledgerReportRouter = require("./routes/ledger-report");
app.use("/api/ledger-report", ledgerReportRouter);

const ledgerCaractionRouter = require("./routes/ledger-caraction");
app.use("/api/ledger-caraction", ledgerCaractionRouter);

const permissionsRouter = require("./routes/permissions");
app.use(permissionsRouter);

const roleManagementRouter = require("./routes/roleManagement");
app.use("/api", roleManagementRouter);

const caManagementRouter = require("./routes/caManagement");
app.use("/api/ca", caManagementRouter);

const auditFormsRouter = require("./routes/auditForms");
app.use("/api/audit", auditFormsRouter);

const userAccountsRouter = require("./routes/userAccounts");
app.use("/api", userAccountsRouter);

const assessee = require("./routes/assessee");
app.use("/api/assessee", assessee);

const itrfiling = require("./routes/ITRFilling");
app.use("/api/itr-filling", itrfiling);

const dashboard = require("./routes/dashboard");
app.use("/api/", dashboard);

const fundflow = require("./routes/fundflow");
app.use("/api/fund-flow", fundflow);

const salesreport = require("./routes/sales-report");
app.use("/api/sales-report", salesreport);

const extractSales = require("./routes/extractSales");
app.use("/api/extract-sales", extractSales);

const extractPurchase = require("./routes/extractPurchase");
app.use("/api/extract-purchase", extractPurchase);

const setProfit = require("./routes/setProfit");
app.use("/api/set-profit", setProfit);

const salesinvoicematching = require("./routes/sales-invoice-matching");
app.use("/api/sales-invoice-matching", salesinvoicematching);

const b2bRoutes = require("./routes/b2b");
app.use("/api/", b2bRoutes);
const b2cRoutes = require("./routes/b2c");
app.use("/api/", b2cRoutes);

const purchaseinvoicematching = require("./routes/purchaseinvoicematching");
app.use("/api/", purchaseinvoicematching);
const authMiddleware = require("./middlewares/authMiddleware");
const AdminUser = require("./routes/AdminUser");
const Traders = require("./routes/traders");
app.use("/api/adminUser", authMiddleware, AdminUser);
app.use("/api/traders", authMiddleware, Traders);
const caEmployee = require("./routes/caemployee");
app.use("/api/", caEmployee);

const consolidatereport = require("./routes/consolidatereport");
app.use("/api/", consolidatereport);
const Header = require("./routes/Header");
app.use("/api/header/", Header);

const EwayBill = require("./routes/EwayBill");
app.use("/api/", EwayBill);

const VoucherImport = require("./routes/VoucherImport");
app.use("/api/", VoucherImport);

const GstAssisment = require("./routes/GstAssisment");
app.use("/api/gst-assessment", GstAssisment);

const userProfile = require("./routes/userProfile");
app.use("/api/profile", userProfile);

const voucherDetailRouter = require("./routes/voucher-detail");
app.use("/api/voucher-detail", voucherDetailRouter);

const purchaseVouchersRouter = require("./routes/purchase_report");
app.use("/api/purchase-report", purchaseVouchersRouter);

// ✅ Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // 🛠️ ONE-TIME REPAIR: Renumber all vouchers to fix chronological issues
  try {
    const { renumberVouchers } = require("./utils/generateVoucherNumber");
    const db = require("./db");

    console.log("🛠️ Starting automatic chronological repair...");

    const [combos] = await db.execute("SELECT DISTINCT company_id, owner_type, owner_id FROM purchase_vouchers");
    for (const combo of combos) {
      // Renumber for current and previous FY
      const datesToFix = [new Date(), new Date(new Date().getFullYear() - 1, 11, 31)];
      for (const d of datesToFix) {
        const types = ["purchase", "sales", "payment", "receipt", "contra", "journal", "bank"];
        for (const t of types) {
          await renumberVouchers({
            companyId: combo.company_id,
            ownerType: combo.owner_type,
            ownerId: combo.owner_id,
            voucherType: t,
            date: d
          }).catch(err => console.error(`Failed to renumber ${t}:`, err.message));
        }
      }
    }
    console.log("✅ Chronological repair completed.");
  } catch (err) {
    console.error("❌ Repair failed:", err.message);
  }
});

