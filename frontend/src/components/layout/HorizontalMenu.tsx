// import React from 'react';
// import { useAppContext } from '../../context/AppContext';
// import { useNavigate, useLocation } from 'react-router-dom';

// const menuItems = [
//   { title: 'Dashboard', path: '/' },
//   { title: 'Masters', path: '/masters' },
//   { title: 'Vouchers', path: '/vouchers' },
//   { title: 'Reports', path: '/reports' },
//   { title: 'Accounting', path: '/accounting' },
//   { title: 'Inventory', path: '/inventory' },
//   { title: 'GST', path: '/gst' },
//   { title: 'TDS', path: '/tds' },
//   { title: 'Audit', path: '/audit' },
//   { title: 'Config', path: '/config' },
// ];

// const HorizontalMenu: React.FC = () => {
//   const { theme } = useAppContext();
//   const navigate = useNavigate();
//   const location = useLocation();

//   const isActive = (path: string) =>
//     location.pathname === path || location.pathname.startsWith(`${path}/`);

//   return (
//     <div
//       className={`fixed top-14 left-60 right-0 z-40 border-b h-10 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-rounded ${
//         theme === 'dark'
//           ? 'bg-gray-900 text-gray-200 border-gray-700 scrollbar-thumb-gray-700'
//           : 'bg-blue-800 text-white border-blue-700 scrollbar-thumb-blue-700'
//       }`}
//     >
//       <div className="flex items-center h-full px-2 space-x-2 min-w-max">
//         {menuItems.map((item, index) => (
//           <button
//             key={index}
//             onClick={() => navigate(item.path)}
//             className={`px-3 py-1 rounded text-sm transition-colors flex-shrink-0 ${
//               isActive(item.path)
//                 ? theme === 'dark'
//                   ? 'bg-gray-700'
//                   : 'bg-blue-700'
//                 : 'hover:bg-blue-700 dark:hover:bg-gray-700'
//             }`}
//           >
//             {item.title}
//           </button>
//         ))}
//       </div>
//     </div>
//   );
// };

// export default HorizontalMenu;





import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../home/context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface HorizontalMenuProps {
  sidebarOpen: boolean;
}

const menuItems = [
  { title: 'Dashboard', path: '/app' },
  { title: 'Masters', path: '/app/masters', permissionId: 'masters' },
  { title: 'Vouchers', path: '/app/vouchers', permissionId: 'vouchers' },
  { title: 'Reports', path: '/app/reports', permissionId: 'reports' },
  // { title: 'Accounting', path: '/app/accounting' },
  // { title: 'Inventory', path: '/app/inventory' },
  { title: 'Vouchers Register', path: '/app/voucher-register', permissionId: 'vouchers' },
  // { title: 'Sales Order', path: '/app/sales-order' },
  { title: 'GST', path: '/app/gst', permissionId: 'gst' },
  { title: 'TDS', path: '/app/tds', permissionId: 'tds' },
  { title: 'TDS Report', path: '/app/tds-report', permissionId: 'tds' },
  { title: 'Income Tax', path: '/app/income-tax', permissionId: 'income-tax' },
  { title: 'Audit', path: '/app/audit', permissionId: 'audit' },
  { title: 'Loan', path: '/app/loan', permissionId: 'loan' },
  { title: 'Config', path: '/app/config' },
];

const HorizontalMenu: React.FC<HorizontalMenuProps> = ({ sidebarOpen }) => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const { hasCompany, checkPermission, user } = useAuth();

  const allowedWhenNoCompany = ['/app', '/app/company'];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div
      className={`print:hidden fixed top-14 z-30 h-10 overflow-x-auto whitespace-nowrap transition-all duration-300 ${
        sidebarOpen ? 'left-60 block' : 'hidden md:block md:left-16'
      } right-0 border-b no-scrollbar ${
        theme === 'dark'
          ? 'bg-slate-900/95 text-slate-200 border-slate-800 backdrop-blur-md'
          : 'bg-indigo-950 text-indigo-100 border-indigo-900 shadow-2xs'
      }`}
    >
      <div className="flex items-center h-full px-3 space-x-1.5 min-w-max">
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
          if ((item as any).permissionId) {
            hasPermission = checkPermission((item as any).permissionId);
          }

          const disabled = (!hasCompany && !allowedWhenNoCompany.includes(item.path)) || !hasPermission;
          const active = isActive(item.path);

          return (
            <button
              key={index}
              onClick={() => !disabled && navigate(item.path)}
              disabled={disabled}
              title={
                !hasPermission
                  ? "You don't have permission to access this module"
                  : disabled
                    ? 'Create a company first to access this'
                    : undefined
              }
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex-shrink-0 cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : theme === 'dark'
                    ? 'hover:bg-slate-800 text-slate-300 hover:text-white'
                    : 'hover:bg-indigo-900/90 text-indigo-200 hover:text-white'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {item.title}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default HorizontalMenu;
