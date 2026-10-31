import React, { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../../../context/AppContext";
import { useNavigate, useParams } from "react-router-dom";
import type { Ledger } from "../../../types";
import type { LedgerGroup } from "../../../types";
import { ArrowLeft, Save } from "lucide-react";
import Swal from "sweetalert2";
import { validateGSTIN } from "../../../utils/ledgerUtils";
import { allSystemGroups as baseGroups } from "../../../constants/ledgerGroups";

const LedgerForm: React.FC = () => {
  const { theme } = useAppContext();
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [chekStock, setChekStock] = useState("");


  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const isEditMode = Boolean(id);

  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );

  const [formData, setFormData] = useState<Omit<Ledger, "id">>({
    name: "",
    groupId: "",
    openingBalance: 0,
    closingBalance: 0,
    balanceType: "debit",
    address: "",
    email: "",
    phone: "",
    gstNumber: "",
    panNumber: "",
    tanNumber: "",
    depreciationRate: "",
    percentage: "",
    profitRatio: "",
    state: "",
    district: "",
    pinCode: "",
  });

  const isFixedAssets = useMemo(() => {
    if (!formData.groupId) return false;
    const findGroup =
      ledgerGroups.find((g) => g.id.toString() === formData.groupId.toString()) ||
      baseGroups.find((g) => g.id.toString() === formData.groupId.toString());
    if (findGroup) {
      const normName = findGroup.name.toLowerCase().replace(/[\s-]/g, "");
      return findGroup.id.toString() === "-9" || normName === "fixedassets";
    }
    if (chekStock) {
      return chekStock.toLowerCase().replace(/[\s-]/g, "") === "fixedassets";
    }
    return false;
  }, [formData.groupId, ledgerGroups, chekStock]);

  const isCurrentAssets = useMemo(() => {
    if (!formData.groupId) return false;
    const findGroup =
      ledgerGroups.find((g) => g.id.toString() === formData.groupId.toString()) ||
      baseGroups.find((g) => g.id.toString() === formData.groupId.toString());
    if (findGroup) {
      const normName = findGroup.name.toLowerCase().replace(/[\s-]/g, "");
      return findGroup.id.toString() === "-5" || normName === "currentassets";
    }
    if (chekStock) {
      return chekStock.toLowerCase().replace(/[\s-]/g, "") === "currentassets";
    }
    return false;
  }, [formData.groupId, ledgerGroups, chekStock]);

  const isCapitalAccount = useMemo(() => {
    if (!formData.groupId) return false;
    const findGroup =
      ledgerGroups.find((g) => g.id.toString() === formData.groupId.toString()) ||
      baseGroups.find((g) => g.id.toString() === formData.groupId.toString());
    if (findGroup) {
      const normName = findGroup.name.toLowerCase().replace(/[\s-]/g, "");
      return (
        findGroup.id.toString() === "-4" ||
        normName === "capitalaccount" ||
        (normName.includes("capital") && !normName.includes("workingcapital"))
      );
    }
    if (chekStock) {
      const normCheck = chekStock.toLowerCase().replace(/[\s-]/g, "");
      return (
        normCheck === "capitalaccount" ||
        (normCheck.includes("capital") && !normCheck.includes("workingcapital"))
      );
    }
    return false;
  }, [formData.groupId, ledgerGroups, chekStock]);


  //by default 

  // Indian States list with codes
  const states = [
    { code: "37", name: "Andhra Pradesh" },
    { code: "12", name: "Arunachal Pradesh" },
    { code: "18", name: "Assam" },
    { code: "10", name: "Bihar" },
    { code: "22", name: "Chhattisgarh" },
    { code: "30", name: "Goa" },
    { code: "24", name: "Gujarat" },
    { code: "06", name: "Haryana" },
    { code: "02", name: "Himachal Pradesh" },
    { code: "20", name: "Jharkhand" },
    { code: "29", name: "Karnataka" },
    { code: "32", name: "Kerala" },
    { code: "23", name: "Madhya Pradesh" },
    { code: "27", name: "Maharashtra" },
    { code: "14", name: "Manipur" },
    { code: "17", name: "Meghalaya" },
    { code: "15", name: "Mizoram" },
    { code: "13", name: "Nagaland" },
    { code: "21", name: "Odisha" },
    { code: "03", name: "Punjab" },
    { code: "08", name: "Rajasthan" },
    { code: "11", name: "Sikkim" },
    { code: "33", name: "Tamil Nadu" },
    { code: "36", name: "Telangana" },
    { code: "16", name: "Tripura" },
    { code: "09", name: "Uttar Pradesh" },
    { code: "05", name: "Uttarakhand" },
    { code: "19", name: "West Bengal" },
    { code: "07", name: "Delhi" },
    { code: "01", name: "Jammu and Kashmir" },
    { code: "38", name: "Ladakh" },
  ];



  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Fetch ledger groups
  useEffect(() => {
    const fetchLedgerGroups = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger-groups?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        setLedgerGroups(data);
      } catch (err) {
        console.error("Failed to load ledger groups", err);
      }
    };

    fetchLedgerGroups();
  }, []);

  // Fetch ledger when editing
  useEffect(() => {
    if (!isEditMode || !id) return;

    const fetchLedgerById = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&_t=${Date.now()}`
        );
        const data = await res.json();

        if (res.ok) {
          setFormData({
            name: data.name || "",
            groupId: data.groupId || "",
            openingBalance: data.opening_balance || 0,
            closingBalance: data.closing_balance || 0,
            balanceType: data.balance_type || "debit",
            address: data.address || "",
            email: data.email || "",
            phone: data.phone || "",
            gstNumber: data.gst_number || "",
            panNumber: data.panNumber || data.pan_number || "",
            tanNumber: data.tanNumber || data.tan_number || "",
            depreciationRate: data.depreciationRate ?? data.depreciation_rate ?? "",
            percentage: data.percentage ?? "",
            profitRatio: data.profitRatio ?? data.profit_ratio ?? "",
            state: data.state || "",
            district: data.district || "",
            pinCode: data.pinCode || data.pin_code || "",
          });

          if (data.groupName) {
            setChekStock(data.groupName);
          } else {
            const base = baseGroups.find(
              (g) => g.id.toString() === data.groupId?.toString()
            );
            if (base) setChekStock(base.name);
          }
        } else {
          console.error("Failed to fetch ledger by ID:", data.message);
        }
      } catch (err) {
        console.error("Error fetching ledger by ID:", err);
      }
    };

    fetchLedgerById();
  }, [id, isEditMode, companyId, ownerType, ownerId]);

  // Prefill from context if available
  useEffect(() => {
    if (!isEditMode || !id) return;

    const fetchLedgerById = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&_t=${Date.now()}`
        );
        const data = await res.json();

        if (res.ok && data) {
          setFormData({
            name: data.name || "",
            groupId: data.groupId?.toString() || "",
            openingBalance: Number(data.openingBalance) || 0,
            closingBalance: Number(data.closingBalance) || 0,
            balanceType: data.balanceType || "debit",
            address: data.address || "",
            email: data.email || "",
            phone: data.phone || "",
            gstNumber: data.gstNumber || data.gst_number || "",
            panNumber: data.panNumber || data.pan_number || "",
            tanNumber: data.tanNumber || data.tan_number || "",
            depreciationRate: data.depreciationRate ?? data.depreciation_rate ?? "",
            percentage: data.percentage ?? "",
            profitRatio: data.profitRatio ?? data.profit_ratio ?? "",
            state: data.state || "",
            district: data.district || "",
            pinCode: data.pinCode || data.pin_code || "",
          });

          if (data.groupName) {
            setChekStock(data.groupName);
          }
        }
      } catch (err) {
        console.error("Error fetching ledger:", err);
      }
    };

    fetchLedgerById();
  }, [id, isEditMode, companyId, ownerType, ownerId]);


  // Handle input changes
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    let processedValue: any = value;
    if (name === "gstNumber") {
      processedValue = value.toUpperCase();
    }

    if (name === "groupId") {
      const findGroup =
        ledgerGroups.find((g) => g.id.toString() === value) ||
        baseGroups.find((g) => g.id.toString() === value);

      const isFA = findGroup && (
        findGroup.id.toString() === "-9" ||
        findGroup.name.trim().toLowerCase() === "fixed assets" ||
        findGroup.name.toLowerCase().replace(/[\s-]/g, "") === "fixedassets"
      );

      const isCap = findGroup && (
        findGroup.id.toString() === "-4" ||
        findGroup.name.trim().toLowerCase() === "capital account" ||
        findGroup.name.toLowerCase().replace(/[\s-]/g, "") === "capitalaccount" ||
        (findGroup.name.toLowerCase().includes("capital") && !findGroup.name.toLowerCase().includes("working capital"))
      );

      setFormData((prev) => ({
        ...prev,
        groupId: value,
        depreciationRate: isFA ? prev.depreciationRate : "",
        profitRatio: isCap ? prev.profitRatio : "",
      }));

      if (findGroup) {
        setChekStock(findGroup.name);
      }
      if (errors.groupId) setErrors((prev) => ({ ...prev, groupId: "" }));
      if (errors.depreciationRate) setErrors((prev) => ({ ...prev, depreciationRate: "" }));
      if (errors.percentage) setErrors((prev) => ({ ...prev, percentage: "" }));
      if (errors.profitRatio) setErrors((prev) => ({ ...prev, profitRatio: "" }));
      return;
    }

    if (name === "depreciationRate") {
      setFormData((prev) => ({
        ...prev,
        depreciationRate: value,
      }));
      if (errors.depreciationRate) {
        setErrors((prev) => ({ ...prev, depreciationRate: "" }));
      }
      return;
    }

    if (name === "percentage") {
      setFormData((prev) => ({
        ...prev,
        percentage: value,
      }));
      if (errors.percentage) {
        setErrors((prev) => ({ ...prev, percentage: "" }));
      }
      return;
    }

    if (name === "profitRatio") {
      setFormData((prev) => ({
        ...prev,
        profitRatio: value,
      }));
      if (errors.profitRatio) {
        setErrors((prev) => ({ ...prev, profitRatio: "" }));
      }
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? parseFloat(value) || 0 : processedValue,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleGstBlur = async () => {
    if (!formData.gstNumber.trim()) return;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ledger/check-duplicate?gst_number=${encodeURIComponent(
          formData.gstNumber.trim()
        )}&company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}${
          isEditMode ? `&exclude_id=${id}` : ""
        }`
      );
      const data = await res.json();

      if (data.exists) {
        setErrors((prev) => ({
          ...prev,
          gstNumber: `GSTIN already exists for ledger: ${data.ledgerName}`,
        }));
      }
    } catch (err) {
      console.error("Duplicate GST check failed:", err);
    }
  };

  // Validate before submit
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) newErrors.name = "Ledger name is required";
    if (!formData.groupId) newErrors.groupId = "Ledger group is required";
    if (formData.gstNumber && !validateGSTIN(formData.gstNumber)) {
      newErrors.gstNumber = "Invalid GSTIN/UIN format";
    }

    if (isFixedAssets && formData.depreciationRate !== "" && formData.depreciationRate !== null && formData.depreciationRate !== undefined) {
      const rate = Number(formData.depreciationRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        newErrors.depreciationRate = "DEPRECIATION Rate must be between 0 and 100";
      }
    }

    if (isCurrentAssets && formData.percentage !== "" && formData.percentage !== null && formData.percentage !== undefined) {
      const pct = Number(formData.percentage);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        newErrors.percentage = "Percentage must be a valid number between 0 and 100";
      }
    }

    if (isCapitalAccount && formData.profitRatio !== "" && formData.profitRatio !== null && formData.profitRatio !== undefined) {
      const pr = Number(formData.profitRatio);
      if (isNaN(pr) || pr < 0) {
        newErrors.profitRatio = "Profit Ratio must be a valid positive number";
      }
    }

    if (errors.name) newErrors.name = errors.name;
    if (errors.gstNumber) newErrors.gstNumber = errors.gstNumber;
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Create ledger
  const createLedger = async () => {
    try {
      const payload = {
        ...formData,
        depreciationRate: isFixedAssets && formData.depreciationRate !== "" && formData.depreciationRate !== null ? Number(formData.depreciationRate) : null,
        percentage: isCurrentAssets && formData.percentage !== "" && formData.percentage !== null ? Number(formData.percentage) : null,
        profitRatio: isCapitalAccount && formData.profitRatio !== "" && formData.profitRatio !== null ? Number(formData.profitRatio) : null,
        companyId,
        ownerType,
        ownerId,
      };

      const token = localStorage.getItem("token");
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        Swal.fire(
          "Success",
          data.message || "Ledger created successfully!",
          "success"
        );
        navigate("/app/masters/ledger");
      } else {
        Swal.fire("Error", data.message || "Failed to create ledger", "error");
      }
    } catch (err) {
      console.error("Create error:", err);
      Swal.fire("Error", "Something went wrong!", "error");
    }
  };

  // Update ledger
  const updateLedger = async () => {
    try {
      const payload = {
        ...formData,
        depreciationRate: isFixedAssets && formData.depreciationRate !== "" && formData.depreciationRate !== null ? Number(formData.depreciationRate) : null,
        percentage: isCurrentAssets && formData.percentage !== "" && formData.percentage !== null ? Number(formData.percentage) : null,
        profitRatio: isCapitalAccount && formData.profitRatio !== "" && formData.profitRatio !== null ? Number(formData.profitRatio) : null,
        companyId,
        ownerType,
        ownerId,
      };

      const res = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/ledger/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (res.ok) {
        Swal.fire(
          "Success",
          data.message || "Ledger updated successfully!",
          "success"
        );
        navigate("/app/masters/ledger");
      } else {
        Swal.fire("Error", data.message || "Failed to update ledger", "error");
      }
    } catch (err) {
      console.error("Update error:", err);
      Swal.fire("Error", "Something went wrong!", "error");
    }
  };

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (isEditMode) {
      updateLedger();
    } else {
      createLedger();
    }
  };

  return (
    <div className="pt-[56px] px-4 ">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate("/app/masters/ledger")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">
          {isEditMode ? "Edit" : "Create"} Ledger
        </h1>
      </div>

      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <form onSubmit={handleSubmit}>
          {/* Ledger Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">
                Ledger Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={async () => {
                  if (!formData.name.trim()) return;
                  try {
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger/check-duplicate?name=${encodeURIComponent(formData.name.trim())}&company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}${isEditMode ? `&exclude_id=${id}` : ""}`);
                    const data = await res.json();
                    if (data.exists) setErrors(prev => ({ ...prev, name: "A ledger with this name already exists" }));
                  } catch (err) { console.error(err); }
                }}
                required
                className={`w-full p-2 rounded border ${errors.name
                  ? "border-red-500 focus:border-red-500"
                  : theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none transition-colors`}
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="groupId"
              >
                Under Group
              </label>
              <select
                id="groupId"
                name="groupId"
                value={formData.groupId}
                onChange={handleChange}
                required
                className={`w-full p-2 rounded border ${errors.groupId
                  ? "border-red-500 focus:border-red-500"
                  : theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none transition-colors`}
              >
                <option value="">Select Group</option>
                {ledgerGroups.map((group: LedgerGroup) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
                {baseGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              {errors.groupId && (
                <p className="text-red-500 text-xs mt-1">{errors.groupId}</p>
              )}
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="openingBalance"
              >
                Opening Balance
              </label>
              <input
                type="number"
                id="openingBalance"
                name="openingBalance"
                value={formData.openingBalance}
                onChange={handleChange}
                step="0.01"
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                  : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none transition-colors`}
              />
            </div>



            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="balanceType"
              >
                Balance Type
              </label>
              <div className="flex space-x-4 mt-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="balanceType"
                    value="debit"
                    checked={formData.balanceType === "debit"}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span>Dr (Debit)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="balanceType"
                    value="credit"
                    checked={formData.balanceType === "credit"}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span>Cr (Credit)</span>
                </label>
              </div>
            </div>

            {chekStock && chekStock.toLowerCase().replace(/[\s-]/g, "") === "stockinhand" && (
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="closingBalance"
                >
                  Closing Balance
                </label>
                <input
                  type="number"
                  id="closingBalance"
                  name="closingBalance"
                  value={formData.closingBalance}
                  onChange={handleChange}
                  step="0.01"
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
              </div>
            )}

            {isFixedAssets && (
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="depreciationRate"
                >
                  DEPRECIATION Rate (%)
                </label>
                <input
                  type="number"
                  id="depreciationRate"
                  name="depreciationRate"
                  value={formData.depreciationRate ?? ""}
                  onChange={handleChange}
                  step="any"
                  min="0"
                  max="100"
                  placeholder="e.g. 10 or 12.5"
                  className={`w-full p-2 rounded border ${errors.depreciationRate
                    ? "border-red-500 focus:border-red-500"
                    : theme === "dark"
                      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                      : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
                {errors.depreciationRate && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.depreciationRate}
                  </p>
                )}
              </div>
            )}

            {isCurrentAssets && (
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="percentage"
                >
                  Percentage (%)
                </label>
                <input
                  type="number"
                  id="percentage"
                  name="percentage"
                  value={formData.percentage ?? ""}
                  onChange={handleChange}
                  step="any"
                  min="0"
                  max="100"
                  placeholder="e.g. 10, 25.5 or 100"
                  className={`w-full p-2 rounded border ${errors.percentage
                    ? "border-red-500 focus:border-red-500"
                    : theme === "dark"
                      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                      : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
                {errors.percentage && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.percentage}
                  </p>
                )}
              </div>
            )}

            {isCapitalAccount && (
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="profitRatio"
                >
                  Profit Ratio
                </label>
                <input
                  type="number"
                  id="profitRatio"
                  name="profitRatio"
                  value={formData.profitRatio ?? ""}
                  onChange={handleChange}
                  step="any"
                  min="0"
                  placeholder="e.g. 50 or 33.33"
                  className={`w-full p-2 rounded border ${errors.profitRatio
                    ? "border-red-500 focus:border-red-500"
                    : theme === "dark"
                      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                      : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
                {errors.profitRatio && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.profitRatio}
                  </p>
                )}
              </div>
            )}

          </div>

          {/* Additional Info */}
          <div
            className={`p-4 mb-6 rounded ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <h3 className="font-semibold mb-4">Additional Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="address"
                >
                  Address
                </label>
                <textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={3}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="email"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full p-2 rounded border ${theme === "dark"
                      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                      : "bg-white border-gray-300 focus:border-blue-500"
                      } outline-none transition-colors`}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="phone"
                  >
                    Phone
                  </label>
                  <input
                    type="text"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full p-2 rounded border ${theme === "dark"
                      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                      : "bg-white border-gray-300 focus:border-blue-500"
                      } outline-none transition-colors`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="gstNumber"
                >
                  GSTIN/UIN Number{" "}
                  <span className="text-xs text-gray-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="gstNumber"
                  name="gstNumber"
                  value={formData.gstNumber}
                  onChange={handleChange}
                  onBlur={handleGstBlur}
                  placeholder="22AAAAA0000A1Z5 or UIN Number"
                  maxLength={15}
                  className={`w-full p-2 rounded border ${errors.gstNumber
                    ? "border-red-500 focus:border-red-500"
                    : theme === "dark"
                      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                      : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
                {errors.gstNumber && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.gstNumber}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  📊 <strong>B2B:</strong> Ledgers with GSTIN/UIN |{" "}
                  <strong>B2C:</strong> Ledgers without GSTIN/UIN
                </p>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="panNumber"
                >
                  PAN Number
                </label>
                <input
                  type="text"
                  id="panNumber"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleChange}
                  placeholder="e.g. ABCDE1234F"
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="tanNumber"
                >
                  TAN Number
                </label>
                <input
                  type="text"
                  id="tanNumber"
                  name="tanNumber"
                  value={formData.tanNumber}
                  onChange={handleChange}
                  placeholder="e.g. ABCD12345E"
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="state"
                >
                  State
                </label>
                <select
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                >
                  <option value="">Select State</option>
                  {states.map((state) => (
                    <option key={state.code} value={`${state.name}(${state.code})`}>
                      {state.name}({state.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="district"
                >
                  District
                </label>
                <input
                  type="text"
                  id="district"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  placeholder="Enter district name"
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="pinCode"
                >
                  PIN Code
                </label>
                <input
                  type="text"
                  id="pinCode"
                  name="pinCode"
                  value={formData.pinCode}
                  onChange={handleChange}
                  placeholder="Enter PIN code"
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none transition-colors`}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate("/app/masters/ledger")}
              className={`px-4 py-2 rounded ${theme === "dark"
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
            >
              <Save size={18} className="mr-1" />
              {isEditMode ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LedgerForm;
