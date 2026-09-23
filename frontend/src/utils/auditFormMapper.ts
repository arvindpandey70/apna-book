export interface Form3CBData {
  nameOfEntity: string;
  panOfEntity: string;
  assessmentYear: string;
  previousYear: string;
  addressOfEntity: string;
  pinCode: string;
  stateCode: string;
  email: string;
  phoneNumber: string;
  natureOfEntity: string;
  dateOfRegistration: string;
  registrationNumber: string;
  booksOfAccountMaintained: 'Yes' | 'No';
  regularBooksOfAccount: 'Yes' | 'No';
  booksOfAccountFromDate: string;
  booksOfAccountToDate: string;
  reasonForNotMaintaining: string;
  grossReceipts: number;
  totalSales: number;
  totalPurchases: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  depreciationClaimed: number;
  methodOfAccounting: 'Cash' | 'Mercantile' | 'Hybrid';
  inventoryValuationMethod: string;
  depreciationMethod: string;
  taxAuditObservations: string;
  discrepanciesFound: 'Yes' | 'No';
  discrepancyDetails: string;
  applicabilityOfSection44AB: 'Yes' | 'No';
  applicabilityOfSection44AD: 'Yes' | 'No';
  anyOtherInformation: string;
}

export interface Form3CDPartnerRow {
  name: string;
  pan: string;
  profitShare: number;
  capitalShare: number;
}

export interface Form3CDBusinessNatureRow {
  sector: string;
  code: string;
  name: string;
  description: string;
}

export interface Form3CDPropertyTransferRow {
  description: string;
  address: string;
  stampValue: number;
  consideration: number;
}

export interface Form3CDRelatedPartyRow {
  name: string;
  pan: string;
  relationship: string;
  amount: number;
  transactionNature: string;
}

export interface Form3CDEmployeeContributionRow {
  fundNature: string;
  amountReceived: number;
  dueDate: string;
  paidDate: string;
  amountPaid: number;
}

export interface Form3CDSection43BRow {
  section: string;
  nature: string;
  preExistingPaid: number;
  preExistingNotPaid: number;
  currentPaidBeforeDue: number;
  currentNotPaidBeforeDue: number;
}

export interface Form3CDLossCarryForwardRow {
  assessmentYear: string;
  natureOfLoss: string;
  amountAsPerReturn: number;
  amountAssessed: number;
  carriedForwardAmount: number;
}

export interface Form3CDTdsStatementRow {
  tan: string;
  formType: string;
  dueDate: string;
  filingDate: string;
  withinTime: 'Yes' | 'No';
  lateFeePaid: number;
}

export interface Form3CDTdsDeductionRow {
  tan: string;
  section: string;
  paymentNature: string;
  totalAmount: number;
  subjectToTds: number;
  tdsDeducted: number;
  tdsDeposited: number;
}

export interface Form3CDTaxDemandRefundRow {
  financialYear: string;
  authority: string;
  orderDate: string;
  demandAmount: number;
  refundAmount: number;
  remarks: string;
}

export interface Form3CDData {
  nameOfAssessee: string;
  address: string;
  panNumber: string;
  indirectTaxLiability: 'Yes' | 'No';
  registrationNumbers: string;
  status: string;
  previousYearFrom: string;
  previousYearTo: string;
  assessmentYear: string;
  section44ABClause: string;
  taxRegimeOpted: string;
  partnersDetails: string[];
  partnerList: Form3CDPartnerRow[];
  partnersChangeDetails: string;
  natureOfBusiness: string[];
  businessNatureList: Form3CDBusinessNatureRow[];
  businessChangeDetails: string;
  booksPrescribed: 'Yes' | 'No';
  booksListPrescribed: string[];
  booksMaintained: string[];
  booksAddress: string;
  booksExamined: string[];
  presumptiveProfits: 'Yes' | 'No';
  presumptiveAmount: number;
  presumptiveSection: string;
  accountingMethod: 'Cash' | 'Mercantile' | 'Hybrid';
  accountingMethodChange: 'Yes' | 'No';
  accountingChangeDetails: string;
  icdsAdjustmentRequired: 'Yes' | 'No';
  icdsAdjustmentDetails: string;
  icdsDisclosure: string;
  stockValuationMethod: string;
  stockDeviationDetails: string;
  capitalAssetConversion: {
    description: string;
    acquisitionDate: string;
    acquisitionCost: number;
    conversionAmount: number;
  }[];
  section28Items: number;
  proformaCredits: number;
  escalationClaims: number;
  otherIncomeItems: number;
  capitalReceipts: number;
  propertyTransferDetails: string;
  propertyTransferList: Form3CDPropertyTransferRow[];
  depreciationDetails: {
    assetBlock: string;
    rate: number;
    wdvCost: number;
    adjustments: number;
    additionsDeductions: string;
    depreciationAllowed: number;
    endingWdv: number;
  }[];
  specialDeductions: {
    section33AB: number;
    section35_1_i: number;
    section35AD: number;
    section35CCD: number;
  };
  bonusCommissionDetails: string;
  employeeFundContributions: string;
  employeeContributionList: Form3CDEmployeeContributionRow[];
  capitalPersonalExpenditure: number;
  section40aDisallowances: number;
  section40bDisallowances: number;
  section40A3Disallowance: number;
  gratuityProvisionDisallowance: number;
  section40A9Disallowance: number;
  contingentLiabilities: string;
  section14ADisallowance: number;
  section36_1_iiiDisallowance: number;
  msmeInterestInadmissible: number;
  msmeTotalPayable: number;
  msmeTimelyPayments: number;
  msmeDelayedPayments: number;
  relatedPartyPayments: string;
  relatedPartyList: Form3CDRelatedPartyRow[];
  deemedProfitsSection32AC: number;
  deemedProfitsOther: number;
  section41Profits: number;
  section41Details: string;
  section43BPreexisting: {
    paid: number;
    notPaid: number;
  };
  section43BCurrentYear: {
    paidBeforeDueDate: number;
    notPaidBeforeDueDate: number;
  };
  section43BList: Form3CDSection43BRow[];
  cenvatCredits: number;
  cenvatTreatment: string;
  priorPeriodItems: string;
  incomeOtherSources: 'Yes' | 'No';
  incomeOtherSourcesNature: string;
  incomeOtherSourcesAmount: number;
  hundiBorrowings: number;
  hundiDetails: string;
  transferPricingAdjustment: 'Yes' | 'No';
  transferPricingClause: string;
  transferPricingAmount: number;
  excessMoneyRepatriated: 'Yes' | 'No';
  imputedInterest: number;
  interestExceedsOneCrore: 'Yes' | 'No';
  interestExpenditure: number;
  ebitda: number;
  excessInterest: number;
  interestBroughtForward: number;
  interestCarriedForward: number;
  impermissibleArrangement: 'Yes' | 'No';
  arrangementNature: string;
  taxBenefitAmount: number;
  loansAboveLimit: {
    name: string;
    address: string;
    pan: string;
    amount: number;
    maxOutstanding: number;
    paymentMode: string;
  }[];
  cashReceiptsAboveLimit: {
    name: string;
    address: string;
    pan: string;
    amount: number;
    transactionNature: string;
  }[];
  cashPaymentsAboveLimit: {
    name: string;
    address: string;
    pan: string;
    amount: number;
    transactionNature: string;
  }[];
  loanRepaymentsAboveLimit: {
    name: string;
    address: string;
    pan: string;
    amount: number;
    paymentMode: string;
  }[];
  broughtForwardLoss: number;
  broughtForwardDepreciation: number;
  lossCarryForwardList: Form3CDLossCarryForwardRow[];
  shareholdingChange: 'Yes' | 'No';
  speculationLoss: 'Yes' | 'No';
  speculationLossAmount: number;
  specifiedBusinessLoss: 'Yes' | 'No';
  speculationBusiness: 'Yes' | 'No';
  chapterVIADeductions: {
    section80C: number;
    section80D: number;
    section80G: number;
    section10A: number;
    section10AA: number;
  };
  tdsRequired: 'Yes' | 'No';
  tdsDetails: string;
  tdsDeductionList: Form3CDTdsDeductionRow[];
  tcsRequired: 'Yes' | 'No';
  tcsDetails: string;
  tdsStatementList: Form3CDTdsStatementRow[];
  tdsInterest: number;
  tradingDetails: {
    item: string;
    openingStock: number;
    purchases: number;
    sales: number;
    closingStock: number;
    shortage: number;
  }[];
  manufacturingDetails: {
    rawMaterial: string;
    openingStock: number;
    purchases: number;
    consumption: number;
    sales: number;
    closingStock: number;
    yield: number;
    yieldPercentage: number;
  }[];
  dividendDistributionTax: {
    distributedProfits: number;
    reductionSection115O_1A_i: number;
    reductionSection115O_1A_ii: number;
    taxPaid: number;
    paymentDates: string[];
  };
  deemedDividendReceived: 'Yes' | 'No';
  deemedDividendAmount: number;
  deemedDividendDate: string;
  shareBuybackAmount: number;
  shareBuybackCost: number;
  costAuditConducted: 'Yes' | 'No';
  costAuditDisagreements: string;
  exciseAuditConducted: 'Yes' | 'No';
  exciseAuditDisagreements: string;
  serviceAuditConducted: 'Yes' | 'No';
  serviceAuditDisagreements: string;
  totalTurnover: number;
  grossProfitRatio: number;
  netProfitRatio: number;
  stockTurnoverRatio: number;
  materialConsumptionRatio: number;
  previousYearTurnover: number;
  previousGrossProfitRatio: number;
  previousNetProfitRatio: number;
  taxDemandsRefunds: string;
  taxDemandRefundList: Form3CDTaxDemandRefundRow[];
  form61Required: 'Yes' | 'No';
  form61Details: string;
  reportingEntityId: string;
  cbcrRequired: 'Yes' | 'No';
  cbcrDetails: string;
  parentEntityName: string;
  gstRegisteredExpenditure: number;
  gstUnregisteredExpenditure: number;
  gstCompositionExpenditure: number;
  gstExemptExpenditure: number;
  auditorName: string;
  auditorMembershipNo: string;
  auditorFirmRegNo: string;
  auditorAddress: string;
  placeOfSigning: string;
  dateOfSigning: string;
}

// Safe value extractor preserving valid falsy values (0, false, empty string)
function getVal<T>(savedVal: any, defaultVal: T): T {
  if (savedVal !== undefined && savedVal !== null) {
    return savedVal as T;
  }
  return defaultVal;
}

export function mapForm3CBData(
  savedData: Partial<Form3CBData> | null,
  companyInfo?: any,
  caInfo?: any,
  financialParticulars?: any,
  selectedFinYear?: string
): Form3CBData {
  const companyName = companyInfo?.name || '';
  const companyPan = companyInfo?.pan_number || companyInfo?.panNumber || '';
  const companyAddress = companyInfo?.address || '';
  const companyPin = companyInfo?.pin || companyInfo?.pin_code || '';
  const companyState = companyInfo?.state || '';
  const companyEmail = companyInfo?.email || '';
  const companyPhone = companyInfo?.phone_number || companyInfo?.phoneNumber || companyInfo?.phone || '';
  const financialYear = selectedFinYear || companyInfo?.financial_year || companyInfo?.financialYear || '2023-24';
  const booksBeginning = companyInfo?.books_beginning_year || companyInfo?.booksBeginningYear || '2023-04-01';

  // Compute assessment year (e.g. 2023-24 -> 2024-25)
  let assessmentYear = '2024-25';
  if (financialYear && typeof financialYear === 'string' && financialYear.includes('-')) {
    const parts = financialYear.split('-');
    const startYr = parseInt(parts[0], 10);
    if (!isNaN(startYr)) {
      const ayStart = startYr + 1;
      const ayEnd = (ayStart + 1) % 100;
      assessmentYear = `${ayStart}-${ayEnd < 10 ? '0' + ayEnd : ayEnd}`;
    }
  }

  const s = savedData || {};

  return {
    nameOfEntity: getVal(s.nameOfEntity, companyName),
    panOfEntity: getVal(s.panOfEntity, companyPan),
    assessmentYear: getVal(s.assessmentYear, assessmentYear),
    previousYear: getVal(s.previousYear, financialYear),
    addressOfEntity: getVal(s.addressOfEntity, companyAddress),
    pinCode: getVal(s.pinCode, companyPin),
    stateCode: getVal(s.stateCode, companyState),
    email: getVal(s.email, companyEmail),
    phoneNumber: getVal(s.phoneNumber, companyPhone),

    natureOfEntity: getVal(s.natureOfEntity, companyInfo?.company_type || 'Private Limited'),
    dateOfRegistration: getVal(s.dateOfRegistration, ''),
    registrationNumber: getVal(s.registrationNumber, companyInfo?.cin_number || companyInfo?.cinNumber || ''),

    booksOfAccountMaintained: getVal(s.booksOfAccountMaintained, 'Yes'),
    regularBooksOfAccount: getVal(s.regularBooksOfAccount, 'Yes'),
    booksOfAccountFromDate: getVal(s.booksOfAccountFromDate, booksBeginning),
    booksOfAccountToDate: getVal(s.booksOfAccountToDate, ''),
    reasonForNotMaintaining: getVal(s.reasonForNotMaintaining, ''),

    grossReceipts: financialParticulars ? (financialParticulars.grossReceipts ?? 0) : getVal(s.grossReceipts, 0),
    totalSales: financialParticulars ? (financialParticulars.totalSales ?? 0) : getVal(s.totalSales, 0),
    totalPurchases: financialParticulars ? (financialParticulars.totalPurchases ?? 0) : getVal(s.totalPurchases, 0),
    grossProfit: financialParticulars ? (financialParticulars.grossProfit ?? 0) : getVal(s.grossProfit, 0),
    totalExpenses: financialParticulars ? (financialParticulars.totalExpenses ?? 0) : getVal(s.totalExpenses, 0),
    netProfit: financialParticulars ? (financialParticulars.netProfit ?? 0) : getVal(s.netProfit, 0),
    depreciationClaimed: financialParticulars ? (financialParticulars.depreciationClaimed ?? 0) : getVal(s.depreciationClaimed, 0),

    methodOfAccounting: getVal(s.methodOfAccounting, 'Mercantile'),
    inventoryValuationMethod: getVal(s.inventoryValuationMethod, 'Cost or Net Realizable Value whichever is lower'),
    depreciationMethod: getVal(s.depreciationMethod, 'Written Down Value (WDV) Method'),

    taxAuditObservations: getVal(s.taxAuditObservations, ''),
    discrepanciesFound: getVal(s.discrepanciesFound, 'No'),
    discrepancyDetails: getVal(s.discrepancyDetails, ''),

    applicabilityOfSection44AB: getVal(s.applicabilityOfSection44AB, 'Yes'),
    applicabilityOfSection44AD: getVal(s.applicabilityOfSection44AD, 'No'),
    anyOtherInformation: getVal(s.anyOtherInformation, '')
  };
}

export function mapForm3CDData(
  savedData: Partial<Form3CDData> | null,
  companyInfo?: any,
  caInfo?: any
): Form3CDData {
  const companyName = companyInfo?.name || '';
  const companyPan = companyInfo?.pan_number || companyInfo?.panNumber || '';
  const companyAddress = companyInfo?.address || '';
  const companyGst = companyInfo?.gst_number || companyInfo?.gstNumber || companyInfo?.gstin || '';
  const companyTan = companyInfo?.tan_number || companyInfo?.tanNumber || '';
  const regNumbers = [companyGst, companyTan].filter(Boolean).join(', ');

  const financialYear = companyInfo?.financial_year || companyInfo?.financialYear || '2023-24';
  const booksBeginning = companyInfo?.books_beginning_year || companyInfo?.booksBeginningYear || '2023-04-01';

  let assessmentYear = '2024-25';
  if (financialYear && typeof financialYear === 'string' && financialYear.includes('-')) {
    const parts = financialYear.split('-');
    const startYr = parseInt(parts[0], 10);
    if (!isNaN(startYr)) {
      const ayStart = startYr + 1;
      const ayEnd = (ayStart + 1) % 100;
      assessmentYear = `${ayStart}-${ayEnd < 10 ? '0' + ayEnd : ayEnd}`;
    }
  }

  const caName = caInfo?.name || caInfo?.firstName || '';
  const caMemNo = caInfo?.membership_number || caInfo?.membershipNumber || '';
  const caRegNo = caInfo?.registration_number || caInfo?.firm_name || caInfo?.firmName || '';
  const caAddr = caInfo?.address || '';
  const todayStr = new Date().toISOString().split('T')[0];

  const s = savedData || {};

  return {
    nameOfAssessee: getVal(s.nameOfAssessee, companyName),
    address: getVal(s.address, companyAddress),
    panNumber: getVal(s.panNumber, companyPan),
    indirectTaxLiability: getVal(s.indirectTaxLiability, companyGst ? 'Yes' : 'No'),
    registrationNumbers: getVal(s.registrationNumbers, regNumbers),
    status: getVal(s.status, companyInfo?.company_type || 'Company'),
    previousYearFrom: getVal(s.previousYearFrom, booksBeginning),
    previousYearTo: getVal(s.previousYearTo, '2024-03-31'),
    assessmentYear: getVal(s.assessmentYear, assessmentYear),
    section44ABClause: getVal(s.section44ABClause, 'Clause (a) - Business turnover exceeds threshold'),
    taxRegimeOpted: getVal(s.taxRegimeOpted, 'Section 115BAA'),

    partnersDetails: getVal(s.partnersDetails, []),
    partnerList: getVal(s.partnerList, []),
    partnersChangeDetails: getVal(s.partnersChangeDetails, ''),

    natureOfBusiness: getVal(s.natureOfBusiness, []),
    businessNatureList: getVal(s.businessNatureList, []),
    businessChangeDetails: getVal(s.businessChangeDetails, ''),

    booksPrescribed: getVal(s.booksPrescribed, 'Yes'),
    booksListPrescribed: getVal(s.booksListPrescribed, ['Cash Book', 'Ledger', 'Journal', 'Sales Register', 'Purchase Register']),
    booksMaintained: getVal(s.booksMaintained, ['Cash Book', 'Ledger', 'Journal', 'Sales Register', 'Purchase Register']),
    booksAddress: getVal(s.booksAddress, companyAddress),
    booksExamined: getVal(s.booksExamined, ['Balance Sheet', 'Profit and Loss Account', 'Trial Balance']),

    presumptiveProfits: getVal(s.presumptiveProfits, 'No'),
    presumptiveAmount: getVal(s.presumptiveAmount, 0),
    presumptiveSection: getVal(s.presumptiveSection, ''),

    accountingMethod: getVal(s.accountingMethod, 'Mercantile'),
    accountingMethodChange: getVal(s.accountingMethodChange, 'No'),
    accountingChangeDetails: getVal(s.accountingChangeDetails, ''),
    icdsAdjustmentRequired: getVal(s.icdsAdjustmentRequired, 'No'),
    icdsAdjustmentDetails: getVal(s.icdsAdjustmentDetails, ''),
    icdsDisclosure: getVal(s.icdsDisclosure, ''),

    stockValuationMethod: getVal(s.stockValuationMethod, 'Lower of Cost or Net Realizable Value'),
    stockDeviationDetails: getVal(s.stockDeviationDetails, ''),

    capitalAssetConversion: getVal(s.capitalAssetConversion, []),

    section28Items: getVal(s.section28Items, 0),
    proformaCredits: getVal(s.proformaCredits, 0),
    escalationClaims: getVal(s.escalationClaims, 0),
    otherIncomeItems: getVal(s.otherIncomeItems, 0),
    capitalReceipts: getVal(s.capitalReceipts, 0),

    propertyTransferDetails: getVal(s.propertyTransferDetails, ''),
    propertyTransferList: getVal(s.propertyTransferList, []),

    depreciationDetails: getVal(s.depreciationDetails, []),

    specialDeductions: getVal(s.specialDeductions, {
      section33AB: 0,
      section35_1_i: 0,
      section35AD: 0,
      section35CCD: 0
    }),

    bonusCommissionDetails: getVal(s.bonusCommissionDetails, ''),
    employeeFundContributions: getVal(s.employeeFundContributions, ''),
    employeeContributionList: getVal(s.employeeContributionList, []),

    capitalPersonalExpenditure: getVal(s.capitalPersonalExpenditure, 0),
    section40aDisallowances: getVal(s.section40aDisallowances, 0),
    section40bDisallowances: getVal(s.section40bDisallowances, 0),
    section40A3Disallowance: getVal(s.section40A3Disallowance, 0),
    gratuityProvisionDisallowance: getVal(s.gratuityProvisionDisallowance, 0),
    section40A9Disallowance: getVal(s.section40A9Disallowance, 0),
    contingentLiabilities: getVal(s.contingentLiabilities, ''),
    section14ADisallowance: getVal(s.section14ADisallowance, 0),
    section36_1_iiiDisallowance: getVal(s.section36_1_iiiDisallowance, 0),

    msmeInterestInadmissible: getVal(s.msmeInterestInadmissible, 0),
    msmeTotalPayable: getVal(s.msmeTotalPayable, 0),
    msmeTimelyPayments: getVal(s.msmeTimelyPayments, 0),
    msmeDelayedPayments: getVal(s.msmeDelayedPayments, 0),

    relatedPartyPayments: getVal(s.relatedPartyPayments, ''),
    relatedPartyList: getVal(s.relatedPartyList, []),

    deemedProfitsSection32AC: getVal(s.deemedProfitsSection32AC, 0),
    deemedProfitsOther: getVal(s.deemedProfitsOther, 0),

    section41Profits: getVal(s.section41Profits, 0),
    section41Details: getVal(s.section41Details, ''),

    section43BPreexisting: getVal(s.section43BPreexisting, { paid: 0, notPaid: 0 }),
    section43BCurrentYear: getVal(s.section43BCurrentYear, { paidBeforeDueDate: 0, notPaidBeforeDueDate: 0 }),
    section43BList: getVal(s.section43BList, []),

    cenvatCredits: getVal(s.cenvatCredits, 0),
    cenvatTreatment: getVal(s.cenvatTreatment, ''),
    priorPeriodItems: getVal(s.priorPeriodItems, ''),

    incomeOtherSources: getVal(s.incomeOtherSources, 'No'),
    incomeOtherSourcesNature: getVal(s.incomeOtherSourcesNature, ''),
    incomeOtherSourcesAmount: getVal(s.incomeOtherSourcesAmount, 0),

    hundiBorrowings: getVal(s.hundiBorrowings, 0),
    hundiDetails: getVal(s.hundiDetails, ''),

    transferPricingAdjustment: getVal(s.transferPricingAdjustment, 'No'),
    transferPricingClause: getVal(s.transferPricingClause, ''),
    transferPricingAmount: getVal(s.transferPricingAmount, 0),
    excessMoneyRepatriated: getVal(s.excessMoneyRepatriated, 'No'),
    imputedInterest: getVal(s.imputedInterest, 0),

    interestExceedsOneCrore: getVal(s.interestExceedsOneCrore, 'No'),
    interestExpenditure: getVal(s.interestExpenditure, 0),
    ebitda: getVal(s.ebitda, 0),
    excessInterest: getVal(s.excessInterest, 0),
    interestBroughtForward: getVal(s.interestBroughtForward, 0),
    interestCarriedForward: getVal(s.interestCarriedForward, 0),

    impermissibleArrangement: getVal(s.impermissibleArrangement, 'No'),
    arrangementNature: getVal(s.arrangementNature, ''),
    taxBenefitAmount: getVal(s.taxBenefitAmount, 0),

    loansAboveLimit: getVal(s.loansAboveLimit, []),
    cashReceiptsAboveLimit: getVal(s.cashReceiptsAboveLimit, []),
    cashPaymentsAboveLimit: getVal(s.cashPaymentsAboveLimit, []),
    loanRepaymentsAboveLimit: getVal(s.loanRepaymentsAboveLimit, []),

    broughtForwardLoss: getVal(s.broughtForwardLoss, 0),
    broughtForwardDepreciation: getVal(s.broughtForwardDepreciation, 0),
    lossCarryForwardList: getVal(s.lossCarryForwardList, []),
    shareholdingChange: getVal(s.shareholdingChange, 'No'),
    speculationLoss: getVal(s.speculationLoss, 'No'),
    speculationLossAmount: getVal(s.speculationLossAmount, 0),
    specifiedBusinessLoss: getVal(s.specifiedBusinessLoss, 'No'),
    speculationBusiness: getVal(s.speculationBusiness, 'No'),

    chapterVIADeductions: getVal(s.chapterVIADeductions, {
      section80C: 0,
      section80D: 0,
      section80G: 0,
      section10A: 0,
      section10AA: 0
    }),

    tdsRequired: getVal(s.tdsRequired, 'No'),
    tdsDetails: getVal(s.tdsDetails, ''),
    tdsDeductionList: getVal(s.tdsDeductionList, []),
    tcsRequired: getVal(s.tcsRequired, 'No'),
    tcsDetails: getVal(s.tcsDetails, ''),
    tdsStatementList: getVal(s.tdsStatementList, []),
    tdsInterest: getVal(s.tdsInterest, 0),

    tradingDetails: getVal(s.tradingDetails, []),
    manufacturingDetails: getVal(s.manufacturingDetails, []),

    dividendDistributionTax: getVal(s.dividendDistributionTax, {
      distributedProfits: 0,
      reductionSection115O_1A_i: 0,
      reductionSection115O_1A_ii: 0,
      taxPaid: 0,
      paymentDates: []
    }),

    deemedDividendReceived: getVal(s.deemedDividendReceived, 'No'),
    deemedDividendAmount: getVal(s.deemedDividendAmount, 0),
    deemedDividendDate: getVal(s.deemedDividendDate, ''),

    shareBuybackAmount: getVal(s.shareBuybackAmount, 0),
    shareBuybackCost: getVal(s.shareBuybackCost, 0),

    costAuditConducted: getVal(s.costAuditConducted, 'No'),
    costAuditDisagreements: getVal(s.costAuditDisagreements, ''),
    exciseAuditConducted: getVal(s.exciseAuditConducted, 'No'),
    exciseAuditDisagreements: getVal(s.exciseAuditDisagreements, ''),
    serviceAuditConducted: getVal(s.serviceAuditConducted, 'No'),
    serviceAuditDisagreements: getVal(s.serviceAuditDisagreements, ''),

    totalTurnover: getVal(s.totalTurnover, 0),
    grossProfitRatio: getVal(s.grossProfitRatio, 0),
    netProfitRatio: getVal(s.netProfitRatio, 0),
    stockTurnoverRatio: getVal(s.stockTurnoverRatio, 0),
    materialConsumptionRatio: getVal(s.materialConsumptionRatio, 0),
    previousYearTurnover: getVal(s.previousYearTurnover, 0),
    previousGrossProfitRatio: getVal(s.previousGrossProfitRatio, 0),
    previousNetProfitRatio: getVal(s.previousNetProfitRatio, 0),

    taxDemandsRefunds: getVal(s.taxDemandsRefunds, ''),
    taxDemandRefundList: getVal(s.taxDemandRefundList, []),

    form61Required: getVal(s.form61Required, 'No'),
    form61Details: getVal(s.form61Details, ''),
    reportingEntityId: getVal(s.reportingEntityId, ''),

    cbcrRequired: getVal(s.cbcrRequired, 'No'),
    cbcrDetails: getVal(s.cbcrDetails, ''),
    parentEntityName: getVal(s.parentEntityName, ''),

    gstRegisteredExpenditure: getVal(s.gstRegisteredExpenditure, 0),
    gstUnregisteredExpenditure: getVal(s.gstUnregisteredExpenditure, 0),
    gstCompositionExpenditure: getVal(s.gstCompositionExpenditure, 0),
    gstExemptExpenditure: getVal(s.gstExemptExpenditure, 0),

    auditorName: getVal(s.auditorName, caName),
    auditorMembershipNo: getVal(s.auditorMembershipNo, caMemNo),
    auditorFirmRegNo: getVal(s.auditorFirmRegNo, caRegNo),
    auditorAddress: getVal(s.auditorAddress, caAddr),
    placeOfSigning: getVal(s.placeOfSigning, caAddr ? caAddr.split(',')[0] : ''),
    dateOfSigning: getVal(s.dateOfSigning, todayStr)
  };
}
