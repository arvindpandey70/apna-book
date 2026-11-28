export interface Parsed26AsMetadata {
  pan: string;
  panStatus: string;
  taxYear: string;
  assesseeName: string;
  summaryTds: number;
  summaryTcs: number;
  demandOutstanding: number;
  refundIssued: number;
  grossTotalAmountPaid: number;
  grossTotalTdsDeducted: number;
  grossTotalTdsDeposited: number;
  totalPages?: number;
}

export interface Parsed26AsEntry {
  partCode: string;
  slNo: string;
  deductorTan: string;
  deductorPan: string;
  deductorName: string;
  sectionCode: string;
  sectionDescription: string;
  transactionDate: string; // YYYY-MM-DD
  transactionDateRaw: string;
  bookingDate: string; // YYYY-MM-DD
  bookingStatus: string;
  remarks: string;
  amountPaid: number;
  tdsDeducted: number;
  tdsDeposited: number;
}

export interface Parsed26AsResult {
  metadata: Parsed26AsMetadata;
  entries: Parsed26AsEntry[];
  deductorsCount: number;
  sectionMap: Record<string, { section: string; description: string }>;
  totalsMatch: boolean;
  calculatedTdsDeposited: number;
  calculatedTdsDeducted: number;
  calculatedAmountPaid: number;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const BUILTIN_SECTION_DESCRIPTIONS: Record<string, { section: string; description: string }> = {
  "1001": { section: "392", description: "Salary - Govt. Employees (other than Union Govt.)" },
  "1002": { section: "392", description: "Salary - Employees other than Govt. Employees" },
  "1003": { section: "392", description: "Salary - Indian Govt. Employees" },
  "1005": { section: "393(1) [Sl. 1(i)]", description: "Commission or brokerage - insurance" },
  "1006": { section: "393(1) [Sl. 1(ii)]", description: "Commission or brokerage - others" },
  "1007": { section: "393(1) [Sl. 2(i)]", description: "Rent paid by Individual/HUF" },
  "1008": { section: "393(1) [Sl. 2(ii).D(a)]", description: "Rent on machinery etc." },
  "1009": { section: "393(1) [Sl. 2(ii).D(b)]", description: "Rent other than machinery etc." },
  "1010": { section: "393(1) [Sl. 3(i)]", description: "TDS on transfer of immovable property" },
  "1019": { section: "393(1) [Sl. 5(i)]", description: "Interest on securities" },
  "1020": { section: "393(1) [Sl. 5(ii).D(a)]", description: "Interest other than securities (Senior Citizen)" },
  "1021": { section: "393(1) [Sl. 5(ii).D(b)]", description: "Interest other than securities (Other than Senior Citizen)" },
  "1022": { section: "393(1) [Sl. 5(iii)]", description: "Interest other than interest on securities" },
  "1023": { section: "393(1) [Sl. 6(i).D(a)]", description: "Payment to Contractor (Individual / HUF)" },
  "1024": { section: "393(1) [Sl. 6(i).D(b)]", description: "Payment to Contractor (Other than Individual / HUF)" },
  "1025": { section: "393(1) [Sl. 6(ii)]", description: "Payment by Individual/HUF to Contractor / Professionals" },
  "1026": { section: "393(1) [Sl. 6(iii).D(a)]", description: "Fees for technical services / Royalty / Call centre" },
  "1027": { section: "393(1) [Sl. 6(iii).D(b)]", description: "Fees for professional services" },
  "1028": { section: "393(1) [Sl. 6(iii).D(b)]", description: "Remuneration / commission to company director" },
  "1029": { section: "393(1) [Sl. 7]", description: "Dividends declared" },
  "1031": { section: "393(1) [Sl. 8(ii)]", description: "Purchase of goods" },
  "1033": { section: "393(1) [Sl. 8(iv)]", description: "Benefit or perquisite from business or profession" },
  "1035": { section: "393(1) [Sl. 8(v)]", description: "E-commerce participant sale of goods/services" },
  "1036": { section: "393(1) [Sl. 8(vi)]", description: "Transfer of virtual digital asset (Individual/HUF)" },
  "1037": { section: "393(1) [Sl. 8(vi)]", description: "Transfer of virtual digital asset (Other than Ind/HUF)" },
  "192": { section: "192", description: "Salary" },
  "194A": { section: "194A", description: "Interest other than interest on securities" },
  "194C": { section: "194C", description: "Payment to Contractors" },
  "194H": { section: "194H", description: "Commission or Brokerage" },
  "194I": { section: "194I", description: "Rent" },
  "194J": { section: "194J", description: "Fees for professional or technical services" },
  "194Q": { section: "194Q", description: "Purchase of goods" },
  "194R": { section: "194R", description: "Benefit or perquisite in business or profession" },
};

export function parseIndianAmount(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw ?? "").trim();
  if (!s || s === "-") return 0;
  const isBracketNeg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),₹\s]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return isBracketNeg ? -Math.abs(n) : n;
}

export function parse26AsDate(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "-") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd-MMM-yyyy (e.g., 30-Sep-2026)
  const mMmm = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{4})$/);
  if (mMmm) {
    const mon = MONTH_MAP[mMmm[2].toLowerCase()];
    if (mon) {
      return `${mMmm[3]}-${mon}-${mMmm[1].padStart(2, "0")}`;
    }
  }

  // dd-MM-yyyy or dd/MM/yyyy
  const mDmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (mDmy) {
    return `${mDmy[3]}-${mDmy[2].padStart(2, "0")}-${mDmy[1].padStart(2, "0")}`;
  }

  return "";
}

const AMOUNT_TOKEN_RE = /\(?-?(?:\d{1,3}(?:,\d{2,3})*|\d+)\.\d{2}\)?/g;
const TAN_RE = /\b([A-Z]{4}\d{5}[A-Z])\b/;
const PAN_RE = /\b([A-Z]{5}\d{4}[A-Z])\b/;
const DATE_RE = /\b(\d{1,2}[-\/](?:[A-Za-z]{3}|\d{2})[-\/]\d{4})\b/g;

function normalizeBookingStatus(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "f" || s === "final") return "Final";
  if (s === "u" || s === "unmatched") return "Unmatched";
  if (s === "m" || s === "matched") return "Matched";
  if (s === "o" || s === "overbooked") return "Overbooked";
  if (s === "p" || s === "pending") return "Pending";
  return raw.trim() || "Final";
}

function isNoiseLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^Data updated till/i.test(l)) return true;
  if (/^Page\s+\d+\s+of\s+\d+/i.test(l)) return true;
  if (/^(TDS|TRACES|Centralized Processing Cell|Government of India|Income Tax Department|Annual Tax Statement)$/i.test(l)) {
    return true;
  }
  if (/^TDS Reconciliation Analysis/i.test(l)) return true;
  if (/^No transactions present\.?$/i.test(l)) return true;
  if (/^S\.No\.\s+(Name of|Section|Acknowledgement|Tax year)/i.test(l)) return true;
  if (/^(Section\s*Code|Transaction\s*Date|Status\s*of|Date\s*of|Remarks|Amount\s*Paid|Tax\s*Deducted|TDS\s*Deposited)/i.test(l)) {
    return true;
  }
  return false;
}

function extractTrailingAmounts(line: string): { amounts: number[]; prefix: string } {
  const matches = [...line.matchAll(AMOUNT_TOKEN_RE)];
  if (matches.length < 3) {
    return { amounts: [], prefix: line };
  }
  const lastThree = matches.slice(-3);
  const firstAmtIndex = lastThree[0].index ?? line.length;
  return {
    amounts: lastThree.map((m) => parseIndianAmount(m[0])),
    prefix: line.slice(0, firstAmtIndex).trim(),
  };
}

/**
 * Parses ordered text lines (already grouped row-by-row from pdfjs-dist or OCR)
 * from a TRACES Form 26AS / Annual Tax Statement PDF.
 */
export function parse26AsLines(rawLines: string[], totalPages?: number): Parsed26AsResult {
  const lines = rawLines
    .map((l) => l.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const metadata: Parsed26AsMetadata = {
    pan: "",
    panStatus: "",
    taxYear: "",
    assesseeName: "",
    summaryTds: 0,
    summaryTcs: 0,
    demandOutstanding: 0,
    refundIssued: 0,
    grossTotalAmountPaid: 0,
    grossTotalTdsDeducted: 0,
    grossTotalTdsDeposited: 0,
    totalPages,
  };

  const sectionMap: Record<string, { section: string; description: string }> = {
    ...BUILTIN_SECTION_DESCRIPTIONS,
  };

  // Pass 1: Extract Metadata, Summary, and Section Code Reference Table
  let inSectionsLookup = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || "";

    // Header fields (handle both side-by-side horizontal PDF rows & label-above-value layouts)
    if (/Permanent Account Number\s*\(PAN\)/i.test(line)) {
      if (!metadata.pan) {
        const panMatch = line.match(PAN_RE)?.[1] || nextLine.match(PAN_RE)?.[1];
        if (panMatch) metadata.pan = panMatch;
      }
      if (!metadata.taxYear && /Tax Year|Assessment Year|Financial Year/i.test(line)) {
        const ty = nextLine.match(/\b(\d{4}-\d{2,4})\b/)?.[1];
        if (ty) metadata.taxYear = ty;
      }
      if (!metadata.panStatus && /Current Status of PAN/i.test(line)) {
        // Strip PAN and Tax Year from nextLine to isolate status text
        const cleanedStatus = nextLine
          .replace(PAN_RE, "")
          .replace(/\b\d{4}-\d{2,4}\b/, "")
          .replace(/\s+/g, " ")
          .trim();
        if (cleanedStatus) metadata.panStatus = cleanedStatus;
      }
    } else if (!metadata.pan && /^PAN\s*[:\-]/i.test(line)) {
      const m = line.match(PAN_RE);
      if (m) metadata.pan = m[1];
    }

    if (!metadata.panStatus && /^Current Status of PAN\b/i.test(line)) {
      const sameLine = line.replace(/^Current Status of PAN\s*[:\-]?/i, "").trim();
      metadata.panStatus = sameLine || nextLine;
    }

    if (!metadata.taxYear) {
      if (/Summary for (?:TY|FY|AY)\s+(\d{4}-\d{2,4})/i.test(line)) {
        metadata.taxYear =
          line.match(/Summary for (?:TY|FY|AY)\s+(\d{4}-\d{2,4})/i)?.[1] || "";
      } else if (/^(?:Tax Year|Assessment Year|Financial Year)\b/i.test(line)) {
        const ty =
          line.match(/\b(\d{4}-\d{2,4})\b/)?.[1] ||
          nextLine.match(/\b(\d{4}-\d{2,4})\b/)?.[1];
        if (ty) metadata.taxYear = ty;
      }
    }

    if (!metadata.assesseeName && /Name of Assessee/i.test(line)) {
      const sameLine = line.replace(/.*Name of Assessee\s*[:\-]?/i, "").trim();
      if (sameLine && !/Address of Assessee/i.test(sameLine)) {
        metadata.assesseeName = sameLine;
      } else if (nextLine && !/Address of Assessee|Current Status|Tax Year/i.test(nextLine)) {
        metadata.assesseeName = nextLine;
      }
    }

    // Summary row: side-by-side labels ("TDS TCS Total TDS/TCS Demand Outstanding TDS/ TCS refund issued")
    if (/^TDS\b/i.test(line) && /\bTCS\b/i.test(line) && /Demand/i.test(line)) {
      const nextAmounts = [...nextLine.matchAll(AMOUNT_TOKEN_RE)].map((m) =>
        parseIndianAmount(m[0])
      );
      if (nextAmounts.length >= 1) metadata.summaryTds = nextAmounts[0];
      if (nextAmounts.length >= 2) metadata.summaryTcs = nextAmounts[1];
      if (nextAmounts.length >= 3) metadata.demandOutstanding = nextAmounts[2];
      if (nextAmounts.length >= 4) metadata.refundIssued = nextAmounts[3];
    } else {
      // Vertical summary fallback
      if (/^TDS$/i.test(line)) {
        const m = nextLine.match(AMOUNT_TOKEN_RE);
        if (m) metadata.summaryTds = parseIndianAmount(m[0]);
      } else if (/^TDS\s+₹?\s*[\d,]+\.\d{2}/i.test(line)) {
        const m = line.match(AMOUNT_TOKEN_RE);
        if (m) metadata.summaryTds = parseIndianAmount(m[0]);
      }

      if (/^TCS$/i.test(line)) {
        const m = nextLine.match(AMOUNT_TOKEN_RE);
        if (m) metadata.summaryTcs = parseIndianAmount(m[0]);
      } else if (/^TCS\s+₹?\s*[\d,]+\.\d{2}/i.test(line)) {
        const m = line.match(AMOUNT_TOKEN_RE);
        if (m) metadata.summaryTcs = parseIndianAmount(m[0]);
      }

      if (/^Total TDS\/TCS Demand Outstanding/i.test(line)) {
        const m = line.match(AMOUNT_TOKEN_RE) || nextLine.match(AMOUNT_TOKEN_RE);
        if (m) metadata.demandOutstanding = parseIndianAmount(m[0]);
      }

      if (/^TDS\/\s*TCS refund issued/i.test(line)) {
        const m = line.match(AMOUNT_TOKEN_RE) || nextLine.match(AMOUNT_TOKEN_RE);
        if (m) metadata.refundIssued = parseIndianAmount(m[0]);
      }
    }

    // Sections reference table (pages 5-9)
    if (/^Sections$/i.test(line)) {
      inSectionsLookup = true;
      continue;
    }
    if (/^Glossary of Codes/i.test(line)) {
      inSectionsLookup = false;
      continue;
    }
    if (inSectionsLookup) {
      const secMatch = line.match(/^(10\d{2})\s+(39[2-4][^\s]*(?:\s+\[[^\]]+\])?(?:\s+Note\s+\d+)?)\s*(.*)$/);
      if (secMatch) {
        const code = secMatch[1];
        const secRef = secMatch[2].trim();
        let desc = secMatch[3].trim();
        // Append next line if description wrapped
        if (
          nextLine &&
          !/^(10\d{2})\s+39[2-4]/.test(nextLine) &&
          !/^(Data updated|Page \d+|Section Code|Glossary)/i.test(nextLine)
        ) {
          desc = `${desc} ${nextLine}`.trim();
        }
        sectionMap[code] = { section: secRef, description: desc };
      }
    }
  }

  // Pass 2: Extract Transactions from PART I, PART II, PART VI (and PART A / B)
  const entries: Parsed26AsEntry[] = [];
  let activePart = "";
  let currentDeductor: { name: string; tan: string; pan: string } | null = null;
  const deductorKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop when reaching Notes / Legends / Sections reference pages
    if (
      /^(Notes for Annual Tax Statement|Legends used in Annual Tax Statement|\*\*Remarks|Sections|Glossary of Codes|Contact Information)$/i.test(
        line
      )
    ) {
      activePart = "";
      currentDeductor = null;
      continue;
    }

    // Detect PART switches
    if (/^PART[\s-]*I\b(?!\s*[IVX])/i.test(line) || /^PART[\s-]*A\b/i.test(line)) {
      activePart = "PART-I";
      currentDeductor = null;
      continue;
    }
    if (/^PART[\s-]*II\b(?!\s*[IVX])/i.test(line)) {
      activePart = "PART-II";
      currentDeductor = null;
      continue;
    }
    if (/^PART[\s-]*III\b/i.test(line)) {
      activePart = "PART-III";
      currentDeductor = null;
      continue;
    }
    if (/^PART[\s-]*IV\b/i.test(line)) {
      activePart = "PART-IV";
      currentDeductor = null;
      continue;
    }
    if (/^PART[\s-]*V\b(?!I)/i.test(line)) {
      activePart = "PART-V";
      currentDeductor = null;
      continue;
    }
    if (/^PART[\s-]*VI\b(?!I)/i.test(line) || /^PART[\s-]*B\b/i.test(line)) {
      activePart = "PART-VI";
      currentDeductor = null;
      continue;
    }
    if (/^PART[\s-]*(VII|VIII|IX|X|XI)\b/i.test(line)) {
      activePart = "";
      currentDeductor = null;
      continue;
    }

    if (!activePart) continue;
    if (isNoiseLine(line)) continue;

    // Gross Total row
    if (/^Gross Total/i.test(line)) {
      const { amounts } = extractTrailingAmounts(line);
      if (amounts.length === 3 && activePart === "PART-I") {
        metadata.grossTotalAmountPaid = amounts[0];
        metadata.grossTotalTdsDeducted = amounts[1];
        metadata.grossTotalTdsDeposited = amounts[2];
      }
      currentDeductor = null;
      continue;
    }

    // Extract trailing 3 amounts (Amount Paid, Tax Deducted, TDS Deposited)
    const { amounts, prefix } = extractTrailingAmounts(line);

    if (amounts.length === 3) {
      const datesInPrefix = [...prefix.matchAll(DATE_RE)].map((m) => m[1]);
      const tanInPrefix = prefix.match(TAN_RE)?.[1] || "";

      // Case A: Child Transaction Row (has transaction date & NO TAN, or starts with X.Y like 1.1)
      const isChildPattern =
        datesInPrefix.length >= 1 && !tanInPrefix && (currentDeductor !== null || /^\d+\.\d+\b/.test(prefix));

      if (isChildPattern && currentDeductor) {
        const slMatch = prefix.match(/^(\d+\.\d+|\d+)\s+(.*)$/);
        const slNo = slMatch ? slMatch[1] : "";
        const restAfterSl = slMatch ? slMatch[2] : prefix;

        // First token after S.No. is Section Code (e.g. 1021, 1033, 194C, 194J, 94C)
        const secTokenMatch = restAfterSl.match(/^([A-Z0-9]{2,6})\s+(.*)$/i);
        const sectionCode = secTokenMatch ? secTokenMatch[1].toUpperCase() : "";

        const txnDateRaw = datesInPrefix[0] || "";
        const bookingDateRaw = datesInPrefix[1] || "";
        const txnDate = parse26AsDate(txnDateRaw);
        const bookingDate = parse26AsDate(bookingDateRaw);

        // Extract booking status & remarks between dates
        let bookingStatus = "Final";
        let remarks = "-";
        if (txnDateRaw) {
          const afterTxnDateIdx = restAfterSl.indexOf(txnDateRaw) + txnDateRaw.length;
          let mid = restAfterSl.slice(afterTxnDateIdx).trim();
          if (bookingDateRaw) {
            const bIdx = mid.indexOf(bookingDateRaw);
            if (bIdx >= 0) {
              const statusPart = mid.slice(0, bIdx).trim();
              if (statusPart) bookingStatus = normalizeBookingStatus(statusPart);
              const afterBooking = mid.slice(bIdx + bookingDateRaw.length).trim();
              remarks = afterBooking || "-";
            }
          } else {
            const statusToken = mid.match(/^([A-Za-z]+)\b/);
            if (statusToken) bookingStatus = normalizeBookingStatus(statusToken[1]);
          }
        }

        const secInfo = sectionMap[sectionCode];

        entries.push({
          partCode: activePart,
          slNo,
          deductorTan: currentDeductor.tan,
          deductorPan: currentDeductor.pan,
          deductorName: currentDeductor.name,
          sectionCode,
          sectionDescription: secInfo ? `${secInfo.section} - ${secInfo.description}` : "",
          transactionDate: txnDate,
          transactionDateRaw: txnDateRaw,
          bookingDate,
          bookingStatus,
          remarks,
          amountPaid: amounts[0],
          tdsDeducted: amounts[1],
          tdsDeposited: amounts[2],
        });
        continue;
      }

      // Case B: Parent Deductor Row (has TAN or integer S.No. before TAN/PAN)
      if (tanInPrefix) {
        const slMatch = prefix.match(/^(\d+)\s+(.*)$/);
        const afterSl = slMatch ? slMatch[2] : prefix;
        const tanIdx = afterSl.indexOf(tanInPrefix);
        let deductorName = afterSl.slice(0, tanIdx).trim();
        const afterTan = afterSl.slice(tanIdx + tanInPrefix.length).trim();
        const deductorPan = afterTan.match(PAN_RE)?.[1] || "";

        // Check if deductor name wrapped onto the immediately preceding non-transaction line
        deductorName = deductorName.replace(/\s+/g, " ").trim();

        currentDeductor = {
          name: deductorName || tanInPrefix,
          tan: tanInPrefix,
          pan: deductorPan,
        };
        deductorKeys.add(`${tanInPrefix}|${currentDeductor.name}`);
        continue;
      }
    }

    // Handle wrapped deductor name continuation line (no amounts, no dates, right after a deductor header)
    if (
      currentDeductor &&
      amounts.length === 0 &&
      !/\d+\.\d+/.test(line) &&
      !/^(S\.No\.|Section|Transaction|Status|Date|Remarks|Amount|Tax|TDS|Gross)/i.test(line) &&
      entries.every((e) => e.deductorTan !== currentDeductor?.tan) &&
      line.length <= 50 &&
      /^[A-Za-z0-9\s.&'()-]+$/.test(line)
    ) {
      currentDeductor.name = `${currentDeductor.name} ${line}`.replace(/\s+/g, " ").trim();
    }
  }

  const calculatedAmountPaid = Number(
    entries.reduce((s, r) => s + r.amountPaid, 0).toFixed(2)
  );
  const calculatedTdsDeducted = Number(
    entries.reduce((s, r) => s + r.tdsDeducted, 0).toFixed(2)
  );
  const calculatedTdsDeposited = Number(
    entries.reduce((s, r) => s + r.tdsDeposited, 0).toFixed(2)
  );

  const expectedTotal =
    metadata.grossTotalTdsDeposited > 0
      ? metadata.grossTotalTdsDeposited
      : metadata.summaryTds;

  const totalsMatch =
    expectedTotal > 0
      ? Math.abs(calculatedTdsDeposited - expectedTotal) < 1
      : entries.length > 0;

  return {
    metadata,
    entries,
    deductorsCount: deductorKeys.size,
    sectionMap,
    totalsMatch,
    calculatedTdsDeposited,
    calculatedTdsDeducted,
    calculatedAmountPaid,
  };
}
