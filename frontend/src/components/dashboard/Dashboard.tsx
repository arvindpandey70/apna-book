import React, { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import {
  Book,
  DollarSign,
  ShoppingBag,
  Activity,
  PlusCircle,
  Lock as LucideLock,
  Building,
  Calendar,
  Lock,
  ShieldCheck,
  TrendingUp,
  CreditCard,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  FileText,
  Building2,
  Sparkles,
  ArrowUpRight,
  UserCheck,
  Plus
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import AddCaEmployeeForm from "./caemployee";
import AssignCompaniesModal from "./AssignCompaniesModal";
import PermissionsModal from "./PermissionsModal";
import DashboardCaEmployee from "./DashboardCaEmployee";
import { useAuth } from "../../home/context/AuthContext";
import { useFinancialYear, getAvailableFinYears, filterByFinancialYear } from "../../hooks/useFinancialYear";

const Dashboard: React.FC = () => {
  const isSameCompany = (a: any, b: any) => {
    if (!a || !b) return false;
    return String(a.id) === String(b.id);
  };

  const { theme, setCompanyInfo } = useAppContext();
  const { switchCompany, activeCompanyId, setCompanies: setContextCompanies } = useCompany();
  const { checkPermission, user } = useAuth();
  const navigate = useNavigate();
  const [companyInfo, setCompanyInfoState] = useState<any>(null);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLimit, setUserLimit] = useState(1);
  const [allCompanies, setAllCompanies] = useState<AllCompanies[]>([]);
  const [caAllCompanies, setCaAllCompanies] = useState<AllCompanies[]>([]);
  const [selectedCaCompany, setSelectedCaCompany] = useState(() => {
    const storedCompanyId = localStorage.getItem("company_id");
    return storedCompanyId || "";
  });
  const [caEmployees, setCaEmployees] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const caId = localStorage.getItem("user_id") || localStorage.getItem("employee_id");
  const suppl: string | null = localStorage.getItem("supplier"); // employee | ca | ca_employee
  const userType = localStorage.getItem("userType");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>("");
  const [chartMetric, setChartMetric] = useState<'sales_purchase' | 'tax'>('sales_purchase');

  const { selectedFinYear, setSelectedFinYear } = useFinancialYear();
  const availableFinYears = getAvailableFinYears(companyInfo?.booksBeginningYear || companyInfo?.books_beginning_year || 2020);

  const openPermissionsModal = (employeeId: number, employeeName: string) => {
    setSelectedEmployeeId(employeeId);
    setSelectedEmployeeName(employeeName);
    setShowPermissionsModal(true);
  };

  const closePermissionsModal = () => {
    setSelectedEmployeeId(null);
    setSelectedEmployeeName("");
    setShowPermissionsModal(false);
  };

  type Company = {
    id: string | number;
    name: string;
    address?: string;
    gstNumber?: string;
    gst_number?: string;
    panNumber?: string;
    pan_number?: string;
    taxType?: string;
  };

  type Employee = {
    companyName: ReactNode;
    name: string;
    adhar: string;
    phone: string;
  };
  type AllCompanies = {
    employee_id: ReactNode;
    pan_number: ReactNode;
    id: number;
    name: string;
    isLocked?: boolean | number;
  };
  const [companies, setCompanies] = useState<Company[]>([]);

  const [selectedCompany, setSelectedCompany] = useState(() => {
    const storedCompanyId = localStorage.getItem("company_id");
    return storedCompanyId || "";
  });

  const [employees, setEmployees] = useState<Employee[]>([
    {
      name: "Rahul Sharma",
      adhar: "1234-5678-9012",
      phone: "9876543210",
      companyName: undefined,
    },
    {
      name: "Priya Verma",
      adhar: "2234-5678-9912",
      phone: "9123456789",
      companyName: undefined,
    },
    {
      name: "Amit Singh",
      adhar: "3234-5678-8812",
      phone: "9988776655",
      companyName: undefined,
    },
  ]);

  const [newEmployee, setNewEmployee] = useState<Employee>({
    name: "",
    adhar: "",
    phone: "",
    companyName: undefined,
  });

  const [showModal, setShowModal] = useState(false);

  const handleCompanyUnlock = async (id: string) => {
    if (suppl === "employee") {
      await switchCompany(id);
      setSelectedCompany(id);
      localStorage.setItem("company_id", id);
      window.location.reload();
    } else {
      localStorage.setItem("company_id", id);
      setSelectedCaCompany(id);
      window.location.reload();
    }
  };

  const employeeId = localStorage.getItem("employee_id");

  const [realStats, setRealStats] = useState<any>({
    salesMonthly: 0,
    purchaseMonthly: 0,
    inputTaxMonthly: 0,
    outputTaxMonthly: 0
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem("token");
        const ownerType = localStorage.getItem("supplier");
        const restrictedId = localStorage.getItem("company_id");

        let ownerId =
          ownerType === "employee"
            ? localStorage.getItem("employee_id")
            : localStorage.getItem("user_id");

        let fetchOwnerType = ownerType;
        let fetchOwnerId = ownerId;

        if (userType === "ca_employee") {
          fetchOwnerType = "employee";
          fetchOwnerId = localStorage.getItem("employee_id");
        }

        let url = `${import.meta.env.VITE_API_URL}/api/dashboard-data?employee_id=${fetchOwnerId}&user_type=${userType}&user_id=${localStorage.getItem("user_id")}`;

        if (restrictedId) {
          url += `&company_id=${restrictedId}`;
        }

        if (selectedFinYear !== undefined) {
          url += `&financialYear=${selectedFinYear}`;
        }

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const data = await res.json();
        if (data.success) {
          setCompanyInfoState((prev: any) => {
            if (isSameCompany(prev, data.companyInfo)) {
              return prev;
            }
            return data.companyInfo;
          });
          setUserLimit(data.userLimit ?? 1);

          setCompanies(data.companies || []);
          setContextCompanies(data.companies || []);

          setLedgers(data.ledgers || []);
          setVouchers(data.vouchers || []);

          if (data.stats) {
            setRealStats(data.stats);
          }
        } else {
          console.error("Failed to load dashboard data");
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    if (employeeId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [employeeId, selectedFinYear]);

  useEffect(() => {
    const employeeId = localStorage.getItem("employee_id");
    const caEmployeeId = localStorage.getItem("user_id");

    if (!employeeId && userType !== "ca_employee" && userType !== "new_ca") return;

    if (userType === "ca_employee" && caEmployeeId) {
      fetch(
        `${import.meta.env.VITE_API_URL}/api/companies-by-ca-employee?ca_employee_id=${caEmployeeId}`
      )
        .then((res) => res.json())
        .then((data) => {
          const restrictedId = localStorage.getItem("company_id");
          let filteredAll = data.companies || [];
          if (restrictedId) {
            filteredAll = filteredAll.filter((c: any) => String(c.id) === String(restrictedId));
          }
          setAllCompanies(filteredAll);
        })
        .catch((err) => console.error("Error fetching CA employee companies:", err));
      return;
    }

    fetch(
      `${import.meta.env.VITE_API_URL}/api/companies-by-employee?employee_id=${employeeId}`
    )
      .then((res) => res.json())
      .then((data) => {
        const restrictedId = localStorage.getItem("company_id");
        let filteredAll = data.companies || [];
        if (userType === 'company_user' && restrictedId) {
          filteredAll = filteredAll.filter((c: any) => String(c.id) === String(restrictedId));
        }
        setAllCompanies(filteredAll);
      })
      .catch((err) => console.error("Error fetching companies:", err));
  }, []);

  useEffect(() => {
    const caId = localStorage.getItem("user_id");
    if (!caId) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/companies-by-ca?ca_id=${caId}`)
      .then((res) => res.json())
      .then((data) => setCaAllCompanies(data.companies || []))
      .catch((err) => console.error("Error fetching CA companies:", err));
  }, []);

  const handleCreateCompany = () => {
    navigate("/app/company");
  };

  useEffect(() => {
    if (!caId) return;
    fetch(
      `${import.meta.env.VITE_API_URL}/api/ca-employees-with-companies?ca_id=${caId}`
    )
      .then((res) => res.json())
      .then((data) => setCaEmployees(data.employees || []))
      .catch(console.error);
  }, [caId, showAddForm]);

  const openAssignModal = (employeeId: number, employeeName: string) => {
    setSelectedEmployeeId(employeeId);
    setSelectedEmployeeName(employeeName);
    setShowAssignModal(true);
  };

  const closeAssignModal = () => {
    setSelectedEmployeeId(null);
    setSelectedEmployeeName("");
    setShowAssignModal(false);
  };

  useEffect(() => {
    if (!companyInfo) return;

    const stored = localStorage.getItem("companyInfo");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.id === companyInfo.id) return;
    }

    localStorage.setItem("companyInfo", JSON.stringify(companyInfo));
    setCompanyInfo(companyInfo);
  }, [companyInfo]);

  const fetchEmployees = () => {
    fetch(
      `${import.meta.env.VITE_API_URL}/api/ca-employees-with-companies?ca_id=${caId}`
    )
      .then((res) => res.json())
      .then((data) => setCaEmployees(data.employees || []))
      .catch(console.error);
  };

  const filteredVouchers = filterByFinancialYear(vouchers, "date", selectedFinYear);

  const cashVal = Number(
    ledgers.find((l) => l.name === "Cash" || l.name?.toLowerCase().includes("cash"))?.openingBalance || 0
  );
  const bankVal = Number(
    ledgers.find((l) => l.name === "Bank Account" || l.name?.toLowerCase().includes("bank"))?.openingBalance || 0
  );

  const kpiStats = [
    {
      title: "Ledger Accounts",
      value: ledgers.length.toString(),
      subtext: "Configured master ledgers",
      badgeText: "Masters",
      badgeBg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50",
      icon: <Book className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
      bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/50",
      topBorder: "border-t-4 border-t-indigo-500",
      meterGradient: "bg-gradient-to-r from-indigo-500 to-indigo-600",
      meterPercent: Math.min(100, Math.max(20, ledgers.length * 2)),
      link: "/app/masters/ledger",
      linkText: "View Ledgers"
    },
    {
      title: "Total Vouchers",
      value: filteredVouchers.length.toString(),
      subtext: selectedFinYear ? `FY ${selectedFinYear} Entries` : "All recorded entries",
      badgeText: selectedFinYear ? `FY ${selectedFinYear}` : "Entries",
      badgeBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50",
      icon: <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
      bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50",
      topBorder: "border-t-4 border-t-emerald-500",
      meterGradient: "bg-gradient-to-r from-emerald-500 to-teal-500",
      meterPercent: Math.min(100, Math.max(15, filteredVouchers.length * 5)),
      link: "/app/vouchers",
      linkText: "View Vouchers"
    },
    {
      title: "Cash Balance",
      value: "₹ " + cashVal.toLocaleString(),
      subtext: "Liquid cash account",
      badgeText: "Liquid Cash",
      badgeBg: "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50",
      icon: <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
      bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50",
      topBorder: "border-t-4 border-t-amber-500",
      meterGradient: "bg-gradient-to-r from-amber-500 to-orange-500",
      meterPercent: cashVal > 0 ? 80 : 15,
      link: "/app/reports/day-book",
      linkText: "Cash Book"
    },
    {
      title: "Bank Balance",
      value: "₹ " + bankVal.toLocaleString(),
      subtext: "Primary bank account",
      badgeText: "Bank Account",
      badgeBg: "bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50",
      icon: <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
      bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-100 dark:border-purple-900/50",
      topBorder: "border-t-4 border-t-purple-500",
      meterGradient: "bg-gradient-to-r from-purple-500 to-indigo-500",
      meterPercent: bankVal > 0 ? 85 : 15,
      link: "/app/reports/day-book",
      linkText: "Bank Book"
    },
  ];

  const companyCount = companies.length;
  const canCreateCompany = companyCount < userLimit && (userType === "employee" || userType === "new_ca");

  const handleAddEmployee = () => {
    if (!newEmployee.name || !newEmployee.adhar || !newEmployee.phone) return;
    setEmployees((prev) => [...prev, newEmployee]);
    setNewEmployee({ name: "", adhar: "", phone: "", companyName: undefined });
    setShowModal(false);
  };

  const getMonthlyChartData = () => {
    const monthNames = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const monthMap: Record<string, { sales: number; purchase: number; inputTax: number; outputTax: number }> = {};
    monthNames.forEach(m => {
      monthMap[m] = { sales: 0, purchase: 0, inputTax: 0, outputTax: 0 };
    });

    if (Array.isArray(filteredVouchers) && filteredVouchers.length > 0) {
      filteredVouchers.forEach((v: any) => {
        if (!v.date) return;
        const vDate = new Date(v.date);
        if (isNaN(vDate.getTime())) return;
        
        const mIndex = vDate.getMonth();
        const fyMonthIndex = (mIndex + 9) % 12;
        const mName = monthNames[fyMonthIndex];
        
        const vType = String(v.type || v.voucher_type || '').toLowerCase();
        const amount = Number(v.amount || v.total_amount || 0);

        if (vType.includes('sales')) {
          monthMap[mName].sales += amount;
        } else if (vType.includes('purchase')) {
          monthMap[mName].purchase += amount;
        }
      });
    }

    const activeMonthName = "Sep";
    if (realStats.salesMonthly && monthMap[activeMonthName].sales === 0) {
      monthMap[activeMonthName].sales = Number(realStats.salesMonthly || 0);
    }
    if (realStats.purchaseMonthly && monthMap[activeMonthName].purchase === 0) {
      monthMap[activeMonthName].purchase = Number(realStats.purchaseMonthly || 0);
    }
    if (realStats.inputTaxMonthly) {
      monthMap[activeMonthName].inputTax = Number(realStats.inputTaxMonthly || 0);
    }
    if (realStats.outputTaxMonthly) {
      monthMap[activeMonthName].outputTax = Number(realStats.outputTaxMonthly || 0);
    }

    return monthNames.map(name => ({
      month: name,
      Sales: monthMap[name].sales,
      Purchase: monthMap[name].purchase,
      InputTax: monthMap[name].inputTax,
      OutputTax: monthMap[name].outputTax,
    }));
  };

  if (loading) {
    return (
      <div className="pt-8 px-4 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading dashboard context...</p>
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <div className="space-y-6 pb-8 max-w-7xl mx-auto mt-2 sm:mt-3">
      {suppl === "employee" || suppl === "ca_employee" ? (
        <>
          {/* Header & Quick Navigation Bar */}
          <div className={`p-6 rounded-2xl border shadow-xs transition-colors ${
            isDark ? "bg-slate-800/90 border-slate-700/80 text-slate-100" : "bg-white border-slate-200/80 text-slate-900"
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              
              {/* Title & Active Company Info */}
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                    Dashboard
                  </span>
                  {companyInfo && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                      <CheckCircle2 size={12} />
                      Active: <strong className="font-semibold">{companyInfo.name}</strong>
                    </span>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    ({companyCount} of {userLimit} companies allowed)
                  </span>
                </div>
                
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Overview & Financial Insights
                </h1>
              </div>

              {/* Controls & Quick Actions */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Financial Year Selector */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">FY:</label>
                  <select
                    value={selectedFinYear}
                    onChange={(e) => setSelectedFinYear(e.target.value)}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none transition-all cursor-pointer ${
                      isDark 
                        ? "bg-slate-700 border-slate-600 text-slate-100 focus:border-indigo-500" 
                        : "bg-slate-50 border-slate-300 text-slate-800 focus:border-indigo-500"
                    }`}
                  >
                    <option value="">All Years</option>
                    {availableFinYears.map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </select>
                </div>

                {/* Company Switcher if multiple companies exist */}
                {(userType === "employee" || userType === "new_ca") && allCompanies.length > 1 && (
                  <select
                    value={activeCompanyId || selectedCompany}
                    onChange={(e) => handleCompanyUnlock(e.target.value)}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none transition-all cursor-pointer max-w-[200px] truncate ${
                      isDark 
                        ? "bg-slate-700 border-slate-600 text-slate-100 focus:border-indigo-500" 
                        : "bg-slate-50 border-slate-300 text-slate-800 focus:border-indigo-500"
                    }`}
                  >
                    <option value="" disabled>Switch Company</option>
                    {allCompanies.map((c) => (
                      <option key={c.id} value={c.id.toString()}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Quick Actions Bar */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate('/app/vouchers/sales/create')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} />
                    Sales
                  </button>
                  <button
                    onClick={() => navigate('/app/vouchers/purchase/create')}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} />
                    Purchase
                  </button>
                  {userType !== "company_user" && canCreateCompany && (
                    <button
                      onClick={handleCreateCompany}
                      className="px-3.5 py-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-semibold transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <PlusCircle size={14} />
                      Create Company
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Subscription Banner */}
          {user?.trialDaysRemaining !== undefined && (() => {
            const isActive = user.trialDaysRemaining >= 0 && !user.isExpired;
            const isFreeTrial = user.isTrial;

            return (
              <div className={`p-4 sm:p-5 rounded-2xl border shadow-xs transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                isActive
                  ? isDark ? 'border-emerald-800/80 bg-emerald-950/30 text-emerald-200' : 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
                  : isDark ? 'border-rose-800/80 bg-rose-950/30 text-rose-200' : 'border-rose-200 bg-rose-50/80 text-rose-900'
              }`}>
                <div className="flex items-start gap-3.5">
                  <div className={`p-2.5 rounded-xl ${
                    isActive
                      ? isDark ? 'bg-emerald-900/60 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                      : isDark ? 'bg-rose-900/60 text-rose-300' : 'bg-rose-100 text-rose-700'
                  }`}>
                    <Calendar size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">
                        {isActive
                          ? (isFreeTrial ? 'Free Trial — Active' : 'Subscription — Active')
                          : (isFreeTrial ? 'Free Trial — Ended' : 'Subscription — Ended')}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        isActive
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}>
                        {isActive ? `${user.trialDaysRemaining} days remaining` : 'Action required'}
                      </span>
                    </div>
                    <p className="text-xs opacity-90 mt-0.5">
                      {isActive
                        ? `Your ${isFreeTrial ? 'free trial' : 'subscription'} is active. Enjoy full access to all features.`
                        : `Your ${isFreeTrial ? 'trial period' : 'subscription'} has ended. Please renew to continue seamless access.`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/app/pricing')}
                  className="self-stretch md:self-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  View Plans / Renew
                </button>
              </div>
            );
          })()}
                 {/* Financial Performance Line Graph & Overview Cards */}
          {checkPermission('reports') && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-bold tracking-tight">
                    Financial Performance & Trend Line
                  </h2>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {selectedFinYear ? `FY ${selectedFinYear}` : "All Time"}
                </span>
              </div>

              {/* Interactive Line / Area Chart Box */}
              <div className={`p-6 rounded-2xl border shadow-xs transition-colors space-y-4 ${
                isDark ? "bg-slate-800/90 border-slate-700/80 text-slate-100" : "bg-white border-slate-200/80 text-slate-900"
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700/80">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <h3 className="text-base font-extrabold tracking-tight">
                        Cashflow & Tax Analytics Graph
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Visual financial trajectory across accounting months
                    </p>
                  </div>

                  {/* Chart Metric Selector */}
                  <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-700/60 text-xs font-semibold">
                    <button
                      onClick={() => setChartMetric('sales_purchase')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        chartMetric === 'sales_purchase'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      Sales vs Purchase
                    </button>
                    <button
                      onClick={() => setChartMetric('tax')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        chartMetric === 'tax'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      Tax Breakdown
                    </button>
                  </div>
                </div>

                {/* Recharts Area / Line Chart */}
                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={getMonthlyChartData()} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorInputTax" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorOutputTax" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} />
                      <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          borderColor: isDark ? '#334155' : '#e2e8f0',
                          borderRadius: '12px',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                          color: isDark ? '#f8fafc' : '#0f172a',
                          fontSize: '12px'
                        }}
                        formatter={(value: any) => [`₹ ${Number(value).toLocaleString()}`, '']}
                      />
                      <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                      {chartMetric === 'sales_purchase' ? (
                        <>
                          <Area type="monotone" dataKey="Sales" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
                          <Area type="monotone" dataKey="Purchase" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPurchase)" />
                        </>
                      ) : (
                        <>
                          <Area type="monotone" dataKey="InputTax" name="Input Tax" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorInputTax)" />
                          <Area type="monotone" dataKey="OutputTax" name="Output Tax" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#colorOutputTax)" />
                        </>
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 50% - 50% Split Display Grid with Monthly Bar Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Sales Report Bar Chart Card (50% Width) */}
                <div className={`p-6 rounded-2xl border shadow-xs transition-all border-l-4 border-l-emerald-500 space-y-4 ${
                  isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400">
                        <TrendingUp size={18} />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold tracking-tight">Sales Report</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Total sales revenue</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/app/reports/sales-report')}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      View Report <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                      ₹ {Number(realStats.salesMonthly || 0).toLocaleString()}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      Monthly Breakdown
                    </span>
                  </div>

                  {/* Sales Monthly Bar Graph */}
                  <div className="h-36 w-full pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getMonthlyChartData()} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                        <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} />
                        <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            borderColor: isDark ? '#334155' : '#e2e8f0',
                            borderRadius: '8px',
                            fontSize: '11px'
                          }}
                          formatter={(val: any) => [`₹ ${Number(val).toLocaleString()}`, 'Sales']}
                        />
                        <Bar dataKey="Sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Purchase Report Bar Chart Card (50% Width) */}
                <div className={`p-6 rounded-2xl border shadow-xs transition-all border-l-4 border-l-indigo-500 space-y-4 ${
                  isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
                        <ShoppingBag size={18} />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold tracking-tight">Purchase Report</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Total purchase expenses</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/app/reports/purchase-report')}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      View Report <ArrowUpRight size={13} />
                    </button>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                      ₹ {Number(realStats.purchaseMonthly || 0).toLocaleString()}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      Monthly Breakdown
                    </span>
                  </div>

                  {/* Purchase Monthly Bar Graph */}
                  <div className="h-36 w-full pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getMonthlyChartData()} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                        <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} />
                        <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            borderColor: isDark ? '#334155' : '#e2e8f0',
                            borderRadius: '8px',
                            fontSize: '11px'
                          }}
                          formatter={(val: any) => [`₹ ${Number(val).toLocaleString()}`, 'Purchase']}
                        />
                        <Bar dataKey="Purchase" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Input Tax Bar Chart Card (50% Width) */}
                {checkPermission('gst') && (
                  <div className={`p-6 rounded-2xl border shadow-xs transition-all border-l-4 border-l-purple-500 space-y-4 ${
                    isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400">
                          <CreditCard size={18} />
                        </span>
                        <div>
                          <h4 className="text-sm font-bold tracking-tight">Input Tax</h4>
                          <p className="text-xs text-slate-400 dark:text-slate-500">ITC credit tax balance</p>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate('/app/gst')}
                        className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        GST Details <ArrowUpRight size={13} />
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div className="text-3xl font-black text-purple-600 dark:text-purple-400 tracking-tight">
                        ₹ {Number(realStats.inputTaxMonthly || 0).toLocaleString()}
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                        Monthly ITC Breakdown
                      </span>
                    </div>

                    {/* Input Tax Monthly Bar Graph */}
                    <div className="h-36 w-full pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getMonthlyChartData()} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                          <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} />
                          <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark ? '#1e293b' : '#ffffff',
                              borderColor: isDark ? '#334155' : '#e2e8f0',
                              borderRadius: '8px',
                              fontSize: '11px'
                            }}
                            formatter={(val: any) => [`₹ ${Number(val).toLocaleString()}`, 'Input Tax']}
                          />
                          <Bar dataKey="InputTax" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Output Tax Bar Chart Card (50% Width) */}
                {checkPermission('gst') && (
                  <div className={`p-6 rounded-2xl border shadow-xs transition-all border-l-4 border-l-amber-500 space-y-4 ${
                    isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400">
                          <FileText size={18} />
                        </span>
                        <div>
                          <h4 className="text-sm font-bold tracking-tight">Output Tax</h4>
                          <p className="text-xs text-slate-400 dark:text-slate-500">Tax liability on sales</p>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate('/app/gst')}
                        className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        GST Details <ArrowUpRight size={13} />
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div className="text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                        ₹ {Number(realStats.outputTaxMonthly || 0).toLocaleString()}
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                        Monthly Tax Liability
                      </span>
                    </div>

                    {/* Output Tax Monthly Bar Graph */}
                    <div className="h-36 w-full pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getMonthlyChartData()} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#f1f5f9'} />
                          <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} />
                          <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark ? '#1e293b' : '#ffffff',
                              borderColor: isDark ? '#334155' : '#e2e8f0',
                              borderRadius: '8px',
                              fontSize: '11px'
                            }}
                            formatter={(val: any) => [`₹ ${Number(val).toLocaleString()}`, 'Output Tax']}
                          />
                          <Bar dataKey="OutputTax" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KPI Stat Cards (4 Columns Visual Metric Grid: Ledger, Vouchers, Cash, Bank) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {kpiStats.map((stat, idx) => (
              <div
                key={idx}
                onClick={() => stat.link && navigate(stat.link)}
                className={`p-5 rounded-2xl border ${stat.topBorder} shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between space-y-4 ${
                  isDark ? "bg-slate-800/90 border-slate-700/80 hover:border-slate-600" : "bg-white border-slate-200/80 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                      {stat.title}
                    </span>
                    <div className={`p-2.5 rounded-xl border ${stat.bg} shadow-2xs group-hover:scale-110 transition-transform`}>
                      {stat.icon}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl sm:text-3xl font-black tracking-tight flex items-baseline justify-between gap-2">
                      <span className="truncate">{stat.value}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate">
                        {stat.subtext}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${stat.badgeBg}`}>
                        {stat.badgeText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visual Metric Gauge Bar */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Metric Gauge</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 group-hover:underline">
                      {stat.linkText} <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 dark:bg-slate-700/80 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${stat.meterGradient}`}
                      style={{ width: `${stat.meterPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Main Grid: Active Company Details Card & My Companies List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Active Company Overview (Spans 2 Cols) */}
            {companyInfo ? (
              <div className={`lg:col-span-2 p-6 rounded-2xl border shadow-xs transition-colors ${
                isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
              }`}>
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200 dark:border-slate-700/80">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-indigo-600 text-white shadow-2xs">
                      <Building2 size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight">
                        {companyInfo.name}
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        Active Company Profile
                      </span>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium block">Financial Year</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                      {selectedFinYear ? `FY ${selectedFinYear}` : "All Years"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium block">Books Beginning From</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                      {companyInfo.books_beginning_year || companyInfo.booksBeginningYear || "—"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium block">GSTIN</span>
                    <span className="font-semibold font-mono text-slate-800 dark:text-slate-200 text-sm">
                      {companyInfo.gst_number || companyInfo.gstNumber || companyInfo.gstin || "—"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium block">PAN Number</span>
                    <span className="font-semibold font-mono text-slate-800 dark:text-slate-200 text-sm">
                      {companyInfo.pan_number || companyInfo.panNumber || "—"}
                    </span>
                  </div>

                  <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
                      <MapPin size={13} /> Address
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm block">
                      {companyInfo.address ? `${companyInfo.address}, ${companyInfo.state || ''} - ${companyInfo.pin || companyInfo.pin_code || companyInfo.pincode || ''}` : "—"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
                      <Mail size={13} /> Email
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate block">
                      {companyInfo.email || "—"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5">
                      <Phone size={13} /> Phone
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm block">
                      {companyInfo.phone_number || companyInfo.phoneNumber || companyInfo.phone || "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`lg:col-span-2 p-8 rounded-2xl border shadow-xs text-center flex flex-col items-center justify-center ${
                isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
              }`}>
                <Building2 size={40} className="text-slate-400 mb-3" />
                <h3 className="text-base font-bold mb-1">No Active Company Selected</h3>
                <p className="text-xs text-slate-500 max-w-sm mb-4">Create a new company or select an existing company from your account to start managing your books.</p>
                {canCreateCompany && (
                  <button
                    onClick={handleCreateCompany}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Create Company
                  </button>
                )}
              </div>
            )}

            {/* Side Card: Subscription Summary & Capacity */}
            <div className={`p-6 rounded-2xl border shadow-xs transition-colors space-y-5 ${
              isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700/80">
                <h3 className="text-base font-bold tracking-tight">
                  Subscription & Plan
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  SaaS Status
                </span>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Account Plan</div>
                  <div className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                    {user?.isTrial ? "Trial License" : "Active Subscription"}
                  </div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2 flex items-center justify-between">
                    <span>Days Remaining:</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {user?.trialDaysRemaining ?? 207} days
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Company Limit</div>
                  <div className="text-sm font-bold">
                    {companyCount} of {userLimit} Created
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (companyCount / (userLimit || 1)) * 100)}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => navigate('/app/pricing')}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer text-center"
                >
                  View Plans / Renew
                </button>
              </div>
            </div>
          </div>

          {/* My Companies Cards Grid */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight">
              My Companies
            </h2>

            {companyCount === 0 ? (
              <div className={`p-8 rounded-2xl border shadow-xs text-center ${
                isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
              }`}>
                <p className="text-sm text-slate-500 mb-4">No companies found under this account.</p>
                {canCreateCompany && (
                  <button
                    onClick={handleCreateCompany}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
                  >
                    Create Company
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {companies
                  .filter(c => {
                    if (userType === 'company_user' || userType === 'ca_employee') {
                      const restrictedId = localStorage.getItem("company_id");
                      return String(c.id) === String(restrictedId);
                    }
                    return true;
                  })
                  .map((c) => {
                    const isSelected = c.id.toString() === selectedCompany;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleCompanyUnlock(c.id.toString())}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-2xs ${
                          isSelected
                            ? "bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20"
                            : isDark
                              ? "bg-slate-800/90 border-slate-700/80 hover:border-slate-600"
                              : "bg-white border-slate-200/80 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-base truncate pr-2">
                            {c.name}
                          </h3>
                          {isSelected && (
                            <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
                          {c.address || "No address specified"}
                        </p>

                        <div className="space-y-1 text-xs font-mono opacity-80 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                          <div>GST: {c.gst_number || c.gstNumber || "—"}</div>
                          <div>PAN: {c.pan_number || c.panNumber || "—"}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      ) : suppl === "ca" ? (
        <div className="space-y-6">
          {/* CA Header */}
          <div className={`p-6 rounded-2xl border shadow-xs transition-colors ${
            isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
          }`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">CA Portal Dashboard</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage assigned companies, staff accountants, and access permissions.</p>
              </div>

              {caAllCompanies.length > 0 && (
                <div className="w-full sm:w-auto">
                  <select
                    value={selectedCaCompany}
                    onChange={(e) => {
                      const companyId = e.target.value;
                      if (!companyId) return;
                      localStorage.setItem("company_id", companyId);
                      setSelectedCaCompany(companyId);
                      window.location.reload();
                    }}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none cursor-pointer w-full sm:w-[220px] ${
                      isDark 
                        ? "bg-slate-700 border-slate-600 text-slate-100" 
                        : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                  >
                    <option value="">Select Company</option>
                    {caAllCompanies.map((c) => (
                      <option key={c.id} value={c.id.toString()}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Company Details Table */}
          <div className={`p-6 rounded-2xl border shadow-xs overflow-hidden ${
            isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
          }`}>
            <h2 className="text-base font-bold mb-4">Assigned Companies</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={`border-b ${isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
                    <th className="p-3 font-semibold">Company Name</th>
                    <th className="p-3 font-semibold">PAN Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
                  {caAllCompanies.map((company) => (
                    <tr key={company.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                      <td className="p-3 font-semibold">{company.name}</td>
                      <td className="p-3 font-mono">{company.pan_number || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Working Employees Table */}
          {userType !== "new_ca" && (
            <div className={`p-6 rounded-2xl border shadow-xs overflow-hidden ${
              isDark ? "bg-slate-800/90 border-slate-700/80" : "bg-white border-slate-200/80"
            }`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-bold">Staff Accountants</h2>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  + Add Employee
                </button>
              </div>

              {showAddForm && (
                <div className="fixed inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs z-50 p-4">
                  <div className={`rounded-3xl shadow-2xl w-full max-w-2xl relative overflow-hidden border p-2 ${
                    isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
                  }`}>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-full z-10 cursor-pointer"
                    >
                      ✕
                    </button>
                    <div className="max-h-[85vh] overflow-y-auto no-scrollbar">
                      <AddCaEmployeeForm
                        caId={caId || ""}
                        onSuccess={() => setShowAddForm(false)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b ${isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
                      <th className="p-3 font-semibold">Employee</th>
                      <th className="p-3 font-semibold">Email</th>
                      <th className="p-3 font-semibold">Company</th>
                      <th className="p-3 font-semibold">Adhaar</th>
                      <th className="p-3 font-semibold">Phone</th>
                      <th className="p-3 font-semibold text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {caEmployees.map((emp, idx) => (
                      <tr key={emp.employee_id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="p-3 font-semibold">{emp.name}</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">{emp.email}</td>
                        <td className="p-3">{emp.company_names || "—"}</td>
                        <td className="p-3 font-mono">{emp.adhar}</td>
                        <td className="p-3 font-mono">{emp.phone}</td>
                        <td className="p-3 text-center space-x-2">
                          <button
                            className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                            onClick={() => openAssignModal(emp.employee_id, emp.name)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                            onClick={() => openPermissionsModal(emp.employee_id, emp.name)}
                          >
                            <ShieldCheck size={13} /> Access
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Modals */}
      {showAssignModal && selectedEmployeeId !== null && (
        <AssignCompaniesModal
          caId={caId || ""}
          employeeId={selectedEmployeeId}
          employeeName={selectedEmployeeName}
          onClose={closeAssignModal}
          onAssigned={() => {
            fetchEmployees();
          }}
        />
      )}

      {showPermissionsModal && selectedEmployeeId !== null && (
        <PermissionsModal
          employeeId={selectedEmployeeId}
          employeeName={selectedEmployeeName}
          onClose={closePermissionsModal}
        />
      )}
    </div>
  );
};

export default Dashboard;
