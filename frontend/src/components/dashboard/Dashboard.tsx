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
} from "lucide-react";
import AddCaEmployeeForm from "./caemployee"; // adjust path as needed
import AssignCompaniesModal from "./AssignCompaniesModal"; // Adjust path accordingly
import PermissionsModal from "./PermissionsModal";
import DashboardCaEmployee from "./DashboardCaEmployee";
import { useAuth } from "../../home/context/AuthContext";
import { Lock, ShieldCheck } from "lucide-react";
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
  const [caEmployees, setCaEmployees] = useState<any[]>([]); // Optional to reload list after create
  const [showAddForm, setShowAddForm] = useState(false);
  const caId = localStorage.getItem("user_id") || localStorage.getItem("employee_id");
  const suppl: string | null = localStorage.getItem("supplier"); // employee | ca | ca_employee
  const userType = localStorage.getItem("userType");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    null
  );
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>("");

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

  // Initialize selectedCompany from localStorage first
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
    // Switch to that company in context immediately
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

  // Removed this useEffect - it was causing infinite loop
  // CompanyContext now handles syncing automatically
  // useEffect(() => {
  //   // Only update if companyInfo exists and selectedCompany is empty or different
  //   if (companyInfo?.id) {
  //     const companyIdStr = companyInfo.id.toString();
  //     const storedCompanyId = localStorage.getItem("company_id");
  //     
  //     // If localStorage has a company_id, use it; otherwise use companyInfo.id
  //     if (storedCompanyId && storedCompanyId !== companyIdStr) {
  //       // If stored company is different, update selectedCompany but don't change localStorage
  //       setSelectedCompany(storedCompanyId);
  //     } else if (!storedCompanyId) {
  //       // If no stored company, use companyInfo.id and save it
  //       setSelectedCompany(companyIdStr);
  //       localStorage.setItem("company_id", companyIdStr);
  //     } else {
  //       // If they match, just ensure state is in sync
  //       setSelectedCompany(companyIdStr);
  //     }
  //   }
  // }, [companyInfo]);


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

        // For CA employees, we want to see the owner's data
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
        // console.log("this is data", data.companyInfo);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      `${import.meta.env.VITE_API_URL
      }/api/companies-by-employee?employee_id=${employeeId}`
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
      `${import.meta.env.VITE_API_URL
      }/api/ca-employees-with-companies?ca_id=${caId}`
    )
      .then((res) => res.json())
      .then((data) => setCaEmployees(data.employees || []))
      .catch(console.error);
  }, [caId, showAddForm]); // Also refetch list when the add modal closes

  // Auto-unlock logic removed - Direct access enabled

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


  // Fetch function to reload employees after assignment
  const fetchEmployees = () => {
    fetch(
      `${import.meta.env.VITE_API_URL
      }/api/ca-employees-with-companies?ca_id=${caId}`
    )
      .then((res) => res.json())
      .then((data) => setCaEmployees(data.employees || []))
      .catch(console.error);
  };


  const filteredVouchers = filterByFinancialYear(vouchers, "date", selectedFinYear);

  const stats = [
    {
      title: "Ledger Accounts",
      value: ledgers.length,
      icon: <Book size={24} />,
      color: theme === "dark" ? "bg-gray-800" : "bg-blue-50",
    },
    {
      title: "Total Vouchers",
      value: filteredVouchers.length,
      icon: <ShoppingBag size={24} />,
      color: theme === "dark" ? "bg-gray-800" : "bg-green-50",
    },
    {
      title: "Cash Balance",
      value:
        "₹ " +
        (ledgers
          .find((l) => l.name === "Cash")
          ?.openingBalance?.toLocaleString() || "0"),
      icon: <DollarSign size={24} />,
      color: theme === "dark" ? "bg-gray-800" : "bg-amber-50",
    },
    {
      title: "Bank Balance",
      value:
        "₹ " +
        (ledgers
          .find((l) => l.name === "Bank Account")
          ?.openingBalance?.toLocaleString() || "0"),
      icon: <Activity size={24} />,
      color: theme === "dark" ? "bg-gray-800" : "bg-purple-50",
    },
  ];

  const companyCount = companies.length;
  const canCreateCompany = companyCount < userLimit && (userType === "employee" || userType === "new_ca");
  // Note: For 'ca_employee', userType is 'ca_employee', so canCreateCompany will be false.

  const handleAddEmployee = () => {
    if (!newEmployee.name || !newEmployee.adhar || !newEmployee.phone) return;
    setEmployees((prev) => [...prev, newEmployee]);
    setNewEmployee({ name: "", adhar: "", phone: "", companyName: undefined });
    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="pt-[56px] px-4">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  // Verification logic removed - Direct access enabled

  // Company gate logic removed - Direct access enabled

  return (
    <>
      {suppl === "employee" || suppl === "ca_employee" ? (
        <div className="pt-[40px] px-4 ">
          {/* <h1 className="text-2xl font-bold mb-6">Dashboard</h1> */}

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 tracking-tight mb-1">
                My Companies
              </h1>
              <div className="text-sm text-gray-500">
                {companyCount} of {userLimit} allowed
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/app/vouchers/sales/create')}
                className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition-colors shadow-sm border border-indigo-100"
              >
                Sales
              </button>
              <button
                onClick={() => navigate('/app/vouchers/purchase/create')}
                className="px-4 py-2 bg-purple-50 text-purple-700 rounded-lg font-medium hover:bg-purple-100 transition-colors shadow-sm border border-purple-100"
              >
                Purchase
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {userType !== "company_user" && (
                canCreateCompany ? (
                  <button
                    onClick={handleCreateCompany}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-2 rounded-lg shadow-md hover:scale-105 transition-transform font-medium"
                  >
                    <PlusCircle className="w-5 h-5" />
                    Create Company
                  </button>
                ) : (
                  <span className="bg-red-100 text-red-700 px-4 py-2 rounded-full font-semibold text-sm">
                    Company Limit Reached ({companyCount}/{userLimit})
                  </span>
                )
              )}

              {(userType === "employee" || userType === "new_ca") && allCompanies.length > 1 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 invisible sm:visible">Active:</span>
                  <select
                    value={activeCompanyId || selectedCompany}
                    onChange={(e) => handleCompanyUnlock(e.target.value)}
                    className="border-2 border-indigo-100 rounded-xl px-4 py-2 w-full sm:w-[220px] bg-white text-gray-700 outline-none focus:border-indigo-500 transition-all font-bold cursor-pointer"
                  >
                    <option value="" disabled>Select Company</option>
                    {allCompanies.map((c) => (
                      <option key={c.id} value={c.id.toString()}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Trial / subscription banner */}
          {user?.trialDaysRemaining !== undefined && (() => {
            const isActive = user.trialDaysRemaining >= 0 && !user.isExpired;
            const isFreeTrial = user.isTrial;

            return (
              <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${isActive ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-800'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center ${isActive ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Calendar className={`h-4 w-4 ${isActive ? 'text-green-700' : 'text-red-700'}`} />
                  </div>
                  <div>
                    <div className={`font-semibold ${isActive ? 'text-green-800' : 'text-red-800'}`}>
                      {isActive
                        ? (isFreeTrial ? 'Free Trial — Active' : 'Subscription — Active')
                        : (isFreeTrial ? 'Free Trial — Ended' : 'Subscription — Ended')}
                    </div>
                    {isActive ? (
                      <div>
                        Your {isFreeTrial ? 'free trial' : 'subscription'} is active —
                        <span className="font-bold"> {user.trialDaysRemaining} days</span> remaining. {isFreeTrial ? 'After the trial ends, a subscription is required to continue using the service.' : ''}
                      </div>
                    ) : (
                      <div>
                        Your {isFreeTrial ? 'trial period' : 'subscription'} has ended. To continue using the service, please renew your subscription.
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => navigate('/app/pricing')}
                  className="self-stretch md:self-auto rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
                >
                  View Plans / Renew
                </button>
              </div>
            );
          })()}

          {/* Company Cards */}
          {companyCount === 0 ? (
            <div className="bg-white rounded-xl shadow p-8 text-center mb-8">
              <h2 className="text-lg font-semibold mb-2">
                No company created yet
              </h2>
              <p className="mb-4 text-gray-600">
                Use the button above to create your first company.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
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
                      className={`rounded-2xl p-6 hover:shadow-xl transition-all border-2 ${isSelected
                        ? "bg-gradient-to-b from-indigo-100 to-purple-100 shadow-lg border-indigo-500 ring-2 ring-indigo-300 ring-offset-2"
                        : "bg-gradient-to-b from-purple-50 to-blue-50 shadow-md border-indigo-100"
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`text-lg font-bold ${isSelected ? "text-indigo-800" : "text-gray-800"
                          }`}>
                          {c.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          <LucideLock className="w-4 h-4 text-green-500" />
                          {isSelected && (
                            <span className="bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                              Active Session
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={`text-sm mb-3 ${isSelected ? "text-gray-600" : "text-gray-500"
                        }`}>
                        {c.address || "—"}
                      </div>

                      <div className="flex flex-col gap-1 text-xs">
                        <span className={isSelected ? "text-gray-700" : "opacity-70"}>
                          GST: {c.gst_number || c.gstNumber || "—"}
                        </span>

                        <span className={isSelected ? "text-gray-700" : "opacity-70"}>
                          PAN: {c.pan_number || c.panNumber || "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* ✅ If no company, show welcome */}
          {!companyInfo ? (
            <div
              className={`p-1 rounded-lg mb-6 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              {/* <h2 className="text-xl font-semibold mb-4">
                Welcome to Apna Book 
              </h2>
              <p className="mb-4">
                No company is currently open. Use the button below to create
                your first company.
              </p> */}
              {/* <button
                onClick={handleCreateCompany}
                className={`px-4 py-2 rounded-md cursor-pointer ${
                  theme === "dark"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                Create Company
              </button> */}
            </div>
          ) : (
            <>


              {/* Company Info */}
              <div
                className={`p-6 rounded-lg mb-6 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                  }`}
              >
                <h2 className="text-xl font-semibold mb-2">
                  {companyInfo.name}
                </h2>

                <p className="text-sm opacity-75 mb-1 flex items-center">
                  <span className="mr-2">Financial Year:</span>
                  <select
                    value={selectedFinYear}
                    onChange={(e) => setSelectedFinYear(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white text-gray-800 outline-none w-auto"
                  >
                    <option value="">All Years</option>
                    {availableFinYears.map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </select>
                </p>

                <p className="text-sm opacity-75 mb-1">
                  Books Beginning From: {companyInfo.books_beginning_year || companyInfo.booksBeginningYear}
                </p>

                <p className="text-sm opacity-75 mb-1">
                  GST Number: {companyInfo.gst_number || companyInfo.gstNumber || companyInfo.gstin}
                </p>

                <p className="text-sm opacity-75 mb-1">
                  PAN Number: {companyInfo.pan_number || companyInfo.panNumber}
                </p>

                <p className="text-sm opacity-75 mb-1">
                  Address: {companyInfo.address}, {companyInfo.state} -{" "}
                  {companyInfo.pin || companyInfo.pin_code || companyInfo.pincode}
                </p>

                <p className="text-sm opacity-75 mb-1">
                  Email: {companyInfo.email}
                </p>

                <p className="text-sm opacity-75">
                  Phone: {companyInfo.phone_number || companyInfo.phoneNumber || companyInfo.phone}
                </p>
              </div>

              {/* Stats */}
              {checkPermission('reports') && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    {stats.map((stat, index) => (
                      <div
                        key={index}
                        className={`p-6 rounded-lg ${stat.color} ${theme === "dark" ? "" : "shadow"
                          }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm opacity-75 mb-1">{stat.title}</p>
                            <p className="text-2xl font-semibold">{stat.value}</p>
                          </div>
                          <div
                            className={`p-2 rounded-full ${theme === "dark" ? "bg-gray-700" : "bg-white"
                              }`}
                          >
                            {stat.icon}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Extra Reports Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    {/* Sales Report */}
                    <div className="p-6 rounded-xl bg-gradient-to-r from-green-50 to-green-100 shadow hover:shadow-lg transition">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        Sales Report
                      </h3>
                      <p className="text-2xl font-bold text-green-700">
                        ₹ {Number(realStats.salesMonthly || 0).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        {selectedFinYear ? `FY ${selectedFinYear}` : "All Time"}
                      </p>
                    </div>

                    {/* Purchase Report */}
                    <div className="p-6 rounded-xl bg-gradient-to-r from-blue-50 to-blue-100 shadow hover:shadow-lg transition">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        Purchase Report
                      </h3>
                      <p className="text-2xl font-bold text-blue-700">
                        ₹ {Number(realStats.purchaseMonthly || 0).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        {selectedFinYear ? `FY ${selectedFinYear}` : "All Time"}
                      </p>
                    </div>

                    {/* Input Tax */}
                    {checkPermission('gst') && (
                      <div className="p-6 rounded-xl bg-gradient-to-r from-purple-50 to-purple-100 shadow hover:shadow-lg transition">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          Input Tax
                        </h3>
                        <p className="text-2xl font-bold text-purple-700">
                          ₹ {Number(realStats.inputTaxMonthly || 0).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500">
                          {selectedFinYear ? `FY ${selectedFinYear}` : "All Time"}
                        </p>
                      </div>
                    )}

                    {/* Output Tax */}
                    {checkPermission('gst') && (
                      <div className="p-6 rounded-xl bg-gradient-to-r from-orange-50 to-orange-100 shadow hover:shadow-lg transition">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          Output Tax
                        </h3>
                        <p className="text-2xl font-bold text-orange-700">
                          ₹ {Number(realStats.outputTaxMonthly || 0).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500">
                          {selectedFinYear ? `FY ${selectedFinYear}` : "All Time"}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : suppl === "ca" ? (
        <div className="pt-[56px] px-4 space-y-8">
          {caAllCompanies.length > 0 && (
            <div className="mb-6">
              <label className="block mb-2 font-medium text-gray-700">
                Switch Company
              </label>
              <select
                value={selectedCaCompany}
                onChange={(e) => {
                  const companyId = e.target.value;
                  if (!companyId) return;

                  localStorage.setItem("company_id", companyId);
                  setSelectedCaCompany(companyId);
                  window.location.reload();
                }}
                className="border rounded px-3 py-2 w-full max-w-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all font-bold"
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

          {/* Company Details Table */}
          <div className="bg-white shadow rounded-2xl p-6 overflow-x-auto">
            <h2 className="text-lg font-semibold mb-4">Company Details</h2>
            <table className="w-full border-collapse border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">Company Name</th>
                  <th className="border p-2">Pan</th>
                </tr>
              </thead>
              <tbody>
                {caAllCompanies.map((company) => (
                  <tr key={company.id}>
                    <td className="border p-2">{company.name}</td>
                    <td className="border p-2">{company.pan_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Employees Table - hidden for new_ca */}
          {userType !== "new_ca" && (
            <div className="bg-white shadow rounded-2xl p-6 overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Working Employees</h2>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                + Add Employee
              </button>
            </div>
            {showAddForm && (
              <div className="fixed inset-0 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm z-50 p-4 transition-all duration-300">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl relative animate-in zoom-in-95 duration-200 overflow-hidden border border-white/20">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-all z-10"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="max-h-[90vh] overflow-y-auto no-scrollbar">
                    <AddCaEmployeeForm
                      caId={caId || ""}
                      onSuccess={() => setShowAddForm(false)}
                    />
                  </div>
                </div>
              </div>
            )}
            <table className="w-full border-collapse border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">Employee Name</th>
                  <th className="border p-2">Email</th>
                  <th className="border p-2">Password</th>
                  <th className="border p-2">Company Name</th>
                  <th className="border p-2">Adhar Number</th>
                  <th className="border p-2">Phone Number</th>
                  <th className="border p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {caEmployees.map((emp, idx) => (
                  <tr key={emp.employee_id || idx} className="text-center">
                    <td className="border p-2">{emp.name}</td>
                    <td className="border p-2">{emp.email}</td>
                    <td className="border p-2">{emp.password || "*****"}</td>
                    <td className="border p-2">{emp.company_names || "—"}</td>
                    <td className="border p-2">{emp.adhar}</td>
                    <td className="border p-2">{emp.phone}</td>
                    <td className="border p-2 flex gap-2 justify-center cursor-pointer">
                      <button
                        className="text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() =>
                          openAssignModal(emp.employee_id, emp.name)
                        }
                      >
                        Edit
                      </button>


                      <button
                        className="text-green-600 hover:underline flex items-center gap-1"
                        onClick={() =>
                          openPermissionsModal(emp.employee_id, emp.name)
                        }
                      >
                        <ShieldCheck size={14} />
                        Access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ) : null}
      {
        showAssignModal && selectedEmployeeId !== null && (
          <AssignCompaniesModal
            caId={caId || ""}
            employeeId={selectedEmployeeId}
            employeeName={selectedEmployeeName}
            onClose={closeAssignModal}
            onAssigned={() => {
              fetchEmployees();
            }}
          />
        )
      }

      {
        showPermissionsModal && selectedEmployeeId !== null && (
          <PermissionsModal
            employeeId={selectedEmployeeId}
            employeeName={selectedEmployeeName}
            onClose={closePermissionsModal}
          />
        )
      }

      {/* Modal for Adding Employee */}
      {
        showModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm z-50 p-4 transition-all duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 overflow-hidden border border-white/20 p-8">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Add New Employee
                </h3>
                <p className="text-sm text-gray-500 mt-1">Fill in the details to add a new employee</p>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Employee Name"
                  value={newEmployee.name}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, name: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium"
                />
                <input
                  type="text"
                  placeholder="Aadhaar Number"
                  value={newEmployee.adhar}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, adhar: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium"
                />
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={newEmployee.phone}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, phone: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 text-gray-800 font-medium"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-semibold text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEmployee}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Add Employee
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
};

export default Dashboard;
