import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdmin } from '../../hooks/useAdmin';
import { useTheme } from '../../context/ThemeContext';
import { gsap } from 'gsap';
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  Users,
  Building2,
  CreditCard,
  Receipt,
  Settings,
  Moon,
  Sun,
  X,
  LogOut
} from 'lucide-react';

import api from '../../services/api';

const Sidebar: React.FC = () => {
  const { sidebarOpen, setSidebarOpen, logout } = useAdmin();
  const { theme, isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sidebarRef.current) {
      gsap.to(sidebarRef.current, {
        x: sidebarOpen ? 0 : -280,
        duration: 0.05,
        ease: 'power4.out'
      });
    }
  }, [sidebarOpen]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'ledgers', label: 'Ledgers', icon: BookOpen, path: '/ledgers' },
    { id: 'groups', label: 'Groups', icon: Layers, path: '/groups' },
    { id: 'users', label: 'Accountant Management', icon: Users, path: '/users' },
    { id: 'ca-management', label: 'CA Management', icon: Users, path: '/ca-management' },
    { id: 'trader', label: 'Trader Management', icon: Building2, path: '/trader' },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard, path: '/subscriptions' },
    { id: 'payments', label: 'Payment History', icon: Receipt, path: '/payments' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' }
  ];

  const handleMenuClick = (path: string) => {
    navigate(path);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/admin/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    logout();
    navigate('/');
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity duration-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed left-0 top-0 h-full shadow-xl z-50 lg:relative flex flex-col transition-all duration-50 ${theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
          } ${sidebarOpen
            ? 'w-70 translate-x-0'
            : 'w-0 -translate-x-full lg:w-0 lg:translate-x-0 overflow-hidden'
          }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>ApnaBook Admin</h1>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Subscription Manager</p>
            </div>
          </div>
          <button
            title='Close Sidebar'
            onClick={() => setSidebarOpen(false)}
            className={`lg:hidden p-2 rounded-lg ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            <X className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${location.pathname === item.path
                      ? theme === 'dark'
                        ? 'bg-violet-900 text-violet-100'
                        : 'bg-violet-100 text-violet-700'
                      : theme === 'dark'
                        ? 'text-gray-300 hover:bg-gray-700'
                        : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className={`p-4 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors mb-2 ${theme === 'dark'
              ? 'text-gray-300 hover:bg-gray-700'
              : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span className="text-sm font-medium">Logout</span>
          </button>
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${theme === 'dark'
              ? 'text-gray-300 hover:bg-gray-700'
              : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            {isDark ? (
              <Sun className="w-5 h-5 mr-3" />
            ) : (
              <Moon className="w-5 h-5 mr-3" />
            )}
            <span className="text-sm font-medium">
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;