-- Migration: Add contractor_kyc_form_data table for auto-save functionality
-- This table stores KYC form data as users progress through the onboarding steps

-- Create the contractor_kyc_form_data table
CREATE TABLE IF NOT EXISTS contractor_kyc_form_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kyc_data JSONB NOT NULL, -- Stores the complete KYC form data as JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one form data entry per user
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contractor_kyc_form_data_user_id ON contractor_kyc_form_data(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_kyc_form_data_updated_at ON contractor_kyc_form_data(updated_at);

-- Enable Row Level Security (RLS)
ALTER TABLE contractor_kyc_form_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only access their own KYC form data
CREATE POLICY "Users can view their own KYC form data" ON contractor_kyc_form_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own KYC form data" ON contractor_kyc_form_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own KYC form data" ON contractor_kyc_form_data
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own KYC form data" ON contractor_kyc_form_data
    FOR DELETE USING (auth.uid() = user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_contractor_kyc_form_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER trigger_update_contractor_kyc_form_data_updated_at
    BEFORE UPDATE ON contractor_kyc_form_data
    FOR EACH ROW
    EXECUTE FUNCTION update_contractor_kyc_form_data_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON contractor_kyc_form_data TO authenticated;
