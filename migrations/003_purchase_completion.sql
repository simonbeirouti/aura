-- Migration 003: Purchase Completion and User Linking
-- This migration enhances the purchase system with proper user linking and completion tracking
-- Builds on 001_initial.sql and 002_purchases.sql

-- Create purchases table if it doesn't exist (from 002_purchases.sql)
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Stripe payment details
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    stripe_price_id TEXT NOT NULL,
    stripe_product_id TEXT NOT NULL,
    
    -- Purchase details
    amount_paid BIGINT NOT NULL, -- Amount in cents
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    
    -- Product information (cached for performance)
    product_name TEXT,
    product_description TEXT,
    price_description TEXT,
    
    -- Timestamps
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create basic indexes for purchases table
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_payment_intent ON purchases(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_price_id ON purchases(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases(purchased_at DESC);

-- Enable Row Level Security (RLS) for purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for purchases (drop and recreate to ensure consistency)
DROP POLICY IF EXISTS "Users can view own purchases" ON purchases;
CREATE POLICY "Users can view own purchases" ON purchases
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own purchases" ON purchases;
CREATE POLICY "Users can insert own purchases" ON purchases
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own purchases" ON purchases;
CREATE POLICY "Users can update own purchases" ON purchases
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all purchases" ON purchases;
CREATE POLICY "Service role can manage all purchases" ON purchases
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create updated_at trigger for purchases
DROP TRIGGER IF EXISTS update_purchases_updated_at ON purchases;
CREATE TRIGGER update_purchases_updated_at 
    BEFORE UPDATE ON purchases 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Update profiles table to include purchase tracking fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_purchases INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_spent_cents BIGINT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0; -- Total tokens user has purchased
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tokens_remaining BIGINT DEFAULT 0; -- Current token balance
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tokens_used BIGINT DEFAULT 0; -- Total tokens consumed

-- Create package definitions table (simplified, no bonus)
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    stripe_product_id TEXT UNIQUE NOT NULL,
    features JSONB DEFAULT '[]'::jsonb, -- Array of feature descriptions
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drop dependent views before dropping columns
DROP VIEW IF EXISTS user_purchases_detailed;
DROP VIEW IF EXISTS user_token_balance;

-- Drop removed columns from packages
ALTER TABLE packages DROP COLUMN IF EXISTS token_amount;
ALTER TABLE packages DROP COLUMN IF EXISTS bonus_percentage;
ALTER TABLE packages DROP COLUMN IF EXISTS effective_token_amount;

-- Create package prices table (added token_amount)
CREATE TABLE IF NOT EXISTS package_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    stripe_price_id TEXT UNIQUE NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    interval_type TEXT NOT NULL DEFAULT 'one_time', -- one_time, month, year
    interval_count INTEGER DEFAULT 1,
    token_amount BIGINT NOT NULL, -- Tokens provided by this price tier
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new column if not exists
ALTER TABLE package_prices ADD COLUMN IF NOT EXISTS token_amount BIGINT DEFAULT 0;

-- Optionally, if you want to enforce NOT NULL after adding:
-- UPDATE package_prices SET token_amount = 0 WHERE token_amount IS NULL;
-- ALTER TABLE package_prices ALTER COLUMN token_amount SET NOT NULL;
-- ALTER TABLE package_prices ALTER COLUMN token_amount DROP DEFAULT;

-- Then later in the INSERT, it will set proper values

-- Create user token transactions table (tracks token purchases and usage)
CREATE TABLE IF NOT EXISTS user_token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL, -- 'purchase', 'usage', 'bonus', 'refund', 'admin_adjustment'
    token_amount BIGINT NOT NULL, -- Positive for credits, negative for debits
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional transaction details
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced purchases table with better package linking
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES packages(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS package_price_id UUID REFERENCES package_prices(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method_id TEXT; -- Stripe payment method used
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS processing_fee_cents BIGINT DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS net_amount_cents BIGINT; -- Amount after fees
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS tokens_purchased BIGINT DEFAULT 0; -- Tokens granted from this purchase

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_packages_stripe_product_id ON packages(stripe_product_id);
CREATE INDEX IF NOT EXISTS idx_packages_is_active ON packages(is_active);

CREATE INDEX IF NOT EXISTS idx_package_prices_package_id ON package_prices(package_id);
CREATE INDEX IF NOT EXISTS idx_package_prices_stripe_price_id ON package_prices(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_package_prices_interval_type ON package_prices(interval_type);

CREATE INDEX IF NOT EXISTS idx_user_token_transactions_user_id ON user_token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_token_transactions_type ON user_token_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_user_token_transactions_created_at ON user_token_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_token_transactions_package_id ON user_token_transactions(package_id);

CREATE INDEX IF NOT EXISTS idx_purchases_package_id ON purchases(package_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_customer_id ON purchases(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_tokens_purchased ON purchases(tokens_purchased);

-- Create trigger to update profiles stats and token balances when purchases are completed
CREATE OR REPLACE FUNCTION update_profile_purchase_stats()
RETURNS TRIGGER AS $$
DECLARE
    token_amount BIGINT := 0;
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status = 'completed') OR
       (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN
        
        -- Get token amount from package_prices
        SELECT token_amount INTO token_amount
        FROM package_prices 
        WHERE id = NEW.package_price_id;
        
        IF token_amount IS NULL THEN
            RAISE EXCEPTION 'No token amount found for package price %', NEW.package_price_id;
        END IF;
        
        NEW.tokens_purchased = token_amount;
        
        -- Create token transaction record
        INSERT INTO user_token_transactions (
            user_id, package_id, purchase_id, transaction_type, 
            token_amount, description, metadata
        ) VALUES (
            NEW.user_id, NEW.package_id, NEW.id, 'purchase',
            token_amount, 
            'Token purchase: ' || token_amount || ' tokens',
            jsonb_build_object(
                'price_cents', NEW.amount_paid,
                'currency', NEW.currency
            )
        );
        
        -- Update profile stats
        UPDATE profiles 
        SET 
            total_purchases = COALESCE(total_purchases, 0) + 1,
            total_spent_cents = COALESCE(total_spent_cents, 0) + NEW.amount_paid,
            total_tokens = COALESCE(total_tokens, 0) + token_amount,
            tokens_remaining = COALESCE(tokens_remaining, 0) + token_amount,
            last_purchase_at = NEW.completed_at,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profile_stats_on_purchase_completion ON purchases;
CREATE TRIGGER update_profile_stats_on_purchase_completion
    BEFORE INSERT OR UPDATE ON purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_purchase_stats();

-- Create trigger to update package prices updated_at
DROP TRIGGER IF EXISTS update_package_prices_updated_at ON package_prices;
CREATE TRIGGER update_package_prices_updated_at 
    BEFORE UPDATE ON package_prices 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Remove unnecessary calculate_effective_tokens since no bonus calculation

-- Create trigger for user_token_transactions
DROP TRIGGER IF EXISTS update_user_token_transactions_updated_at ON user_token_transactions;
CREATE TRIGGER update_user_token_transactions_updated_at 
    BEFORE UPDATE ON user_token_transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to consume tokens safely
CREATE OR REPLACE FUNCTION consume_user_tokens(
    p_user_id UUID,
    p_token_amount BIGINT,
    p_description TEXT DEFAULT 'Token usage',
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BOOLEAN AS $$
DECLARE
    current_balance BIGINT;
BEGIN
    -- Check current balance
    SELECT tokens_remaining INTO current_balance
    FROM profiles 
    WHERE id = p_user_id;
    
    -- Return false if insufficient tokens
    IF current_balance IS NULL OR current_balance < p_token_amount THEN
        RETURN FALSE;
    END IF;
    
    -- Update profile balance
    UPDATE profiles 
    SET 
        tokens_remaining = tokens_remaining - p_token_amount,
        tokens_used = tokens_used + p_token_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Record transaction
    INSERT INTO user_token_transactions (
        user_id, transaction_type, token_amount, description, metadata
    ) VALUES (
        p_user_id, 'usage', -p_token_amount, p_description, p_metadata
    );
    
    RETURN TRUE;
END;
$$ language 'plpgsql';

-- Enable RLS on new tables
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_token_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for packages (public read access for active packages)
DROP POLICY IF EXISTS "Active packages are viewable by everyone" ON packages;
CREATE POLICY "Active packages are viewable by everyone" ON packages
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage packages" ON packages;
CREATE POLICY "Service role can manage packages" ON packages
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for package_prices (public read access for active prices)
DROP POLICY IF EXISTS "Active package prices are viewable by everyone" ON package_prices;
CREATE POLICY "Active package prices are viewable by everyone" ON package_prices
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage package prices" ON package_prices;
CREATE POLICY "Service role can manage package prices" ON package_prices
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for user_token_transactions (users can see their own transactions)
DROP POLICY IF EXISTS "Users can view own token transactions" ON user_token_transactions;
CREATE POLICY "Users can view own token transactions" ON user_token_transactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage user token transactions" ON user_token_transactions;
CREATE POLICY "Service role can manage user token transactions" ON user_token_transactions
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create comprehensive view for user purchases with package details (simplified)
CREATE OR REPLACE VIEW user_purchases_detailed AS
SELECT 
    p.*,
    pkg.name as package_name,
    pkg.description as package_description,
    pp.interval_type,
    pp.interval_count,
    pp.token_amount,
    profiles.username,
    profiles.full_name
FROM purchases p
LEFT JOIN packages pkg ON p.package_id = pkg.id
LEFT JOIN package_prices pp ON p.package_price_id = pp.id
LEFT JOIN profiles ON p.user_id = profiles.id;

-- Create view for user token balance and transaction history
CREATE OR REPLACE VIEW user_token_balance AS
SELECT 
    profiles.id as user_id,
    profiles.username,
    profiles.full_name,
    profiles.total_tokens,
    profiles.tokens_remaining,
    profiles.tokens_used,
    profiles.total_purchases,
    profiles.total_spent_cents,
    profiles.last_purchase_at,
    COALESCE(recent_transactions.recent_activity, '[]'::jsonb) as recent_transactions
FROM profiles
LEFT JOIN (
    SELECT 
        user_id,
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'transaction_type', transaction_type,
                'token_amount', token_amount,
                'description', description,
                'created_at', created_at
            ) ORDER BY created_at DESC
        ) FILTER (WHERE rn <= 10) as recent_activity
    FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
        FROM user_token_transactions
    ) ranked_transactions
    WHERE rn <= 10
    GROUP BY user_id
) recent_transactions ON profiles.id = recent_transactions.user_id;

-- Grant access to views
GRANT SELECT ON user_purchases_detailed TO authenticated;
GRANT SELECT ON user_token_balance TO authenticated;

-- Set security invoker for views
ALTER VIEW user_purchases_detailed SET (security_invoker = true);
ALTER VIEW user_token_balance SET (security_invoker = true);

-- Fix: Convert to single product with multiple prices
-- First, let's clean up the existing data
DELETE FROM package_prices;
DELETE FROM packages;

-- Insert the SINGLE product with the correct Stripe product ID
INSERT INTO packages (name, description, stripe_product_id, features, is_active, sort_order) VALUES
    ('Token Packages', 'Flexible token packages with bulk discounts', 'prod_SqniwA0Verdhlk', 
     '["Flexible token amounts", "Bulk discounts", "All features", "Priority support"]'::jsonb, true, 0)
ON CONFLICT (stripe_product_id) DO NOTHING;

-- Now insert the 6 different price tiers for this single product
-- Replace the price IDs with your actual Stripe price IDs
-- The amounts should match what you see in your app
INSERT INTO package_prices (package_id, stripe_price_id, amount_cents, currency, interval_type, interval_count, is_active, token_amount) 
SELECT 
    packages.id,
    price_data.stripe_price_id,
    price_data.amount_cents,
    'aud',
    'one_time',
    1,
    true,
    price_data.token_amount
FROM packages
CROSS JOIN (VALUES
    ('price_1Rv67RQdTny8lgOgpa3vAoNV', 149, 100),   -- A$1.49 - 100 tokens
    ('price_1Rv67RQdTny8lgOgx2CpLumG', 749, 500),   -- A$7.49 - 500 tokens  
    ('price_1Rv67RQdTny8lgOg3GUHGWpw', 1499, 1000), -- A$14.99 - 1000 tokens
    ('price_1Rv67RQdTny8lgOg39n1b1oS', 3099, 5000), -- A$30.99 - 5000 tokens
    ('price_1Rv67RQdTny8lgOgJR7IzIeY', 6299, 25000), -- A$62.99 - 25000 tokens
    ('price_1Rv67RQdTny8lgOgb2EwXy2v', 15999, 100000) -- A$159.99 - 100000 tokens
) AS price_data(stripe_price_id, amount_cents, token_amount)
WHERE packages.stripe_product_id = 'prod_SqniwA0Verdhlk'
ON CONFLICT (stripe_price_id) DO NOTHING;
