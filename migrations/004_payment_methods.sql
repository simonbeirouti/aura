-- Migration 004: Payment Methods Management
-- This migration creates the payment_methods table to store user payment methods
-- with support for Stripe integration, default method selection, and proper user linking.
-- Builds on 001_initial.sql, 002_purchases_and_subscriptions.sql, and 003_purchase_completion.sql

-- Create payment_methods table (one-to-many: one user can have many payment methods)
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Stripe payment method details
    stripe_payment_method_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT NOT NULL, -- Link to Stripe customer
    
    -- Card information (cached from Stripe for performance)
    card_brand TEXT NOT NULL, -- visa, mastercard, amex, etc.
    card_last4 TEXT NOT NULL, -- Last 4 digits of card
    card_exp_month INTEGER NOT NULL, -- Expiration month (1-12)
    card_exp_year INTEGER NOT NULL, -- Expiration year (full year, e.g., 2025)
    card_country TEXT, -- Card issuing country
    card_funding TEXT, -- credit, debit, prepaid, unknown
    
    -- Payment method metadata
    is_default BOOLEAN DEFAULT false, -- Only one can be true per user
    is_active BOOLEAN DEFAULT true, -- Soft delete flag
    
    -- Usage tracking
    last_used_at TIMESTAMPTZ, -- When this payment method was last used
    usage_count INTEGER DEFAULT 0, -- How many times this method has been used
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_payment_method_id ON payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_customer_id ON payment_methods(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_methods_created_at ON payment_methods(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_methods_last_used_at ON payment_methods(last_used_at DESC);

-- Partial unique index to ensure only one default payment method per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_default 
    ON payment_methods(user_id) 
    WHERE is_default = true AND is_active = true;

-- Enable Row Level Security (RLS)
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_methods
DROP POLICY IF EXISTS "Users can view own payment methods" ON payment_methods;
CREATE POLICY "Users can view own payment methods" ON payment_methods
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own payment methods" ON payment_methods;
CREATE POLICY "Users can insert own payment methods" ON payment_methods
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own payment methods" ON payment_methods;
CREATE POLICY "Users can update own payment methods" ON payment_methods
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own payment methods" ON payment_methods;
CREATE POLICY "Users can delete own payment methods" ON payment_methods
    FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all payment methods" ON payment_methods;
CREATE POLICY "Service role can manage all payment methods" ON payment_methods
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create trigger for updated_at timestamp (reuse existing function)
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at 
    BEFORE UPDATE ON payment_methods 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to safely set a payment method as default (ensures only one default per user)
CREATE OR REPLACE FUNCTION set_default_payment_method(
    p_user_id UUID,
    p_payment_method_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    method_exists BOOLEAN;
BEGIN
    -- Check if the payment method exists and belongs to the user
    SELECT EXISTS(
        SELECT 1 FROM payment_methods 
        WHERE id = p_payment_method_id 
        AND user_id = p_user_id 
        AND is_active = true
    ) INTO method_exists;
    
    IF NOT method_exists THEN
        RETURN FALSE;
    END IF;
    
    -- Begin transaction to ensure consistency
    -- First, unset all default flags for this user
    UPDATE payment_methods 
    SET 
        is_default = false,
        updated_at = NOW()
    WHERE user_id = p_user_id AND is_active = true;
    
    -- Then set the specified payment method as default
    UPDATE payment_methods 
    SET 
        is_default = true,
        updated_at = NOW()
    WHERE id = p_payment_method_id AND user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ language 'plpgsql';

-- Function to safely delete a payment method (soft delete with default handling)
CREATE OR REPLACE FUNCTION delete_payment_method(
    p_user_id UUID,
    p_payment_method_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    was_default BOOLEAN;
    new_default_id UUID;
BEGIN
    -- Check if the payment method exists and get its default status
    SELECT is_default INTO was_default
    FROM payment_methods 
    WHERE id = p_payment_method_id 
    AND user_id = p_user_id 
    AND is_active = true;
    
    IF was_default IS NULL THEN
        RETURN FALSE; -- Payment method doesn't exist or already deleted
    END IF;
    
    -- Soft delete the payment method
    UPDATE payment_methods 
    SET 
        is_active = false,
        is_default = false,
        updated_at = NOW()
    WHERE id = p_payment_method_id AND user_id = p_user_id;
    
    -- If this was the default payment method, set another active one as default
    IF was_default THEN
        SELECT id INTO new_default_id
        FROM payment_methods 
        WHERE user_id = p_user_id 
        AND is_active = true 
        AND id != p_payment_method_id
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- Set the oldest remaining payment method as default
        IF new_default_id IS NOT NULL THEN
            UPDATE payment_methods 
            SET 
                is_default = true,
                updated_at = NOW()
            WHERE id = new_default_id;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ language 'plpgsql';

-- Function to track payment method usage
CREATE OR REPLACE FUNCTION track_payment_method_usage(
    p_payment_method_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE payment_methods 
    SET 
        usage_count = usage_count + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE stripe_payment_method_id = p_payment_method_id AND is_active = true;
END;
$$ language 'plpgsql';

-- Create view for active payment methods with user details
CREATE OR REPLACE VIEW user_payment_methods_detailed AS
SELECT 
    pm.*,
    p.username,
    p.full_name,
    p.stripe_customer_id as profile_customer_id
FROM payment_methods pm
LEFT JOIN profiles p ON pm.user_id = p.id
WHERE pm.is_active = true
ORDER BY pm.is_default DESC, pm.created_at ASC;

-- Grant access to the view
GRANT SELECT ON user_payment_methods_detailed TO authenticated;
ALTER VIEW user_payment_methods_detailed SET (security_invoker = true);

-- Update purchases table to better link with payment methods (if not already done)
-- This adds a foreign key reference to the payment_methods table
DO $$ 
BEGIN 
    -- Check if the column exists and add FK constraint if it doesn't have one
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchases' 
        AND column_name = 'payment_method_id'
        AND table_schema = 'public'
    ) THEN
        -- Convert the text column to UUID and add FK constraint
        -- First, we need to be careful as the column might have text data
        -- For now, we'll add a new column and migrate later if needed
        
        -- Add new column for payment method FK
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method_uuid UUID REFERENCES payment_methods(id);
        
        -- Create index for the new FK
        CREATE INDEX IF NOT EXISTS idx_purchases_payment_method_uuid ON purchases(payment_method_uuid);
    END IF;
END $$;

-- Add trigger to update profiles.stripe_customer_id when payment methods are added
-- This ensures consistency between payment methods and profiles
CREATE OR REPLACE FUNCTION sync_customer_id_to_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- When a payment method is added, ensure the profile has the same customer ID
    IF (TG_OP = 'INSERT') THEN
        UPDATE profiles 
        SET stripe_customer_id = NEW.stripe_customer_id
        WHERE id = NEW.user_id 
        AND (stripe_customer_id IS NULL OR stripe_customer_id != NEW.stripe_customer_id);
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS sync_customer_id_on_payment_method_insert ON payment_methods;
CREATE TRIGGER sync_customer_id_on_payment_method_insert
    AFTER INSERT ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION sync_customer_id_to_profile();

-- Example queries for common operations:
-- 
-- Get all active payment methods for a user:
-- SELECT * FROM payment_methods WHERE user_id = 'user-uuid' AND is_active = true ORDER BY is_default DESC, created_at ASC;
--
-- Get user's default payment method:
-- SELECT * FROM payment_methods WHERE user_id = 'user-uuid' AND is_default = true AND is_active = true;
--
-- Set a payment method as default:
-- SELECT set_default_payment_method('user-uuid', 'payment-method-uuid');
--
-- Soft delete a payment method:
-- SELECT delete_payment_method('user-uuid', 'payment-method-uuid');
--
-- Track payment method usage:
-- SELECT track_payment_method_usage('stripe-payment-method-id');
