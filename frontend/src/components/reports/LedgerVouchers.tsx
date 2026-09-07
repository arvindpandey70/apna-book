import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';

interface LedgerVoucherEntry {
  id: number;
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
}

const LedgerVouchers: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const { ledgerName } = useParams<{ ledgerName: string }>();
  const location = useLocation();
  const { period } = location.state || {};

  // Mock ledger voucher data
  const voucherData: LedgerVoucherEntry[] = [
    {
      id: 1,
      date: '2025-04-01',
      particulars: 'Cash',
      vchType: 'Receipt',
      vchNo: '1',
      debit: 0,
      credit: 300000
    },
    {
      id: 2,
      date: '2025-04-15',
      particulars: 'Sales Account',
      vchType: 'Sales',
      vchNo: '15',
      debit: 150000,
      credit: 0
    },
    {
      id: 3,
      date: '2025-04-20',
      particulars: 'Bank Transfer',
      vchType: 'Payment',
      vchNo: '8',
      debit: 0,
      credit: 75000
    },
    {
      id: 4,
      date: '2025-04-25',
      particulars: 'Interest Income',
      vchType: 'Journal',
      vchNo: '12',
      debit: 0,
      credit: 5000
    }
  ];

  const formatCurrency = (amount: number) => {
    if (amount === 0) return '';
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year}`;
  };

  const handleVoucherClick = (voucher: LedgerVoucherEntry) => {
    navigate(`/app/vouchers/view/${voucher.vchType.toLowerCase()}/${voucher.vchNo}`, {
      state: {
        voucherData: voucher,
        ledgerName: ledgerName,
        period: period
      }
    });
  };

  const totalDebit = voucherData.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = voucherData.reduce((sum, entry) => sum + entry.credit, 0);

  return (
    <div className='pt-[56px] px-4'>
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          type="button"
          title='Back to Group Cash Flow'
          onClick={() => navigate(-1)}
          className={`mr-4 p-2 rounded-full ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Ledger Vouchers
          </h1>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Company: Abd Pvt Ltd
          </p>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Ledger: {decodeURIComponent(ledgerName || '')}
          </p>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Period: {period || '1-Apr-25 to 30-Apr-25'}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            title='Print Report'
            type='button'
            className={`p-2 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
          >
            <Printer size={18} />
          </button>
          <button
            title='Download Report'
            type='button'
            className={`p-2 rounded-md ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              }`}
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className={`rounded-xl border ${theme === 'dark'
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200'
        }`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
              }`}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                  Date
                </th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                  Particulars
                </th>
                <th className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                  Vch Type
                </th>
                <th className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                  Vch No
                </th>
                <th className={`px-4 py-3 text-right text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                  Debit
                </th>
                <th className={`px-4 py-3 text-right text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'
                  }`}>
                  Credit
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'
              }`}>
              {voucherData.map((voucher) => (
                <tr
                  key={voucher.id}
                  onClick={() => handleVoucherClick(voucher)}
                  className={`cursor-pointer transition-all duration-150 ${theme === 'dark'
                      ? 'hover:bg-blue-600 hover:text-white'
                      : 'hover:bg-blue-600 hover:text-white font-bold'
                    }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {formatDate(voucher.date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                    {voucher.particulars}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {voucher.vchType}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-medium">
                    {voucher.vchNo}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    {voucher.debit > 0 && (
                      <span className={theme === 'dark' ? 'text-green-400' : 'text-green-600'}>
                        {formatCurrency(voucher.debit)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    {voucher.credit > 0 && (
                      <span className={theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}>
                        {formatCurrency(voucher.credit)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Total Row */}
              <tr className={`font-bold border-t-2 ${theme === 'dark'
                  ? 'border-gray-600 bg-gray-700 text-white'
                  : 'border-gray-300 bg-gray-50 text-gray-900'
                }`}>
                <td className="px-4 py-3 text-sm" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  {totalDebit > 0 && (
                    <span className={theme === 'dark' ? 'text-green-400' : 'text-green-600'}>
                      {formatCurrency(totalDebit)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  {totalCredit > 0 && (
                    <span className={theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}>
                      {formatCurrency(totalCredit)}
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LedgerVouchers;
