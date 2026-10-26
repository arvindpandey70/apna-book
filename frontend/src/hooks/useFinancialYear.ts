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
        years.push(`${y}-${String(y + 1).slice(-2)}`);
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
    const [selectedFinYear, setFinYear] = useState<string>(() => {
        const storedFinYear = localStorage.getItem("selectedFinYear");
        const normalized = storedFinYear ? normalizeFinYear(storedFinYear) : "";
        if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;

        const currentYear = new Date().getFullYear();
        const isPastMarch = new Date().getMonth() >= 3;
        const startYear = isPastMarch ? currentYear : currentYear - 1;
        return `${startYear}-${String(startYear + 1).slice(-2)}`;
    });

    useEffect(() => {
        localStorage.setItem("selectedFinYear", selectedFinYear);
    }, [selectedFinYear]);

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
