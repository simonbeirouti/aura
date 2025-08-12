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

-- Create package definitions table
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    stripe_product_id TEXT UNIQUE NOT NULL,
    token_amount BIGINT NOT NULL, -- Number of tokens this package provides
    bonus_percentage DECIMAL(5,2) DEFAULT 0, -- Bonus percentage for bulk purchases (e.g. 10.00 for 10%)
    effective_token_amount BIGINT, -- Actual tokens including bonus (calculated field)
    features JSONB DEFAULT '[]'::jsonb, -- Array of feature descriptions
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create package prices table (one package can have multiple pricing options)
CREATE TABLE IF NOT EXISTS package_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    stripe_price_id TEXT UNIQUE NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    interval_type TEXT NOT NULL DEFAULT 'one_time', -- one_time, month, year
    interval_count INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_packages_token_amount ON packages(token_amount);
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
    package_tokens BIGINT := 0;
    bonus_tokens BIGINT := 0;
    total_tokens BIGINT := 0;
    package_info RECORD;
BEGIN
    -- Only update stats when status changes to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Get package token information if package_id is set
        IF NEW.package_id IS NOT NULL THEN
            SELECT token_amount, bonus_percentage, effective_token_amount
            INTO package_info
            FROM packages 
            WHERE id = NEW.package_id;
            
            IF FOUND THEN
                -- Calculate tokens (use effective_token_amount if set, otherwise calculate)
                IF package_info.effective_token_amount IS NOT NULL THEN
                    total_tokens := package_info.effective_token_amount;
                ELSE
                    package_tokens := package_info.token_amount;
                    bonus_tokens := FLOOR(package_tokens * package_info.bonus_percentage / 100);
                    total_tokens := package_tokens + bonus_tokens;
                END IF;
                
                -- Update tokens_purchased in the purchase record
                UPDATE purchases 
                SET tokens_purchased = total_tokens 
                WHERE id = NEW.id;
                
                -- Create token transaction record
                INSERT INTO user_token_transactions (
                    user_id, package_id, purchase_id, transaction_type, 
                    token_amount, description, metadata
                ) VALUES (
                    NEW.user_id, NEW.package_id, NEW.id, 'purchase',
                    total_tokens, 
                    'Token purchase: ' || package_info.token_amount || ' tokens' || 
                    CASE WHEN bonus_tokens > 0 THEN ' + ' || bonus_tokens || ' bonus' ELSE '' END,
                    jsonb_build_object(
                        'base_tokens', package_tokens,
                        'bonus_tokens', bonus_tokens,
                        'bonus_percentage', package_info.bonus_percentage
                    )
                );
            END IF;
        END IF;
        
        -- Update profile stats
        UPDATE profiles 
        SET 
            total_purchases = COALESCE(total_purchases, 0) + 1,
            total_spent_cents = COALESCE(total_spent_cents, 0) + NEW.amount_paid,
            total_tokens = COALESCE(total_tokens, 0) + COALESCE(total_tokens, 0),
            tokens_remaining = COALESCE(tokens_remaining, 0) + COALESCE(total_tokens, 0),
            last_purchase_at = NEW.completed_at,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profile_stats_on_purchase_completion
    AFTER UPDATE ON purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_purchase_stats();

-- Create trigger to update package prices updated_at
CREATE TRIGGER update_package_prices_updated_at 
    BEFORE UPDATE ON package_prices 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate effective token amount
CREATE OR REPLACE FUNCTION calculate_effective_tokens()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate effective tokens if not manually set
    IF NEW.effective_token_amount IS NULL THEN
        NEW.effective_token_amount := NEW.token_amount + FLOOR(NEW.token_amount * NEW.bonus_percentage / 100);
    END IF;
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_effective_tokens_trigger
    BEFORE INSERT OR UPDATE ON packages 
    FOR EACH ROW 
    EXECUTE FUNCTION calculate_effective_tokens();

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
CREATE POLICY "Active packages are viewable by everyone" ON packages
    FOR SELECT USING (is_active = true);

CREATE POLICY "Service role can manage packages" ON packages
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for package_prices (public read access for active prices)
CREATE POLICY "Active package prices are viewable by everyone" ON package_prices
    FOR SELECT USING (is_active = true);

CREATE POLICY "Service role can manage package prices" ON package_prices
    FOR ALL USING (current_setting('role') = 'service_role');

-- RLS Policies for user_token_transactions (users can see their own transactions)
CREATE POLICY "Users can view own token transactions" ON user_token_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage user token transactions" ON user_token_transactions
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create comprehensive view for user purchases with package details
CREATE OR REPLACE VIEW user_purchases_detailed AS
SELECT 
    p.*,
    pkg.name as package_name,
    pkg.description as package_description,
    pkg.token_amount,
    pkg.bonus_percentage,
    pkg.effective_token_amount,
    pp.interval_type,
    pp.interval_count,
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

-- Insert sample package data (token-based packages with proportional pricing)
INSERT INTO packages (name, description, stripe_product_id, token_amount, bonus_percentage, features) VALUES
    ('Starter Pack', '100 tokens - Perfect for trying out the service', 'prod_starter', 100, 0, 
     '["100 API calls", "Basic features", "Standard support"]'::jsonb),
    ('Popular Pack', '500 tokens + 5% bonus - Great value for regular users', 'prod_popular', 500, 5, 
     '["500 API calls", "+5% bonus tokens", "All features", "Priority support"]'::jsonb),
    ('Pro Pack', '1,000 tokens + 10% bonus - Best for power users', 'prod_pro', 1000, 10, 
     '["1,000 API calls", "+10% bonus tokens", "All features", "Priority support", "Advanced analytics"]'::jsonb),
    ('Business Pack', '5,000 tokens + 15% bonus - Perfect for teams', 'prod_business', 5000, 15, 
     '["5,000 API calls", "+15% bonus tokens", "All features", "24/7 support", "Team management", "Custom integrations"]'::jsonb),
    ('Enterprise Pack', '25,000 tokens + 20% bonus - For large organizations', 'prod_enterprise', 25000, 20, 
     '["25,000 API calls", "+20% bonus tokens", "All features", "Dedicated support", "Custom solutions", "SLA guarantee"]'::jsonb),
    ('Ultimate Pack', '100,000 tokens + 25% bonus - Maximum value', 'prod_ultimate', 100000, 25, 
     '["100,000 API calls", "+25% bonus tokens", "All features", "White-glove support", "Custom development", "Priority infrastructure"]'::jsonb)
ON CONFLICT (stripe_product_id) DO NOTHING;

-- Example usage comments:

-- Get all packages with their pricing options and token amounts:
-- SELECT p.*, pp.amount_cents, pp.currency, p.token_amount, p.bonus_percentage,
--        CASE WHEN p.effective_token_amount IS NOT NULL 
--             THEN p.effective_token_amount 
--             ELSE p.token_amount + FLOOR(p.token_amount * p.bonus_percentage / 100) 
--        END as total_tokens
-- FROM packages p 
-- LEFT JOIN package_prices pp ON p.id = pp.package_id 
-- WHERE p.is_active = true AND pp.is_active = true;

-- Get user's token balance and recent activity:
-- SELECT * FROM user_token_balance WHERE user_id = 'user-uuid-here';

-- Get user's purchase history with token details:
-- SELECT * FROM user_purchases_detailed WHERE user_id = 'user-uuid-here' ORDER BY purchased_at DESC;

-- Get user's token transaction history:
-- SELECT * FROM user_token_transactions 
-- WHERE user_id = 'user-uuid-here' 
-- ORDER BY created_at DESC LIMIT 50;

-- Record a completed purchase with tokens:
-- UPDATE purchases 
-- SET status = 'completed', completed_at = NOW(), stripe_customer_id = 'cus_xxx',
--     package_id = 'pkg-uuid'
-- WHERE stripe_payment_intent_id = 'pi_xxx' AND status = 'pending';

-- Check user's current token balance:
-- SELECT tokens_remaining FROM profiles WHERE id = 'user-uuid';

-- Consume tokens (for API usage):
-- INSERT INTO user_token_transactions (user_id, transaction_type, token_amount, description)
-- VALUES ('user-uuid', 'usage', -5, 'API call - text generation');
-- UPDATE profiles 
-- SET tokens_remaining = tokens_remaining - 5, tokens_used = tokens_used + 5 
-- WHERE id = 'user-uuid' AND tokens_remaining >= 5;

-- Get packages sorted by value (tokens per dollar):
-- SELECT p.*, pp.amount_cents, 
--        CAST(p.token_amount as DECIMAL) / (pp.amount_cents / 100.0) as tokens_per_dollar
-- FROM packages p 
-- JOIN package_prices pp ON p.id = pp.package_id 
-- WHERE p.is_active = true AND pp.is_active = true
-- ORDER BY tokens_per_dollar DESC;
