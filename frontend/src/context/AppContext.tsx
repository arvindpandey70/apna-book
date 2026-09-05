// import React, { createContext, useContext, useState } from 'react';
// import type { ReactNode } from 'react';
// import type { CompanyInfo, Ledger, LedgerGroup, VoucherEntry, StockItem, UnitOfMeasurement } from '../types';
// import { defaultLedgerGroups, defaultLedgers } from '../data/defaultData';

// type ThemeMode = 'light' | 'dark';

// interface AppContextProps {
//   theme: ThemeMode;
//   toggleTheme: () => void;
//   companyInfo: CompanyInfo | null;
//   setCompanyInfo: (info: CompanyInfo) => void;
//   ledgerGroups: LedgerGroup[];
//   ledgers: Ledger[];
//   vouchers: VoucherEntry[];
//   stockItems: StockItem[];
//   units: UnitOfMeasurement[];
//   addLedgerGroup: (group: LedgerGroup) => void;
//   addLedger: (ledger: Ledger) => void;
//   addVoucher: (voucher: VoucherEntry) => void;
//   addStockItem: (item: StockItem) => void;
//   addUnit: (unit: UnitOfMeasurement) => void;
// }

// const AppContext = createContext<AppContextProps | undefined>(undefined);

// export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
//   const [theme, setTheme] = useState<ThemeMode>('light');
//   const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
//   const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>(defaultLedgerGroups);
//   const [ledgers, setLedgers] = useState<Ledger[]>(defaultLedgers);
//   const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
//   const [stockItems, setStockItems] = useState<StockItem[]>([]);
//   const [units, setUnits] = useState<UnitOfMeasurement[]>([
//     { id: '1', name: 'Number', symbol: 'Nos' },
//     { id: '2', name: 'Kilogram', symbol: 'Kg' },
//     { id: '3', name: 'Meter', symbol: 'Mtr' }
//   ]);

//   const toggleTheme = () => {
//     setTheme(prev => prev === 'light' ? 'dark' : 'light');
//   };

//   const addLedgerGroup = (group: LedgerGroup) => {
//     setLedgerGroups(prev => [...prev, group]);
//   };

//   const addLedger = (ledger: Ledger) => {
//     setLedgers(prev => [...prev, ledger]);
//   };

//   const addVoucher = (voucher: VoucherEntry) => {
//     setVouchers(prev => [...prev, voucher]);
//   };

//   const addStockItem = (item: StockItem) => {
//     setStockItems(prev => [...prev, item]);
//   };

//   const addUnit = (unit: UnitOfMeasurement) => {
//     setUnits(prev => [...prev, unit]);
//   };

//   return (
//     <AppContext.Provider value={{
//       theme,
//       toggleTheme,
//       companyInfo,
//       setCompanyInfo,
//       ledgerGroups,
//       ledgers,
//       vouchers,
//       stockItems,
//       units,
//       addLedgerGroup,
//       addLedger,
//       addVoucher,
//       addStockItem,
//       addUnit
//     }}>
//       {children}
//     </AppContext.Provider>
//   );
// };

// export const useAppContext = () => {
//   const context = useContext(AppContext);
//   if (context === undefined) {
//     throw new Error('useAppContext must be used within an AppProvider');
//   }
//   return context;
// };




// import React, { createContext, useContext, useState } from 'react';
// import type { ReactNode } from 'react';
// import type { CompanyInfo, Ledger, LedgerGroup, VoucherEntry, StockItem, UnitOfMeasurement, Godown } from '../types';
// import { defaultLedgerGroups, defaultLedgers } from '../data/defaultData';

// type ThemeMode = 'light' | 'dark';

// interface AppContextProps {
//   theme: ThemeMode;
//   toggleTheme: () => void;
//   companyInfo: CompanyInfo | null;
//   setCompanyInfo: (info: CompanyInfo) => void;
//   ledgerGroups: LedgerGroup[];
//   ledgers: Ledger[];
//   vouchers: VoucherEntry[];
//   stockItems: StockItem[];
//   units: UnitOfMeasurement[];
//   godowns: Godown[];
//   addLedgerGroup: (group: LedgerGroup) => void;
//   addLedger: (ledger: Ledger) => void;
//   addVoucher: (voucher: VoucherEntry) => void;
//   addStockItem: (item: StockItem) => void;
//   addUnit: (unit: UnitOfMeasurement) => void;
//   addGodown: (godown: Godown) => void;
//   updateStockItem: (id: string, updates: Partial<StockItem>) => void;
// }

// const AppContext = createContext<AppContextProps | undefined>(undefined);

// export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
//   const [theme, setTheme] = useState<ThemeMode>('light');
//   const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
//   const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>(defaultLedgerGroups);
//   const [ledgers, setLedgers] = useState<Ledger[]>(defaultLedgers);
//   const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
//   const [stockItems, setStockItems] = useState<StockItem[]>([]);
//   const [units, setUnits] = useState<UnitOfMeasurement[]>([
//     { id: '1', name: 'Number', symbol: 'Nos' },
//     { id: '2', name: 'Kilogram', symbol: 'Kg' },
//     { id: '3', name: 'Meter', symbol: 'Mtr' }
//   ]);
//   const [godowns, setGodowns] = useState<Godown[]>([
//     { id: 'g1', name: 'Main Godown' },
//     { id: 'g2', name: 'Secondary Godown' }
//   ]);

//   const toggleTheme = () => {
//     setTheme(prev => prev === 'light' ? 'dark' : 'light');
//   };

//   const addLedgerGroup = (group: LedgerGroup) => {
//     setLedgerGroups(prev => [...prev, group]);
//   };

//   const addLedger = (ledger: Ledger) => {
//     setLedgers(prev => [...prev, ledger]);
//   };

//   const addVoucher = (voucher: VoucherEntry) => {
//     setVouchers(prev => [...prev, voucher]);
//   };

//   const addStockItem = (item: StockItem) => {
//     setStockItems(prev => [...prev, item]);
//   };

//   const addUnit = (unit: UnitOfMeasurement) => {
//     setUnits(prev => [...prev, unit]);
//   };

//   const addGodown = (godown: Godown) => {
//     setGodowns(prev => [...prev, godown]);
//   };

//   const updateStockItem = (id: string, updates: Partial<StockItem>) => {
//     setStockItems(prev =>
//       prev.map(item => (item.id === id ? { ...item, ...updates } : item))
//     );
//   };

//   return (
//     <AppContext.Provider value={{
//       theme,
//       toggleTheme,
//       companyInfo,
//       setCompanyInfo,
//       ledgerGroups,
//       ledgers,
//       vouchers,
//       stockItems,
//       units,
//       godowns,
//       addLedgerGroup,
//       addLedger,
//       addVoucher,
//       addStockItem,
//       addUnit,
//       addGodown,
//       updateStockItem
//     }}>
//       {children}
//     </AppContext.Provider>
//   );
// };

// export const useAppContext = () => {
//   const context = useContext(AppContext);
//   if (context === undefined) {
//     throw new Error('useAppContext must be used within an AppProvider');
//   }
//   return context;
// };





// import React, { createContext, useContext, useState } from 'react';
// import type { ReactNode } from 'react';
// import type { CompanyInfo, Ledger, LedgerGroup, VoucherEntry, StockItem, UnitOfMeasurement, Godown } from '../types';
// import { defaultLedgerGroups, defaultLedgers } from '../data/defaultData';

// type ThemeMode = 'light' | 'dark';

// interface AppContextProps {
//   theme: ThemeMode;
//   toggleTheme: () => void;
//   companyInfo: CompanyInfo | null;
//   setCompanyInfo: (info: CompanyInfo) => void;
//   ledgerGroups: LedgerGroup[];
//   ledgers: Ledger[];
//   vouchers: VoucherEntry[];
//   stockItems: StockItem[];
//   units: UnitOfMeasurement[];
//   godowns: Godown[];
//   addLedgerGroup: (group: LedgerGroup) => void;
//   addLedger: (ledger: Ledger) => void;
//   addVoucher: (voucher: VoucherEntry) => void;
//   addStockItem: (item: StockItem) => void;
//   addUnit: (unit: UnitOfMeasurement) => void;
//   addGodown: (godown: Godown) => void;
//   updateStockItem: (id: string, updates: Partial<StockItem>) => void;
// }

// const AppContext = createContext<AppContextProps | undefined>(undefined);

// export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
//   const [theme, setTheme] = useState<ThemeMode>('light');
//   const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
//   const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>(defaultLedgerGroups);
//   const [ledgers, setLedgers] = useState<Ledger[]>(defaultLedgers);
//   const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
//   const [stockItems, setStockItems] = useState<StockItem[]>([]);
//   const [units, setUnits] = useState<UnitOfMeasurement[]>([
//     { id: '1', name: 'Number', symbol: 'Nos' },
//     { id: '2', name: 'Kilogram', symbol: 'Kg' },
//     { id: '3', name: 'Meter', symbol: 'Mtr' }
//   ]);
//   const [godowns, setGodowns] = useState<Godown[]>([
//     { id: 'g1', name: 'Main Godown' },
//     { id: 'g2', name: 'Secondary Godown' }
//   ]);

//   const toggleTheme = () => {
//     setTheme(prev => prev === 'light' ? 'dark' : 'light');
//   };

//   const addLedgerGroup = (group: LedgerGroup) => {
//     setLedgerGroups(prev => [...prev, group]);
//   };

//   const addLedger = (ledger: Ledger) => {
//     setLedgers(prev => [...prev, ledger]);
//   };

//   const addVoucher = (voucher: VoucherEntry) => {
//     setVouchers(prev => [...prev, voucher]);
//   };

//   const addStockItem = (item: StockItem) => {
//     setStockItems(prev => [...prev, item]);
//   };

//   const addUnit = (unit: UnitOfMeasurement) => {
//     setUnits(prev => [...prev, unit]);
//   };

//   const addGodown = (godown: Godown) => {
//     setGodowns(prev => [...prev, godown]);
//   };

//   const updateStockItem = (id: string, updates: Partial<StockItem>) => {
//     setStockItems(prev =>
//       prev.map(item => (item.id === id ? { ...item, ...updates } : item))
//     );
//   };

//   return (
//     <AppContext.Provider value={{
//       theme,
//       toggleTheme,
//       companyInfo,
//       setCompanyInfo,
//       ledgerGroups,
//       ledgers,
//       vouchers,
//       stockItems,
//       units,
//       godowns,
//       addLedgerGroup,
//       addLedger,
//       addVoucher,
//       addStockItem,
//       addUnit,
//       addGodown,
//       updateStockItem
//     }}>
//       {children}
//     </AppContext.Provider>
//   );
// };

// export const useAppContext = () => {
//   const context = useContext(AppContext);
//   if (context === undefined) {
//     throw new Error('useAppContext must be used within an AppProvider');
//   }
//   return context;
// }




import React, { createContext, useContext, useState, useEffect } from 'react';
import type { CompanyInfo, Ledger, LedgerGroup, VoucherEntry, StockItem, UnitOfMeasurement, Godown, StockGroup, GstClassification, CapitalGain, TDSEntry } from '../types';
import { defaultLedgerGroups, defaultLedgers } from '../data/defaultData';
import { useCompany } from './CompanyContext';
import { allSystemGroups } from '../constants/ledgerGroups';
import type { ReactNode } from 'react';

const systemMapped: LedgerGroup[] = allSystemGroups.map(g => ({
  id: g.id as any,
  name: g.name,
  parent: g.parent as any,
  type: (g.nature?.toLowerCase().replace(' ', '-') || 'current-assets') as any,
  behavesLikeSubLedger: false,
  nettBalancesForReporting: true,
  usedForCalculation: false
}));

const initialLedgerGroups = [...systemMapped, ...defaultLedgerGroups];

type ThemeMode = 'light' | 'dark';

interface AppContextProps {
  theme: ThemeMode;
  toggleTheme: () => void;
  companyInfo: CompanyInfo | null;
  setCompanyInfo: (info: CompanyInfo) => void;
  ledgerGroups: LedgerGroup[];
  ledgers: Ledger[];
  vouchers: VoucherEntry[];
  stockItems: StockItem[];
  stockGroups: StockGroup[];
  gstClassifications: GstClassification[];
  units: UnitOfMeasurement[];
  godowns: Godown[];
  capitalGains: CapitalGain[];
  tdsEntries: TDSEntry[];
  addLedgerGroup: (group: LedgerGroup) => void;
  addLedger: (ledger: Ledger) => void;
  addVoucher: (voucher: VoucherEntry) => void;
  updateVoucher: (id: string, updates: Partial<VoucherEntry>) => void;
  addStockItem: (item: Omit<StockItem, 'id'>) => void;
  addStockGroup: (group: StockGroup) => void;
  addGstClassification: (classification: GstClassification) => void;
  addUnit: (unit: UnitOfMeasurement) => void;
  addGodown: (godown: Godown) => void;
  updateStockItem: (id: string, updates: Partial<StockItem>) => void;
  addCapitalGain: (gain: CapitalGain) => void;
  updateCapitalGain: (gain: CapitalGain) => void;
  deleteCapitalGain: (id: string) => void;
  addTDSEntry: (entry: TDSEntry) => void;
  updateTDSEntry: (entry: TDSEntry) => void;
  deleteTDSEntry: (id: string) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

// Internal component that uses CompanyContext
// This must be rendered inside CompanyProvider
const AppProviderInner: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('app_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [theme]);

  const { companyInfo: contextCompanyInfo } = useCompany();
  const [localCompanyInfo, setLocalCompanyInfo] = useState<CompanyInfo | null>(null);

  // Sync with CompanyContext - companyInfo from context takes precedence
  useEffect(() => {
    if (contextCompanyInfo) {
      setLocalCompanyInfo(contextCompanyInfo);
    } else {
      setLocalCompanyInfo(null);
    }
  }, [contextCompanyInfo]);

  // Use context companyInfo if available, otherwise use local state
  const companyInfo = contextCompanyInfo || localCompanyInfo;

  const setCompanyInfo = (info: CompanyInfo) => {
    setLocalCompanyInfo(info);
    // Note: For proper company switching, use useCompany().switchCompany()
  };
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>(initialLedgerGroups);
  const [ledgers, setLedgers] = useState<Ledger[]>(defaultLedgers);
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([
    {
      id: 'v1',
      date: new Date().toISOString().split('T')[0],
      type: 'sales',
      number: 'S001',
      narration: 'Sales to customer A',
      mode: 'item-invoice',
      partyId: '15', // PQR Enterprises
      salesLedgerId: '11', // Sales Account
      entries: [
        // Item entries
        {
          id: 'e1',
          itemId: 'i1', // Item A (Electronics)
          quantity: 2,
          rate: 5000,
          amount: 10000,
          type: 'debit',
          cgstRate: 9,
          sgstRate: 9,
          igstRate: 0,
          godownId: 'g1',
          hsnCode: '8471',
          narration: 'Sales of Item A'
        },
        {
          id: 'e2',
          itemId: 'i2', // Item B (Clothing)
          quantity: 1,
          rate: 2000,
          amount: 2000,
          type: 'debit',
          cgstRate: 6,
          sgstRate: 6,
          igstRate: 0,
          godownId: 'g1',
          hsnCode: '6201',
          narration: 'Sales of Item B'
        },
        // Accounting entries
        {
          id: 'e3',
          ledgerId: '15', // PQR Enterprises (Sundry Debtors)
          amount: 14280, // 12000 + 1080 CGST + 1200 SGST
          type: 'debit',
          narration: 'Total invoice amount including GST'
        },
        {
          id: 'e4',
          ledgerId: '11', // Sales Account
          amount: 12000,
          type: 'credit',
          narration: 'Total sales amount'
        },
        {
          id: 'e5',
          ledgerId: '23', // Output CGST (assuming exists)
          amount: 1080, // (10000 * 9% + 2000 * 6%)
          type: 'credit',
          narration: 'CGST on sales'
        },
        {
          id: 'e6',
          ledgerId: '24', // Output SGST (assuming exists)
          amount: 1200, // (10000 * 9% + 2000 * 6%)
          type: 'credit',
          narration: 'SGST on sales'
        }
      ]
    },
    {
      id: 'v2',
      date: new Date().toISOString().split('T')[0],
      type: 'purchase',
      number: 'P001',
      narration: 'Purchase from supplier B',
      mode: 'item-invoice',
      partyId: '13', // ABC Suppliers
      entries: [
        // Item entries
        {
          id: 'e7',
          itemId: 'i1', // Item A (Electronics)
          quantity: 5,
          rate: 4000,
          amount: 20000,
          type: 'debit',
          cgstRate: 9,
          sgstRate: 9,
          igstRate: 0,
          godownId: 'g1',
          narration: 'Purchase of Item A'
        },
        // Accounting entries
        {
          id: 'e8',
          ledgerId: '12', // Purchase Account
          amount: 20000,
          type: 'debit',
          narration: 'Purchase amount'
        },
        {
          id: 'e9',
          ledgerId: '25', // Input CGST (assuming exists)
          amount: 1800, // 20000 * 9%
          type: 'debit',
          narration: 'CGST on purchase'
        },
        {
          id: 'e10',
          ledgerId: '26', // Input SGST (assuming exists)
          amount: 1800, // 20000 * 9%
          type: 'debit',
          narration: 'SGST on purchase'
        },
        {
          id: 'e11',
          ledgerId: '13', // ABC Suppliers (Sundry Creditors)
          amount: 23600, // 20000 + 1800 + 1800
          type: 'credit',
          narration: 'Total purchase amount including GST'
        }
      ]
    },
    {
      id: 'v3',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
      type: 'payment',
      number: 'PAY001',
      narration: 'Payment to supplier',
      mode: 'double-entry',
      entries: [
        {
          id: 'e12',
          ledgerId: '13', // ABC Suppliers (Sundry Creditors)
          amount: 23600,
          type: 'debit',
          narration: 'Payment to ABC Suppliers'
        },
        {
          id: 'e13',
          ledgerId: '5', // State Bank of India - Current A/c
          amount: 23600,
          type: 'credit',
          bankName: 'State Bank of India',
          chequeNumber: 'CHQ001',
          narration: 'Payment by cheque'
        }
      ]
    },
    {
      id: 'v4',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
      type: 'receipt',
      number: 'REC001',
      narration: 'Receipt from customer',
      mode: 'double-entry',
      entries: [
        {
          id: 'e14',
          ledgerId: '5', // State Bank of India - Current A/c
          amount: 14280,
          type: 'debit',
          bankName: 'State Bank of India',
          narration: 'Receipt by bank transfer'
        },
        {
          id: 'e15',
          ledgerId: '15', // PQR Enterprises (Sundry Debtors)
          amount: 14280,
          type: 'credit',
          narration: 'Receipt from PQR Enterprises'
        }
      ]
    },
    {
      id: 'v5',
      date: new Date(Date.now() - 172800000).toISOString().split('T')[0], // 2 days ago
      type: 'stock-journal',
      number: 'SJ001',
      narration: 'Stock transfer between godowns',
      mode: 'transfer',
      entries: [
        {
          id: 'e16',
          itemId: 'i1', // Item A
          quantity: 2,
          rate: 4000,
          amount: 8000,
          type: 'source',
          godownId: 'g1', // Main Godown
          narration: 'Transfer from Main Godown'
        },
        {
          id: 'e17',
          itemId: 'i1', // Item A
          quantity: 2,
          rate: 4000,
          amount: 8000,
          type: 'destination',
          godownId: 'g2', // Secondary Godown
          narration: 'Transfer to Secondary Godown'
        }
      ]
    }
  ]);
  const [stockItems, setStockItems] = useState<StockItem[]>([
    { id: 'i1', name: 'Item A', unit: '1', stockGroupId: 'sg1', openingBalance: 100, openingValue: 1000, gstRate: 18, hsnCode: '8517' },
    { id: 'i2', name: 'Item B', unit: '2', stockGroupId: 'sg2', openingBalance: 50, openingValue: 500, gstRate: 12, hsnCode: '6204' }
  ]);
  const [stockGroups, setStockGroups] = useState<StockGroup[]>([
    { id: 'sg1', name: 'Electronics', hsnCode: '8517', gstRate: 18 },
    { id: 'sg2', name: 'Clothing', hsnCode: '6204', gstRate: 12 }
  ]);
  const [gstClassifications, setGstClassifications] = useState<GstClassification[]>([
    { id: 'gc1', name: 'Electronics - 18%', hsnCode: '8517', gstRate: 18 },
    { id: 'gc2', name: 'Clothing - 12%', hsnCode: '6204', gstRate: 12 },
    { id: 'gc3', name: 'Food - 5%', hsnCode: '2106', gstRate: 5 }
  ]);
  const [units, setUnits] = useState<UnitOfMeasurement[]>([
    {
      id: '1', name: 'Number', symbol: 'Nos',
      type: 'Simple'
    },
    {
      id: '2', name: 'Kilogram', symbol: 'Kg',
      type: 'Simple'
    },
    {
      id: '3', name: 'Meter', symbol: 'Mtr',
      type: 'Simple'
    }
  ]);
  const [godowns, setGodowns] = useState<Godown[]>([
    { id: 'g1', name: 'Main Godown' },
    { id: 'g2', name: 'Secondary Godown' }
  ]);
  const [capitalGains, setCapitalGains] = useState<CapitalGain[]>([]);
  const [tdsEntries, setTdsEntries] = useState<TDSEntry[]>([]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const addLedgerGroup = (group: LedgerGroup) => {
    setLedgerGroups(prev => [...prev, group]);
  };

  const addLedger = (ledger: Ledger) => {
    setLedgers(prev => [...prev, ledger]);
  };

  const addVoucher = (voucher: VoucherEntry) => {
    setVouchers(prev => [...prev, voucher]);
  };

  const updateVoucher = (id: string, updates: Partial<VoucherEntry>) => {
    setVouchers(prev =>
      prev.map(voucher => (voucher.id === id ? { ...voucher, ...updates } : voucher))
    );
  };

  const addStockItem = (item: Omit<StockItem, 'id'>) => {
    setStockItems(prev => [...prev, { ...item, id: Math.random().toString(36).substring(2, 9) }]);
  };

  const addStockGroup = (group: StockGroup) => {
    setStockGroups(prev => [...prev, group]);
  };

  const addGstClassification = (classification: GstClassification) => {
    setGstClassifications(prev => [...prev, classification]);
  };

  const addUnit = (unit: UnitOfMeasurement) => {
    setUnits(prev => [...prev, unit]);
  };

  const addGodown = (godown: Godown) => {
    setGodowns(prev => [...prev, godown]);
  };

  const updateStockItem = (id: string, updates: Partial<StockItem>) => {
    setStockItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Capital Gains methods
  const addCapitalGain = (gain: CapitalGain) => {
    setCapitalGains(prev => [...prev, gain]);
  };

  const updateCapitalGain = (gain: CapitalGain) => {
    setCapitalGains(prev =>
      prev.map(g => (g.id === gain.id ? gain : g))
    );
  };

  const deleteCapitalGain = (id: string) => {
    setCapitalGains(prev => prev.filter(g => g.id !== id));
  };

  // TDS methods
  const addTDSEntry = (entry: TDSEntry) => {
    setTdsEntries(prev => [...prev, entry]);
  };

  const updateTDSEntry = (entry: TDSEntry) => {
    setTdsEntries(prev =>
      prev.map(e => (e.id === entry.id ? entry : e))
    );
  };

  const deleteTDSEntry = (id: string) => {
    setTdsEntries(prev => prev.filter(e => e.id !== id));
  };

  return (
    <AppContext.Provider value={{
      theme,
      toggleTheme,
      companyInfo,
      setCompanyInfo,
      ledgerGroups,
      ledgers,
      vouchers,
      stockItems,
      stockGroups,
      gstClassifications,
      units,
      godowns,
      capitalGains,
      tdsEntries,
      addLedgerGroup,
      addLedger,
      addVoucher,
      updateVoucher,
      addStockItem,
      addStockGroup,
      addGstClassification,
      addUnit,
      addGodown,
      updateStockItem,
      addCapitalGain,
      updateCapitalGain,
      deleteCapitalGain,
      addTDSEntry,
      updateTDSEntry,
      deleteTDSEntry
    }}>
      {children}
    </AppContext.Provider>
  );
};

// Wrapper that ensures CompanyProvider is available
// This must be used inside CompanyProvider (see App.tsx)
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <AppProviderInner>{children}</AppProviderInner>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};