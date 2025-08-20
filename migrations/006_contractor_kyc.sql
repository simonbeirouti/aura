-- Migration 006: Contractor KYC System
-- This migration creates the contractor system with KYC verification support
-- Builds on previous migrations and integrates with Stripe Connect

-- Create contractor types enum
CREATE TYPE contractor_type AS ENUM ('individual', 'business');
CREATE TYPE kyc_status AS ENUM ('pending', 'submitted', 'under_review', 'approved', 'rejected', 'expired');
CREATE TYPE verification_document_type AS ENUM ('passport', 'drivers_license', 'national_id', 'business_license', 'tax_certificate');

-- Create contractors table
CREATE TABLE IF NOT EXISTS contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Contractor type and status
    contractor_type contractor_type NOT NULL DEFAULT 'individual',
    kyc_status kyc_status NOT NULL DEFAULT 'pending',
    is_active BOOLEAN DEFAULT true,
    
    -- Stripe Connect integration
    stripe_connect_account_id TEXT UNIQUE,
    stripe_connect_account_status TEXT,
    stripe_connect_requirements_completed BOOLEAN DEFAULT false,
    
    -- KYC verification metadata
    kyc_submitted_at TIMESTAMPTZ,
    kyc_approved_at TIMESTAMPTZ,
    kyc_rejected_at TIMESTAMPTZ,
    kyc_rejection_reason TEXT,
    kyc_expires_at TIMESTAMPTZ,
    
    -- Business information (for business contractors)
    business_name TEXT,
    business_tax_id TEXT,
    business_registration_number TEXT,
    business_address JSONB, -- Structured address data
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contractor verification documents table
CREATE TABLE IF NOT EXISTS contractor_verification_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Document information
    document_type verification_document_type NOT NULL,
    document_number TEXT,
    document_issuer TEXT,
    document_issued_date DATE,
    document_expiry_date DATE,
    
    -- File storage
    document_file_url TEXT, -- URL to stored document
    document_file_hash TEXT, -- For integrity verification
    
    -- Verification status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contractor bank accounts table
CREATE TABLE IF NOT EXISTS contractor_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Bank account information
    account_holder_name TEXT NOT NULL,
    account_number TEXT,
    routing_number TEXT,
    bank_name TEXT,
    account_type TEXT, -- checking, savings, etc.
    
    -- Stripe integration
    stripe_bank_account_id TEXT,
    stripe_bank_account_status TEXT,
    
    -- Verification status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create contractor addresses table
CREATE TABLE IF NOT EXISTS contractor_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    
    -- Address information
    address_type TEXT NOT NULL DEFAULT 'residential', -- residential, business, mailing
    street_address TEXT NOT NULL,
    street_address_2 TEXT,
    city TEXT NOT NULL,
    state_province TEXT,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    
    -- Verification status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contractors_user_id ON contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_contractors_profile_id ON contractors(profile_id);
CREATE INDEX IF NOT EXISTS idx_contractors_kyc_status ON contractors(kyc_status);
CREATE INDEX IF NOT EXISTS idx_contractors_stripe_connect_account_id ON contractors(stripe_connect_account_id);
CREATE INDEX IF NOT EXISTS idx_contractors_is_active ON contractors(is_active);

CREATE INDEX IF NOT EXISTS idx_contractor_verification_documents_contractor_id ON contractor_verification_documents(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_verification_documents_document_type ON contractor_verification_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_contractor_verification_documents_is_verified ON contractor_verification_documents(is_verified);

CREATE INDEX IF NOT EXISTS idx_contractor_bank_accounts_contractor_id ON contractor_bank_accounts(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_bank_accounts_stripe_bank_account_id ON contractor_bank_accounts(stripe_bank_account_id);

CREATE INDEX IF NOT EXISTS idx_contractor_addresses_contractor_id ON contractor_addresses(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_addresses_address_type ON contractor_addresses(address_type);

-- Enable Row Level Security (RLS)
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contractors
CREATE POLICY "Users can view own contractor profile" ON contractors
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contractor profile" ON contractors
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contractor profile" ON contractors
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all contractors" ON contractors
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for contractor verification documents
CREATE POLICY "Users can view own verification documents" ON contractor_verification_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_verification_documents.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own verification documents" ON contractor_verification_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_verification_documents.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own verification documents" ON contractor_verification_documents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_verification_documents.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all verification documents" ON contractor_verification_documents
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for contractor bank accounts
CREATE POLICY "Users can view own bank accounts" ON contractor_bank_accounts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_bank_accounts.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own bank accounts" ON contractor_bank_accounts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_bank_accounts.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own bank accounts" ON contractor_bank_accounts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_bank_accounts.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all bank accounts" ON contractor_bank_accounts
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for contractor addresses
CREATE POLICY "Users can view own addresses" ON contractor_addresses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_addresses.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own addresses" ON contractor_addresses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_addresses.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own addresses" ON contractor_addresses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_addresses.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all addresses" ON contractor_addresses
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create updated_at triggers
CREATE TRIGGER update_contractors_updated_at 
    BEFORE UPDATE ON contractors 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contractor_verification_documents_updated_at 
    BEFORE UPDATE ON contractor_verification_documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contractor_bank_accounts_updated_at 
    BEFORE UPDATE ON contractor_bank_accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contractor_addresses_updated_at 
    BEFORE UPDATE ON contractor_addresses 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create contractor profile when user applies
CREATE OR REPLACE FUNCTION create_contractor_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Create contractor profile when user applies
    INSERT INTO contractors (user_id, profile_id, contractor_type, kyc_status)
    VALUES (NEW.user_id, NEW.profile_id, NEW.contractor_type, 'pending');
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically create contractor profile
CREATE TRIGGER auto_create_contractor_profile
    AFTER INSERT ON contractors
    FOR EACH ROW
    EXECUTE FUNCTION create_contractor_profile();

-- Create view for contractor KYC status
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
    c.business_name,
    c.business_tax_id,
    -- Count verification documents
    COUNT(DISTINCT cvd.id) as total_documents,
    COUNT(DISTINCT CASE WHEN cvd.is_verified THEN cvd.id END) as verified_documents,
    -- Count bank accounts
    COUNT(DISTINCT cba.id) as total_bank_accounts,
    COUNT(DISTINCT CASE WHEN cba.is_verified THEN cba.id END) as verified_bank_accounts,
    -- Count addresses
    COUNT(DISTINCT ca.id) as total_addresses,
    COUNT(DISTINCT CASE WHEN ca.is_verified THEN ca.id END) as verified_addresses
FROM contractors c
LEFT JOIN profiles p ON c.profile_id = p.id
LEFT JOIN contractor_verification_documents cvd ON c.id = cvd.contractor_id
LEFT JOIN contractor_bank_accounts cba ON c.id = cba.contractor_id
LEFT JOIN contractor_addresses ca ON c.id = ca.contractor_id
GROUP BY c.id, c.user_id, p.username, p.full_name, c.contractor_type, c.kyc_status, 
         c.is_active, c.stripe_connect_account_id, c.stripe_connect_account_status,
         c.kyc_submitted_at, c.kyc_approved_at, c.kyc_expires_at, c.business_name, c.business_tax_id;

-- Grant access to the view
GRANT SELECT ON contractor_kyc_status TO authenticated;
ALTER VIEW contractor_kyc_status SET (security_invoker = true);

-- Add contractor-related columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_contractor BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES contractors(id);

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_profiles_is_contractor ON profiles(is_contractor);
CREATE INDEX IF NOT EXISTS idx_profiles_contractor_id ON profiles(contractor_id);

-- Update the handle_new_user function to include contractor fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url, is_contractor)
    VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', false);
    RETURN new;
END;
$$ language 'plpgsql' security definer;

-- Example queries for common operations:
-- 
-- Get contractor KYC status:
-- SELECT * FROM contractor_kyc_status WHERE user_id = 'user-uuid';
--
-- Get contractor verification documents:
-- SELECT * FROM contractor_verification_documents WHERE contractor_id = 'contractor-uuid';
--
-- Get contractor bank accounts:
-- SELECT * FROM contractor_bank_accounts WHERE contractor_id = 'contractor-uuid';
--
-- Get contractor addresses:
-- SELECT * FROM contractor_addresses WHERE contractor_id = 'contractor-uuid';
