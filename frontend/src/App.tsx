import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { CompanyProvider } from "./context/CompanyContext";
import MainLayout from "./components/layout/MainLayout";
import RequireCompany from "./components/layout/RequireCompany";
import RequireSubscription from "./components/layout/RequireSubscription";
import Dashboard from "./components/dashboard/Dashboard";
import CompanyForm from "./components/company/CompanyForm";

// // Masters Components
import MastersIndex from "./components/masters/MastersIndex";
import LedgerList from "./components/masters/ledger/LedgerList";
import LedgerForm from "./components/masters/ledger/LedgerForm";
import MultiLedgerForm from "./components/masters/ledger/MultiLedgerForm";
import OpeningBalance from "./components/masters/ledger/OpeningBalance";
import GroupList from "./components/masters/group/GroupList";
import GroupForm from "./components/masters/group/GroupForm";
import BudgetList from "./components/masters/budget/BudgetList";
import BudgetForm from "./components/masters/budget/BudgetForm";
import CurrencyList from "./components/masters/currency/CurrencyList";
import CurrencyForm from "./components/masters/currency/CurrencyForm";
import CostCenterList from "./components/masters/costcenter/CostCenterList";
import CostCenterForm from "./components/masters/costcenter/CostCnterForm";
import StockCategoryList from "./components/masters/stock/StockCategoryList";
import StockCategoryForm from "./components/masters/stock/StockCategoryForm";
import StockItemList from "./components/masters/stock/StockItemList";
import StockItemForm from "./components/masters/stock/StockItemForm";
import StockItemEdit from "./components/masters/stock/StockItemEdit";
import BulkStockItemCreate from "./components/masters/stock/BulkStockItemCreate";
import StockPerchaseItem from "./components/masters/stock/StocPerchaseItem";
import BatchList from "./components/masters/batch/BatchList";
import BarcodeList from "./components/masters/barcode/Barcode";
import BatchSelectionPage from "./components/masters/batch/BatchSelectionPage";
import ItemManagement from "./components/masters/ItemManagement";
import StockGroupList from "./components/masters/stock/StockGroupList";
import StockGroupForm from "./components/masters/stock/StockGroupForm";
import UnitList from "./components/masters/unit/UnitList";
import UnitForm from "./components/masters/unit/UnitForm";
import GodownList from "./components/masters/godown/GodownList";
import GodownForm from "./components/masters/godown/GodownForm";
import ScenarioList from "./components/masters/scenario/ScenarioList";
import ScenarioForm from "./components/masters/scenario/ScenarioForm";
import SalesTypeList from "./components/masters/salesTypes/SalesTypeList";
import SalesTypeForm from "./components/masters/salesTypes/SalesTypeForm";

// // Vouchers Components
import VouchersIndex from "./components/vouchers/VouchersIndex";
import PaymentVoucher from "./components/vouchers/payment/PaymentVouchers";
import ContraVoucher from "./components/vouchers/Contra/ContraVoucher";
import CreditNoteVoucher from "./components/vouchers/creditnote/CreditNoteVoucher";
import DebitNoteVoucher from "./components/vouchers/debitnote/DebitNoteVoucher";
import DeliveryNoteVoucher from "./components/vouchers/deliverynote/DeliveryNoteVoucher";
import JournalVoucher from "./components/vouchers/journal/JournalVoucher";
import SalesVoucher1 from "./components/vouchers/sales/SalesVoucher1";
import SalesOrder from "./components/vouchers/salesOrder/SalesOrder";
import PurchaseOrderVoucher from "./components/vouchers/purchaseOrder/PurchaseOrderVoucher";
import PurchaseVoucher1 from "./components/vouchers/purches/PurcheseVoucher1";
import StockJournalVoucher1 from "./components/vouchers/stockjournal/StockJournalVoucher1";
import ReceiptVoucher from "./components/vouchers/receipt/ReceiptVoucher";
import VoucherImport from "./components/vouchers/import/VoucherImport";
import BankStatementImport from "./components/vouchers/import/BankStatementImport";
import PurchaseImport from "./components/vouchers/import/PurchaseImport";
import SalesImport from "./components/vouchers/import/SalesImport";
import QuotationList from "./components/vouchers/quotation/QuotationList";
import QuotationCreate from "./components/vouchers/quotation/QuotationCreate";

// Voucher Register Components
import VoucherRegisterIndex from "./components/voucherRegister/VoucherRegisterIndex";
import PaymentRegister from "./components/voucherRegister/PaymentRegister";
import ReceiptRegister from "./components/voucherRegister/ReceiptRegister";
import ContraRegister from "./components/voucherRegister/ContraRegister";
import JournalRegister from "./components/voucherRegister/JournalRegister";
import SalesRegister from "./components/voucherRegister/salesVoucherRegister/SalesRegister";
import PurchaseRegister from "./components/voucherRegister/purchaseVoucherRegister/PurchaseRegister";
import CreditNoteRegister from "./components/voucherRegister/CreditNoteRegister";
import DebitNoteRegister from "./components/voucherRegister/DebitNoteRegister";
import SalesOrderRegister from "./components/voucherRegister/SalesOrderRegister";
import PurchaseReturnRegister from "./components/voucherRegister/PurchaseReturnRegister";
import StockJournalRegister from "./components/voucherRegister/StockJournalRegister";
import DeliveryNoteRegister from "./components/voucherRegister/DeliveryNoteRegister";
import QuotationRegister from "./components/voucherRegister/QuotationRegister";
import SalesReturnRegister from "./components/voucherRegister/SalesReturnRegister";

//Accounting

//inventry

// // Reports Components
import ReportsIndex from "./components/reports/ReportsIndex";
import DayBook from "./components/reports/DayBook";
import LedgerReport from "./components/reports/LedgerReport";
import TrialBalance from "./components/reports/TrialBalance";
// import TradingAccount from './components/reports/TradingAccount';
// import ProfitLoss from './components/accounting/ProfitLoss';
import ProfitLoss from "./components/reports/ProfitLoss";
import SalesDetail from "./components/reports/profit_loss/SalesDetail";
import SalesAddDetails from "./components/reports/profit_loss/SalesAddDetails";
import BalanceSheet from "./components/reports/BalanceSheet";
import GroupSummary from "./components/reports/GroupSummary";
import GroupSummaryIndex from "./components/reports/GroupSummaryIndex";
import SubGroupSummary from "./components/reports/SubGroupSummary";
import CashFlow from "./components/reports/CashFlow";
import CashFlowSummary from "./components/reports/CashFlowSummary";
import GroupCashFlow from "./components/reports/GroupCashFlow";
import FundFlow from "./components/reports/FundFlow";
import LedgerVouchers from "./components/reports/LedgerVouchers";
import VoucherView from "./components/vouchers/view/VoucherView";
import StockSummary from "./components/reports/StockSummary";
import MovementAnalysis from "./components/reports/MovementAnalysis";
import ItemMonthlySummary from "./components/reports/ItemMonthlySummary";
import StockVouchers from "./components/reports/StockVouchers";
import AgeingAnalysis from "./components/reports/AgeingAnalysis";
import GodownSummary from "./components/reports/GodownSummary";
import GSTAnalysis from "./components/reports/GSTAnalysis";
import OutstandingReports from "./components/reports/outstanding/OutstandingReports";
import SalesReport from "./components/reports/SalesReport";
import SalesInvoiceMatching from "./components/reports/SalesInvoiceMatching";
import ExtractSales from "./components/reports/ExtractSales";
import ExtractPurchase from "./components/reports/ExtractPurchase";
import PurchaseReport1 from "./components/reports/PurchaseReport1";
import PurchaseInvoiceMatching1 from "./components/reports/PurchaseInvoiceMatching";
import B2B from "./components/reports/B2B";
import B2C from "./components/reports/B2C";
import Consolidation from "./components/reports/Consolidation";
import LedgerCaraction from "./components/reports/LedgerCaraction";
import AttributeSummary from "./components/reports/AttributeSummary";
import VoucherReportComingSoon from "./components/reports/voucher/VoucherReportComingSoon";

// GST Module Components

import GSTModule from "./components/modules/gst/GSTModul";
import GSTCalculator from "./components/modules/gst/GSTCalculator";
import GSTRates from "./components/modules/gst/GSTRates";
import HSNCodes from "./components/modules/gst/HSNCode";
import GSTR1 from "./components/modules/gst/GSTR1";
import GSTR3B from "./components/modules/gst/GSTR3B";
import GSTR9 from "./components/modules/gst/GSTR9";
import GSTR9C from "./components/modules/gst/GSTR9C";
import GSTRegistration from "./components/modules/gst/GSTRegistration";
import ComplianceCheck from "./components/modules/gst/ComplianceCheck";
import ImportData from "./components/modules/gst/ImportData";
import Reconciliation from "./components/modules/gst/Reconciliation";
import ExportReturns from "./components/modules/gst/ExportReturns";
import GSTSummary from "./components/modules/gst/GSTSummary";
import EWayBill from "./components/modules/gst/EWayBill";
import ComingSoon from "./components/modules/gst/ComingSoon";
import TDSSummary from "./components/modules/tds/TDSSummary";

//TDSvModules
import TDSModule from "./components/modules/tds/TDSModule";
import TDSReportModule from "./components/modules/tds/TDSReportModule";
import Form24Q from './components/modules/tds/Form24Q';
import Form26Q from './components/modules/tds/Form26Q';
import Form26QReport from './components/modules/tds/Form26QReport';
import Form27QPage from "./components/modules/tds/Form27QPage";
import Form27EQ from "./components/modules/tds/Form27EQ";
import TDSRates from "./components/modules/tds/TDSRates";
import Form16 from "./components/modules/tds/Form16";
import ComplianceCheck2 from "./components/modules/tds/ComplianceCheck";
import DeducteeMaster from "./components/modules/tds/DeducteeMaster";
import TANRegistration from "./components/modules/tds/TANRegistration";
import AuditCompliance from "./components/audit/ComplianceCheck";
import FraudDetection from "./components/audit/FraudDetection";
import Form3CB from "./components/audit/Form3CB";
import Form3CA from "./components/audit/Form3CA";
import Form3CD from "./components/modules/audit/Form3CD";
import Form26QB from "./components/modules/tds/Form26QB";
import Form26QC from "./components/modules/tds/Form26QC";

//Audit Modules
import AuditModule from "./components/modules/AuditModule";
import AuditSummary from "./components/audit/AuditSummary";
import TransactionLog from "./components/audit/TransactionLog";
import UserActivity from "./components/audit/UserActivity";
import LoginHistory from "./components/audit/LoginHistory";
import DataChanges from "./components/audit/DataChanges";
import SecuritySettings from "./components/audit/SecuritySettings";
import RiskAssessment from "./components/audit/RiskAssessment";
import CMAModule from "./components/modules/CMAModule";
import CMAReport from "./components/audit/CMAReport";
import DPRReport from "./components/loan/DPRReport";
import ExceptionReports from "./components/audit/ExceptionReports";
import PeriodAnalysis from "./components/audit/PeriodAnalysis";
import UserReports from "./components/audit/UserReports";
import LoanModule from "./components/modules/loan/LoanModule";

// Income Tax Modules
import IncomeTaxIndex from "./components/incometax/IncomeTaxIndex";
import ITRFiling from "./components/incometax/ITRFiling";
import TaxCalculator from "./components/incometax/TaxCalculator";
import AssesseeManagement from "./components/incometax/AssesseeManagement";
import BusinessIncomeManagement from "./components/incometax/BusinessIncomeManagement";
import InvestmentManagement from "./components/incometax/InvestmentManagement";
import CapitalGainsManagement from "./components/incometax/CapitalGainsManagement";
import TDSManagement from "./components/incometax/TDSManagement";
import IncomeTaxReports from "./components/incometax/IncomeTaxReports";
import SalaryIncomeManagement from "./components/incometax/SalaryIncomeManagement";
import HousePropertyIncomeManagement from "./components/incometax/HousePropertyIncomeManagement";
import OtherSourcesIncomeManagement from "./components/incometax/OtherSourcesIncomeManagement";

// Other Modules
// import AccountingModule from './components/accounting/AccountingModule';
// import InventoryModule from './components/inventory/InventoryModule';

// Home Pages
import HomePage from "./home/pages/HomePage";
import PricingPage from "./home/pages/PricingPage";
import AppPricing from "./components/payments/Pricing";
import PaymentSuccess from "./components/payments/Success";
import PaymentFailure from "./components/payments/Failure";
import PurchasePage from "./home/pages/PurchasePage";
import AboutUsPage from "./home/pages/AboutUsPage";
import CareersPage from "./home/pages/CareersPage";
import ContactPage from "./home/pages/ContactPage";
import PrivacyPolicyPage from "./home/pages/PrivacyPolicyPage";
import LoginPage from "./home/auth/LoginPage";
import Register from "./home/auth/Register";
import ForgotPassword from "./home/auth/ForgotPassword";
import ResetPassword from "./home/auth/ResetPassword";
import { AuthProvider } from "./home/context/AuthContext";

//config module
import ConfigModule from "./components/modules/ConfigModule";
import GeneralSettings from "./components/config/GeneralSettings";
import DatabaseSettings from "./components/config/DatabaseSettings";
import BackupRestore from "./components/config/BackupRestore";
import DisplaySettings from "./components/config/DisplaySettings";
import UserAccounts from "./components/config/UserAccounts";
import Permissions from "./components/config/Permissions";
import RoleManagement from "./components/config/RoleManagement";
import AccessControl from "./components/config/AccessControl";
import SetProfit from "./components/config/SetProfit";
import SalesByFifo from "./components/config/SalesByFifo";
import Profile from "./components/config/Profile";
import UpdateProfile from "./components/config/UpdateProfile";
import PurchaseDetail from "./components/reports/profit_loss/PurchaseDetail";
import PurchaseAddDetails from "./components/reports/profit_loss/PurchaseAddDetails";
import PurchaseItemDetail from "./components/reports/profit_loss/PurchaseItemDetail";
import OpeningStockDetail from "./components/reports/profit_loss/OpeningStockDetail";
import SalesItemDetail from "./components/reports/profit_loss/SalesItemDetail";
import DirectExpenseDetail from "./components/reports/profit_loss/DirectExpenseDetail";
import IndirectExpenseDetail from "./components/reports/profit_loss/IndirectExpenseDetail";
import IndirectIncomeDetail from "./components/reports/profit_loss/IndirectIncomeDetail";
import ReceivablesDetails from "./components/reports/outstanding/outStandingDetails/ReceivablesDetails";
import Payablesdetails from "./components/reports/outstanding/outStandingDetails/Payablesdetails";
import SalesRepostDetails from "./components/reports/SalesReportDetail/SalesRepostDetails";
import PurchseReportDetil from "./components/reports/ParchseReportDetail/PurchseReportDetil";
import B2BHsn from "./components/reports/B2BHsn";
import B2CHsn from "./components/reports/B2CHsn";
import B2BPurchase from "./components/reports/B2BPurchase";
import B2CPurchase from "./components/reports/B2CPurchase";
import B2BHsnPurchase from "./components/reports/B2BHsnPurchase";
import B2CHsnPurchase from "./components/reports/B2CHsnPurchase";
import Gstr2B2b from "./components/modules/gst/Gstr1/GstrB2b";
import GstrB2cl from "./components/modules/gst/Gstr1/GstrB2cl";
import GstrB2cs from "./components/modules/gst/Gstr1/GstrB2cs";
import HSNSummary from "./components/modules/gst/Gstr1/HSNSummary";
import HSNSummaryB2C from "./components/modules/gst/Gstr1/HSNSummaryB2C";
import PurchaseOrderRegister from "./components/voucherRegister/PurchaseOrderRegister";
import DebitNoteRegiser from "./components/voucherRegister/DebitNoteRegiser";
import AllSaleHsn from "./components/reports/AllSaleHsn";
import AllHsnPurachase from "./components/reports/AllHsnPurachase";
import NoCompanyAssigned from "./components/dashboard/NoCompanyAssigned";

function App() {
  // Add keyboard shortcut listener for Alt+F1 for company selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+F1 for company selection
      if (e.altKey && e.key === "F1") {
        e.preventDefault();
        window.location.href = "/app/company";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <AuthProvider>
      <CompanyProvider>
        <AppProvider>
          <Router>
            <Routes>
              {/* Home/Marketing Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/signup" element={<Register />} />
              <Route path="/purchase" element={<PurchasePage />} />
              <Route path="/about" element={<AboutUsPage />} />
              <Route path="/careers" element={<CareersPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />

              {/* App Routes */}
              <Route path="/app" element={<MainLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="company" element={<CompanyForm />} />
                <Route path="no-company" element={<NoCompanyAssigned />} />
                <Route
                  path="pricing"
                  element={
                    <RequireCompany>
                      <AppPricing />
                    </RequireCompany>
                  }
                />
                <Route
                  path="payments/success"
                  element={<PaymentSuccess />}
                />
                <Route
                  path="payments/failure"
                  element={<PaymentFailure />}
                />
                {/* Masters Routes */}
                <Route
                  path="masters"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <MastersIndex />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/ledger"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <LedgerList />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/ledger/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <LedgerForm />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/ledger/opn"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <OpeningBalance />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/ledger/bulk-create"
                  element={
                    <RequireCompany>
                      <MultiLedgerForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/ledger/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <LedgerForm />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/group"
                  element={
                    <RequireCompany>
                      <GroupList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/group/create"
                  element={
                    <RequireCompany>
                      <GroupForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/group/edit/:id"
                  element={
                    <RequireCompany>
                      <GroupForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/budgets"
                  element={
                    <RequireCompany>
                      <BudgetList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/budget/create"
                  element={
                    <RequireCompany>
                      <BudgetForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/budget/edit/:id"
                  element={
                    <RequireCompany>
                      <BudgetForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/currency"
                  element={
                    <RequireCompany>
                      <CurrencyList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/currency/create"
                  element={
                    <RequireCompany>
                      <CurrencyForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/currency/edit/:id"
                  element={
                    <RequireCompany>
                      <CurrencyForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/cost-centers"
                  element={
                    <RequireCompany>
                      <CostCenterList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/cost-center/create"
                  element={
                    <RequireCompany>
                      <CostCenterForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/cost-center/edit/:id"
                  element={
                    <RequireCompany>
                      <CostCenterForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-categories"
                  element={
                    <RequireCompany>
                      <StockCategoryList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-category/create"
                  element={
                    <RequireCompany>
                      <StockCategoryForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-category/edit/:id"
                  element={
                    <RequireCompany>
                      <StockCategoryForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item"
                  element={
                    <RequireCompany>
                      <StockItemList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/create"
                  element={
                    <RequireCompany>
                      <StockItemForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/purchase/create"
                  element={
                    <RequireCompany>
                      <StockPerchaseItem />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/bulk-create"
                  element={
                    <RequireCompany>
                      <BulkStockItemCreate />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/edit/:id"
                  element={
                    <RequireCompany>
                      <StockItemForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/edit-stock/:id"
                  element={
                    <RequireCompany>
                      <StockItemEdit />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/batches"
                  element={
                    <RequireCompany>
                      <BatchList />
                    </RequireCompany>
                  }
                />

                <Route
                  path="masters/stock-item/barcode"
                  element={
                    <RequireCompany>
                      <BarcodeList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/manage"
                  element={
                    <RequireCompany>
                      <ItemManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-item/batch-selection/:id"
                  element={
                    <RequireCompany>
                      <BatchSelectionPage />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-group"
                  element={
                    <RequireCompany>
                      <StockGroupList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-group/create"
                  element={
                    <RequireCompany>
                      <StockGroupForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/stock-group/edit/:id"
                  element={
                    <RequireCompany>
                      <StockGroupForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/units"
                  element={
                    <RequireCompany>
                      <UnitList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/unit/create"
                  element={
                    <RequireCompany>
                      <UnitForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/unit/edit/:id"
                  element={
                    <RequireCompany>
                      <UnitForm />
                    </RequireCompany>
                  }
                />{" "}
                <Route
                  path="masters/godowns"
                  element={
                    <RequireCompany>
                      <GodownList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/godown/create"
                  element={
                    <RequireCompany>
                      <GodownForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/godown/edit/:id"
                  element={
                    <RequireCompany>
                      <GodownForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/scenarios"
                  element={
                    <RequireCompany>
                      <ScenarioList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/scenario/create"
                  element={
                    <RequireCompany>
                      <ScenarioForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/scenario/edit/:id"
                  element={
                    <RequireCompany>
                      <ScenarioForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/sales-types"
                  element={
                    <RequireCompany>
                      <SalesTypeList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/sales-types/create"
                  element={
                    <RequireCompany>
                      <SalesTypeForm />
                    </RequireCompany>
                  }
                />
                <Route
                  path="masters/sales-types/edit/:id"
                  element={
                    <RequireCompany>
                      <SalesTypeForm />
                    </RequireCompany>
                  }
                />
                {/* <Route path="scenarios" element={<ScenarioList />} />
            <Route path="scenarios/create" element={<ScenarioForm />} />
            <Route path="scenarios/edit/:id" element={<ScenarioForm />} /> */}
                {/* Vouchers Routes */}
                <Route
                  path="vouchers"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <VouchersIndex />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/payment/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PaymentVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/payment/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PaymentVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/receipt/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ReceiptVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/receipt/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ReceiptVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/contra/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ContraVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/contra/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ContraVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/credit-note/create"
                  element={
                    <RequireCompany>
                      <CreditNoteVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/credit-note/edit/:id"
                  element={
                    <RequireCompany>
                      <CreditNoteVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/debit-note/create"
                  element={
                    <RequireCompany>
                      <DebitNoteVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/debit-note/edit/:id"
                  element={
                    <RequireCompany>
                      <DebitNoteVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/delivery-note/create"
                  element={
                    <RequireCompany>
                      <DeliveryNoteVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/delivery-note/edit/:id"
                  element={
                    <RequireCompany>
                      <DeliveryNoteVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/journal/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <JournalVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/journal/create/:id"
                  element={
                    <RequireCompany>
                      <JournalVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/journal/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <JournalVoucher />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/purchase/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PurchaseVoucher1 />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/purchase/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PurchaseVoucher1 />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/stock-journal/create"
                  element={
                    <RequireCompany>
                      <StockJournalVoucher1 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/stock-journal/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <StockJournalVoucher1 />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/sales/create"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <SalesVoucher1 />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/sales/edit/:id"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <SalesVoucher1 />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/sales-order/create"
                  element={
                    <RequireCompany>
                      <SalesOrder />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/sales-order/edit/:id"
                  element={
                    <RequireCompany>
                      <SalesOrder />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/quotation/create"
                  element={
                    <RequireCompany>
                      <QuotationCreate />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/quotation/list"
                  element={
                    <RequireCompany>
                      <QuotationList />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/purchase-order/create"
                  element={
                    <RequireCompany>
                      <PurchaseOrderVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/purchase-order/edit/:id"
                  element={
                    <RequireCompany>
                      <PurchaseOrderVoucher />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/view/:voucherType/:voucherNo"
                  element={
                    <RequireCompany>
                      <VoucherView />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/import"
                  element={
                    <RequireCompany>
                      <VoucherImport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/bank-statement-import"
                  element={
                    <RequireCompany>
                      <BankStatementImport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/purchase-import"
                  element={
                    <RequireCompany>
                      <PurchaseImport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="vouchers/sales-import"
                  element={
                    <RequireCompany>
                      <SalesImport />
                    </RequireCompany>
                  }
                />
                {/* Voucher Register Routes */}
                <Route
                  path="voucher-register"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <VoucherRegisterIndex />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/payment"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PaymentRegister />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/receipt"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ReceiptRegister />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/contra"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ContraRegister />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/journal"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <JournalRegister />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/sales"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <SalesRegister />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/debit-note"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <DebitNoteRegiser />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/sales/detail/:month"
                  element={
                    <RequireCompany>
                      <SalesRepostDetails />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/purchase"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PurchaseRegister />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/purchase/detail/:month"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <PurchseReportDetil />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/credit-note"
                  element={
                    <RequireCompany>
                      <CreditNoteRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/sales-order"
                  element={
                    <RequireCompany>
                      <SalesOrderRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/purchase-order"
                  element={
                    <RequireCompany>
                      <PurchaseOrderRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/purchase-return"
                  element={
                    <RequireCompany>
                      <PurchaseReturnRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/stock-journal"
                  element={
                    <RequireCompany>
                      <StockJournalRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/delivery-note"
                  element={
                    <RequireCompany>
                      <DeliveryNoteRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/quotation"
                  element={
                    <RequireCompany>
                      <QuotationRegister />
                    </RequireCompany>
                  }
                />
                <Route
                  path="voucher-register/sales-return"
                  element={
                    <RequireCompany>
                      <SalesReturnRegister />
                    </RequireCompany>
                  }
                />
                {/* Reports Routes */}
                <Route
                  path="reports"
                  element={
                    <RequireCompany>
                      <RequireSubscription>
                        <ReportsIndex />
                      </RequireSubscription>
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/voucher/payment"
                  element={
                    <RequireCompany>
                      <VoucherReportComingSoon title="Payment Voucher Report" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/voucher/receipt"
                  element={
                    <RequireCompany>
                      <VoucherReportComingSoon title="Receipt Voucher Report" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/voucher/contra"
                  element={
                    <RequireCompany>
                      <VoucherReportComingSoon title="Contra Voucher Report" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/voucher/journal"
                  element={
                    <RequireCompany>
                      <VoucherReportComingSoon title="Journal Voucher Report" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/voucher/sales"
                  element={
                    <RequireCompany>
                      <VoucherReportComingSoon title="Sales Voucher Report" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/voucher/purchase"
                  element={
                    <RequireCompany>
                      <VoucherReportComingSoon title="Purchase Voucher Report" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/day-book"
                  element={
                    <RequireCompany>
                      <DayBook />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/ledger"
                  element={
                    <RequireCompany>
                      <LedgerReport />
                    </RequireCompany>
                  }
                />

                <Route
                  path="reports/ledger/:id"
                  element={
                    <RequireCompany>
                      <LedgerReport />
                    </RequireCompany>
                  }
                />

                <Route
                  path="reports/trial-balance"
                  element={
                    <RequireCompany>
                      <TrialBalance />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss"
                  element={
                    <RequireCompany>
                      <ProfitLoss />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/purchase"
                  element={
                    <RequireCompany>
                      <PurchaseDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/purchase/alldetails"
                  element={
                    <RequireCompany>
                      <PurchaseAddDetails />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/sales"
                  element={
                    <RequireCompany>
                      <SalesDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/sales/alldetails"
                  element={
                    <RequireCompany>
                      <SalesAddDetails />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/opening-stock/alldetails"
                  element={
                    <RequireCompany>
                      <OpeningStockDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/purchase-item/alldetails"
                  element={
                    <RequireCompany>
                      <PurchaseItemDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/sales-item/alldetails"
                  element={
                    <RequireCompany>
                      <SalesItemDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/direct-expense/alldetails"
                  element={
                    <RequireCompany>
                      <DirectExpenseDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/indirect-expense/alldetails"
                  element={
                    <RequireCompany>
                      <IndirectExpenseDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/profit-loss/indirect-income/alldetails"
                  element={
                    <RequireCompany>
                      <IndirectIncomeDetail />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/balance-sheet"
                  element={
                    <RequireCompany>
                      <BalanceSheet />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/sub-group-summary/:groupId"
                  element={
                    <RequireCompany>
                      <SubGroupSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/group-summary"
                  element={
                    <RequireCompany>
                      <GroupSummaryIndex />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/group-summary/:groupType"
                  element={
                    <RequireCompany>
                      <GroupSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/cash-flow"
                  element={
                    <RequireCompany>
                      <CashFlow />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/fund-flow"
                  element={
                    <RequireCompany>
                      <FundFlow />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/cash-flow-summary/:monthCode"
                  element={
                    <RequireCompany>
                      <CashFlowSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/group-cash-flow/:accountName"
                  element={
                    <RequireCompany>
                      <GroupCashFlow />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/ledger-vouchers/:ledgerName"
                  element={
                    <RequireCompany>
                      <LedgerVouchers />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/outstanding"
                  element={
                    <RequireCompany>
                      <OutstandingReports />
                    </RequireCompany>
                  }
                />
                {/* <Route
                  path="reports/outstanding/receivables"
                  element={
                    <RequireCompany>
                      <ReceivablesDetails />
                    </RequireCompany>
                  }
                /> */}
                {/* <Route
                  path="reports/outstanding/payables"
                  element={
                    <RequireCompany>
                      <Payablesdetails />
                    </RequireCompany>
                  }
                /> */}
                <Route
                  path="reports/stock-summary"
                  element={
                    <RequireCompany>
                      <StockSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/attribute-summary"
                  element={
                    <RequireCompany>
                      <AttributeSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/item-monthly-summary"
                  element={
                    <RequireCompany>
                      <ItemMonthlySummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/stock-vouchers"
                  element={
                    <RequireCompany>
                      <StockVouchers />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/movement-analysis"
                  element={
                    <RequireCompany>
                      <MovementAnalysis />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/ageing-analysis"
                  element={
                    <RequireCompany>
                      <AgeingAnalysis />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/godown-summary"
                  element={
                    <RequireCompany>
                      <GodownSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/extract-sales"
                  element={
                    <RequireCompany>
                      <ExtractSales />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/extract-purchase"
                  element={
                    <RequireCompany>
                      <ExtractPurchase />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/sales-report"
                  element={
                    <RequireCompany>
                      <SalesReport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/sales-invoice-matching"
                  element={
                    <RequireCompany>
                      <SalesInvoiceMatching />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/purchase-report"
                  element={
                    <RequireCompany>
                      <PurchaseReport1 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/purchase-invoice-matching"
                  element={
                    <RequireCompany>
                      <PurchaseInvoiceMatching1 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2b"
                  element={
                    <RequireCompany>
                      <B2B />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2c"
                  element={
                    <RequireCompany>
                      <B2C />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2bhsn"
                  element={
                    <RequireCompany>
                      <B2BHsn />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2chsn"
                  element={
                    <RequireCompany>
                      <B2CHsn />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/allhsn"
                  element={
                    <RequireCompany>
                      <AllSaleHsn />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2bpurchase"
                  element={
                    <RequireCompany>
                      <B2BPurchase />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2cpurchase"
                  element={
                    <RequireCompany>
                      <B2CPurchase />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2bhsnpurchase"
                  element={
                    <RequireCompany>
                      <B2BHsnPurchase />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/b2chsnpurchase"
                  element={
                    <RequireCompany>
                      <B2CHsnPurchase />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/allhsnpurchase"
                  element={
                    <RequireCompany>
                      <AllHsnPurachase />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/consolidation"
                  element={
                    <RequireCompany>
                      <Consolidation />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/ledger-caraction"
                  element={
                    <RequireCompany>
                      <LedgerCaraction />
                    </RequireCompany>
                  }
                />
                <Route
                  path="reports/ledger-caraction/:id"
                  element={
                    <RequireCompany>
                      <LedgerCaraction />
                    </RequireCompany>
                  }
                />
                {/* GST Module Routes */}
                <Route
                  path="gst/gstr-1"
                  element={
                    <RequireCompany>
                      <GSTR1 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-1/b2b"
                  element={
                    <RequireCompany>
                      <Gstr2B2b />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-1/b2cl"
                  element={
                    <RequireCompany>
                      <GstrB2cl />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-1/b2c-small"
                  element={
                    <RequireCompany>
                      <GstrB2cs />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-1/hsn-summary"
                  element={
                    <RequireCompany>
                      <HSNSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-1/hsn-summary-b2c"
                  element={
                    <RequireCompany>
                      <HSNSummaryB2C />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-3b"
                  element={
                    <RequireCompany>
                      <GSTR3B />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-9"
                  element={
                    <RequireCompany>
                      <GSTR9 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-9c"
                  element={
                    <RequireCompany>
                      <GSTR9C />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gstr-2a"
                  element={
                    <RequireCompany>
                      <ComingSoon title="GSTR-2A" />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/gst-analysis"
                  element={
                    <RequireCompany>
                      <GSTAnalysis />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst"
                  element={
                    <RequireCompany>
                      <GSTModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/calculator"
                  element={
                    <RequireCompany>
                      <GSTCalculator />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/hsn-codes"
                  element={
                    <RequireCompany>
                      <HSNCodes />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/compliance"
                  element={
                    <RequireCompany>
                      <ComplianceCheck />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/rates"
                  element={
                    <RequireCompany>
                      <GSTRates />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/registration"
                  element={
                    <RequireCompany>
                      <GSTRegistration />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/import"
                  element={
                    <RequireCompany>
                      <ImportData />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/reconciliation"
                  element={
                    <RequireCompany>
                      <Reconciliation />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/export"
                  element={
                    <RequireCompany>
                      <ExportReturns />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/e-way-bill"
                  element={
                    <RequireCompany>
                      <EWayBill />
                    </RequireCompany>
                  }
                />
                <Route
                  path="gst/summary"
                  element={
                    <RequireCompany>
                      <GSTSummary />
                    </RequireCompany>
                  }
                />
                {/* TDS Module Routes */}
                <Route
                  path="tds"
                  element={
                    <RequireCompany>
                      <TDSModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-24q"
                  element={
                    <RequireCompany>
                      <Form24Q />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-26q"
                  element={
                    <RequireCompany>
                      <Form26Q />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-27q"
                  element={
                    <RequireCompany>
                      <Form27QPage />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-27eq"
                  element={
                    <RequireCompany>
                      <Form27EQ />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/summary"
                  element={
                    <RequireCompany>
                      <TDSSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/rates"
                  element={
                    <RequireCompany>
                      <TDSRates />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-16"
                  element={
                    <RequireCompany>
                      <Form16 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/compliance"
                  element={
                    <RequireCompany>
                      <ComplianceCheck2 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/deductees"
                  element={
                    <RequireCompany>
                      <DeducteeMaster />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/tan"
                  element={
                    <RequireCompany>
                      <TANRegistration />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-26qb"
                  element={
                    <RequireCompany>
                      <Form26QB />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds/form-26qc"
                  element={
                    <RequireCompany>
                      <Form26QC />
                    </RequireCompany>
                  }
                />
                {/* TDS Report Module Routes */}
                <Route
                  path="tds-report"
                  element={
                    <RequireCompany>
                      <TDSReportModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-24q"
                  element={
                    <RequireCompany>
                      <Form24Q />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-26q"
                  element={
                    <RequireCompany>
                      <Form26QReport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-27q"
                  element={
                    <RequireCompany>
                      <Form27QPage />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-27eq"
                  element={
                    <RequireCompany>
                      <Form27EQ />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/summary"
                  element={
                    <RequireCompany>
                      <TDSSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/rates"
                  element={
                    <RequireCompany>
                      <TDSRates />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-16"
                  element={
                    <RequireCompany>
                      <Form16 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/compliance"
                  element={
                    <RequireCompany>
                      <ComplianceCheck2 />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/deductees"
                  element={
                    <RequireCompany>
                      <DeducteeMaster />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/tan"
                  element={
                    <RequireCompany>
                      <TANRegistration />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-26qb"
                  element={
                    <RequireCompany>
                      <Form26QB />
                    </RequireCompany>
                  }
                />
                <Route
                  path="tds-report/form-26qc"
                  element={
                    <RequireCompany>
                      <Form26QC />
                    </RequireCompany>
                  }
                />
                {/* Audit Module Routes */}
                <Route
                  path="audit"
                  element={
                    <RequireCompany>
                      <AuditModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="loan"
                  element={
                    <RequireCompany>
                      <LoanModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="loan/cma"
                  element={
                    <RequireCompany>
                      <CMAModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="loan/cma-report"
                  element={
                    <RequireCompany>
                      <CMAReport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/summary"
                  element={
                    <RequireCompany>
                      <AuditSummary />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/transaction-log"
                  element={
                    <RequireCompany>
                      <TransactionLog />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/user-activity"
                  element={
                    <RequireCompany>
                      <UserActivity />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/login-history"
                  element={
                    <RequireCompany>
                      <LoginHistory />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/data-changes"
                  element={
                    <RequireCompany>
                      <DataChanges />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/security"
                  element={
                    <RequireCompany>
                      <SecuritySettings />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/compliance"
                  element={
                    <RequireCompany>
                      <AuditCompliance />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/risk"
                  element={
                    <RequireCompany>
                      <RiskAssessment />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/fraud"
                  element={
                    <RequireCompany>
                      <FraudDetection />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/exceptions"
                  element={
                    <RequireCompany>
                      <ExceptionReports />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/period-analysis"
                  element={
                    <RequireCompany>
                      <PeriodAnalysis />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/user-reports"
                  element={
                    <RequireCompany>
                      <UserReports />
                    </RequireCompany>
                  }
                />
                <Route
                  path="loan/dpr"
                  element={
                    <RequireCompany>
                      <DPRReport />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/3-Cb"
                  element={
                    <RequireCompany>
                      <Form3CB />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/3-ca"
                  element={
                    <RequireCompany>
                      <Form3CA />
                    </RequireCompany>
                  }
                />
                <Route
                  path="audit/3-cd"
                  element={
                    <RequireCompany>
                      <Form3CD />
                    </RequireCompany>
                  }
                />
                {/* Income Tax Module Routes */}
                <Route
                  path="income-tax"
                  element={
                    <RequireCompany>
                      <IncomeTaxIndex />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/itr-filing"
                  element={
                    <RequireCompany>
                      <ITRFiling />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/calculator"
                  element={
                    <RequireCompany>
                      <TaxCalculator />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/assessee"
                  element={
                    <RequireCompany>
                      <AssesseeManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/business-income"
                  element={
                    <RequireCompany>
                      <BusinessIncomeManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/investment"
                  element={
                    <RequireCompany>
                      <InvestmentManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/capital-gains"
                  element={
                    <RequireCompany>
                      <CapitalGainsManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/tds"
                  element={
                    <RequireCompany>
                      <TDSManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/reports"
                  element={
                    <RequireCompany>
                      <IncomeTaxReports />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/salary"
                  element={
                    <RequireCompany>
                      <SalaryIncomeManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/house-property"
                  element={
                    <RequireCompany>
                      <HousePropertyIncomeManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/other-sources"
                  element={
                    <RequireCompany>
                      <OtherSourcesIncomeManagement />
                    </RequireCompany>
                  }
                />
                {/* Legacy route aliases for backward compatibility */}
                <Route
                  path="income-tax/business"
                  element={
                    <RequireCompany>
                      <BusinessIncomeManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="income-tax/deductions"
                  element={
                    <RequireCompany>
                      <InvestmentManagement />
                    </RequireCompany>
                  }
                />
                {/* Config Module Routes */}
                <Route
                  path="config"
                  element={
                    <RequireCompany>
                      <ConfigModule />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/general"
                  element={
                    <RequireCompany>
                      <GeneralSettings />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/database"
                  element={
                    <RequireCompany>
                      <DatabaseSettings />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/backup"
                  element={
                    <RequireCompany>
                      <BackupRestore />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/display"
                  element={
                    <RequireCompany>
                      <DisplaySettings />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/users"
                  element={
                    <RequireCompany>
                      <UserAccounts />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/permissions"
                  element={
                    <RequireCompany>
                      <Permissions />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/roles"
                  element={
                    <RequireCompany>
                      <RoleManagement />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/access"
                  element={
                    <RequireCompany>
                      <AccessControl />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/set-profit"
                  element={
                    <RequireCompany>
                      <SetProfit />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/sales-fifo"
                  element={
                    <RequireCompany>
                      <SalesByFifo />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/profile"
                  element={
                    <RequireCompany>
                      <Profile />
                    </RequireCompany>
                  }
                />
                <Route
                  path="config/update-profile"
                  element={
                    <RequireCompany>
                      <UpdateProfile />
                    </RequireCompany>
                  }
                />
              </Route>
            </Routes>
          </Router>
        </AppProvider>
      </CompanyProvider>
    </AuthProvider>
  );
}

export default App;
