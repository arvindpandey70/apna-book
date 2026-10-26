import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
const API_URL = import.meta.env.VITE_API_URL;
console.log(API_URL);

const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email or Username is required';
    } else if (formData.email.includes('@') && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const success = await login(formData.email, formData.password);

      if (success) {
        const userType = localStorage.getItem('userType') ?? 'employee';
        const hasCompanyRaw = localStorage.getItem('company');
        const hasCompany = hasCompanyRaw === 'true' || hasCompanyRaw === '1' || hasCompanyRaw === 'True';

        if (userType === 'ca' || userType === 'new_ca') {
          // CA always lands on the CA Portal Dashboard (/app)
          navigate('/app');
        } else if (hasCompany) {
          navigate('/app');
        } else if (userType === 'employee') {
          navigate('/app/company');
        } else {
          navigate('/app/no-company');
        }
      } else {
        setErrors({ submit: 'Invalid email or password' });
      }
    } catch (error) {
      console.error('Login Error:', error);
      setErrors({ submit: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500/80 via-purple-600/80 to-purple-800/80 bg-[url('/src/assets/bg-1.svg')] bg-cover bg-center bg-no-repeat bg-blend-overlay">

      <div className="flex items-center justify-center w-full max-w-6xl mx-auto px-4">
        {/* Left Side - Illustration */}
        <div className="hidden lg:flex lg:w-1/2 items-center justify-center">
          <div className="relative">
            {/* Security illustration */}
            <div className="w-80 h-80 flex items-center justify-center">
              {/* <img 
                src="/src/assets/image 1.svg" 
                alt="Security Illustration" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.classList.add('hidden');
                }}
              /> */}
              {/* Fallback illustration if image doesn't load */}
              <div className="w-64 h-64 bg-white/20 rounded-3xl backdrop-blur-sm flex items-center justify-center">
                <div className="text-white/80 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-[#6D30D4] rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold">Secur Login</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full lg:w-1/2 max-w-md mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Login</h2>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {errors.submit && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                  {errors.submit}
                </div>
              )}

              <div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border-2 ${errors.email ? 'border-red-300' : 'border-white/30'
                    } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200`}
                  placeholder="Username"
                />
                {errors.email && (
                  <p className="mt-2 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border-2 ${errors.password ? 'border-red-300' : 'border-white/30'
                    } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200 pr-12`}
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                {errors.password && (
                  <p className="mt-2 text-sm text-red-600">{errors.password}</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-white focus:ring-white/50 border-white/30 rounded bg-white/10"
                />
                <label htmlFor="rememberMe" className="ml-3 text-sm text-white font-medium">
                  Remember Password
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-[#6D30D4] hover:bg-[#5a2bb5] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6D30D4] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin -ml-1 mr-3 h-5 w-5 text-white">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                      Signing in...
                    </div>
                  ) : (
                    'Login'
                  )}
                </button>
              </div>

              <div className="text-center space-y-2">
                <div>
                  <Link to="/forgot-password" className="text-sm text-white/80 hover:text-white transition-colors">
                    Forgot Password?
                  </Link>
                </div>
                <div className="text-sm text-white/80">
                  Don't have account?{' '}
                  <Link to="/signup" className="font-medium text-white hover:text-white/80 transition-colors">
                    Sign up
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
