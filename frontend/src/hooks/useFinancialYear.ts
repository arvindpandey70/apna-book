import { useState, useEffect, useMemo } from "react";
import { useCompany } from "../context/CompanyContext";

export const normalizeFinYear = (yearStr: string) => {
    if (!yearStr) return "";
    const match = yearStr.match(/^(\d{4})-\d{2}(\d{2})$/);
    if (match) {
        return `${match[1]}-${match[2]}`; // Converts 2026-2027 to 2026-27
    }
    return yearStr;
};

export const getFinancialYearRange = (yearStr: string) => {
    const match = yearStr.match(/\d{4}/);
    const year = match ? parseInt(match[0], 10) : new Date().getFullYear();
    const startDate = new Date(year, 3, 1); // April 1 (Month is 0-indexed)
    const endDate = new Date(year + 1, 2, 31, 23, 59, 59, 999); // March 31 of next year
    return { startDate, endDate };
};

export const filterByFinancialYear = <T extends Record<string, any>>(
    data: T[],
    dateField: string,
    finYearStr: string | null
): T[] => {
    if (!finYearStr || finYearStr === "All-Years" || finYearStr === "All Years") return data;
    if (!Array.isArray(data)) return data;

    const { startDate, endDate } = getFinancialYearRange(finYearStr);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    return data.filter((item) => {
        const dStr = item[dateField];
        if (!dStr) return false;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return false;
        return d.getTime() >= startTime && d.getTime() <= endTime;
    });
};

export const getAvailableFinYears = (startYear: string | number = 2020) => {
    const currentYear = new Date().getFullYear();
    const isPastMarch = new Date().getMonth() >= 3;
    const endFinYear = isPastMarch ? currentYear : currentYear - 1;
    const start = typeof startYear === 'string' ? parseInt(startYear.match(/\d{4}/)?.[0] || '2020', 10) : startYear;

    const years = [];
    for (let y = endFinYear + 2; y >= start; y--) {
        years.push(`${y}-${y + 1}`);
    }
    return years;
};

export const getFinancialYearDefaults = (finYearStr: string) => {
    const { startDate, endDate } = getFinancialYearRange(finYearStr || "2024-25");

    const today = new Date();
    let defaultDate = today;

    if (today < startDate) defaultDate = startDate;
    if (today > endDate) defaultDate = endDate;

    // Use local ISO format without timezone shift issues
    const formatDate = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    return {
        minDate: formatDate(startDate),
        maxDate: formatDate(endDate),
        defaultDate: formatDate(defaultDate)
    };
};

export const useFinancialYear = () => {
    const { companyInfo } = useCompany();
    const [selectedFinYear, setFinYear] = useState<string>(() => {
        return localStorage.getItem("selectedFinYear") || "";
    });

    useEffect(() => {
        let storedFinYear = localStorage.getItem("selectedFinYear");
        if (storedFinYear) {
            // Normalize existing stored fin year in case it was stored as YYYY-YYYY
            const normalized = normalizeFinYear(storedFinYear);
            if (normalized !== storedFinYear) {
                localStorage.setItem("selectedFinYear", normalized);
                storedFinYear = normalized;
                setFinYear(normalized);
            }
        }

        if (storedFinYear === null && companyInfo?.financialYear) {
            const normalized = normalizeFinYear(companyInfo.financialYear);
            setFinYear(normalized);
            localStorage.setItem("selectedFinYear", normalized);
        } else if (storedFinYear === null) {
            const currentYear = new Date().getFullYear();
            const isPastMarch = new Date().getMonth() >= 3;
            const y = isPastMarch ? currentYear : currentYear - 1;
            const fy = `${y}-${(y + 1).toString().slice(2)}`;
            setFinYear(fy);
            localStorage.setItem("selectedFinYear", fy);
        }
    }, [companyInfo]);

    const setSelectedFinYear = (year: string) => {
        setFinYear(year);
        localStorage.setItem("selectedFinYear", year);
        window.dispatchEvent(new Event("finYearChanged"));
    };

    useEffect(() => {
        const handleStorageChange = () => {
            setFinYear(localStorage.getItem("selectedFinYear") || "");
        };
        window.addEventListener("finYearChanged", handleStorageChange);
        return () => window.removeEventListener("finYearChanged", handleStorageChange);
    }, []);

    return { selectedFinYear, setSelectedFinYear };
};

export const useVoucherDateConfig = (selectedFinYear: string) => {
    const { companyInfo } = useCompany();
    const defaults = getFinancialYearDefaults(selectedFinYear);
    
    const config = useMemo(() => {
        // Default to false if undefined (based on user request: "bydefault unchek rahe ga")
        const backDateAllowed = companyInfo?.backDateAllowed === true;
        
        let minDate = defaults.minDate;
        let defaultDate = defaults.defaultDate;
        const isDateReadOnly = !backDateAllowed;
        
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (!backDateAllowed) {
            // If today is within financial year, restrict to today
            if (todayStr >= defaults.minDate && todayStr <= defaults.maxDate) {
                minDate = todayStr;
                defaultDate = todayStr; // Force today
            } else {
                // If today is outside FY, we might have to stick to defaults 
                // but usually backdating disabled means "today" is the only option
                // if they are in the wrong FY, they can't enter at all?
                minDate = defaults.maxDate; 
            }
        }
        
        return {
            ...defaults,
            minDate,
            defaultDate,
            backDateAllowed,
            isDateReadOnly
        };
    }, [defaults, companyInfo?.backDateAllowed]);

    return config;
};
