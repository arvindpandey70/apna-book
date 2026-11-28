-- ATS 168 (Annual Tax Statement) Imports & Entries Schema
CREATE TABLE IF NOT EXISTS ats_168_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  owner_type VARCHAR(32) DEFAULT NULL,
  owner_id VARCHAR(64) DEFAULT NULL,
  pan VARCHAR(20) DEFAULT NULL,
  assessee_name VARCHAR(255) DEFAULT NULL,
  tax_year VARCHAR(20) DEFAULT NULL,
  source_file_name VARCHAR(255) DEFAULT NULL,
  summary_tds DECIMAL(15, 2) DEFAULT 0.00,
  summary_tcs DECIMAL(15, 2) DEFAULT 0.00,
  total_amount_paid DECIMAL(15, 2) DEFAULT 0.00,
  total_tds_deducted DECIMAL(15, 2) DEFAULT 0.00,
  total_tds_deposited DECIMAL(15, 2) DEFAULT 0.00,
  row_count INT DEFAULT 0,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ats_168_imp_company_ty (company_id, tax_year)
);

CREATE TABLE IF NOT EXISTS ats_168_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_id INT NOT NULL,
  company_id VARCHAR(64) NOT NULL,
  owner_type VARCHAR(32) DEFAULT NULL,
  owner_id VARCHAR(64) DEFAULT NULL,
  part_code VARCHAR(20) DEFAULT 'PART-I',
  sl_no VARCHAR(20) DEFAULT NULL,
  deductor_tan VARCHAR(20) DEFAULT NULL,
  deductor_pan VARCHAR(20) DEFAULT NULL,
  deductor_name VARCHAR(255) NOT NULL,
  section_code VARCHAR(32) DEFAULT NULL,
  section_description VARCHAR(255) DEFAULT NULL,
  transaction_date DATE DEFAULT NULL,
  booking_date DATE DEFAULT NULL,
  booking_status VARCHAR(50) DEFAULT NULL,
  remarks VARCHAR(100) DEFAULT NULL,
  amount_paid DECIMAL(15, 2) DEFAULT 0.00,
  tds_deducted DECIMAL(15, 2) DEFAULT 0.00,
  tds_deposited DECIMAL(15, 2) DEFAULT 0.00,
  tax_year VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ats_168_ent_company_date (company_id, transaction_date),
  INDEX idx_ats_168_ent_company_tan (company_id, deductor_tan),
  CONSTRAINT fk_ats_168_import_id
    FOREIGN KEY (import_id) REFERENCES ats_168_imports(id)
    ON DELETE CASCADE
);
