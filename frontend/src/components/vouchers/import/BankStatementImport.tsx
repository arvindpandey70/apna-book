import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Upload,
  FileText,
  Download,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Edit3,
  Check,
  X,
  Sparkles,
  Layers,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx-js-style";
import axios from "axios";
import Swal from "sweetalert2";
import * as pdfjsLib from "pdfjs-dist";
import * as Tesseract from "tesseract.js";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ImportedRow {
  Date: string;
  Particulars: string;
  Narration: string;
  Debit: number;
  Credit: number;
  Balance: number | string;
  "Reference number": string;
  SimulatedVoucherNumber?: string;
  VoucherTargetType: "payment" | "receipt" | "contra" | "journal" | "error";
  particularsMatch: boolean;
  status: "pending" | "importing" | "imported" | "error";
  errorMessage?: string;
  particularsId?: string | number;
  isDuplicate?: boolean;
  duplicateVoucherNo?: string;
  skipImport?: boolean;
}

const isBankLedger = (ledger: any, groupsList: any[] = []): boolean => {
  if (!ledger) return false;

  const groupName = String(
    ledger.groupName || ledger.group_name || ledger.group || ""
  )
    .toLowerCase()
    .trim();
  const groupType = String(
    ledger.groupType || ledger.group_type || ""
  )
    .toLowerCase()
    .trim();
  const groupId = String(ledger.groupId || ledger.group_id || "");

  // Direct group name matches
  if (
    groupName === "bank accounts" ||
    groupName === "bank account" ||
    groupName === "bank od a/c" ||
    groupName === "bank od account" ||
    groupName.includes("bank account")
  ) {
    return true;
  }

  // Direct group type matches
  if (groupType === "bank") {
    return true;
  }

  // Known system group IDs (-113 for Bank Accounts, 11 for Bank Accounts in defaultData, -114 for Bank OD A/c)
  if (groupId === "-113" || groupId === "11" || groupId === "-114") {
    return true;
  }

  // Check against ledgerGroups list if available
  if (groupsList && groupsList.length > 0) {
    const groupObj = groupsList.find((g) => String(g.id) === groupId);
    if (groupObj) {
      const gName = String(groupObj.name || "").toLowerCase().trim();
      const gType = String(groupObj.type || "").toLowerCase().trim();
      if (
        gName.includes("bank account") ||
        gName === "bank accounts" ||
        gType === "bank"
      ) {
        return true;
      }
    }
  }

  return false;
};

const isBankLedgerMatch = (ledgerName: string, bankName: string): boolean => {
  if (!ledgerName || !bankName) return false;
  const lName = String(ledgerName).toLowerCase().replace(/\s+/g, " ").trim();
  const bName = String(bankName).toLowerCase().replace(/\s+/g, " ").trim();

  if (lName === bName) return true;

  const synonymGroups = [
    ["state bank of india", "sbi", "state bank"],
    ["hdfc bank", "hdfc"],
    ["icici bank", "icici"],
    ["axis bank", "axis"],
    ["punjab national bank", "pnb"],
    ["bank of baroda", "bob"],
    ["canara bank", "canara"],
    ["union bank of india", "union bank"],
    ["kotak mahindra bank", "kotak bank", "kotak"],
    ["idbi bank", "idbi"],
  ];

  for (const group of synonymGroups) {
    const bMatch = group.some(
      (syn) => bName === syn || bName.includes(syn) || syn.includes(bName)
    );
    if (bMatch) {
      const lMatch = group.some(
        (syn) => lName === syn || lName.includes(syn) || syn.includes(lName)
      );
      if (lMatch) return true;
    }
  }

  if (lName.includes(bName) || bName.includes(lName)) {
    return true;
  }

  return false;
};

const BankStatementImport: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const [ledgers, setLedgers] = useState<any[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<any[]>([]);
  const [excelBankName, setExcelBankName] = useState<string>("");
  const [excelBankMatch, setExcelBankMatch] = useState<boolean>(false);
  const [excelBankId, setExcelBankId] = useState<string | number | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAIFile, setSelectedAIFile] = useState<File | null>(null);
  const [importedRows, setImportedRows] = useState<ImportedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const [aiProcessingStage, setAiProcessingStage] = useState("");
  const [aiProgress, setAiProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [aiDragActive, setAiDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "import" | "preview" | "templates"
  >("import");
  const [isMatchingDB, setIsMatchingDB] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });

  // Premium OCR & Duplicates States
  const [daybookVouchers, setDaybookVouchers] = useState<any[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ImportedRow>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  useEffect(() => {
    fetchLedgers();
    fetchLedgerGroups();
    fetchDaybookVouchers();
  }, [companyId, ownerType, ownerId]);

  const bankAccountLedgers = useMemo(() => {
    return ledgers.filter((l) => isBankLedger(l, ledgerGroups));
  }, [ledgers, ledgerGroups]);

  const fetchLedgerGroups = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/ledger-groups`,
        {
          params: {
            company_id: companyId,
            owner_type: ownerType,
            owner_id: ownerId,
          },
        }
      );
      setLedgerGroups((response.data as any[]) || []);
    } catch (error) {
      console.error("Error fetching ledger groups:", error);
    }
  };

  const fetchLedgers = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/ledger`,
        {
          params: {
            company_id: companyId,
            owner_type: ownerType,
            owner_id: ownerId,
          },
        }
      );
      setLedgers((response.data as any[]) || []);
    } catch (error) {
      console.error("Error fetching ledgers:", error);
    }
  };

  const fetchDaybookVouchers = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/daybookTable2`,
        {
          params: {
            company_id: companyId,
            owner_type: ownerType,
            owner_id: ownerId,
          },
        }
      );
      setDaybookVouchers((response.data as any[]) || []);
    } catch (error) {
      console.error("Error fetching daybook vouchers:", error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isExcel = file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel";
    const isCsv = file.type === "text/csv" || file.name.endsWith(".csv");

    if (!isExcel && !isCsv && !isPdf) {
      Swal.fire({
        icon: 'error',
        title: 'Invalid File',
        text: 'Please select a valid Excel (.xlsx, .xls), CSV or PDF file'
      });
      return;
    }

    setSelectedFile(file);
    if (isPdf) {
      processPdfFile(file);
    } else {
      processFile(file);
    }
  };

  const handleAIDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setAiDragActive(true);
    } else if (e.type === "dragleave") {
      setAiDragActive(false);
    }
  };

  const handleAIDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAiDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAIFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleAIFileSelect = (file: File) => {
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      Swal.fire({
        icon: 'error',
        title: 'Invalid File',
        text: 'Please select a valid PDF or Image file for AI Extraction.'
      });
      return;
    }

    setSelectedAIFile(file);
    processAIFile(file);
  };

  const extractDateString = (str: string): string => {
    if (!str) return "";
    const dateRegexes = [
      /\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}/,
      /\d{1,2}\s*[-/]\s*[a-zA-Z]{3,9}\s*[-/]\s*\d{2,4}/,
      /\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4}/,
      /\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}/,
      /[a-zA-Z]{3,9}\s+\d{1,2},?\s+\d{2,4}/,
      /\d{1,2},?\s+[a-zA-Z]{3,9},?\s+\d{2,4}/,
    ];
    for (const rx of dateRegexes) {
      const match = str.match(rx);
      if (match) {
        return match[0].trim();
      }
    }
    return "";
  };

  const formatDate = (dateValue: unknown): string => {
    if (!dateValue) return "";
    try {
      if (typeof dateValue === "number") {
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        return date.toISOString().split("T")[0];
      }
      if (typeof dateValue === "string") {
        const extracted = extractDateString(dateValue);
        if (extracted) {
          if (/\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4}/.test(extracted)) {
            const parts = extracted.split(/\s+/);
            if (parts.length === 3) {
              let day = parts[0].padStart(2, "0");
              let month = parts[1];
              let year = parts[2];
              if (year.length === 2) year = "20" + year;

              const months = [
                "jan",
                "feb",
                "mar",
                "apr",
                "may",
                "jun",
                "jul",
                "aug",
                "sep",
                "oct",
                "nov",
                "dec",
              ];
              const mIdx = months.findIndex((m) =>
                month.toLowerCase().startsWith(m)
              );
              if (mIdx !== -1) {
                month = String(mIdx + 1).padStart(2, "0");
              } else {
                month = month.padStart(2, "0");
              }
              return `${year}-${month}-${day}`;
            }
          }

          const parts = extracted.split(/[-/.]/);
          if (parts.length === 3) {
            let day = parts[0].trim().padStart(2, "0");
            let month = parts[1].trim().padStart(2, "0");
            let year = parts[2].trim();

            // Handle 2-digit years
            if (year.length === 2) {
              year = "20" + year;
            }

            // Handle case where year is first (YYYY-MM-DD)
            if (parts[0].trim().length === 4) {
              return `${parts[0].trim()}-${parts[1]
                .trim()
                .padStart(2, "0")}-${parts[2].trim().padStart(2, "0")}`;
            }

            // Handle text months (e.g. 15-May-2024)
            if (isNaN(Number(month))) {
              const months = [
                "jan",
                "feb",
                "mar",
                "apr",
                "may",
                "jun",
                "jul",
                "aug",
                "sep",
                "oct",
                "nov",
                "dec",
              ];
              const mIdx = months.findIndex((m) =>
                month.toLowerCase().startsWith(m)
              );
              if (mIdx !== -1) {
                month = String(mIdx + 1).padStart(2, "0");
              }
            }

            return `${year}-${month}-${day}`;
          }
        }
      }
      return new Date(dateValue as string).toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const detectDate = (str: string): boolean => {
    if (!str) return false;
    return extractDateString(str) !== "";
  };

  const isStartOfDate = (str: string): boolean => {
    if (!str) return false;
    const clean = str.trim().toLowerCase();

    // E.g. "10 Feb", "09/02", "10-02"
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const hasMonth = months.some((m) => clean.includes(m));

    // Match day/month formats: e.g. "10/02", "10-02", "10.02" or "10 Feb"
    const hasDigits = /\d+/.test(clean);
    const hasSeparators =
      clean.includes("/") || clean.includes("-") || clean.includes(".");

    if (hasDigits && (hasMonth || hasSeparators)) {
      // Ensure it's not JUST a 4-digit year (like "2026")
      const isJustYear = /^\d{4}$/.test(clean);
      if (!isJustYear) {
        return true;
      }
    }
    return false;
  };

  const detectDuplicates = (
    rows: ImportedRow[],
    vouchers: any[]
  ): ImportedRow[] => {
    if (!vouchers || vouchers.length === 0) return rows;

    return rows.map((row) => {
      const rowAmount = row.Debit > 0 ? row.Debit : row.Credit;
      const rowType = row.Debit > 0 ? "payment" : "receipt";

      const match = vouchers.find((v) => {
        // 1. Match date (normalized to YYYY-MM-DD)
        const vDate = v.date
          ? new Date(v.date).toISOString().split("T")[0]
          : "";
        const rDate = row.Date;
        if (vDate !== rDate) return false;

        // 2. Match reference number (if available)
        const vRef = v.reference_no
          ? String(v.reference_no).trim().toLowerCase()
          : "";
        const rRef = row["Reference number"]
          ? String(row["Reference number"]).trim().toLowerCase()
          : "";
        if (vRef && rRef && vRef === rRef) return true;

        // 3. Match debit/credit entry details
        const entryMatch = v.entries?.find((entry: any) => {
          const entryAmt = Number(entry.amount || 0);
          const isAmtMatch = Math.abs(entryAmt - rowAmount) < 0.05;
          const vLedger = entry.ledger_name
            ? entry.ledger_name.toLowerCase().trim()
            : "";
          const rLedger = row.Particulars
            ? row.Particulars.toLowerCase().trim()
            : "";
          return (
            isAmtMatch && (vLedger === rLedger || v.voucher_type === rowType)
          );
        });

        return !!entryMatch;
      });

      if (match) {
        return {
          ...row,
          isDuplicate: true,
          duplicateVoucherNo: match.voucher_number || "Existing",
          skipImport: true, // Skip by default
        };
      }
      return row;
    });
  };

  const handleBankLedgerChange = (selectedId: string) => {
    if (!selectedId) {
      setExcelBankId(null);
      setExcelBankMatch(false);
      return;
    }

    const selectedLedger = ledgers.find(
      (l) => String(l.id) === String(selectedId)
    );
    if (selectedLedger) {
      setExcelBankId(selectedLedger.id);
      setExcelBankMatch(true);

      // Re-evaluate importedRows to clear bank missing error if a valid bank ledger is selected
      setImportedRows((prevRows) =>
        prevRows.map((row) => {
          let newError = row.errorMessage || "";
          newError = newError.replace(/Bank '[^']+' not found\.?/g, "").trim();

          let newStatus = row.status;
          if (!row.particularsMatch) {
            newStatus = "error";
            if (!newError.includes("Ledger")) {
              newError =
                `Ledger '${row.Particulars}' not found.` +
                (newError ? " " + newError : "");
            }
          } else if (!newError) {
            newStatus = "pending";
          }

          return {
            ...row,
            status: newStatus,
            errorMessage: newError || undefined,
          };
        })
      );
    } else {
      setExcelBankId(null);
      setExcelBankMatch(false);
    }
  };

  const mapAndSequenceRows = async (rawRows: any[], extractedBank: string) => {
    setExcelBankName(extractedBank);
    const bankList = bankAccountLedgers.length > 0 ? bankAccountLedgers : ledgers;
    const matchedBankLedger =
      bankList.find((l) => isBankLedgerMatch(l.name, extractedBank)) ||
      ledgers.find((l) => isBankLedgerMatch(l.name, extractedBank));

    setExcelBankMatch(!!matchedBankLedger);
    setExcelBankId(matchedBankLedger ? matchedBankLedger.id : null);

    const processedRows: ImportedRow[] = rawRows.map((row) => {
      const debit = Number(row.Debit || row.debit || 0);
      const credit = Number(row.Credit || row.credit || 0);
      let voucherCol = String(row.Voucher || row.voucher || "")
        .toLowerCase()
        .trim();
      let targetType: ImportedRow["VoucherTargetType"] = "error";

      if (debit > 0) {
        targetType = voucherCol === "contra" ? "contra" : "payment";
      } else if (credit > 0) {
        targetType = voucherCol === "journal" ? "journal" : "receipt";
      }

      const particularsName = String(
        row.Particulars ||
          row.Particular ||
          row.particulars ||
          row.particular ||
          ""
      ).trim();
      const matchedParticulars = ledgers.find(
        (l) => l.name.toLowerCase() === particularsName.toLowerCase()
      );
      const isParticularsMatch = !!matchedParticulars;

      let initialStatus: "pending" | "error" = "pending";
      let initialError = "";

      if (!isParticularsMatch) {
        initialStatus = "error";
        initialError = `Ledger '${particularsName}' not found.`;
      }
      if (!matchedBankLedger) {
        initialStatus = "error";
        initialError +=
          (initialError ? " " : "") + `Bank '${extractedBank}' not found.`;
      }

      const displayParticulars = matchedParticulars
        ? matchedParticulars.name
        : particularsName;

      return {
        Date: formatDate(row.Date || row.date),
        Particulars: displayParticulars,
        Narration: String(row.Narration || row.narration || "").trim(),
        Debit: debit,
        Credit: credit,
        Balance: row.Balance || row.balance || "",
        "Reference number": String(
          row["Reference number"] ||
            row["Reference No"] ||
            row["Reference Number"] ||
            row["Refrance number"] ||
            row.refNo ||
            row.ref ||
            ""
        ).trim(),
        VoucherTargetType: targetType,
        particularsMatch: isParticularsMatch,
        particularsId: matchedParticulars ? matchedParticulars.id : undefined,
        status: initialStatus,
        errorMessage: initialError,
        skipImport: false,
      };
    });

    // Run Duplicate Check
    const rowsWithDuplicates = detectDuplicates(processedRows, daybookVouchers);

    setIsMatchingDB(true);

    try {
      const types = ["payment", "receipt", "contra", "journal"];
      const nextDocs: Record<string, string> = {};

      const firstDate =
        rowsWithDuplicates[0]?.Date || new Date().toISOString().split("T")[0];

      await Promise.all(
        types.map(async (type) => {
          try {
            const res = await axios.get(
              `${import.meta.env.VITE_API_URL}/api/vouchers/next-number`,
              {
                params: {
                  company_id: companyId,
                  owner_type: ownerType,
                  owner_id: ownerId,
                  voucherType: type,
                  date: firstDate,
                },
              }
            );
            const resData = res.data as any;
            if (resData.success) {
              nextDocs[type] = resData.voucherNumber;
            }
          } catch (e) {
            console.error(`Failed to fetch next number for ${type}`);
          }
        })
      );

      const trackers = { ...nextDocs };

      const finalRows = rowsWithDuplicates.map((row) => {
        if (row.VoucherTargetType === "error") return row;

        const currentNum = trackers[row.VoucherTargetType];

        if (currentNum) {
          row.SimulatedVoucherNumber = currentNum;

          const parts = currentNum.split("/");
          if (parts.length === 3) {
            const seq = parseInt(parts[2], 10);
            if (!isNaN(seq)) {
              parts[2] = String(seq + 1).padStart(6, "0");
              trackers[row.VoucherTargetType] = parts.join("/");
            }
          }
        }
        return row;
      });

      setImportedRows(finalRows);
    } catch (err) {
      console.error("Failed to sequence voucher numbers", err);
      setImportedRows(rowsWithDuplicates);
    }

    setActiveTab("preview");
    setTimeout(() => {
      setIsMatchingDB(false);
    }, 1500);
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setProcessingStage("Reading Excel sheet...");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      let headerRowIndex = -1;
      let extractedBankName = "";

      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        if (!row) continue;

        // Check for bank
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || "").trim();
          const lowerCell = cell.toLowerCase();
          if (
            lowerCell === "bank :-" ||
            lowerCell === "bank:-" ||
            lowerCell === "bank:"
          ) {
            if (row[j + 1]) extractedBankName = String(row[j + 1]).trim();
          } else if (lowerCell.startsWith("bank :-")) {
            extractedBankName = cell.substring(7).trim();
          } else if (lowerCell.startsWith("bank:")) {
            extractedBankName = cell.substring(5).trim();
          }
        }

        // Check for header row
        const rowString = row
          .filter(Boolean)
          .map(String)
          .join(" ")
          .toLowerCase();
        if (
          rowString.includes("date") &&
          rowString.includes("particular") &&
          (rowString.includes("debit") || rowString.includes("credit"))
        ) {
          headerRowIndex = i;
        }
      }

      if (!extractedBankName) {
        Swal.fire({
          icon: 'warning',
          title: 'Bank Name Missing',
          text: "Bank name not found at the top of the Excel (format: 'Bank :- Your Bank Name')"
        });
        setIsProcessing(false);
        return;
      }

      if (headerRowIndex === -1) {
        Swal.fire({
          icon: 'error',
          title: 'Headers Missing',
          text: "Could not find table headers (Date, Particulars, Debit, Credit)"
        });
        setIsProcessing(false);
        return;
      }

      const headers = rawData[headerRowIndex] as string[];
      const dataRows = rawData.slice(headerRowIndex + 1);

      const jsonData: any[] = dataRows.map((row) => {
        let obj: any = {};
        headers.forEach((h, i) => {
          if (h) obj[h.trim()] = row[i];
        });
        return obj;
      });

      const rawTxns = jsonData.filter(
        (row) => Number(row.Debit || 0) > 0 || Number(row.Credit || 0) > 0
      );

      await mapAndSequenceRows(rawTxns, extractedBankName);
    } catch (err) {
      console.error("File Read Error:", err);
      Swal.fire({
        icon: 'error',
        title: 'Read Error',
        text: 'Invalid Excel or CSV file!'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getSuspenseLedgerName = () => {
    const suspenseLedger = ledgers.find(
      (l) => l.name.toUpperCase().includes("SUSPENSE")
    );
    return suspenseLedger ? suspenseLedger.name : "SUSPENSE";
  };

  const processAIFile = async (file: File) => {
    setIsAIProcessing(true);
    setAiProcessingStage("AI is analyzing your document...");
    setAiProgress(0);

    // Simulate progress while waiting for AI
    const progressInterval = setInterval(() => {
      setAiProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        // Slower progression as it gets higher
        const increment = prev > 80 ? 1 : prev > 50 ? 5 : 10;
        return prev + increment;
      });
    }, 800);

    try {
      const formData = new FormData();
      formData.append("statementFile", file);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/extract-bank-statement`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }

      const data = await response.json();
      
      if (!data || !data.rows || data.rows.length === 0) {
        throw { error: "AI could not extract valid statement rows." };
      }

      const rawTxns = data.rows.filter(
        (row: any) => Number(row.Debit || 0) > 0 || Number(row.Credit || 0) > 0
      ).map((row: any) => {
        let narrationText = row.Particulars || "";
        if (row.Narration && row.Narration !== row.Particulars) {
          narrationText = narrationText ? `${narrationText} ${row.Narration}` : row.Narration;
        }
        
        return {
          ...row,
          Particulars: getSuspenseLedgerName(),
          Narration: narrationText.trim()
        };
      });

      clearInterval(progressInterval);
      setAiProgress(100);
      
      // Add slight delay so user sees 100%
      setTimeout(async () => {
        await mapAndSequenceRows(rawTxns, data.bankName || "Unknown Bank");
      }, 500);

    } catch (err: any) {
      clearInterval(progressInterval);
      setAiProgress(0);
      console.error("AI Extraction Error:", err);
      
      let title = "AI Extraction Failed";
      let message = err.error || err.message || "Failed to process document with AI!";
      let icon: 'error' | 'warning' = 'error';

      if (err.isQuotaError) {
        title = "AI Limit Reached";
        icon = 'warning';
      } else if (err.isServiceUnavailable) {
        title = "Service Unavailable";
        icon = 'warning';
      }

      Swal.fire({
        icon: icon,
        title: title,
        text: message,
        confirmButtonColor: '#6366f1'
      });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const processPdfFile = async (file: File) => {
    setIsProcessing(true);
    setProcessingStage("Initializing PDF Engine...");

    try {
      const data = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;

      let hasSelectableText = false;
      const pagesData: any[] = [];

      setProcessingStage("Scanning document layout...");
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        if (textContent.items.length > 5) {
          hasSelectableText = true;
        }
        pagesData.push({ page, textContent });
      }

      if (!hasSelectableText) {
        setIsProcessing(false);
        const result = await Swal.fire({
          title: "Scanned PDF Detected",
          text: "This document appears to be a scanned image with no selectable text. Would you like to run OCR text recognition?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#2563eb",
          confirmButtonText: "Yes, Run OCR",
          cancelButtonText: "No, Cancel",
        });

        if (result.isConfirmed) {
          await processPdfOcr(pdf);
        }
        return;
      }

      await parseStructuredPdf(pagesData, pdf);
    } catch (err: any) {
      console.error("PDF Parsing Error:", err);
      Swal.fire(
        "PDF Parse Error",
        err.message || "Failed to process PDF file",
        "error"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const extractAccountName = (text: string): string => {
    const nameRegex =
      /(?:account\s+name|customer\s+name|name)\s*(?::-|:|-)\s*(?::)?\s*(?:mr\.|mrs\.|ms\.|dr\.|shri|smt\.)?\s*([A-Za-z0-9\s.&'-]+)/i;
    const match = text.match(nameRegex);
    if (match && match[1]) {
      let name = match[1].trim();
      name = name.replace(/\s+/g, " ");
      const stopWords = [
        "statement",
        "page",
        "date",
        "address",
        "period",
        "from",
        "to",
        "branch",
        "account",
        "no",
        "number",
      ];
      for (const stopWord of stopWords) {
        const stopIndex = name.toLowerCase().indexOf(" " + stopWord);
        if (stopIndex !== -1) {
          name = name.substring(0, stopIndex).trim();
        }
      }
      name = name.replace(/^(mr|mrs|ms|dr|shri|smt)\s+/i, "").trim();
      return name;
    }
    return "";
  };

  const parseStructuredPdf = async (pagesData: any[], pdf: any) => {
    setProcessingStage("Analyzing columns and coordinates...");
    let allExtractedTxns: any[] = [];
    let detectedBank = "";
    let extractedAccountNameVal = "";

    if (pagesData.length > 0) {
      const originalText = pagesData[0].textContent.items
        .map((i: any) => i.str)
        .join(" ");
      const firstPageText = originalText.toLowerCase();

      const extractedName = extractAccountName(originalText);
      if (extractedName) {
        extractedAccountNameVal = extractedName;
      }

      if (
        firstPageText.includes("state bank of india") ||
        firstPageText.includes("sbi")
      ) {
        detectedBank = "State Bank of India";
      } else if (firstPageText.includes("hdfc")) {
        detectedBank = "HDFC Bank";
      } else if (firstPageText.includes("icici")) {
        detectedBank = "ICICI Bank";
      } else if (firstPageText.includes("axis")) {
        detectedBank = "Axis Bank";
      } else if (
        firstPageText.includes("punjab national bank") ||
        firstPageText.includes("pnb")
      ) {
        detectedBank = "Punjab National Bank";
      } else if (
        firstPageText.includes("bank of baroda") ||
        firstPageText.includes("bob")
      ) {
        detectedBank = "Bank of Baroda";
      } else if (firstPageText.includes("canara")) {
        detectedBank = "Canara Bank";
      } else if (firstPageText.includes("union bank")) {
        detectedBank = "Union Bank of India";
      } else if (firstPageText.includes("idbi")) {
        detectedBank = "IDBI Bank";
      } else if (firstPageText.includes("kotak")) {
        detectedBank = "Kotak Mahindra Bank";
      } else if (firstPageText.includes("yes bank")) {
        detectedBank = "Yes Bank";
      } else if (firstPageText.includes("federal bank")) {
        detectedBank = "Federal Bank";
      }
    }

    if (!detectedBank) {
      detectedBank = "State Bank of India";
    }

    let activeColumnCoords: any = null;
    let currentTxn: any = null;

    for (let p = 0; p < pagesData.length; p++) {
      const { textContent } = pagesData[p];
      const rowsByY: { y: number; items: any[] }[] = [];

      textContent.items.forEach((item: any) => {
        const text = item.str.trim();
        if (!text) return;
        const x = item.transform[4];
        const y = item.transform[5];
        const height = item.height || 10;

        // Restored precise Y-clustering threshold of 5px to prevent collapses/merging of consecutive transactions
        let foundRow = rowsByY.find((r) => Math.abs(r.y - y) <= 5);
        if (!foundRow) {
          foundRow = { y, items: [] };
          rowsByY.push(foundRow);
        }
        foundRow.items.push({ text, x, y, width: item.width || 0, height });
      });

      rowsByY.sort((a, b) => b.y - a.y);

      rowsByY.forEach((row) => {
        row.items.sort((a, b) => a.x - b.x);
      });

      rowsByY.forEach((row) => {
        const merged: any[] = [];
        row.items.forEach((item) => {
          if (merged.length === 0) {
            merged.push({ ...item });
          } else {
            const last = merged[merged.length - 1];
            const gap = item.x - (last.x + last.width);
            // Relaxed gap threshold to 5px to merge split digits/characters without merging columns
            if (gap <= 5) {
              last.text += " " + item.text;
              last.width = item.x + item.width - last.x;
            } else {
              merged.push({ ...item });
            }
          }
        });
        row.items = merged;
      });

      let headerRowIndex = -1;
      let pageColumnCoords = {
        date: -1,
        particulars: -1,
        refNo: -1,
        debit: -1,
        credit: -1,
        balance: -1,
      };

      for (let r = 0; r < Math.min(80, rowsByY.length); r++) {
        const row = rowsByY[r];
        let tempCoords = {
          date: -1,
          particulars: -1,
          refNo: -1,
          debit: -1,
          credit: -1,
          balance: -1,
        };

        row.items.forEach((item) => {
          const center = item.x + item.width / 2;
          const text = item.text.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (text.includes("date") || text === "dt") {
            tempCoords.date = center;
          } else if (
            text.includes("particular") ||
            text.includes("description") ||
            text.includes("narration") ||
            text.includes("remark") ||
            text.includes("detail") ||
            text.includes("transaction") ||
            text === "txn" ||
            text === "info"
          ) {
            tempCoords.particulars = center;
          } else if (
            text.includes("debit") ||
            text.includes("withdrawal") ||
            text.includes("payment") ||
            text === "dr" ||
            text.includes("withdrawn")
          ) {
            tempCoords.debit = center;
          } else if (
            text.includes("credit") ||
            text.includes("deposit") ||
            text.includes("receipt") ||
            text === "cr"
          ) {
            tempCoords.credit = center;
          } else if (
            text.includes("balance") ||
            text === "bal" ||
            text.includes("closing")
          ) {
            tempCoords.balance = center;
          } else if (
            text.includes("ref") ||
            text.includes("cheque") ||
            text.includes("chq") ||
            text.includes("instrument") ||
            text.includes("doc")
          ) {
            tempCoords.refNo = center;
          }
        });

        if (
          tempCoords.date !== -1 &&
          tempCoords.particulars !== -1 &&
          (tempCoords.debit !== -1 ||
            tempCoords.credit !== -1 ||
            tempCoords.balance !== -1)
        ) {
          headerRowIndex = r;
          pageColumnCoords = tempCoords;
          break;
        }
      }

      if (headerRowIndex !== -1) {
        if (!activeColumnCoords) {
          activeColumnCoords = { ...pageColumnCoords };
        } else {
          // Smart coordinate merging to keep previously found columns
          Object.keys(pageColumnCoords).forEach((k) => {
            const key = k as keyof typeof pageColumnCoords;
            const val = pageColumnCoords[key];
            if (val !== -1) {
              activeColumnCoords[key] = val;
            }
          });
        }
      }

      const coords = activeColumnCoords;
      const startIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

      if (!coords || coords.date === -1) {
        continue;
      }

      const getClosestColumn = (item: any) => {
        let closestCol = "";
        let minDiff = Infinity;
        const itemCenter = item.x + item.width / 2;
        Object.entries(coords).forEach(
          ([colName, colCenter]: [string, any]) => {
            if (colCenter === -1) return;
            const diff = Math.abs(itemCenter - colCenter);
            if (diff < minDiff) {
              minDiff = diff;
              closestCol = colName;
            }
          }
        );
        return closestCol;
      };

      for (let r = startIdx; r < rowsByY.length; r++) {
        const row = rowsByY[r];
        const rowString = row.items
          .map((i) => i.text)
          .join(" ")
          .toLowerCase();

        if (
          rowString.includes("transaction total") ||
          rowString.includes("closing balance") ||
          rowString.includes("legends used") ||
          rowString.includes("page ") ||
          rowString.includes("end of statement") ||
          rowString.includes("statement between") ||
          rowString.includes("charge statement") ||
          rowString.includes("total charges")
        ) {
          break;
        }

        const rowData = {
          date: "",
          particulars: "",
          refNo: "",
          debit: "",
          credit: "",
          balance: "",
        };

        row.items.forEach((item) => {
          const col = getClosestColumn(item);
          if (col) {
            if (rowData[col as keyof typeof rowData]) {
              rowData[col as keyof typeof rowData] += " " + item.text;
            } else {
              rowData[col as keyof typeof rowData] = item.text;
            }
          }
        });

        if (isStartOfDate(rowData.date)) {
          if (currentTxn) {
            allExtractedTxns.push({
              Date: currentTxn.Date,
              Particulars: getSuspenseLedgerName(),
              Narration: currentTxn.Particulars,
              Debit: Number(currentTxn.Debit.replace(/[^\d.]/g, "")) || 0,
              Credit: Number(currentTxn.Credit.replace(/[^\d.]/g, "")) || 0,
              Balance: currentTxn.Balance,
              "Reference number": currentTxn.refNo,
            });
          }
          currentTxn = {
            Date: rowData.date,
            Particulars: rowData.particulars,
            Narration: rowData.particulars,
            Debit: rowData.debit,
            Credit: rowData.credit,
            Balance: rowData.balance,
            refNo: rowData.refNo,
          };
        } else if (currentTxn) {
          if (rowData.date) {
            currentTxn.Date += " " + rowData.date;
          }
          if (rowData.particulars) {
            currentTxn.Particulars = currentTxn.Particulars
              ? currentTxn.Particulars + " " + rowData.particulars
              : rowData.particulars;
            currentTxn.Narration = currentTxn.Narration
              ? currentTxn.Narration + " " + rowData.particulars
              : rowData.particulars;
          }
          if (rowData.debit) {
            currentTxn.Debit = currentTxn.Debit
              ? currentTxn.Debit + " " + rowData.debit
              : rowData.debit;
          }
          if (rowData.credit) {
            currentTxn.Credit = currentTxn.Credit
              ? currentTxn.Credit + " " + rowData.credit
              : rowData.credit;
          }
          if (rowData.balance) {
            currentTxn.Balance = currentTxn.Balance
              ? currentTxn.Balance + " " + rowData.balance
              : rowData.balance;
          }
          if (rowData.refNo) {
            currentTxn.refNo = currentTxn.refNo
              ? currentTxn.refNo + " " + rowData.refNo
              : rowData.refNo;
          }
        }
      }
    }

    if (currentTxn) {
      allExtractedTxns.push({
        Date: currentTxn.Date,
        Particulars: getSuspenseLedgerName(),
        Narration: currentTxn.Particulars,
        Debit: Number(currentTxn.Debit.replace(/[^\d.]/g, "")) || 0,
        Credit: Number(currentTxn.Credit.replace(/[^\d.]/g, "")) || 0,
        Balance: currentTxn.Balance,
        "Reference number": currentTxn.refNo,
      });
    }

    if (allExtractedTxns.length === 0) {
      const result = await Swal.fire({
        title: "Could not extract rows",
        text: "We couldn't automatically read the table format. Would you like to try using the OCR fallback scanner?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Yes, Try OCR",
        cancelButtonText: "No, Cancel",
      });
      if (result.isConfirmed) {
        await processPdfOcr(pdf);
      }
      return;
    }

    const validTxns = allExtractedTxns.filter(
      (t) => t.Debit > 0 || t.Credit > 0
    );

    if (validTxns.length === 0) {
      Swal.fire(
        "Warning",
        "No valid transactions with debit or credit amounts were found.",
        "warning"
      );
      return;
    }

    await mapAndSequenceRows(validTxns, detectedBank);
  };

  const processPdfOcr = async (pdf: any) => {
    setIsProcessing(true);
    setSaveProgress({ done: 0, total: pdf.numPages });
    const allOcrTxns: any[] = [];
    let detectedBank = "";
    let extractedAccountNameVal = "";

    // Set up Tesseract worker
    setProcessingStage("Loading OCR modules...");
    const worker = await Tesseract.createWorker();

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setProcessingStage(`Rendering page ${pageNum} for OCR...`);
        const page = await pdf.getPage(pageNum);

        // 2.0x scale for crisp OCR scans
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context!,
          viewport: viewport,
        }).promise;

        setProcessingStage(
          `Running character recognition (Page ${pageNum}/${pdf.numPages})...`
        );
        const {
          data: { text },
        } = await worker.recognize(canvas);

        if (pageNum === 1) {
          const extractedName = extractAccountName(text);
          if (extractedName) {
            extractedAccountNameVal = extractedName;
          }
          const lowerText = text.toLowerCase();
          if (
            lowerText.includes("state bank of india") ||
            lowerText.includes("sbi")
          ) {
            detectedBank = "State Bank of India";
          } else if (lowerText.includes("hdfc")) {
            detectedBank = "HDFC Bank";
          } else if (lowerText.includes("icici")) {
            detectedBank = "ICICI Bank";
          } else if (lowerText.includes("axis")) {
            detectedBank = "Axis Bank";
          } else if (
            lowerText.includes("punjab national bank") ||
            lowerText.includes("pnb")
          ) {
            detectedBank = "Punjab National Bank";
          } else if (
            lowerText.includes("bank of baroda") ||
            lowerText.includes("bob")
          ) {
            detectedBank = "Bank of Baroda";
          } else if (lowerText.includes("canara")) {
            detectedBank = "Canara Bank";
          } else if (lowerText.includes("union bank")) {
            detectedBank = "Union Bank of India";
          } else if (lowerText.includes("idbi")) {
            detectedBank = "IDBI Bank";
          } else if (lowerText.includes("kotak")) {
            detectedBank = "Kotak Mahindra Bank";
          } else if (lowerText.includes("yes bank")) {
            detectedBank = "Yes Bank";
          } else if (lowerText.includes("federal bank")) {
            detectedBank = "Federal Bank";
          }
        }

        const lines = text.split("\n");
        const parsedOcrRows = parseOcrLines(lines);
        parsedOcrRows.forEach((row) => {
          allOcrTxns.push(row);
        });

        setSaveProgress((prev) => ({ ...prev, done: pageNum }));
      }

      if (allOcrTxns.length === 0) {
        Swal.fire(
          "OCR Warning",
          "Tesseract could not identify any transaction lines. Ensure scan quality is adequate.",
          "warning"
        );
        return;
      }

      if (!detectedBank) {
        detectedBank = "State Bank of India";
      }

      const mappedOcrTxns = allOcrTxns.map((t) => ({
        Date: t.date,
        Particulars: getSuspenseLedgerName(),
        Narration: t.particulars,
        Debit: t.debit,
        Credit: t.credit,
        Balance: t.balance,
        "Reference number": t.refNo,
      }));

      await mapAndSequenceRows(mappedOcrTxns, detectedBank);
    } catch (err: any) {
      console.error("OCR Fallback Error:", err);
      Swal.fire(
        "OCR Failed",
        err.message || "Failed during Tesseract scanning",
        "error"
      );
    } finally {
      await worker.terminate();
      setIsProcessing(false);
    }
  };

  const parseOcrLines = (lines: string[]): any[] => {
    const parsedRows: any[] = [];
    const dateRegex =
      /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/][a-zA-Z]{3,9}[-/]\d{2,4}|\d{1,2}\s+[a-zA-Z]{3,9}\s+\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/;

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      const dateMatch = cleanLine.match(dateRegex);
      if (!dateMatch) return;

      const dateStr = dateMatch[1];
      const dateIndex = cleanLine.indexOf(dateStr);
      const afterDate = cleanLine.substring(dateIndex + dateStr.length).trim();
      if (!afterDate) return;

      // Extract numeric amounts at the end of the line (requiring decimals to avoid matching branch codes/account numbers)
      const numberRegex = /(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+(?:\.\d{2}))/g;
      const matches = afterDate.match(numberRegex);

      if (!matches || matches.length < 1) return;

      const amounts = matches.map((m) => m.replace(/,/g, ""));
      const firstAmount = matches[0];
      const particularsIndex = afterDate.indexOf(firstAmount);
      let particulars = afterDate.substring(0, particularsIndex).trim();

      particulars = particulars.replace(/^[-/\\s]+|[-/\\s]+$/g, "").trim();

      let debit = 0;
      let credit = 0;
      let balance = "";
      let refNo = "";

      const refMatch = particulars.match(/\b(\d{8,18})\b/);
      if (refMatch) {
        refNo = refMatch[1];
      }

      if (amounts.length >= 3) {
        const val1 = Number(amounts[amounts.length - 3]);
        const val2 = Number(amounts[amounts.length - 2]);
        const val3 = amounts[amounts.length - 1];

        if (val1 > 0 && val2 === 0) {
          debit = val1;
        } else if (val2 > 0 && val1 === 0) {
          credit = val2;
        } else {
          debit = val1;
          credit = val2;
        }
        balance = val3;
      } else if (amounts.length === 2) {
        const val1 = Number(amounts[amounts.length - 2]);
        const val2 = amounts[amounts.length - 1];
        const lowerLine = cleanLine.toLowerCase();
        const isCredit =
          lowerLine.includes("cr") ||
          lowerLine.includes("deposit") ||
          lowerLine.includes("received") ||
          lowerLine.includes("refund") ||
          lowerLine.includes("interest");
        if (isCredit) {
          credit = val1;
        } else {
          debit = val1;
        }
        balance = val2;
      } else if (amounts.length === 1) {
        const val1 = Number(amounts[0]);
        const lowerLine = cleanLine.toLowerCase();
        const isCredit =
          lowerLine.includes("cr") ||
          lowerLine.includes("deposit") ||
          lowerLine.includes("received") ||
          lowerLine.includes("refund") ||
          lowerLine.includes("interest");
        if (isCredit) {
          credit = val1;
        } else {
          debit = val1;
        }
      }

      parsedRows.push({
        date: dateStr,
        particulars,
        refNo,
        debit,
        credit,
        balance,
      });
    });

    return parsedRows;
  };

  const handleDeleteRow = (index: number) => {
    Swal.fire({
      title: "Are you sure?",
      text: "Do you want to delete this row from the import list?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    }).then((result) => {
      if (result.isConfirmed) {
        setImportedRows((prev) => prev.filter((_, i) => i !== index));
      }
    });
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditValues({ ...importedRows[index] });
  };

  const saveEditing = (index: number) => {
    handleUpdateRow(index, editValues);
    setEditingIndex(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
  };

  const handleUpdateRow = (
    index: number,
    updatedFields: Partial<ImportedRow>
  ) => {
    setImportedRows((prev) => {
      const newRows = [...prev];
      const row = { ...newRows[index], ...updatedFields };

      // Re-evaluate matches and ledger status
      if (updatedFields.Particulars !== undefined) {
        const particularsName = updatedFields.Particulars.trim();
        const matchedParticulars = ledgers.find(
          (l) => l.name.toLowerCase() === particularsName.toLowerCase()
        );
        row.particularsMatch = !!matchedParticulars;
        row.particularsId = matchedParticulars
          ? matchedParticulars.id
          : undefined;
        row.Particulars = matchedParticulars
          ? matchedParticulars.name
          : particularsName;
      }

      const selectedBankLedger = ledgers.find(
        (l) => String(l.id) === String(excelBankId)
      );
      const bankLedgerName = selectedBankLedger
        ? selectedBankLedger.name
        : excelBankName;
      const matchedBankLedger =
        selectedBankLedger ||
        ledgers.find((l) => isBankLedgerMatch(l.name, bankLedgerName));

      let newStatus: "pending" | "error" = "pending";
      let newError = "";

      if (!row.particularsMatch) {
        newStatus = "error";
        newError = `Ledger '${row.Particulars}' not found.`;
      }
      if (!matchedBankLedger) {
        newStatus = "error";
        newError +=
          (newError ? " " : "") + `Bank '${bankLedgerName}' not found.`;
      }

      row.status = newStatus;
      row.errorMessage = newError || undefined;

      newRows[index] = row;
      return newRows;
    });
  };

  const saveImportedVouchers = async () => {
    setIsProcessing(true);
    const selectedBankLedger = ledgers.find(
      (l) => String(l.id) === String(excelBankId)
    );

    if (!selectedBankLedger && !excelBankMatch) {
      Swal.fire({
        icon: "warning",
        title: "Bank Ledger Required",
        text: "Please select a valid Bank Account ledger from the dropdown before importing.",
      });
      setIsProcessing(false);
      return;
    }

    const bankLedgerName = selectedBankLedger
      ? selectedBankLedger.name
      : ledgers.find((l) => isBankLedgerMatch(l.name, excelBankName))?.name ||
        excelBankName;

    // Exclude duplicate rows if skipDuplicates is toggled
    const pendingRows = importedRows.filter(
      (r) => r.status === "pending" && !(skipDuplicates && r.skipImport)
    );
    setSaveProgress({ done: 0, total: pendingRows.length });

    const updatedRows = [...importedRows];

    // Mark matching rows as importing
    updatedRows.forEach((r, i) => {
      if (r.status === "pending" && !(skipDuplicates && r.skipImport)) {
        updatedRows[i] = { ...r, status: "importing" };
      }
    });
    setImportedRows([...updatedRows]);

    let done = 0;

    for (let i = 0; i < importedRows.length; i++) {
      const row = importedRows[i];
      if (row.status !== "pending" || (skipDuplicates && row.skipImport))
        continue;

      let endpoint = "";
      let payload: any = {};

      if (row.VoucherTargetType === "payment") {
        endpoint = "/api/payment_import";
        payload = {
          rows: [
            {
              Date: row.Date,
              "Paid To": row.Particulars,
              "Payment Mode": bankLedgerName,
              Amount: row.Debit,
              Narration: row.Narration,
              "Reference No": row["Reference number"],
            },
          ],
          companyId,
          ownerType,
          ownerId,
        };
      } else if (row.VoucherTargetType === "receipt") {
        endpoint = "/api/receipt_import";
        payload = {
          rows: [
            {
              Date: row.Date,
              "Paid To": row.Particulars,
              "Payment Mode": bankLedgerName,
              Amount: row.Credit,
              Narration: row.Narration,
              "Reference No": row["Reference number"],
            },
          ],
          companyId,
          ownerType,
          ownerId,
        };
      } else if (row.VoucherTargetType === "contra") {
        endpoint = "/api/contra_import";
        payload = {
          rows: [
            {
              Date: row.Date,
              "Debit Ledger": row.Particulars,
              "Credit Ledger": bankLedgerName,
              Amount: row.Debit,
              Narration: row.Narration,
              "Reference No": row["Reference number"],
            },
          ],
          companyId,
          ownerType,
          ownerId,
        };
      } else if (row.VoucherTargetType === "journal") {
        endpoint = "/api/journal_import";
        payload = {
          rows: [
            {
              Date: row.Date,
              "Debit Ledger": bankLedgerName,
              "Credit Ledger": row.Particulars,
              Amount: row.Credit,
              Narration: row.Narration,
              "Reference No": row["Reference number"],
            },
          ],
          companyId,
          ownerType,
          ownerId,
        };
      } else {
        continue;
      }

      try {
        const res = await axios.post(
          `${import.meta.env.VITE_API_URL}${endpoint}`,
          payload
        );
        const resData = res.data as any;
        updatedRows[i] = {
          ...updatedRows[i],
          status: resData.success ? "imported" : "error",
          errorMessage: resData.success ? undefined : "Backend error",
        };
      } catch (err: any) {
        updatedRows[i] = {
          ...updatedRows[i],
          status: "error",
          errorMessage: err.response?.data?.message || err.message || "Failed",
        };
      }

      done++;
      setSaveProgress({ done, total: pendingRows.length });
      setImportedRows([...updatedRows]);
    }

    setIsProcessing(false);

    const savedCount = updatedRows.filter(
      (r) => r.status === "imported"
    ).length;
    const errorCount = updatedRows.filter((r) => r.status === "error").length;

    if (savedCount > 0) {
      Swal.fire({
        icon: "success",
        title: "Import Successful!",
        html: `<b>${savedCount}</b> voucher${
          savedCount > 1 ? "s" : ""
        } saved successfully!${
          errorCount > 0
            ? `<br/><span style="color:#e53e3e">${errorCount} rows had errors.</span>`
            : ""
        }`,
        showConfirmButton: true,
        confirmButtonText: "Great!",
        confirmButtonColor: "#2563eb",
        timer: 4000,
        timerProgressBar: true,
      });
    } else if (errorCount > 0) {
      Swal.fire({
        icon: "error",
        title: "Import Failed",
        text: `${errorCount} rows had errors. Please check and try again.`,
      });
    }
  };

  const downloadTemplate = () => {
    const aoa = [
      ["Bank :-", "Enter Your Bank Name Here"],
      [],
      [
        "Date",
        "Particulars",
        "Narration",
        "Debit",
        "Credit",
        "Balance",
        "Voucher",
        "Reference number",
      ],
      [
        "15/01/2024",
        "Office Expenses",
        "Paid for stationery",
        5000,
        0,
        45000,
        "Payment",
        "CHQ12345",
      ],
      [
        "16/01/2024",
        "Customer A",
        "Received payment",
        0,
        10000,
        55000,
        "Receipt",
        "NEFT6789",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    
    // Add styles to headers
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:H5");
    ws['!rows'] = [{ hpt: 20 }, { hpt: 20 }, { hpt: 35 }]; // Make header row taller
    ws['!cols'] = Array(range.e.c + 1).fill({ wch: 18 }); // Make columns wider

    for (let C = 0; C <= 7; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: 2, c: C });
        if (!ws[cellAddress]) continue;
        ws[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F46E5" } }, // Indigo background
            alignment: { wrapText: true, horizontal: "center", vertical: "center" }
        };
    }
    // Also style the first row Bank header
    const cellA1 = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if(ws[cellA1]) {
        ws[cellA1].s = { font: { bold: true } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Bank_Statement_Template.xlsx");
  };

  const resetImport = () => {
    setSelectedFile(null);
    setImportedRows([]);
    setActiveTab("import");
  };

  return (
    <div className="pt-[56px] px-4">
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <button
            title="Back to Vouchers"
            type="button"
            onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
            className="mr-4 p-2 rounded-full hover:bg-gray-200"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            Intelligent Bank Statement Import
          </h2>
        </div>
        <p className="text-sm text-gray-600">
          Upload bank statements in Excel, CSV, or PDF formats and auto-route to
          Payment, Receipt, Contra, and Journal vouchers.
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            {
              id: "import",
              label: "Import Data",
              icon: <Upload className="h-4 w-4" />,
            },
            {
              id: "preview",
              label: "Preview & Save",
              icon: <FileText className="h-4 w-4" />,
            },
            {
              id: "templates",
              label: "Download Templates",
              icon: <Download className="h-4 w-4" />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(tab.id as "import" | "preview" | "templates")
              }
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "import" && (
        <>
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-teal-500/10 p-6 border border-green-200 rounded-xl shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"></div>
              <div
                className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 mt-2 bg-white/60 backdrop-blur-sm ${
                  dragActive
                    ? "border-green-500 bg-green-50/80 shadow-inner"
                    : "border-green-300 hover:border-green-400 hover:shadow-md"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex justify-center mb-6">
                  <div className="relative bg-white p-4 rounded-full shadow-sm border border-green-100">
                    <FileText className="h-10 w-10 text-green-600" />
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-700 to-teal-700 mb-3 tracking-tight">
                  Standard Data Import
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto text-sm leading-relaxed">
                  Upload your <span className="font-semibold text-green-700">Excel, CSV, or standard PDF</span> statement. For Excel, ensure the Bank Name is at the top prefixed by "Bank :-".
                </p>
                
                {selectedFile && (
                  <div className="mb-6 flex justify-center">
                    <p className="text-sm font-semibold text-green-700 bg-green-100/80 border border-green-200 inline-flex items-center px-4 py-2 rounded-full shadow-sm">
                      <FileText className="h-4 w-4 mr-2" />
                      {selectedFile.name}
                    </p>
                  </div>
                )}
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white font-medium rounded-xl hover:from-green-700 hover:to-teal-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center mx-auto space-x-2 group"
                >
                  <Upload className="h-5 w-5 group-hover:-translate-y-1 transition-transform" />
                  <span>Choose File</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(e) =>
                    e.target.files?.[0] && handleFileSelect(e.target.files[0])
                  }
                  className="hidden"
                  title="Select file for import"
                />
              </div>
            </div>
            {isProcessing && (
              <div className="mt-4 bg-gradient-to-r from-green-50 to-teal-50 border border-green-200 rounded-xl p-4 flex items-center space-x-4 shadow-sm">
                <RefreshCw className="h-5 w-5 text-green-600 animate-spin" />
                <span className="text-green-800 font-medium">
                  {processingStage || "Processing file..."}
                </span>
              </div>
            )}
          </div>

          <div className="relative flex py-8 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 font-medium text-sm uppercase tracking-wider">Or</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <div className="space-y-6">
            {!isAIProcessing ? (
              <div className="bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-indigo-500/10 p-6 border border-purple-200 rounded-xl shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500"></div>
                <div
                  className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 mt-2 bg-white/60 backdrop-blur-sm ${
                    aiDragActive
                      ? "border-purple-500 bg-purple-50/80 shadow-inner"
                      : "border-purple-300 hover:border-purple-400 hover:shadow-md"
                  }`}
                  onDragEnter={handleAIDrag}
                  onDragLeave={handleAIDrag}
                  onDragOver={handleAIDrag}
                  onDrop={handleAIDrop}
                >
                  <div className="flex justify-center mb-6">
                    <div className="relative">
                      <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full blur opacity-40 animate-pulse"></div>
                      <div className="relative bg-white p-4 rounded-full shadow-sm border border-purple-100">
                        <Sparkles className="h-10 w-10 text-purple-600" />
                      </div>
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-indigo-700 mb-3 tracking-tight">
                    AI Statement Extraction
                  </h3>
                  <p className="text-gray-600 mb-4 max-w-md mx-auto text-sm leading-relaxed">
                    Upload any <span className="font-semibold text-purple-700">PDF or Image</span>. Our advanced AI instantly parses complex layouts, identifies tables, and accurately extracts your transactions.
                  </p>
                  
                  <div className="mb-6 flex justify-center">
                    <span className="text-amber-700 font-semibold text-xs tracking-wider uppercase bg-amber-100/80 px-3 py-1.5 rounded-full border border-amber-200 flex items-center shadow-sm">
                      <span className="mr-1">⚠️</span> NOTE:- AI TAKES SOME TIME, PLEASE BE PATIENT
                    </span>
                  </div>
                  
                  {selectedAIFile && (
                    <div className="mb-6 flex justify-center">
                      <p className="text-sm font-semibold text-purple-700 bg-purple-100/80 border border-purple-200 inline-flex items-center px-4 py-2 rounded-full shadow-sm">
                        <FileText className="h-4 w-4 mr-2" />
                        {selectedAIFile.name}
                      </p>
                    </div>
                  )}
                  
                  <button
                    onClick={() => aiFileInputRef.current?.click()}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center mx-auto space-x-2 group"
                  >
                    <Upload className="h-5 w-5 group-hover:-translate-y-1 transition-transform" />
                    <span>Choose Document</span>
                  </button>
                  <input
                    ref={aiFileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) =>
                      e.target.files?.[0] && handleAIFileSelect(e.target.files[0])
                    }
                    className="hidden"
                    title="Select file for AI import"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 rounded-2xl p-6 relative overflow-hidden shadow-2xl border border-indigo-500/30">
                {/* Animated background elements */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
                  <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] animate-[spin_20s_linear_infinite] bg-[conic-gradient(transparent,rgba(168,85,247,0.3),transparent)]"></div>
                </div>
                
                <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
                  {/* Glowing core */}
                  <div className="relative flex items-center justify-center h-16 w-16">
                    <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-purple-400 animate-spin"></div>
                    <div className="absolute inset-1 rounded-full border-b-2 border-l-2 border-indigo-300 animate-[spin_3s_linear_infinite_reverse]"></div>
                    <div className="absolute inset-0 bg-purple-500 rounded-full blur-xl opacity-40 animate-pulse"></div>
                    <Sparkles className="h-6 w-6 text-purple-200 animate-pulse" />
                  </div>
                  
                  {/* Processing Text */}
                  <div className="text-center">
                    <h4 className="text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-indigo-200 font-bold text-lg tracking-wide mb-1">
                      Gemini AI Engine Active
                    </h4>
                    <p className="text-indigo-300/80 text-sm flex items-center justify-center space-x-2">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>{aiProcessingStage || "Extracting transaction data..."}</span>
                    </p>
                  </div>
                  
                  {/* Progress bar simulation */}
                  <div className="w-full max-w-xs bg-indigo-950/50 rounded-full h-1.5 mt-2 overflow-hidden border border-indigo-800/50">
                    <div className="bg-gradient-to-r from-purple-500 to-indigo-400 h-1.5 rounded-full transition-all duration-500 ease-out animate-[pulse_2s_ease-in-out_infinite]" style={{ width: `${aiProgress}%` }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "preview" && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Preview Bank Statement Rows
              </h3>
              <p className="text-sm text-gray-600">
                Review extracted data and resolve missing ledgers before
                importing. Hover on rows to Edit/Delete.
              </p>
              <div className="mt-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm max-w-md">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                  Bank Ledger {excelBankName ? `(Extracted: ${excelBankName})` : ""}
                </label>
                {bankAccountLedgers.length > 0 ? (
                  <div className="relative">
                    <select
                      value={excelBankId ? String(excelBankId) : ""}
                      onChange={(e) => handleBankLedgerChange(e.target.value)}
                      className={`w-full px-3 py-2 text-sm font-medium border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-colors ${
                        excelBankMatch
                          ? "border-green-300 text-green-900 bg-green-50/50 focus:ring-green-500"
                          : "border-amber-300 text-amber-900 bg-amber-50/50 focus:ring-amber-500"
                      }`}
                    >
                      <option value="">-- Select Bank Account Ledger --</option>
                      {bankAccountLedgers.map((ledger) => (
                        <option key={ledger.id} value={ledger.id}>
                          {ledger.name} {ledger.id ? `(ID: ${ledger.id})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                    ⚠️ No Bank Account ledgers found. Please create a Bank Account ledger to proceed.
                  </div>
                )}
                <div className="mt-2 flex items-center space-x-1.5 text-xs">
                  {excelBankMatch ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-green-700 font-medium">✓ Matched in your ledgers</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <span className="text-amber-700 font-medium">
                        {bankAccountLedgers.length > 0
                          ? "Please select a Bank Account ledger from the dropdown"
                          : "No Bank Account ledgers available"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col space-y-3">
              {isProcessing && saveProgress.total > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800 flex items-center space-x-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>
                        Saving vouchers... {saveProgress.done} /{" "}
                        {saveProgress.total}
                      </span>
                    </span>
                    <span className="text-xs text-blue-600">
                      {Math.round(
                        (saveProgress.done / saveProgress.total) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          (saveProgress.done / saveProgress.total) * 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center space-x-2 text-sm text-gray-700 bg-gray-50 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="font-medium text-orange-700 flex items-center space-x-1">
                    <Sparkles className="h-4 w-4" />
                    <span>Skip Potential Duplicates</span>
                  </span>
                </label>
                <button
                  onClick={resetImport}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Start Over
                </button>
                <button
                  onClick={saveImportedVouchers}
                  disabled={
                    isProcessing ||
                    importedRows.filter(
                      (r) =>
                        r.status === "pending" &&
                        !(skipDuplicates && r.skipImport)
                    ).length === 0
                  }
                  className="flex items-center space-x-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors font-medium shadow"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>
                        Save Vouchers (
                        {
                          importedRows.filter(
                            (r) =>
                              r.status === "pending" &&
                              !(skipDuplicates && r.skipImport)
                          ).length
                        }{" "}
                        ready)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {isMatchingDB ? (
            <div className="bg-white border border-gray-200 rounded-lg p-16 flex flex-col items-center justify-center space-y-4 shadow-sm">
              <RefreshCw className="h-12 w-12 text-blue-500 animate-spin" />
              <h3 className="text-xl font-semibold text-gray-900">
                Verifying Ledgers & Checking Duplicates...
              </h3>
              <p className="text-gray-500 text-center max-w-sm">
                Securely scanning your transactions and running pattern matching
                against live ledger accounts.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-900">
                      Ready for Import
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600 mt-2">
                    {
                      importedRows.filter(
                        (v) =>
                          v.status === "pending" &&
                          !(skipDuplicates && v.skipImport)
                      ).length
                    }
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <Layers className="h-5 w-5 text-orange-600" />
                    <span className="font-medium text-orange-900">
                      Duplicates Flagged
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-orange-600 mt-2">
                    {importedRows.filter((v) => v.isDuplicate).length}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <span className="font-medium text-red-900">
                      Errors (Resolve by Editing)
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-red-600 mt-2">
                    {importedRows.filter((v) => v.status === "error").length}
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-900">
                      Imported Successfully
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-green-600 mt-2">
                    {importedRows.filter((v) => v.status === "imported").length}
                  </div>
                </div>
              </div>

              <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                          Import
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Vch No.
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Particulars
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Narration
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Voucher
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase text-right">
                          Debit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase text-right">
                          Credit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase text-right">
                          Balance
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Ref No
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {importedRows.map((row, i) => {
                        const isEditing = editingIndex === i;
                        const rowSkipped = skipDuplicates && row.skipImport;

                        return (
                          <tr
                            key={i}
                            className={`group hover:bg-gray-50 transition-colors ${
                              rowSkipped ? "bg-orange-50/50 opacity-60" : ""
                            }`}
                          >
                            <td className="px-4 py-3 text-sm">
                              <input
                                title="Toggle import row"
                                type="checkbox"
                                disabled={
                                  row.status === "imported" ||
                                  row.status === "importing"
                                }
                                checked={!row.skipImport}
                                onChange={(e) => {
                                  handleUpdateRow(i, {
                                    skipImport: !e.target.checked,
                                  });
                                }}
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {row.status === "error" ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                  Error
                                </span>
                              ) : row.status === "imported" ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                  ✓ Done
                                </span>
                              ) : row.status === "importing" ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex items-center space-x-1 border border-blue-200">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  <span>Saving...</span>
                                </span>
                              ) : rowSkipped ? (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                  Skipped (Duplicate)
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                  Ready
                                </span>
                              )}
                              {row.errorMessage && (
                                <div className="text-xs text-red-600 mt-1 max-w-[150px] break-words">
                                  {row.errorMessage}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-sm text-gray-800 font-mono font-medium">
                              {row.SimulatedVoucherNumber || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {isEditing ? (
                                <input
                                  title="Edit Row Date"
                                  type="date"
                                  value={editValues.Date || ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      Date: e.target.value,
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs"
                                />
                              ) : (
                                row.Date
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {isEditing ? (
                                <select
                                  title="Select Ledger"
                                  value={editValues.Particulars || ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      Particulars: e.target.value,
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs w-full max-w-[180px]"
                                >
                                  <option value="">-- Map Ledger --</option>
                                  {ledgers.map((l) => (
                                    <option key={l.id} value={l.name}>
                                      {l.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span
                                    className={
                                      row.particularsMatch
                                        ? "text-gray-900 font-medium"
                                        : "text-red-600 font-bold"
                                    }
                                  >
                                    {row.Particulars}{" "}
                                    {row.particularsId && (
                                      <span className="text-gray-500 ml-1 text-xs font-normal">
                                        ({row.particularsId})
                                      </span>
                                    )}
                                  </span>
                                  {row.particularsMatch ? (
                                    <span title="Ledger Matched">
                                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                    </span>
                                  ) : (
                                    <span title="Ledger Not Found">
                                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                                    </span>
                                  )}
                                  {row.isDuplicate && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-0.5">
                                      <Sparkles className="h-3 w-3 shrink-0" />
                                      <span>
                                        Duplicate ({row.duplicateVoucherNo})
                                      </span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">
                              {isEditing ? (
                                <input
                                  title="Edit Narration"
                                  type="text"
                                  value={editValues.Narration || ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      Narration: e.target.value,
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs w-full"
                                />
                              ) : (
                                row.Narration
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold capitalize text-blue-700">
                              {isEditing ? (
                                <select
                                  title="Select Voucher Target Type"
                                  value={editValues.VoucherTargetType || ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      VoucherTargetType: e.target.value as any,
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs"
                                >
                                  <option value="payment">payment</option>
                                  <option value="receipt">receipt</option>
                                  <option value="contra">contra</option>
                                  <option value="journal">journal</option>
                                  <option value="error">error</option>
                                </select>
                              ) : (
                                row.VoucherTargetType
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-red-600 font-medium">
                              {isEditing ? (
                                <input
                                  title="Edit Debit Amount"
                                  type="number"
                                  value={editValues.Debit || 0}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      Debit: Number(e.target.value),
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs w-20 text-right"
                                />
                              ) : row.Debit > 0 ? (
                                row.Debit
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-600 font-medium">
                              {isEditing ? (
                                <input
                                  title="Edit Credit Amount"
                                  type="number"
                                  value={editValues.Credit || 0}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      Credit: Number(e.target.value),
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs w-20 text-right"
                                />
                              ) : row.Credit > 0 ? (
                                row.Credit
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-800 font-medium">
                              {isEditing ? (
                                <input
                                  title="Edit Balance"
                                  type="text"
                                  value={editValues.Balance || ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      Balance: e.target.value,
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs w-20 text-right"
                                />
                              ) : row.Balance ? (
                                row.Balance
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {isEditing ? (
                                <input
                                  title="Edit Ref No"
                                  type="text"
                                  value={editValues["Reference number"] || ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      "Reference number": e.target.value,
                                    }))
                                  }
                                  className="px-2 py-1 border rounded text-xs w-24"
                                />
                              ) : (
                                row["Reference number"] || "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center space-x-1">
                                  <button
                                    title="Save row changes"
                                    onClick={() => saveEditing(i)}
                                    className="p-1 text-green-600 hover:bg-green-100 rounded"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    title="Cancel editing"
                                    onClick={cancelEditing}
                                    className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    title="Edit this row inline"
                                    disabled={
                                      row.status === "imported" ||
                                      row.status === "importing"
                                    }
                                    onClick={() => startEditing(i)}
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded disabled:opacity-30"
                                  >
                                    <Edit3 size={16} />
                                  </button>
                                  <button
                                    title="Delete this row"
                                    disabled={
                                      row.status === "imported" ||
                                      row.status === "importing"
                                    }
                                    onClick={() => handleDeleteRow(i)}
                                    className="p-1 text-red-600 hover:bg-red-100 rounded disabled:opacity-30"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "templates" && (
        <div className="space-y-6">
          <div className="border border-gray-200 rounded-lg p-6 max-w-lg shadow-sm bg-white">
            <h4 className="font-semibold text-gray-900 mb-2">
              Bank Statement Template
            </h4>
            <div className="text-sm text-gray-600 mb-4 space-y-2">
              <p>
                <strong>Top of file:</strong> Put{" "}
                <code className="bg-gray-100 p-1">
                  Bank :- Enter Bank Ledger Name
                </code>{" "}
                at the very top.
              </p>
              <p>
                <strong>Required Columns:</strong> Date, Particulars, Narration,
                Debit, Credit, Balance, Voucher, Reference number
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow"
            >
              <Download className="h-4 w-4" />
              <span>Download Template</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankStatementImport;

