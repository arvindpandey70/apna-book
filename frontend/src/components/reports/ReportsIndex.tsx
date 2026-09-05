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
  BookCopy
} from 'lucide-react';

const ReportsIndex: React.FC = () => {
  const { theme } = useAppContext(); // 👈 get role here
  const navigate = useNavigate();
  // Read role from localStorage (always lowercase for safety)
  const role: string | null = localStorage.getItem("supplier")?.toLowerCase() || null;
  const reportCategories = [
    {
      title: 'Accounting Reports',
      items: [
        { icon: <BookOpen size={20} />, name: 'Day Book', path: '/app/reports/day-book' },
        { icon: <FileText size={20} />, name: 'Ledger', path: '/app/reports/ledger' },
        { icon: <FileText size={20} />, name: 'Group Summary', path: '/app/reports/group-summary' },
        { icon: <BarChart2 size={20} />, name: 'Trial Balance', path: '/app/reports/trial-balance' },
        { icon: <TrendingUp size={20} />, name: 'Profit & Loss', path: '/app/reports/profit-loss' },
        { icon: <DollarSign size={20} />, name: 'Balance Sheet', path: '/app/reports/balance-sheet' },
        { icon: <PieChart size={20} />, name: 'Cash Flow', path: '/app/reports/cash-flow' },
        { icon: <PieChart size={20} />, name: 'Fund Flow', path: '/app/reports/fund-flow' },
        { icon: <AlertTriangle size={20} />, name: 'Outstanding', path: '/app/reports/outstanding' },
        { icon: <BookCopy size={20} />, name: 'Consolidation', path: '/app/reports/consolidation' },
        { icon: <FileText size={20} />, name: 'Ledger Correction', path: '/app/reports/ledger-caraction' }
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
        { icon: <FileText size={20} />, name: 'Attribute summary', path: '/app/reports/attribute-summary' }
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
        { icon: <BookOpen size={20} />, name: 'All HSN', path: '/app/reports/allhsn' }
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
        { icon: <BookOpen size={20} />, name: 'All HSN', path: '/app/reports/allhsnpurchase' }
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {category.items
                .filter(item =>
                  // 🚫 hide Consolidation for CA + CA Employee
                  !((role === 'ca' || role === 'ca_employee') && item.name === 'Consolidation')
                )
                .map((item, itemIndex) => (
                  <button
                    key={itemIndex}
                    onClick={() => navigate(item.path)}
                    className={`p-4 rounded-lg flex flex-col items-center text-center transition-colors ${theme === 'dark'
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                  >
                    <div className={`p-2 rounded-full mb-2 ${theme === 'dark'
                        ? 'bg-gray-600'
                        : 'bg-blue-50'
                      }`}>
                      {item.icon}
                    </div>
                    <span>{item.name}</span>
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
