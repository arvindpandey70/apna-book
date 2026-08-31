// Utility functions for ledger categorization and GST validation

import type { Ledger } from '../types';

/**
 * Validates GSTIN/UIN format
 * @param gstNumber - The GST/UIN number to validate
 * @returns boolean - True if valid format, false otherwise
 */
export const validateGSTIN = (gstNumber: string): boolean => {
  if (!gstNumber) return true; // Optional field
  
  // GSTIN format: 2 digits (state code) + 10 characters (PAN) + 1 digit (entity number) + 1 digit (checksum) + 1 letter (default 'Z')
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  
  // UIN format: 4 digits + 7 characters + 4 digits
  const uinRegex = /^[0-9]{4}[A-Z0-9]{7}[0-9]{4}$/;
  
  return gstinRegex.test(gstNumber) || uinRegex.test(gstNumber);
};

/**
 * Categorizes ledgers into B2B and B2C based on GST number presence
 * @param ledgers - Array of ledgers to categorize
 * @returns Object with b2bLedgers and b2cLedgers arrays
 */
export const categorizeLedgers = (ledgers: Ledger[]) => {
  const b2bLedgers = ledgers.filter(ledger => 
    ledger.gstNumber && ledger.gstNumber.trim().length > 0
  );
  
  const b2cLedgers = ledgers.filter(ledger => 
    !ledger.gstNumber || ledger.gstNumber.trim().length === 0
  );
  
  return {
    b2bLedgers,
    b2cLedgers
  };
};

/**
 * Checks if a ledger should be categorized as B2B
 * @param ledger - The ledger to check
 * @returns boolean - True if B2B (has GST number), false if B2C
 */
export const isB2BLedger = (ledger: Ledger): boolean => {
  return Boolean(ledger.gstNumber && ledger.gstNumber.trim().length > 0);
};

export const STATE_CODES: { [key: string]: string } = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
  '38': 'Ladakh'
};

export const STATE_NAME_TO_CODE: { [key: string]: string } = Object.entries(STATE_CODES).reduce(
  (acc, [code, name]) => {
    acc[name.toLowerCase()] = code;
    return acc;
  },
  {
    'west bengal': '19',
    'wb': '19',
    'maharashtra': '27',
    'mh': '27',
    'orissa': '21',
    'pondicherry': '34'
  } as { [key: string]: string }
);

/**
 * Extracts 2-digit Indian state code from GSTIN or state name
 */
export const extractStateCode = (gstinOrState?: string | null): { code: string | null; name: string | null } => {
  if (!gstinOrState) return { code: null, name: null };
  const clean = gstinOrState.trim();
  if (!clean) return { code: null, name: null };

  // Check if first two chars are digits matching a valid state code
  if (clean.length >= 2 && /^\d{2}/.test(clean)) {
    const code = clean.substring(0, 2);
    if (STATE_CODES[code]) {
      return { code, name: STATE_CODES[code] };
    }
  }

  // Fallback: search by state name
  const lower = clean.toLowerCase();
  if (STATE_NAME_TO_CODE[lower]) {
    const code = STATE_NAME_TO_CODE[lower];
    return { code, name: STATE_CODES[code] || clean };
  }

  // Partial match by name
  for (const [code, name] of Object.entries(STATE_CODES)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { code, name };
    }
  }

  return { code: null, name: null };
};

/**
 * Gets the GST state code from GSTIN
 * @param gstin - The GSTIN number
 * @returns string - State code or empty string if invalid
 */
export const getGSTStateCode = (gstin: string): string => {
  if (!gstin || gstin.length < 2) return '';
  const stateCode = gstin.substring(0, 2);
  return STATE_CODES[stateCode] || '';
};

/**
 * Formats GST number for display
 * @param gstNumber - The GST number to format
 * @returns string - Formatted GST number
 */
export const formatGSTNumber = (gstNumber: string): string => {
  if (!gstNumber) return '';
  
  // Format GSTIN: 22AAAAA0000A1Z5 -> 22-AAAAA-0000-A1Z5
  if (gstNumber.length === 15) {
    return `${gstNumber.substring(0, 2)}-${gstNumber.substring(2, 7)}-${gstNumber.substring(7, 11)}-${gstNumber.substring(11)}`;
  }
  
  return gstNumber;
};

/**
 * Gets business type suggestion based on GST number
 * @param gstNumber - The GST number
 * @returns string - Suggested business type
 */
export const getBusinessTypeSuggestion = (gstNumber: string): string => {
  if (!gstNumber || gstNumber.length < 3) return 'Unknown';
  
  const thirdChar = gstNumber.charAt(2);
  
  switch (thirdChar) {
    case 'A': return 'Association of Persons';
    case 'B': return 'Body of Individuals';
    case 'C': return 'Company';
    case 'F': return 'Firm/LLP';
    case 'G': return 'Government';
    case 'H': return 'HUF';
    case 'L': return 'Local Authority';
    case 'J': return 'Artificial Juridical Person';
    case 'P': return 'Individual';
    case 'T': return 'Trust';
    default: return 'Other Entity';
  }
};

export default {
  validateGSTIN,
  categorizeLedgers,
  isB2BLedger,
  getGSTStateCode,
  extractStateCode,
  formatGSTNumber,
  getBusinessTypeSuggestion
};

