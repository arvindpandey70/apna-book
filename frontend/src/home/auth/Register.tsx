import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
// import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import { useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    pan: '',
    address: '',
    agreeToTerms: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const location = useLocation();
  const userLimit = location.state?.userLimit || 1;
  // const { isAuthenticated } = useAuth();
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

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // if (!formData.companyName.trim()) {
    //   newErrors.companyName = 'Company name is required';
    // }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    }

    if (!formData.pan.trim()) {
      newErrors.pan = 'PAN number is required';
    }

    if (!formData.agreeToTerms) {
      newErrors.agreeToTerms = 'You must agree to the terms and conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});
    console.log("📨 Raw Response:");


    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/SignUp/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          phoneNumber: formData.phoneNumber,
          pan: formData.pan,
          userLimit: userLimit,
          address: formData.address
        })
      });

      console.log("📨 Raw Response:", res);

      const data = await res.json();

      console.log("✅ Response Status:", res.status);
      console.log("✅ Response Body:", data);

      if (res.ok) {
        localStorage.clear();
        sessionStorage.clear();
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: data.message,
        }).then(() => {
          navigate('/login'); // or your route to go back
        });

      } else {
        setErrors({ submit: data.message || 'Registration failed. Please try again.' });
        return;
      }


    } catch (err) {
      console.error('❌ Register fetch error:', err);
      setErrors({ submit: 'Network error — please try again.' });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500/80 via-purple-600/80 to-purple-800/80 bg-[url('/src/assets/bg-1.svg')] bg-cover bg-center bg-no-repeat bg-blend-overlay">

      <div className="flex items-center justify-center w-full max-w-7xl mx-auto px-4 py-8">
        {/* Left Side - Illustration */}
        <div className="hidden lg:flex lg:w-1/2 items-center justify-center">
          <div className="relative">
            {/* Registration/Growth illustration */}
            <div className="w-80 h-80 flex items-center justify-center">
              {/* <img 
                src="/src/assets/image 1.svg" 
                alt="Growth Illustration" 
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold">Join Us Today</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Signup Form */}
        <div className="w-full lg:w-1/2 max-w-lg mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Create Account</h2>
              <p className="text-white/80">Join thousands of businesses using Apna Book</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {errors.submit && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                  {errors.submit}
                </div>
              )}

              {/* First Name and Last Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border-2 ${errors.firstName ? 'border-red-300' : 'border-white/30'
                      } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200`}
                    placeholder="First Name"
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
                  )}
                </div>
                <div>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border-2 ${errors.lastName ? 'border-red-300' : 'border-white/30'
                      } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200`}
                    placeholder="Last Name"
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
                  )}
                </div>
              </div>

              {/* Email */}
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
                  placeholder="Email Address"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Company Name */}
              <div>
                <input
                  id="userLimit"
                  name="userLimit"
                  type="text"

                  value={`No of Company Allotted ${userLimit}`}
                  readOnly

                  className={`w-full px-4 py-3 border-2 ${errors.companyName ? 'border-red-300' : 'border-white/30'
                    } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200`}
                  placeholder="Company Name"
                />

              </div>

              {/* PAN Number */}
              <div>
                <input
                  id="pan"
                  name="pan"
                  type="text"
                  required
                  value={formData.pan}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border-2 ${errors.pan ? 'border-red-300' : 'border-white/30'
                    } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200`}
                  placeholder="PAN Number"
                />
                {errors.pan && (
                  <p className="mt-1 text-sm text-red-600">{errors.pan}</p>
                )}
              </div>

              {/* Phone Number */}
              <div>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border-2 ${errors.phoneNumber ? 'border-red-300' : 'border-white/30'
                    } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200`}
                  placeholder="Phone Number"
                />
                {errors.phoneNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.phoneNumber}</p>
                )}
              </div>

              {/* Address */}
              <div>
                <textarea
                  id="address"
                  name="address"
                  required
                  value={formData.address}
                  onChange={(e: any) => handleInputChange(e)}
                  className={`w-full px-4 py-3 border-2 ${errors.address ? 'border-red-300' : 'border-white/30'
                    } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200 min-h-[100px]`}
                  placeholder="Permanent Address"
                />
                {errors.address && (
                  <p className="mt-1 text-sm text-red-600">{errors.address}</p>
                )}
              </div>

              {/* Password and Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
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
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border-2 ${errors.confirmPassword ? 'border-red-300' : 'border-white/30'
                      } rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 bg-white/10 backdrop-blur-sm transition-all duration-200 pr-12`}
                    placeholder="Confirm Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="flex items-start">
                <input
                  id="agreeToTerms"
                  name="agreeToTerms"
                  type="checkbox"
                  checked={formData.agreeToTerms}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-white focus:ring-white/50 border-white/30 rounded mt-1 bg-white/10"
                />
                <label htmlFor="agreeToTerms" className="ml-3 text-sm text-white/80">
                  I agree to the{' '}
                  <Link to="/privacy-policy" className="text-white hover:text-white/80 font-medium">
                    Terms and Conditions
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy-policy" className="text-white hover:text-white/80 font-medium">
                    Privacy Policy
                  </Link>
                </label>
              </div>
              {errors.agreeToTerms && (
                <p className="text-sm text-red-600">{errors.agreeToTerms}</p>
              )}

              {/* Submit Button */}
              <div className="pt-2">
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
                      Creating Account...
                    </div>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>

              {/* Login Link */}
              <div className="text-center">
                <div className="text-sm text-white/80">
                  Already have an account?{' '}
                  <Link to="/login" className="font-medium text-white hover:text-white/80 transition-colors">
                    Sign in
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

export default Register;
