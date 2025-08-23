-- Migration 008: Complete KYC Fields for Stripe Connect API Onboarding
-- Adds missing essential fields required for Stripe Connect API onboarding

-- Add missing fields to contractors table
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS business_website_url TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS industry_mcc_code TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS company_registration_number TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS company_structure TEXT; -- corporation, llc, partnership, etc.

-- Individual-specific fields
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS national_id_number TEXT; -- SSN/TIN/equivalent
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS national_id_type TEXT; -- ssn, tin, etc.

-- Create beneficial owners table (for entities with >25% ownership)
CREATE TABLE IF NOT EXISTS contractor_beneficial_owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Personal information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    email TEXT,
    phone_number TEXT,
    
    -- Address
    street_address TEXT NOT NULL,
    street_address_2 TEXT,
    city TEXT NOT NULL,
    state_province TEXT,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    
    -- Ownership details
    ownership_percentage DECIMAL(5,2) NOT NULL, -- e.g., 25.50 for 25.5%
    title TEXT, -- CEO, CFO, etc.
    
    -- Identification
    national_id_number TEXT,
    national_id_type TEXT,
    
    -- Verification status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure ownership percentage is valid
    CONSTRAINT valid_ownership_percentage CHECK (ownership_percentage > 0 AND ownership_percentage <= 100)
);

-- Create directors/representatives table
CREATE TABLE IF NOT EXISTS contractor_representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Personal information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    email TEXT,
    phone_number TEXT,
    
    -- Address
    street_address TEXT NOT NULL,
    street_address_2 TEXT,
    city TEXT NOT NULL,
    state_province TEXT,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    
    -- Role details
    title TEXT NOT NULL, -- Director, Authorized Signatory, etc.
    is_authorized_signatory BOOLEAN DEFAULT false,
    
    -- Identification
    national_id_number TEXT,
    national_id_type TEXT,
    
    -- Verification status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create document uploads table for Stripe File API integration
CREATE TABLE IF NOT EXISTS contractor_document_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Document metadata
    document_type TEXT NOT NULL, -- 'identity_document', 'address_verification', 'business_registration', etc.
    document_purpose TEXT NOT NULL, -- 'account_requirement', 'identity_verification', etc.
    file_name TEXT NOT NULL,
    file_size BIGINT,
    mime_type TEXT,
    
    -- Stripe integration
    stripe_file_id TEXT, -- Stripe File object ID
    stripe_upload_status TEXT DEFAULT 'pending', -- 'pending', 'uploaded', 'failed'
    stripe_upload_error TEXT,
    
    -- Local file storage (optional backup)
    local_file_path TEXT,
    file_hash TEXT, -- For integrity verification
    
    -- Processing status
    verification_status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'rejected', 'requires_action'
    verification_notes TEXT,
    verified_at TIMESTAMPTZ,
    
    -- Requirements tracking
    required_for_capability TEXT[], -- Array of capabilities this document supports
    requirement_id TEXT, -- Stripe requirement ID this document fulfills
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_upload_status CHECK (stripe_upload_status IN ('pending', 'uploaded', 'failed')),
    CONSTRAINT valid_verification_status CHECK (verification_status IN ('pending', 'verified', 'rejected', 'requires_action'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contractor_beneficial_owners_contractor_id ON contractor_beneficial_owners(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_beneficial_owners_ownership_percentage ON contractor_beneficial_owners(ownership_percentage);
CREATE INDEX IF NOT EXISTS idx_contractor_representatives_contractor_id ON contractor_representatives(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_representatives_is_authorized_signatory ON contractor_representatives(is_authorized_signatory);
CREATE INDEX IF NOT EXISTS idx_contractors_user_id ON contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_contractors_stripe_account_id ON contractors(stripe_connect_account_id);
CREATE INDEX IF NOT EXISTS idx_contractor_addresses_contractor_id ON contractor_addresses(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_bank_accounts_contractor_id ON contractor_bank_accounts(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_verification_documents_contractor_id ON contractor_verification_documents(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_contractor_id ON contractor_document_uploads(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_stripe_file_id ON contractor_document_uploads(stripe_file_id);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_document_type ON contractor_document_uploads(document_type);
CREATE INDEX IF NOT EXISTS idx_contractors_industry_mcc_code ON contractors(industry_mcc_code);
CREATE INDEX IF NOT EXISTS idx_contractors_company_registration_number ON contractors(company_registration_number);
CREATE INDEX IF NOT EXISTS idx_contractors_national_id_number ON contractors(national_id_number);

-- Enable Row Level Security
ALTER TABLE contractor_beneficial_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_document_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for beneficial owners
CREATE POLICY "Users can view own beneficial owners" ON contractor_beneficial_owners
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_beneficial_owners.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own beneficial owners" ON contractor_beneficial_owners
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_beneficial_owners.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own beneficial owners" ON contractor_beneficial_owners
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_beneficial_owners.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all beneficial owners" ON contractor_beneficial_owners
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for representatives
CREATE POLICY "Users can view own representatives" ON contractor_representatives
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_representatives.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own representatives" ON contractor_representatives
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_representatives.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own representatives" ON contractor_representatives
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_representatives.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all representatives" ON contractor_representatives
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create updated_at triggers
CREATE TRIGGER update_contractor_beneficial_owners_updated_at 
    BEFORE UPDATE ON contractor_beneficial_owners 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contractor_representatives_updated_at 
    BEFORE UPDATE ON contractor_representatives 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Update the contractor_kyc_status view to include new fields
DROP VIEW IF EXISTS contractor_kyc_status;
CREATE OR REPLACE VIEW contractor_kyc_status AS
SELECT 
    c.id as contractor_id,
    c.user_id,
    p.username,
    p.full_name,
    c.contractor_type,
    c.kyc_status,
    c.is_active,
    c.stripe_connect_account_id,
    c.stripe_connect_account_status,
    c.kyc_submitted_at,
    c.kyc_approved_at,
    c.kyc_expires_at,
    
    -- Business information
    c.business_name,
    c.business_tax_id,
    c.business_website_url,
    c.business_description,
    c.industry_mcc_code,
    c.company_registration_number,
    c.company_structure,
    
    -- Individual information
    c.first_name,
    c.last_name,
    c.date_of_birth,
    c.phone_number,
    c.national_id_number,
    c.national_id_type,
    
    -- Count verification documents
    COUNT(DISTINCT cvd.id) as total_documents,
    COUNT(DISTINCT CASE WHEN cvd.is_verified THEN cvd.id END) as verified_documents,
    
    -- Count bank accounts
    COUNT(DISTINCT cba.id) as total_bank_accounts,
    COUNT(DISTINCT CASE WHEN cba.is_verified THEN cba.id END) as verified_bank_accounts,
    
    -- Count addresses
    COUNT(DISTINCT ca.id) as total_addresses,
    COUNT(DISTINCT CASE WHEN ca.is_verified THEN ca.id END) as verified_addresses,
    
    -- Count beneficial owners
    COUNT(DISTINCT cbo.id) as total_beneficial_owners,
    COUNT(DISTINCT CASE WHEN cbo.is_verified THEN cbo.id END) as verified_beneficial_owners,
    
    -- Count representatives
    COUNT(DISTINCT cr.id) as total_representatives,
    COUNT(DISTINCT CASE WHEN cr.is_verified THEN cr.id END) as verified_representatives
    
FROM contractors c
LEFT JOIN profiles p ON c.profile_id = p.id
LEFT JOIN contractor_verification_documents cvd ON c.id = cvd.contractor_id
LEFT JOIN contractor_bank_accounts cba ON c.id = cba.contractor_id
LEFT JOIN contractor_addresses ca ON c.id = ca.contractor_id
LEFT JOIN contractor_beneficial_owners cbo ON c.id = cbo.contractor_id
LEFT JOIN contractor_representatives cr ON c.id = cr.contractor_id
GROUP BY c.id, c.user_id, p.username, p.full_name, c.contractor_type, c.kyc_status, 
         c.is_active, c.stripe_connect_account_id, c.stripe_connect_account_status,
         c.kyc_submitted_at, c.kyc_approved_at, c.kyc_expires_at, c.business_name, c.business_tax_id,
         c.business_website_url, c.business_description, c.industry_mcc_code, c.company_registration_number,
         c.company_structure, c.first_name, c.last_name, c.date_of_birth, c.phone_number,
         c.national_id_number, c.national_id_type;

-- Grant access to the updated view
GRANT SELECT ON contractor_kyc_status TO authenticated;
ALTER VIEW contractor_kyc_status SET (security_invoker = true);

-- Grant permissions for new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON contractor_beneficial_owners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON contractor_representatives TO authenticated;
