-- Migration 009: Stripe Connect Document Upload System
-- This migration adds document upload capability for Stripe Connect KYC compliance
-- Integrates with Stripe File API for document verification

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
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_contractor_id ON contractor_document_uploads(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_stripe_file_id ON contractor_document_uploads(stripe_file_id);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_document_type ON contractor_document_uploads(document_type);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_verification_status ON contractor_document_uploads(verification_status);
CREATE INDEX IF NOT EXISTS idx_contractor_document_uploads_requirement_id ON contractor_document_uploads(requirement_id);

-- Enable Row Level Security
ALTER TABLE contractor_document_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document uploads
CREATE POLICY "Users can view own document uploads" ON contractor_document_uploads
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_document_uploads.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own document uploads" ON contractor_document_uploads
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_document_uploads.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own document uploads" ON contractor_document_uploads
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_document_uploads.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own document uploads" ON contractor_document_uploads
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM contractors 
            WHERE contractors.id = contractor_document_uploads.contractor_id 
            AND contractors.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all document uploads" ON contractor_document_uploads
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create updated_at trigger
CREATE TRIGGER update_contractor_document_uploads_updated_at 
    BEFORE UPDATE ON contractor_document_uploads 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for document upload status
CREATE OR REPLACE VIEW contractor_document_status AS
SELECT 
    c.id as contractor_id,
    c.user_id,
    c.contractor_type,
    c.kyc_status,
    -- Document upload counts
    COUNT(DISTINCT cdu.id) as total_documents_uploaded,
    COUNT(DISTINCT CASE WHEN cdu.verification_status = 'verified' THEN cdu.id END) as verified_documents,
    COUNT(DISTINCT CASE WHEN cdu.verification_status = 'rejected' THEN cdu.id END) as rejected_documents,
    COUNT(DISTINCT CASE WHEN cdu.verification_status = 'pending' THEN cdu.id END) as pending_documents,
    -- Document types uploaded
    ARRAY_AGG(DISTINCT cdu.document_type) FILTER (WHERE cdu.document_type IS NOT NULL) as uploaded_document_types,
    -- Latest upload timestamp
    MAX(cdu.created_at) as latest_upload_at
FROM contractors c
LEFT JOIN contractor_document_uploads cdu ON c.id = cdu.contractor_id
GROUP BY c.id, c.user_id, c.contractor_type, c.kyc_status;

-- Grant access to the view
GRANT SELECT ON contractor_document_status TO authenticated;
ALTER VIEW contractor_document_status SET (security_invoker = true);

-- Create function to check document requirements completion
CREATE OR REPLACE FUNCTION check_document_requirements_complete(contractor_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    contractor_type_val TEXT;
    required_docs TEXT[];
    uploaded_docs TEXT[];
    doc_type TEXT;
BEGIN
    -- Get contractor type
    SELECT contractor_type INTO contractor_type_val 
    FROM contractors 
    WHERE id = contractor_uuid;
    
    -- Define required documents based on contractor type
    IF contractor_type_val = 'individual' THEN
        required_docs := ARRAY['identity_document', 'address_verification'];
    ELSE
        required_docs := ARRAY['identity_document', 'address_verification', 'business_registration'];
    END IF;
    
    -- Get uploaded and verified document types
    SELECT ARRAY_AGG(DISTINCT document_type) INTO uploaded_docs
    FROM contractor_document_uploads
    WHERE contractor_id = contractor_uuid 
    AND verification_status = 'verified';
    
    -- Check if all required documents are uploaded and verified
    FOREACH doc_type IN ARRAY required_docs
    LOOP
        IF NOT (doc_type = ANY(uploaded_docs)) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_document_requirements_complete(UUID) TO authenticated;

-- Example queries for common operations:
-- 
-- Get contractor document status:
-- SELECT * FROM contractor_document_status WHERE user_id = 'user-uuid';
--
-- Get contractor document uploads:
-- SELECT * FROM contractor_document_uploads WHERE contractor_id = 'contractor-uuid';
--
-- Check if document requirements are complete:
-- SELECT check_document_requirements_complete('contractor-uuid');
--
-- Get pending document uploads:
-- SELECT * FROM contractor_document_uploads WHERE verification_status = 'pending';
