import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart2,
  BookOpen,
  Calendar,
  DollarSign,
  FileText,
  PieChart,
  TrendingUp,
  AlertTriangle,
  BookCopy,
  ShieldCheck
} from 'lucide-react';

interface ReportItem {
  icon: React.ReactNode;
  name: string;
  path: string;
  isPending?: boolean;
}

interface ReportCategory {
  title: string;
  items: ReportItem[];
}

const ReportsIndex: React.FC = () => {
  const { theme } = useAppContext(); // 👈 get role here
  const navigate = useNavigate();
  // Read role from localStorage (always lowercase for safety)
  const role: string | null = localStorage.getItem("supplier")?.toLowerCase() || null;
  const reportCategories: ReportCategory[] = [
    {
      title: 'Accounting Reports',
      items: [
        { icon: <BookOpen size={20} />, name: 'Day Book', path: '/app/reports/day-book' },
        { icon: <FileText size={20} />, name: 'Ledger', path: '/app/reports/ledger' },
        { icon: <FileText size={20} />, name: 'Ledger Confirmation', path: '/app/reports/ledger-confirmation' },
        { icon: <FileText size={20} />, name: 'Group Summary', path: '/app/reports/group-summary' },
        { icon: <BarChart2 size={20} />, name: 'Trial Balance', path: '/app/reports/trial-balance' },
        { icon: <TrendingUp size={20} />, name: 'Profit & Loss', path: '/app/reports/profit-loss' },
        { icon: <DollarSign size={20} />, name: 'Balance Sheet', path: '/app/reports/balance-sheet' },
        { icon: <PieChart size={20} />, name: 'Cash Flow', path: '/app/reports/cash-flow' },
        { icon: <PieChart size={20} />, name: 'Fund Flow', path: '/app/reports/fund-flow' },
        { icon: <AlertTriangle size={20} />, name: 'Outstanding', path: '/app/reports/outstanding' },
        { icon: <BookCopy size={20} />, name: 'Consolidation', path: '/app/reports/consolidation' },
        { icon: <FileText size={20} />, name: 'Schedule of Fixed Assets', path: '/app/reports/fixed-assets-schedule' },
        { icon: <FileText size={20} />, name: 'Ledger Correction', path: '/app/reports/ledger-caraction' },
        { icon: <FileText size={20} />, name: 'Account Summary', path: '/app/reports/account-summary' },
        { icon: <ShieldCheck size={20} />, name: 'Books vs 26AS', path: '/app/reports/books-vs-26as', isPending: true },
        { icon: <FileText size={20} />, name: 'Books vs AIS', path: '/app/reports/books-vs-ais', isPending: true },
        { icon: <FileText size={20} />, name: 'Income and Expenditure', path: '/app/reports/income-expenditure', isPending: true },
        { icon: <FileText size={20} />, name: 'Capital Account', path: '/app/reports/capital-account' },
        { icon: <BarChart2 size={20} />, name: 'GST Assessment', path: '/app/reports/gst-analysis' },
        { icon: <FileText size={20} />, name: 'Receipt and Payment Account', path: '/app/reports/receipt-payment-account', isPending: true },
        { icon: <FileText size={20} />, name: 'Tax Status', path: '/app/reports/tax-status', isPending: true },
        { icon: <BarChart2 size={20} />, name: 'Financial Analysis', path: '/app/reports/financial-analysis', isPending: true },
        { icon: <TrendingUp size={20} />, name: 'Ratio Analysis', path: '/app/reports/ratio-analysis', isPending: true },
        { icon: <Activity size={20} />, name: 'Financial Changes', path: '/app/reports/financial-changes', isPending: true }
      ]
    },
    {
      title: 'Voucher Report',
      items: [
        { icon: <FileText size={20} />, name: 'Payment', path: '/app/reports/voucher/payment' },
        { icon: <FileText size={20} />, name: 'Receipt', path: '/app/reports/voucher/receipt' },
        { icon: <FileText size={20} />, name: 'Contra', path: '/app/reports/voucher/contra' },
        { icon: <FileText size={20} />, name: 'Journal', path: '/app/reports/voucher/journal' },
        { icon: <FileText size={20} />, name: 'Sales', path: '/app/reports/voucher/sales' },
        { icon: <FileText size={20} />, name: 'Purchase', path: '/app/reports/voucher/purchase' }
      ]
    },
    {
      title: 'Inventory Reports',
      items: [
        { icon: <BookOpen size={20} />, name: 'Stock Summary', path: '/app/reports/stock-summary' },
        { icon: <Activity size={20} />, name: 'Movement Analysis', path: '/app/reports/movement-analysis' },
        { icon: <Calendar size={20} />, name: 'Ageing Analysis', path: '/app/reports/ageing-analysis' },
        { icon: <BarChart2 size={20} />, name: 'Godown Summary', path: '/app/reports/godown-summary' },
        { icon: <FileText size={20} />, name: 'Attribute summary', path: '/app/reports/attribute-summary' },
        { icon: <FileText size={20} />, name: 'Quantity Correction', path: '/app/reports/quantity-correction' }
      ]
    },
    {
      title: 'Sales Reports',
      items: [
        // { icon: <BookOpen size={20} />, name: 'Extract Sales', path: '/app/reports/extract-sales' },
        { icon: <Activity size={20} />, name: 'Sales Report', path: '/app/reports/sales-report' },
        { icon: <Calendar size={20} />, name: 'Sales Invoice Matching', path: '/app/reports/sales-invoice-matching' },
        { icon: <Calendar size={20} />, name: 'B2B', path: '/app/reports/b2b' },
        { icon: <Calendar size={20} />, name: 'B2C', path: '/app/reports/b2c' },
        { icon: <Calendar size={20} />, name: 'B2B HSN', path: '/app/reports/b2bhsn' },
        { icon: <Calendar size={20} />, name: 'B2C HSN', path: '/app/reports/b2chsn' },
        { icon: <BookOpen size={20} />, name: 'All HSN', path: '/app/reports/allhsn' },
        { icon: <FileText size={20} />, name: 'Books vs GSTR1', path: '/app/reports/books-vs-gstr1', isPending: true },
        { icon: <FileText size={20} />, name: 'Books vs GSTR3B', path: '/app/reports/books-vs-gstr3b', isPending: true },
        { icon: <FileText size={20} />, name: 'GSTR1 vs GSTR3B', path: '/app/reports/gstr1-vs-gstr3b', isPending: true }
      ]
    },
    {
      title: 'Purchase Reports',
      items: [
        // { icon: <BookOpen size={20} />, name: 'Extract Purchase', path: '/app/reports/extract-purchase' },
        { icon: <Activity size={20} />, name: 'Purchase Report', path: '/app/reports/purchase-report' },
        { icon: <Calendar size={20} />, name: 'Purchase Invoice Matching', path: '/app/reports/purchase-invoice-matching' },
        { icon: <Calendar size={20} />, name: 'B2B', path: '/app/reports/b2bpurchase' },
        { icon: <Calendar size={20} />, name: 'B2C', path: '/app/reports/b2cpurchase' },
        { icon: <Calendar size={20} />, name: 'B2B HSN', path: '/app/reports/b2bhsnpurchase' },
        { icon: <Calendar size={20} />, name: 'B2C HSN', path: '/app/reports/b2chsnpurchase' },
        { icon: <BookOpen size={20} />, name: 'All HSN', path: '/app/reports/allhsnpurchase' },
        { icon: <FileText size={20} />, name: 'Books vs GSTR2A', path: '/app/reports/books-vs-2a', isPending: true },
        { icon: <FileText size={20} />, name: 'Books vs GSTR2B', path: '/app/reports/books-vs-2b', isPending: true },
        { icon: <FileText size={20} />, name: 'GSTR2A vs GSTR2B', path: '/app/reports/gstr2a-vs-gstr2b', isPending: true },
        { icon: <FileText size={20} />, name: 'RCM Report', path: '/app/reports/rcm-report' }
      ]
    }
  ];

  return (
    <div className='pt-[56px] px-4 '>
      <h1 className="text-2xl font-bold mb-6">Reports</h1>

      <div className="grid grid-cols-1 gap-6">
        {reportCategories.map((category, index) => (
          <div
            key={index}
            className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white shadow'}`}
          >
            <h2 className="text-xl font-semibold mb-4">{category.title}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {category.items
                .filter(item =>
                  // 🚫 hide Consolidation for CA + CA Employee
                  !((role === 'ca' || role === 'ca_employee') && item.name === 'Consolidation')
                )
                .map((item, itemIndex) => (
                  <button
                    key={itemIndex}
                    onClick={() => navigate(item.path)}
                    className={`p-4 rounded-lg flex flex-col items-center text-center transition-colors ${
                      item.isPending
                        ? theme === 'dark'
                          ? 'bg-red-950/30 border border-red-800/50 hover:bg-red-900/40 text-red-400'
                          : 'bg-red-50 border border-red-200 hover:bg-red-100 text-red-600'
                        : theme === 'dark'
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className={`p-2 rounded-full mb-2 ${
                      item.isPending
                        ? theme === 'dark'
                          ? 'bg-red-900/60 text-red-300'
                          : 'bg-red-100 text-red-600'
                        : theme === 'dark'
                          ? 'bg-gray-600'
                          : 'bg-blue-50'
                    }`}>
                      {item.icon}
                    </div>
                    <span className={item.isPending ? 'font-medium text-red-600 dark:text-red-400' : ''}>
                      {item.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-6 p-4 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-blue-50'
        }`}>
        <p className="text-sm">
          <span className="font-semibold">Pro Tip:</span> Press Alt+F9 to quickly access Reports, or use F5 to refresh the current report.
        </p>
      </div>
    </div>
  );
};

export default ReportsIndex;
