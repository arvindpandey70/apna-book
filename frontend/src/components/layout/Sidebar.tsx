import React from "react";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../home/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  BarChart2,
  BookOpen,
  FileText,
  Settings,
  Database,
  ShoppingCart,
  Truck,
  BookKey,
  Wallet,
  LogOut,
  Lock,
  Landmark,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const { theme } = useAppContext();
  const { logout, hasCompany, checkPermission, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems: any[] = [
    { icon: <Home size={18} />, title: "Dashboard", path: "/app" },
    { icon: <Database size={18} />, title: "Masters", path: "/app/masters", permissionId: ['ledger', 'item'] },
    { icon: <FileText size={18} />, title: "Vouchers", path: "/app/vouchers", permissionId: ['payment', 'receipt', 'contra', 'journal', 'sales', 'purchase', 'sales-order', 'purchase-order', 'quotation', 'debit-note', 'credit-note', 'stock-journal', 'delivery-note'] },
    { icon: <BookKey size={18} />, title: "Vouchers Register", path: "/app/voucher-register", permissionId: 'payment' }, // Using payment as proxy for general voucher access
    { icon: <BarChart2 size={18} />, title: "Reports", path: "/app/reports", permissionId: 'reports' },
    { icon: <ShoppingCart size={18} />, title: "GST", path: "/app/gst", permissionId: 'gst' },
    { icon: <Truck size={18} />, title: "TDS", path: "/app/tds", permissionId: 'tds' },
    { icon: <Truck size={18} />, title: "TDS Report", path: "/app/tds-report", permissionId: 'tds' },
    { icon: <Wallet size={18} />, title: "Income Tax", path: "/app/income-tax", permissionId: 'income-tax' },
    { icon: <BookOpen size={18} />, title: "Audit", path: "/app/audit", permissionId: 'audit' },
    { icon: <Landmark size={18} />, title: "Loan", path: "/app/loan", permissionId: 'loan' },
    { icon: <Settings size={18} />, title: "Configuration", path: "/app/config" },
  ];

  const allowedWhenNoCompany = ["/app", "/app/company"];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div
      className={`print:hidden ${
        isOpen ? "translate-x-0 w-60" : "-translate-x-full md:translate-x-0 md:w-16"
      } transition-all duration-300 ease-in-out h-[calc(100vh-3.5rem)] ${
        theme === "dark"
          ? "bg-slate-900 text-slate-200 border-slate-800"
          : "bg-indigo-950 text-slate-100 border-indigo-900"
      } border-r fixed top-14 left-0 z-40 flex flex-col justify-between overflow-hidden`}
    >
      <nav className="p-2 overflow-y-auto flex-1 no-scrollbar">
        <ul className="space-y-1.5">
          {menuItems
            .filter((item) => {
              if (user?.userType === "ca" || user?.userType === "new_ca") {
                const titleLower = item.title.toLowerCase();
                return !(
                  titleLower === "masters" ||
                  titleLower === "vouchers" ||
                  titleLower === "vouchers register" ||
                  titleLower === "reports"
                );
              }
              return true;
            })
            .map((item, index) => {
            let hasPermission = true;
            if (item.permissionId) {
              if (Array.isArray(item.permissionId)) {
                hasPermission = item.permissionId.some((pid: string) => checkPermission(pid));
              } else {
                hasPermission = checkPermission(item.permissionId);
              }
            }

            const disabled =
              (!hasCompany && !allowedWhenNoCompany.includes(item.path)) || !hasPermission;
            const active = isActive(item.path);

            return (
              <li key={index}>
                <button
                  onClick={() => !disabled && navigate(item.path)}
                  disabled={disabled}
                  title={
                    !hasPermission
                      ? `${item.title} (No Permission)`
                      : !hasCompany && !allowedWhenNoCompany.includes(item.path)
                        ? `${item.title} (Create company first)`
                        : item.title
                  }
                  className={`w-full flex items-center ${
                    isOpen ? "px-3 justify-start" : "px-0 justify-center"
                  } py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    active
                      ? theme === "dark"
                        ? "bg-indigo-600/90 text-white shadow-sm font-semibold"
                        : "bg-indigo-600 text-white shadow-sm font-semibold"
                      : theme === "dark"
                        ? "hover:bg-slate-800 text-slate-300 hover:text-white"
                        : "hover:bg-indigo-900/80 text-indigo-200 hover:text-white"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <span className="flex-shrink-0 flex items-center justify-center">{item.icon}</span>
                  {isOpen && (
                    <div className="ml-3 flex flex-grow justify-between items-center truncate">
                      <span className="flex items-center gap-2 truncate">
                        {item.title}
                        {!hasPermission && <Lock size={12} className="text-rose-400 flex-shrink-0" />}
                      </span>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout Button */}
      <div className="p-2 border-t border-slate-800/40 dark:border-slate-800 flex-shrink-0 bg-inherit">
        <button
          onClick={logout}
          title={isOpen ? undefined : "Logout"}
          className={`w-full flex items-center ${
            isOpen ? "px-3 justify-center space-x-2.5" : "px-0 justify-center"
          } cursor-pointer py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm ${
            theme === 'dark'
              ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50'
              : 'bg-indigo-900 hover:bg-indigo-850 text-rose-300 border border-indigo-800'
          }`}
        >
          <LogOut size={17} className="flex-shrink-0" />
          {isOpen && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
