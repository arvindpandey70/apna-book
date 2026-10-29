import React, { useEffect, useState } from "react";
import { useAuth } from "../../home/context/AuthContext";
import { useNavigate, Outlet } from "react-router-dom";

interface RequireSubscriptionProps {
  children?: React.ReactNode;
}

const RequireSubscription: React.FC<RequireSubscriptionProps> = ({
  children,
}) => {
  const { user, companyId } = useAuth();
  const navigate = useNavigate();

  const userType = user?.userType || localStorage.getItem("userType");
  const isAccountant = userType === 'accountant' || userType === 'ca' || userType === 'new_ca';

  // If user object has subscription info (isExpired, hasSubscription), we can use it immediately.
  const hasSubInfo = isAccountant || user?.hasSubscription !== undefined;
  const [isChecking, setIsChecking] = useState(!hasSubInfo && !isAccountant);
  const [isBlocked, setIsBlocked] = useState(isAccountant ? false : !!user?.isExpired);
  const [message, setMessage] = useState<string | null>(
    isAccountant
      ? null
      : user?.isExpired
        ? user?.isTrial
          ? "Your free trial has ended. To continue using the product, please renew your subscription."
          : "Your subscription has expired. Please renew or subscribe to continue using the service."
        : null
  );

  // Sync state with user object changes
  useEffect(() => {
    if (isAccountant) {
      setIsBlocked(false);
      setMessage(null);
      return;
    }
    if (user?.hasSubscription !== undefined) {
      setIsBlocked(!!user.isExpired);
      if (user.isExpired) {
        setMessage(
          user.isTrial
            ? "Your free trial has ended. To continue using the product, please renew your subscription."
            : "Your subscription has expired. Please renew or subscribe to continue using the service."
        );
      } else {
        setMessage(null);
      }
    }
  }, [user, isAccountant]);

  // Always verify live subscription status from server on mount / companyId change
  // This ensures that when the admin extends the subscription, reloading or visiting unblocks immediately!
  useEffect(() => {
    let isMounted = true;
    const check = async () => {
      if (isAccountant) {
        if (isMounted) {
          setIsBlocked(false);
          setIsChecking(false);
          setMessage(null);
        }
        return;
      }

      const activeCompId = companyId || localStorage.getItem("company_id") || localStorage.getItem("active_company_id");
      if (!activeCompId) {
        if (isMounted) setIsChecking(false);
        return;
      }

      try {
        const userId = user?.id || localStorage.getItem("user_id") || "";
        const queryParams = new URLSearchParams();
        if (userType) queryParams.append("user_type", userType);
        if (userId) queryParams.append("user_id", String(userId));
        const qs = queryParams.toString() ? `?${queryParams.toString()}` : "";

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/company-subscription/status/${activeCompId}${qs}`,
          { credentials: "include" }
        );

        if (!res.ok) {
          if (isMounted) setIsChecking(false);
          return;
        }

        const json = await res.json();
        const status = json?.data;

        if (status && isMounted) {
          const isCurrentlyExpired = !!status.isExpired;
          setIsBlocked(isCurrentlyExpired);
          if (isCurrentlyExpired) {
            if (status.isAccountantManaged) {
              setMessage(
                status.message ||
                "This company is managed by an Accountant. To access and work on this company's books, please purchase a subscription plan."
              );
            } else {
              setMessage(
                status.isTrial
                  ? "Your free trial has ended. To continue using the product, please renew your subscription."
                  : "Your subscription has expired. Please renew or subscribe to continue using the service."
              );
            }
          } else {
            setMessage(null);
            // Update cached user in localStorage so it doesn't revert to stale expired state
            try {
              const savedUser = localStorage.getItem("user");
              if (savedUser) {
                const parsed = JSON.parse(savedUser);
                parsed.isExpired = false;
                parsed.hasSubscription = true;
                parsed.subscriptionStatus = status.status;
                parsed.isTrial = !!status.isTrial;
                parsed.trialDaysRemaining = status.daysRemaining;
                localStorage.setItem("user", JSON.stringify(parsed));
              }
            } catch (e) {
              // ignore storage errors
            }
          }
        }
      } catch (err) {
        console.error("Error checking subscription status:", err);
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };

    check();

    return () => {
      isMounted = false;
    };
  }, [companyId, user?.userType, user?.id, isAccountant]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-500">
          Checking subscription status...
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Subscription Required
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {message ||
              "Your subscription has expired. Please renew or subscribe to continue using the service."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/app/pricing")}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
            >
              View Plans & Pricing
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              Check Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RequireSubscription;
