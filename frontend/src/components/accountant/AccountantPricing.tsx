import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../home/context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { createOrder, confirmPayment } from '../../services/payments';
import {
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
  Building2,
  Users,
  CreditCard,
  Tag,
  ArrowRight,
  Clock,
  HelpCircle
} from 'lucide-react';
import Swal from 'sweetalert2';

interface AccountantPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  popular?: boolean;
  recommendedFor?: string;
}

const AccountantPricing: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [plans, setPlans] = useState<AccountantPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);

  // Status
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);

  // Coupons
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // 1. Fetch live subscription status
    fetch(`${import.meta.env.VITE_API_URL}/api/accountant/subscription-status`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.subscription) {
          setSubscriptionStatus(data.subscription);
        }
      })
      .catch(err => console.error('Failed to load subscription status:', err));

    // 2. Fetch accountant plans
    fetch(`${import.meta.env.VITE_API_URL}/api/accountant/plans`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.plans) {
          setPlans(data.plans);
        }
      })
      .catch(err => console.error('Failed to load accountant plans:', err))
      .finally(() => setLoadingPlans(false));
  }, []);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponError(null);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/coupons`);
      const data = await res.json();
      if (data.success && Array.isArray(data.coupons)) {
        const found = data.coupons.find(
          (c: any) => c.code.toLowerCase() === couponCode.trim().toLowerCase() && c.isActive
        );
        if (found) {
          setAppliedCoupon(found);
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Coupon applied: ${found.code}`,
            timer: 2500,
            showConfirmButton: false,
          });
        } else {
          setCouponError('Invalid or expired coupon code');
        }
      }
    } catch (e) {
      setCouponError('Could not validate coupon');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleSubscribe = async (plan: AccountantPlan) => {
    try {
      setProcessingPlanId(plan.id);

      const basePrice = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
      let discountAmount = 0;
      if (appliedCoupon) {
        if (appliedCoupon.discountType === 'percentage') {
          discountAmount = Math.round((basePrice * appliedCoupon.discountValue) / 100);
        } else {
          discountAmount = Math.round(appliedCoupon.discountValue);
        }
      }
      const finalAmount = Math.max(basePrice - discountAmount, 1);

      const userRaw = localStorage.getItem('user');
      const parsedUser = userRaw ? JSON.parse(userRaw) : user;

      const payload = {
        orderId: `acc_${plan.id}_${Date.now()}`,
        amount: basePrice,
        currency: 'INR',
        user: {
          id: parsedUser?.id || localStorage.getItem('user_id'),
          name: parsedUser?.name || `${parsedUser?.firstName || ''} ${parsedUser?.lastName || ''}`.trim() || 'Accountant',
          email: parsedUser?.email || '',
          phone: parsedUser?.phoneNumber || parsedUser?.phone || '',
        },
        productinfo: `Accountant Plan: ${plan.name} (${billingCycle})`,
        planId: plan.id,
        couponId: appliedCoupon?.id || null,
        discountAmount,
        finalAmount,
      };

      const resp = await createOrder(payload);
      if (!resp || !resp.order || !resp.key) {
        Swal.fire('Error', 'Could not initialize payment order with server.', 'error');
        setProcessingPlanId(null);
        return;
      }

      // Ensure Razorpay SDK loaded
      const loadRazorpay = () =>
        new Promise<void>((resolve, reject) => {
          if ((window as any).Razorpay) return resolve();
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Razorpay SDK failed to load'));
          document.body.appendChild(script);
        });

      await loadRazorpay();

      const options = {
        key: resp.key,
        amount: resp.order.amount,
        currency: resp.order.currency,
        name: 'ApnaBook Accountant Panel',
        description: `${plan.name} (${billingCycle.toUpperCase()})`,
        order_id: resp.order.id,
        prefill: {
          name: payload.user.name,
          email: payload.user.email,
          contact: payload.user.phone,
        },
        theme: {
          color: '#6366f1',
        },
        handler: async function (response: any) {
          try {
            await confirmPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            // Update local user object
            if (parsedUser) {
              parsedUser.hasSubscription = true;
              parsedUser.isExpired = false;
              parsedUser.subscriptionStatus = 'active';
              parsedUser.isTrial = false;
              localStorage.setItem('user', JSON.stringify(parsedUser));
            }

            await Swal.fire({
              icon: 'success',
              title: 'Subscription Activated!',
              text: `You have successfully subscribed to ${plan.name}. Full Accountant Panel access is unlocked.`,
              confirmButtonText: 'Go to Accountant Dashboard',
              confirmButtonColor: '#6366f1',
            });

            window.location.href = '/accountant/dashboard';
          } catch (confirmErr: any) {
            console.error('Payment confirmation error:', confirmErr);
            Swal.fire({
              icon: 'warning',
              title: 'Verification Pending',
              text: 'Payment received. Your account will be activated shortly.',
            });
            window.location.href = '/accountant/dashboard';
          }
        },
        modal: {
          ondismiss: function () {
            setProcessingPlanId(null);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error('Subscription error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Payment Error',
        text: err.message || 'Failed to initiate checkout',
      });
      setProcessingPlanId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="text-center space-y-3 pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          <ShieldCheck size={14} />
          Accountant Exclusive Plans
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Accountant Panel Subscription
        </h1>
        <p className={`text-sm sm:text-base max-w-2xl mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Select an accountant subscription plan to manage client companies, provision client users, and access consolidated tax and audit tools.
        </p>
      </div>

      {/* Current Status Banner */}
      {subscriptionStatus && (
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            subscriptionStatus.isPaid
              ? isDark
                ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : subscriptionStatus.isTrial && !subscriptionStatus.isExpired
              ? isDark
                ? 'bg-indigo-950/30 border-indigo-800/80 text-indigo-300'
                : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              : isDark
              ? 'bg-amber-950/30 border-amber-800/80 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                {subscriptionStatus.isPaid ? (
                  <CheckCircle2 size={22} className="text-emerald-500" />
                ) : subscriptionStatus.isTrial && !subscriptionStatus.isExpired ? (
                  <Sparkles size={22} className="text-indigo-500" />
                ) : (
                  <Clock size={22} className="text-amber-500" />
                )}
              </div>
              <div>
                <div className="font-bold text-sm">
                  {subscriptionStatus.isPaid
                    ? `Active Paid Subscription (${subscriptionStatus.plan})`
                    : subscriptionStatus.isTrial && !subscriptionStatus.isExpired
                    ? `Admin Free Trial Active (${subscriptionStatus.daysRemaining !== null ? `${subscriptionStatus.daysRemaining} days remaining` : 'Unlimited'})`
                    : 'Free Trial Expired / Subscription Required'}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  {subscriptionStatus.isPaid
                    ? `Your account is fully active until ${new Date(subscriptionStatus.endDate).toLocaleDateString('en-IN')}.`
                    : subscriptionStatus.isTrial && !subscriptionStatus.isExpired
                    ? 'You can use all features for free during your trial. Subscribe below to upgrade.'
                    : 'Please purchase a plan below to unlock full access to the Accountant Panel.'}
                </div>
              </div>
            </div>

            {subscriptionStatus.isExpired && (
              <span className="text-xs font-extrabold uppercase px-3 py-1 rounded-full bg-amber-500 text-white shrink-0">
                Action Required
              </span>
            )}
          </div>
        </div>
      )}

      {/* Billing Cycle Switch */}
      <div className="flex justify-center">
        <div className={`p-1.5 rounded-2xl border flex items-center gap-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
              billingCycle === 'monthly'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              billingCycle === 'yearly'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Yearly Billing
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
              Save ~17%
            </span>
          </button>
        </div>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
          let discount = 0;
          if (appliedCoupon) {
            discount =
              appliedCoupon.discountType === 'percentage'
                ? Math.round((price * appliedCoupon.discountValue) / 100)
                : Math.round(appliedCoupon.discountValue);
          }
          const finalPrice = Math.max(price - discount, 0);

          return (
            <div
              key={plan.id}
              className={`rounded-3xl border p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 relative ${
                plan.popular
                  ? isDark
                    ? 'bg-slate-800/90 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500'
                    : 'bg-white border-indigo-600 shadow-xl shadow-indigo-500/15 ring-2 ring-indigo-600'
                  : isDark
                  ? 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md">
                  Most Popular for Accountants
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  {plan.recommendedFor && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {plan.recommendedFor}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 min-h-[36px]">
                  {plan.description}
                </p>

                {/* Price Display */}
                <div className="mb-6 pb-6 border-b border-slate-100 dark:border-slate-700/80">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                      ₹{finalPrice.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">
                      /{billingCycle === 'yearly' ? 'year' : 'month'}
                    </span>
                  </div>
                  {appliedCoupon && discount > 0 && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                      Save ₹{discount.toLocaleString('en-IN')} with code {appliedCoupon.code}
                    </div>
                  )}
                </div>

                {/* Features List */}
                <div className="space-y-3 mb-8">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    What's Included:
                  </div>
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => handleSubscribe(plan)}
                disabled={processingPlanId !== null}
                className={`w-full py-3.5 px-4 rounded-2xl text-xs font-bold transition-all transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                  plan.popular
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-600/30'
                    : isDark
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                } disabled:opacity-50`}
              >
                {processingPlanId === plan.id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing Payment...
                  </>
                ) : (
                  <>
                    Subscribe to {plan.name}
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Coupon Code Section */}
      <div className={`p-6 rounded-3xl border ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Tag size={20} />
            </div>
            <div>
              <div className="font-bold text-sm">Have a Discount Coupon?</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Enter your promo or promotional voucher code to apply instant savings.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="ENTER COUPON CODE"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className={`px-4 py-2.5 rounded-xl border text-xs font-mono font-semibold uppercase tracking-wider outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={validatingCoupon || !couponCode.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
            >
              {validatingCoupon ? 'Checking...' : 'Apply'}
            </button>
          </div>
        </div>

        {couponError && (
          <div className="text-xs text-rose-500 font-medium mt-3 text-right">
            {couponError}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountantPricing;
