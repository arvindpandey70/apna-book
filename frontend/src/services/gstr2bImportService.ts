import axiosInstance from "../api/axiosInstance";

export interface Gstr2bReturnMetadata {
  gstin?: string;
  rtnprd?: string;
  gendt?: string;
  version?: string;
  chksum?: string;
  itcsumm?: any;
  cpsumm?: any;
}

export interface Gstr2bB2bInvoiceRow {
  sno: number;
  ctin: string;
  trdnm: string;
  inum: string;
  idt: string;
  inv_typ: string;
  pos: string;
  rev: string;
  itcavl: string;
  rsn?: string;
  ims_status?: string;
  txval: number;
  camt: number;
  samt: number;
  iamt: number;
  csamt: number;
  val: number | null;
  supprd?: string;
  supfildt?: string;
}

export interface Gstr2bCdnrNoteRow {
  sno: number;
  ctin: string;
  trdnm: string;
  ntnum: string;
  dt: string;
  typ: string;
  suptyp?: string;
  pos: string;
  rev: string;
  itcavl: string;
  rsn?: string;
  ims_status?: string;
  txval: number;
  camt: number;
  samt: number;
  iamt: number;
  csamt: number;
  val: number | null;
  supprd?: string;
  supfildt?: string;
}

export interface ParsedGstr2bData {
  metadata: Gstr2bReturnMetadata;
  b2bInvoices: Gstr2bB2bInvoiceRow[];
  cdnrNotes: Gstr2bCdnrNoteRow[];
  totalB2bTaxable: number;
  totalB2bTax: number;
  totalB2bVal: number;
  totalCdnrTaxable: number;
  totalCdnrTax: number;
  totalCdnrVal: number;
  itcAvailableTax: number;
  fileName: string;
  fileSizeBytes: number;
  scannedAt: string;
  warning?: string;
}

export interface Gstr2bImportPayload {
  company_id: string | number;
  owner_type?: string;
  owner_id?: string | number | null;
  file_name: string;
  file_size_bytes?: number;
  metadata: Gstr2bReturnMetadata;
  b2b_invoices: Gstr2bB2bInvoiceRow[];
  cdnr_notes: Gstr2bCdnrNoteRow[];
  total_b2b_taxable: number;
  total_b2b_tax: number;
  total_b2b_val: number;
  total_cdnr_taxable: number;
  total_cdnr_tax: number;
  total_cdnr_val: number;
  itc_available_tax: number;
  financial_year?: string;
  raw_json?: any;
}

export interface Gstr2bImportResponse {
  success: boolean;
  message: string;
  importId?: number;
  b2bCount?: number;
  cdnrCount?: number;
  returnPeriod?: string;
  gstin?: string;
}

export interface Gstr2bLatestResponse {
  success: boolean;
  data: ParsedGstr2bData | null;
  message?: string;
}

/**
 * Save complete GSTR-2B JSON data to database
 */
export async function saveGstr2bToDatabase(
  data: ParsedGstr2bData,
  companyId: string | number,
  options?: {
    ownerType?: string;
    ownerId?: string | number | null;
    rawJson?: any;
  }
): Promise<Gstr2bImportResponse> {
  const payload: Gstr2bImportPayload = {
    company_id: companyId,
    owner_type: options?.ownerType || "company",
    owner_id: options?.ownerId || null,
    file_name: data.fileName,
    file_size_bytes: data.fileSizeBytes,
    metadata: data.metadata,
    b2b_invoices: data.b2bInvoices,
    cdnr_notes: data.cdnrNotes,
    total_b2b_taxable: data.totalB2bTaxable,
    total_b2b_tax: data.totalB2bTax,
    total_b2b_val: data.totalB2bVal,
    total_cdnr_taxable: data.totalCdnrTaxable,
    total_cdnr_tax: data.totalCdnrTax,
    total_cdnr_val: data.totalCdnrVal,
    itc_available_tax: data.itcAvailableTax,
    raw_json: options?.rawJson || null,
  };

  const response = await axiosInstance.post<Gstr2bImportResponse>(
    "/gstr2b/import",
    payload
  );
  return response.data;
}

/**
 * Fetch latest persisted GSTR-2B return for the company
 */
export async function fetchLatestGstr2bFromDatabase(
  companyId: string | number,
  returnPeriod?: string
): Promise<ParsedGstr2bData | null> {
  const params: Record<string, any> = { company_id: companyId };
  if (returnPeriod) {
    params.return_period = returnPeriod;
  }

  const response = await axiosInstance.get<Gstr2bLatestResponse>(
    "/gstr2b/latest",
    { params }
  );

  if (response.data && response.data.success && response.data.data) {
    return response.data.data;
  }
  return null;
}

/**
 * List all GSTR-2B imports for the company
 */
export async function listGstr2bImports(
  companyId: string | number
): Promise<any[]> {
  const response = await axiosInstance.get("/gstr2b/list", {
    params: { company_id: companyId },
  });
  if (response.data && response.data.success) {
    return response.data.data || [];
  }
  return [];
}

/**
 * Delete a specific GSTR-2B import
 */
export async function deleteGstr2bImport(
  importId: number,
  companyId: string | number
): Promise<boolean> {
  const response = await axiosInstance.delete(`/gstr2b/import/${importId}`, {
    params: { company_id: companyId },
  });
  return !!(response.data && response.data.success);
}
