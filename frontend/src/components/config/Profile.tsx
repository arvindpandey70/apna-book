import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../home/context/AuthContext";
import type { CompanyInfo } from "../../types";
import Swal from "sweetalert2";
import {
  Building,
  Calendar,
  MapPin,
  Phone,
  Mail,
  CreditCard,
  FileText,
  Globe,
  Hash,
  Save,
  X,
  Lock,
  Shield,
  User,
  Eye,
  EyeOff,
  AlertTriangle,
  Key,
} from "lucide-react";

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

// Reusable Input Field Component
interface InputFieldProps {
  id: string;
  name: string;
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  theme: string;
  title?: string;
  disabled?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  required = false,
  placeholder,
  icon,
  theme,
  title,
  disabled = false,
}) => (
  <div>
    <label className="block text-sm font-medium mb-1" htmlFor={id}>
      {icon && <span className="inline-flex items-center mr-1">{icon}</span>}
      {label}
    </label>
    <input
      type={type}
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      className={`w-full p-2 rounded border ${disabled ? (theme === "dark" ? "bg-gray-600 cursor-not-allowed opacity-70" : "bg-gray-100 cursor-not-allowed opacity-70") : ""} ${theme === "dark"
        ? "bg-gray-700 border-gray-600 focus:border-blue-500 text-white"
        : "bg-white border-gray-300 focus:border-blue-500"
        } outline-none transition-colors`}
    />
  </div>
);

// Reusable Select Field Component
interface SelectFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  options: { value: string; label: string }[];
  icon?: React.ReactNode;
  theme: string;
}
interface Accountant {
  fdSiNo: number;
  fdname: string;
}
const SelectField: React.FC<SelectFieldProps> = ({
  id,
  name,
  label,
  value,
  onChange,
  required = false,
  options,
  icon,
  theme,
}) => (
  <div>
    <label className="block text-sm font-medium mb-1" htmlFor={id}>
      {icon && <span className="inline-flex items-center mr-1">{icon}</span>}
      {label}
    </label>
    <select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      className={`w-full p-2 rounded border ${theme === "dark"
        ? "bg-gray-700 border-gray-600 text-white"
        : "bg-white border-gray-300 text-black"
        } outline-none transition-colors`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const Profile: React.FC = () => {
  const { theme, setCompanyInfo } = useAppContext();
  const { user, updateCompany } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyInfo>({
    name: "",
    financialYear: "",
    booksBeginningYear: "",
    address: "",
    pin: "",
    phoneNumber: "",
    email: "",
    panNumber: "",
    tanNumber: "",
    gstNumber: "",
    vatNumber: "",
    cinNumber: "",
    state: "",
    country: "India",
    taxType: "GST",
    maintainBy: "self",
    accountantName: "",
    accountantId: "",
    caId: "",
    assesseeName: "",
    companyType: "",
  });

  // Security & Access Control States

  const [accessControlEnabled, setAccessControlEnabled] =
    useState<boolean>(false);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);
  const [accountantsList, setAccountantsList] = useState<Accountant[]>([]);
  const [caList, setCaList] = useState<any[]>([]);
  const [initialAccessControl, setInitialAccessControl] = useState<boolean>(false);
  const [vaultEnabled, setVaultEnabled] = useState<boolean>(false);
  const [vaultPassword, setVaultPassword] = useState<string>("");
  const [showVaultPassword, setShowVaultPassword] = useState<boolean>(false);

  const companyId = localStorage.getItem("company_id");
  useEffect(() => {
    const fetchCompanyById = async () => {
      try {
        if (!companyId) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/company/company/${companyId}`
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Failed to fetch company");
        }

        // 🔥 FORM PREFILL HERE
        setCompany({
          name: data.name || "",
          financialYear: data.financialYear || "",
          booksBeginningYear: data.booksBeginningYear || "",
          address: data.address || "",
          pin: data.pin || "",
          phoneNumber: data.phoneNumber || "",
          email: data.email || "",
          panNumber: user?.pan || data.panNumber || "",
          tanNumber: data.tanNumber || "",
          gstNumber: data.gstNumber || "",
          vatNumber: data.vatNumber || "",
          cinNumber: "", // frontend-only
          state: data.state || "",
          country: data.country || "India",
          taxType: data.taxType || "GST",
          maintainBy: data.maintainBy || "self",
          accountantName: data.accountantName || "",
          accountantId: data.accountantId || "",
          caId: data.caId || "",
          assesseeName: data.assesseeName || "",
          companyType: data.companyType || "",
        });

        // Set Security States
        const isAccessEnabled = !!data.accessControlEnabled;
        setAccessControlEnabled(isAccessEnabled);
        setInitialAccessControl(isAccessEnabled);
        setVaultEnabled(!!data.vaultEnabled);
        if (data.username) setUsername(data.username);
      } catch (err) {
        console.error("❌ Fetch company error:", err);
        Swal.fire({
          title: "Error",
          text: "Could not load company details",
          icon: "error",
        });
      }
    };

    fetchCompanyById();
  }, [companyId]);

  // Pre-fill PAN from user
  useEffect(() => {
    if (user && user.pan) {
      setCompany((prev) => ({
        ...prev,
        panNumber: user.pan,
      }));
    }
  }, [user]);

  // Form validation errors

  useEffect(() => {
    const fetchAccountants = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/company/accountants`
        ); // your API endpoint
        const data = await res.json();

        if (res.ok) {
          setAccountantsList(data); // assuming data = [{id: "1", name: "John Doe"}, ...]
        } else {
          console.error("Failed to fetch accountants:", data.message);
        }
      } catch (err) {
        console.error("Network error while fetching accountants:", err);
      }
    };

    const fetchCAs = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ca`);
        const data = await res.json();
        if (res.ok) {
          setCaList(data);
        } else {
          console.error("Failed to fetch CAs:", data.message);
        }
      } catch (err) {
        console.error("Network error while fetching CAs:", err);
      }
    };

    if (company.maintainBy === "accountant") {
      fetchAccountants();
    }
    fetchCAs();
  }, [company.maintainBy]);

  // Form validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "accountantName") {
      const selectedAcc = accountantsList.find((a) => a.fdname === value);
      setCompany((prev) => ({
        ...prev,
        accountantName: value,
        accountantId: selectedAcc ? selectedAcc.fdSiNo : "",
      }));
    } else if (name === "maintainBy") {
      setCompany((prev) => ({
        ...prev,
        maintainBy: value as "self" | "accountant",
        ...(value === "self" ? { accountantName: "", accountantId: "" } : {}),
      }));
    } else {
      setCompany((prev) => ({ ...prev, [name]: value }));
    }

    // Clear errors when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Prepare options for select fields
  const stateOptions = [
    { value: "", label: "Select State" },
    ...states.map(({ code, name }) => ({
      value: `${name}(${code})`,
      label: `${name} (${code})`,
    })),
  ];

  const taxTypeOptions = [
    { value: "GST", label: "GST" },
    { value: "VAT", label: "VAT" },
  ];

  const maintainByOptions = [
    { value: "self", label: "Self Maintenance" },
    { value: "accountant", label: "Accountant" },
  ];

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Basic validations
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const gstRegex =
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const vatRegex = /^[0-9]{11}$/; // Simple VAT regex for demo
    const cinRegex = /^[LUF][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/; // CIN format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;
    const pinRegex = /^[0-9]{6}$/;

    // Required fields
    if (!company.name.trim()) newErrors.name = "Company name is required";
    if (!company.financialYear.trim()) {
      newErrors.financialYear = "Financial year is required";
    } else if (!/^\d{4}-\d{2}$/.test(company.financialYear.trim())) {
      newErrors.financialYear = "Format must be YYYY-YY (e.g., 2024-25)";
    }
    if (!company.booksBeginningYear.trim()) newErrors.booksBeginningYear = "Books beginning year is required";
    if (!company.state) newErrors.state = "State is required";
    if (!company.panNumber.trim())
      newErrors.panNumber = "PAN number is required";
    if (!company.tanNumber.trim()) {
      newErrors.tanNumber = "TAN number is required";
    }
    if (!company.email) newErrors.email = "Email is required";

    // Format validations
    if (company.panNumber && !panRegex.test(company.panNumber)) {
      newErrors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)";
    }

    if (
      company.taxType === "GST" &&
      company.gstNumber &&
      !gstRegex.test(company.gstNumber)
    ) {
      newErrors.gstNumber = "Invalid GST Number format (15 characters)";
    }

    if (
      company.taxType === "VAT" &&
      company.vatNumber &&
      !vatRegex.test(company.vatNumber)
    ) {
      newErrors.vatNumber = "Invalid VAT Number format (11 digits)";
    }

    // CIN validation (frontend only)
    if (company.cinNumber && !cinRegex.test(company.cinNumber)) {
      newErrors.cinNumber = "Invalid CIN format (e.g., L12345XX2021PLC123456)";
    }

    if (company.email && !emailRegex.test(company.email)) {
      newErrors.email = "Invalid email format";
    }

    if (company.phoneNumber && !phoneRegex.test(company.phoneNumber)) {
      newErrors.phoneNumber = "Phone number must be exactly 10 digits";
    }

    if (company.pin && !pinRegex.test(company.pin)) {
      newErrors.pin = "PIN code must be exactly 6 digits";
    }

    // Accountant name validation (made optional)

    // Vault password validation
    if (vaultEnabled && !vaultPassword.trim()) {
      newErrors.vaultPassword =
        "Vault password is required when vault is enabled";
    }

    if (vaultEnabled && vaultPassword.length < 6) {
      newErrors.vaultPassword = "Vault password must be at least 6 characters";
    }

    // Access control validation
    if (accessControlEnabled) {
      if (!username.trim()) {
        newErrors.username =
          "Username is required when access control is enabled";
      }

      if (!password.trim() && !initialAccessControl) {
        newErrors.password =
          "Password is required when access control is enabled";
      }

      if (password.trim() && password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      }

      if (password !== confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleVaultConfirmation = async (): Promise<boolean> => {
    if (!vaultEnabled) return true;

    const { value: enteredPassword } = await Swal.fire({
      title: "Confirm Vault Password",
      text: "Please re-enter your vault password to confirm",
      input: "password",
      inputPlaceholder: "Re-enter vault password",
      showCancelButton: true,
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      inputValidator: (value) => {
        if (!value) {
          return "Vault password is required!";
        }
        if (value !== vaultPassword) {
          return "Vault password does not match!";
        }
        return null;
      },
    });

    return enteredPassword === vaultPassword;
  };

  const handleAccessControlLogin = async (): Promise<boolean> => {
    if (!accessControlEnabled) return true;

    const { value: formValues } = await Swal.fire({
      title: "Company Access Login",
      html: `
        <input id="swal-input1" class="swal2-input" placeholder="Username">
        <input id="swal-input2" class="swal2-input" type="password" placeholder="Password">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Login",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const usernameEl = document.getElementById(
          "swal-input1"
        ) as HTMLInputElement;
        const passwordEl = document.getElementById(
          "swal-input2"
        ) as HTMLInputElement;

        if (!usernameEl.value || !passwordEl.value) {
          Swal.showValidationMessage("Please enter both username and password");
          return null;
        }

        if (usernameEl.value !== username || passwordEl.value !== password) {
          Swal.showValidationMessage("Invalid username or password");
          return null;
        }

        return [usernameEl.value, passwordEl.value];
      },
    });

    return !!formValues;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      Swal.fire({
        title: "Validation Error",
        text: "Please fix the errors before submitting",
        icon: "error",
        confirmButtonColor: "#d33",
      });
      return;
    }

    try {
      // 1️⃣ Vault password confirmation
      const vaultConfirmed = await handleVaultConfirmation();
      if (!vaultConfirmed) return;

      // 2️⃣ Access control login
      const accessConfirmed = await handleAccessControlLogin();
      if (!accessConfirmed) return;

      // 3️⃣ Prepare payload
      const payload = {
        ...company,
        cinNumber: undefined, // frontend only
        vaultEnabled,
        vaultPassword: vaultEnabled ? vaultPassword : null,
        accessControlEnabled,
        username: accessControlEnabled ? username : null,
        password: accessControlEnabled ? password : null,
        employeeId: localStorage.getItem("employee_id"),
      };

      // 4️⃣ PUT API call (UPDATE)
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/company/company/${companyId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to update company");
      }

      // ✅ 5️⃣ SUCCESS MESSAGE (NO REDIRECT)
      await Swal.fire({
        title: "✅ Company Updated",
        text: "Company information updated successfully",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });



      setCompanyInfo(company);

    } catch (err) {
      console.error("Submit error:", err);
      Swal.fire({
        title: "Network Error!",
        text: "Could not update company. Please try again.",
        icon: "error",
        confirmButtonColor: "#d33",
      });
    }
  };


  return (
    <div className="pt-[56px] px-4">
      <div
        className={`max-w-4xl mx-auto p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow-md"
          }`}
      >
        <h2
          className={`text-2xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"
            }`}
        >
          Edit Company
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Basic Company Information */}
          <div
            className={`p-4 rounded-lg mb-6 ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <h3
              className={`text-lg font-semibold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"
                }`}
            >
              <Building size={20} className="inline mr-2" />
              Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <InputField
                  id="name"
                  name="name"
                  label="Company Name *"
                  placeholder="Enter your company name"
                  value={company.name}
                  onChange={handleChange}
                  required
                  icon={<Building size={16} />}
                  theme={theme}
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <InputField
                  id="financialYear"
                  name="financialYear"
                  label="Financial Year *"
                  value={company.financialYear}
                  onChange={handleChange}
                  required
                  icon={<Calendar size={16} />}
                  theme={theme}
                  placeholder="e.g., 2024-25"
                />
                {errors.financialYear && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.financialYear}
                  </p>
                )}
              </div>

              <div>
                <InputField
                  id="assesseeName"
                  name="assesseeName"
                  label="Assessee Name"
                  placeholder="Enter assessee name"
                  value={company.assesseeName || ""}
                  onChange={handleChange}
                  icon={<User size={16} />}
                  theme={theme}
                />
              </div>

              <div>
                <SelectField
                  id="companyType"
                  name="companyType"
                  label="Company Type"
                  value={company.companyType || ""}
                  onChange={handleChange}
                  options={[
                    { value: "", label: "Select Company Type" },
                    { value: "Proprietor", label: "Proprietor" },
                    { value: "Partnership", label: "Partnership" },
                    { value: "Trust", label: "Trust" },
                    { value: "Limited Liability Partnership", label: "Limited Liability Partnership" },
                    { value: "Private Limited Company", label: "Private Limited Company" },
                    { value: "Society", label: "Society" },
                    { value: "HUF", label: "Hindu Undivided Family (HUF)" }
                  ]}
                  icon={<Building size={16} />}
                  theme={theme}
                />
              </div>

              <div>
                <InputField
                  placeholder="e.g., 2024-25"
                  id="booksBeginningYear"
                  name="booksBeginningYear"
                  label="Books Beginning From *"
                  type="date"
                  value={company.booksBeginningYear}
                  onChange={handleChange}
                  required
                  icon={<Calendar size={16} />}
                  theme={theme}
                  title="Enter the beginning financial year"
                />
                {errors.booksBeginningYear && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.booksBeginningYear}
                  </p>
                )}
              </div>

              <div>
                <SelectField
                  id="state"
                  name="state"
                  label="State *"
                  value={company.state || ""}
                  onChange={handleChange}
                  required
                  options={stateOptions}
                  icon={<MapPin size={16} />}
                  theme={theme}
                />
                {errors.state && (
                  <p className="text-red-500 text-sm mt-1">{errors.state}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <InputField
                  placeholder="Enter your address"
                  id="address"
                  name="address"
                  label="Address"
                  value={company.address}
                  onChange={handleChange}
                  icon={<MapPin size={16} />}
                  theme={theme}
                />
              </div>

              <div>
                <InputField
                  id="pin"
                  name="pin"
                  label="PIN Code"
                  value={company.pin}
                  onChange={handleChange}
                  icon={<Hash size={16} />}
                  theme={theme}
                  placeholder="6-digit PIN code"
                />
                {errors.pin && (
                  <p className="text-red-500 text-sm mt-1">{errors.pin}</p>
                )}
              </div>

              <div>
                <InputField
                  id="country"
                  name="country"
                  label="Country"
                  value={company.country || ""}
                  onChange={handleChange}
                  required
                  icon={<Globe size={16} />}
                  theme={theme}
                />
              </div>

              <div>
                <InputField
                  id="phoneNumber"
                  name="phoneNumber"
                  label="Phone Number"
                  type="tel"
                  value={company.phoneNumber}
                  onChange={handleChange}
                  icon={<Phone size={16} />}
                  theme={theme}
                  placeholder="10-digit mobile number"
                />
                {errors.phoneNumber && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.phoneNumber}
                  </p>
                )}
              </div>

              <div>
                <InputField
                  id="email"
                  placeholder="Enter your email"
                  name="email"
                  label="Email"
                  type="email"
                  required
                  value={company.email}
                  onChange={handleChange}
                  icon={<Mail size={16} />}
                  theme={theme}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputField
                    id="panNumber"
                    name="panNumber"
                    label="PAN Number *"
                    value={company.panNumber}
                    onChange={handleChange}
                    icon={<CreditCard size={16} />}
                    theme={theme}
                    placeholder="e.g., ABCDE1234F"
                    disabled={true}
                  />
                  {errors.panNumber && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.panNumber}
                    </p>
                  )}
                </div>

                <div>
                  <InputField
                    id="tanNumber"
                    name="tanNumber"
                    label="TAN Number *"
                    value={company.tanNumber}
                    onChange={handleChange}
                    icon={<CreditCard size={16} />}
                    theme={theme}
                    placeholder="e.g., ABCD12345E"
                  />
                  {errors.tanNumber && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.tanNumber}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <SelectField
                  id="taxType"
                  name="taxType"
                  label="Tax Type"
                  value={company.taxType || "GST"}
                  onChange={handleChange}
                  options={taxTypeOptions}
                  icon={<FileText size={16} />}
                  theme={theme}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="taxNumber"
                >
                  <FileText size={16} className="inline mr-1" />
                  {company.taxType} Number
                </label>
                <input
                  type="text"
                  id="taxNumber"
                  name={company.taxType === "GST" ? "gstNumber" : "vatNumber"}
                  value={
                    company.taxType === "GST"
                      ? company.gstNumber
                      : company.vatNumber
                  }
                  onChange={handleChange}
                  placeholder={`Enter ${company.taxType} number`}
                  title={`Enter the ${company.taxType} Number`}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                    : "bg-white border-gray-300 text-black focus:border-blue-500"
                    } outline-none transition-colors`}
                />

                {((company.taxType === "GST" && errors.gstNumber) ||
                  (company.taxType === "VAT" && errors.vatNumber)) && (
                    <p className="text-red-500 text-sm mt-1">
                      {company.taxType === "GST"
                        ? errors.gstNumber
                        : errors.vatNumber}
                    </p>
                  )}
              </div>

              <div>
                <InputField
                  id="cinNumber"
                  name="cinNumber"
                  label="CIN Number (Optional)"
                  value={company.cinNumber}
                  onChange={handleChange}
                  icon={<FileText size={16} />}
                  theme={theme}
                  placeholder="e.g., L12345XX2021PLC123456"
                  title="Corporate Identification Number"
                />
                {errors.cinNumber && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.cinNumber}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  * CIN is stored locally for display purposes and not saved to
                  database whwn backend itegrate then remove this line
                </p>
              </div>

              <div>
                <SelectField
                  id="maintainBy"
                  name="maintainBy"
                  label="Account Maintain By"
                  value={company.maintainBy || "self"}
                  onChange={handleChange}
                  options={maintainByOptions}
                  icon={<User size={16} />}
                  theme={theme}
                />
              </div>
              {company.maintainBy === "accountant" && (
                <div>
                  <label
                    className="block text-sm font-medium mb-1"
                    htmlFor="accountantName"
                  >
                    <User size={16} className="inline mr-1" />
                    Select Accountant
                  </label>
                  <select
                    id="accountantName"
                    name="accountantName"
                    value={company.accountantName || ""}
                    onChange={handleChange}
                    className={`w-full p-2 rounded border ${theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                      : "bg-white border-gray-300 text-black focus:border-blue-500"
                      } outline-none transition-colors`}
                  >
                    <option value="">-- Select Accountant --</option>
                    {accountantsList.map((acc) => (
                      <option key={acc.fdSiNo} value={acc.fdname}>
                        {acc.fdname}
                      </option>
                    ))}
                  </select>
                  {errors.accountantName && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.accountantName}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="caId"
                >
                  <User size={16} className="inline mr-1" />
                  Select CA
                </label>
                <select
                  id="caId"
                  name="caId"
                  value={company.caId || ""}
                  onChange={handleChange}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                    : "bg-white border-gray-300 text-black focus:border-blue-500"
                    } outline-none transition-colors`}
                >
                  <option value="">-- Select CA --</option>
                  {caList.map((ca) => (
                    <option key={ca.id} value={ca.id}>
                      {ca.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {/* Tally Vault Security */}
          <div
            className={`p-4 rounded-lg mb-6 ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <h3
              className={`text-lg font-semibold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"
                }`}
            >
              <Lock size={20} className="inline mr-2" />
              Apna Book Vault Security (Optional)
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Set Apna Book Vault Password?
                </label>
                <select
                  title="Enable or disable Apna Book Vault password protection"
                  value={vaultEnabled ? "yes" : "no"}
                  onChange={(e) => setVaultEnabled(e.target.value === "yes")}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                    } outline-none transition-colors`}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              {vaultEnabled && (
                <>
                  <div
                    className={`p-3 rounded border-l-4 border-orange-500 ${theme === "dark" ? "bg-orange-900/20" : "bg-orange-50"
                      }`}
                  >
                    <div className="flex items-start">
                      <AlertTriangle
                        size={16}
                        className="text-orange-500 mr-2 mt-0.5"
                      />
                      <div className="text-sm">
                        <strong>Warning:</strong> If you forget your Apna Book Vault
                        password, you will permanently lose access to this
                        company.
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      <Key size={16} className="inline mr-1" />
                      Vault Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showVaultPassword ? "text" : "password"}
                        value={vaultPassword}
                        onChange={(e) => setVaultPassword(e.target.value)}
                        placeholder="Enter vault password (min 6 characters)"
                        className={`w-full p-2 pr-10 rounded border ${theme === "dark"
                          ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                          : "bg-white border-gray-300 text-black focus:border-blue-500"
                          } outline-none transition-colors`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowVaultPassword(!showVaultPassword)}
                        className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {showVaultPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                    {errors.vaultPassword && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.vaultPassword}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Access Control */}
          <div
            className={`p-4 rounded-lg mb-6 ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <h3
              className={`text-lg font-semibold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"
                }`}
            >
              <Shield size={20} className="inline mr-2" />
              Access Control (Optional)
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Enable Access Control?
                </label>
                <select
                  title="Enable or disable user access control for this company"
                  value={accessControlEnabled ? "yes" : "no"}
                  onChange={(e) =>
                    setAccessControlEnabled(e.target.value === "yes")
                  }
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                    } outline-none transition-colors`}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              {accessControlEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      <User size={16} className="inline mr-1" />
                      Username *
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      className={`w-full p-2 rounded border ${theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                        : "bg-white border-gray-300 text-black focus:border-blue-500"
                        } outline-none transition-colors`}
                    />
                    {errors.username && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.username}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      <Key size={16} className="inline mr-1" />
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password (min 8 characters)"
                        className={`w-full p-2 pr-10 rounded border ${theme === "dark"
                          ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                          : "bg-white border-gray-300 text-black focus:border-blue-500"
                          } outline-none transition-colors`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">
                      <Key size={16} className="inline mr-1" />
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className={`w-full p-2 pr-10 rounded border ${theme === "dark"
                          ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                          : "bg-white border-gray-300 text-black focus:border-blue-500"
                          } outline-none transition-colors`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Admin Information */}
          <div
            className={`p-4 rounded-lg mb-6 ${theme === "dark" ? "bg-blue-900/20" : "bg-blue-50"
              }`}
          >
            <h3
              className={`text-lg font-semibold mb-2 ${theme === "dark" ? "text-blue-200" : "text-blue-900"
                }`}
            >
              <User size={20} className="inline mr-2" />
              Admin Rights
            </h3>
            <p
              className={`text-sm ${theme === "dark" ? "text-blue-300" : "text-blue-800"
                }`}
            >
              You will be automatically set as the{" "}
              <strong>Administrator</strong> of this company with full access
              to:
            </p>
            <ul
              className={`mt-2 text-sm space-y-1 ${theme === "dark" ? "text-blue-300" : "text-blue-800"
                }`}
            >
              <li>• Lock/Unlock company access</li>
              <li>• Grant or revoke user permissions</li>
              <li>• Assign roles (Admin, Editor, Viewer)</li>
              <li>• Complete system administration</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate("/app")}
              className={`flex items-center gap-2 px-6 py-2 rounded ${theme === "dark"
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
                } transition-colors`}
            >
              <X size={16} />
              Cancel
            </button>
            <button
              type="submit"
              className={`flex items-center gap-2 px-6 py-2 rounded ${theme === "dark"
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
                } transition-colors`}
            >
              <Save size={16} />
              Update Company
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
