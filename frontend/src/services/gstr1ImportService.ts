import axiosInstance from "../api/axiosInstance";
import type {
  ParsedGstr1Data,
  GstB2bInvoiceRow,
  GstB2cSummaryRow,
  GstReturnMetadata,
} from "../components/reports/gst-scanner/GstJsonScanner";

export interface Gstr1ImportPayload {
  company_id: string | number;
  owner_type?: string;
  owner_id?: string | number | null;
  file_name: string;
  file_size_bytes?: number;
  metadata: GstReturnMetadata;
  b2b_invoices: GstB2bInvoiceRow[];
  b2c_summaries: GstB2cSummaryRow[];
  total_b2b_taxable: number;
  total_b2b_tax: number;
  total_b2b_val: number;
  total_b2c_taxable: number;
  total_b2c_tax: number;
  financial_year?: string;
  raw_json?: any;
}

export interface Gstr1ImportResponse {
  success: boolean;
  message: string;
  importId?: number;
  b2bCount?: number;
  b2cCount?: number;
  returnPeriod?: string;
  gstin?: string;
}

export interface Gstr1LatestResponse {
  success: boolean;
  data: ParsedGstr1Data | null;
  message?: string;
}

/**
 * Save complete GSTR-1 JSON data to database
 */
export async function saveGstr1ToDatabase(
  data: ParsedGstr1Data,
  companyId: string | number,
  options?: {
    ownerType?: string;
    ownerId?: string | number | null;
    rawJson?: any;
  }
): Promise<Gstr1ImportResponse> {
  const payload: Gstr1ImportPayload = {
    company_id: companyId,
    owner_type: options?.ownerType || "company",
    owner_id: options?.ownerId || null,
    file_name: data.fileName,
    file_size_bytes: data.fileSizeBytes,
    metadata: data.metadata,
    b2b_invoices: data.b2bInvoices,
    b2c_summaries: data.b2cSummaries,
    total_b2b_taxable: data.totalB2bTaxable,
    total_b2b_tax: data.totalB2bTax,
    total_b2b_val: data.totalB2bVal,
    total_b2c_taxable: data.totalB2cTaxable,
    total_b2c_tax: data.totalB2cTax,
    raw_json: options?.rawJson || null,
  };

  const response = await axiosInstance.post<Gstr1ImportResponse>(
    "/gstr1/import",
    payload
  );
  return response.data;
}

/**
 * Fetch latest persisted GSTR-1 return for the company
 */
export async function fetchLatestGstr1FromDatabase(
  companyId: string | number,
  returnPeriod?: string
): Promise<ParsedGstr1Data | null> {
  const params: Record<string, any> = { company_id: companyId };
  if (returnPeriod) {
    params.return_period = returnPeriod;
  }

  const response = await axiosInstance.get<Gstr1LatestResponse>(
    "/gstr1/latest",
    { params }
  );

  if (response.data && response.data.success && response.data.data) {
    return response.data.data;
  }
  return null;
}

/**
 * List all GSTR-1 imports for the company
 */
export async function listGstr1Imports(
  companyId: string | number
): Promise<any[]> {
  const response = await axiosInstance.get("/gstr1/list", {
    params: { company_id: companyId },
  });
  if (response.data && response.data.success) {
    return response.data.data || [];
  }
  return [];
}

/**
 * Delete a specific GSTR-1 import
 */
export async function deleteGstr1Import(
  importId: number,
  companyId: string | number
): Promise<boolean> {
  const response = await axiosInstance.delete(`/gstr1/import/${importId}`, {
    params: { company_id: companyId },
  });
  return !!(response.data && response.data.success);
}

/**
 * Fetch all GSTR-1 B2B invoices for a company
 */
export async function fetchGstr1Invoices(
  companyId: string | number,
  returnPeriod?: string,
  search?: string
): Promise<GstB2bInvoiceRow[]> {
  const params: Record<string, any> = { company_id: companyId };
  if (returnPeriod && returnPeriod !== "all") {
    params.return_period = returnPeriod;
  }
  if (search) {
    params.search = search;
  }

  const response = await axiosInstance.get<{
    success: boolean;
    count: number;
    data: GstB2bInvoiceRow[];
  }>("/gstr1/invoices", { params });

  if (response.data && response.data.success && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  return [];
}

/**
 * Fetch available return periods for GSTR-1
 */
export async function fetchGstr1Periods(
  companyId: string | number
): Promise<Array<{ return_period: string; financial_year: string }>> {
  const response = await axiosInstance.get<{
    success: boolean;
    data: Array<{ return_period: string; financial_year: string }>;
  }>("/gstr1/periods", {
    params: { company_id: companyId },
  });

  if (response.data && response.data.success && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  return [];
}
