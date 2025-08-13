/* 
-- Optional: Drop existing tables for clean first run (uncomment if needed for testing)
DROP VIEW IF EXISTS user_purchase_summary, user_subscriptions_detailed, user_subscription_summary;
DROP TABLE IF EXISTS purchases, subscription_plans, subscription_prices, subscriptions CASCADE;
*/

-- Migration 002: Purchases and Subscriptions System
-- Merges purchase tracking (one-to-many with users) and subscription management (one-to-one with users).
-- Builds on 001_initial.sql.

-- Purchases table (one-to-many: one user can have many purchases)
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    stripe_price_id TEXT NOT NULL,
    stripe_product_id TEXT NOT NULL,
    amount_paid BIGINT NOT NULL, -- Amount in cents
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    product_name TEXT,
    product_description TEXT,
    price_description TEXT,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create shared updated_at function (used by triggers) - moved here to define before any triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Indexes for purchases
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_payment_intent ON purchases(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_price_id ON purchases(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases(purchased_at DESC);

-- Enable RLS for purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- RLS policies for purchases
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

-- Updated_at trigger for purchases
DROP TRIGGER IF EXISTS update_purchases_updated_at ON purchases;
CREATE TRIGGER update_purchases_updated_at 
    BEFORE UPDATE ON purchases 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- View for user purchase summary (aggregated)
CREATE OR REPLACE VIEW user_purchase_summary AS
SELECT 
    user_id,
    COUNT(*) as total_purchases,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_purchases,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_purchases,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_purchases,
    COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_purchases,
    SUM(CASE WHEN status = 'completed' THEN amount_paid ELSE 0 END) as total_spent_cents,
    MIN(purchased_at) as first_purchase_at,
    MAX(purchased_at) as last_purchase_at
FROM purchases
GROUP BY user_id;

GRANT SELECT ON user_purchase_summary TO authenticated;
ALTER VIEW user_purchase_summary SET (security_invoker = true);

-- Add subscription columns to profiles (moved from 001)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_period_end BIGINT;

-- Note: Purchase-related columns (e.g., total_purchases, tokens) are added in 003_purchase_completion.sql

-- Now, subscriptions section

-- Ensure profiles has subscription fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_period_end BIGINT;

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    stripe_product_id TEXT UNIQUE NOT NULL,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription prices table
CREATE TABLE IF NOT EXISTS subscription_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    stripe_price_id TEXT UNIQUE NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    interval_type TEXT NOT NULL,
    interval_count INTEGER DEFAULT 1,
    token_amount BIGINT DEFAULT 0,
    trial_period_days INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table (one-to-one enforced via UNIQUE(user_id))
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, -- Enforces one subscription per user
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_price_id TEXT NOT NULL,
    stripe_product_id TEXT NOT NULL,
    subscription_plan_id UUID REFERENCES subscription_plans(id),
    subscription_price_id UUID REFERENCES subscription_prices(id),
    status TEXT NOT NULL DEFAULT 'pending',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- After table creations, before indexes

-- Create shared updated_at function (used by triggers)
-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_product_id ON subscription_plans(stripe_product_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);

CREATE INDEX IF NOT EXISTS idx_subscription_prices_plan_id ON subscription_prices(subscription_plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_prices_stripe_price_id ON subscription_prices(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_subscription_prices_interval_type ON subscription_prices(interval_type);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON subscriptions(current_period_end);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Active subscription plans are viewable by everyone" ON subscription_plans;
CREATE POLICY "Active subscription plans are viewable by everyone" ON subscription_plans
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage subscription plans" ON subscription_plans;
CREATE POLICY "Service role can manage subscription plans" ON subscription_plans
    FOR ALL USING (current_setting('role') = 'service_role');

DROP POLICY IF EXISTS "Active subscription prices are viewable by everyone" ON subscription_prices;
CREATE POLICY "Active subscription prices are viewable by everyone" ON subscription_prices
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage subscription prices" ON subscription_prices;
CREATE POLICY "Service role can manage subscription prices" ON subscription_prices
    FOR ALL USING (current_setting('role') = 'service_role');

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;
CREATE POLICY "Users can insert own subscriptions" ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
CREATE POLICY "Users can update own subscriptions" ON subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all subscriptions" ON subscriptions;
CREATE POLICY "Service role can manage all subscriptions" ON subscriptions
    FOR ALL USING (current_setting('role') = 'service_role');

-- Updated_at triggers
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_prices_updated_at ON subscription_prices;
CREATE TRIGGER update_subscription_prices_updated_at
    BEFORE UPDATE ON subscription_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update profiles on subscription changes (simplified, no tokens yet)
CREATE OR REPLACE FUNCTION update_profile_subscription_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.status = 'active' THEN
        UPDATE profiles
        SET
            subscription_id = NEW.stripe_subscription_id,
            subscription_status = NEW.status,
            subscription_period_end = EXTRACT(EPOCH FROM NEW.current_period_end),
            updated_at = NOW()
        WHERE id = NEW.user_id;
    ELSIF NEW.status IN ('canceled', 'past_due') THEN
        UPDATE profiles
        SET
            subscription_status = NEW.status,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profile_subscription_stats ON subscriptions;
CREATE TRIGGER update_profile_subscription_stats
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_subscription_stats();

-- Views for subscriptions
CREATE OR REPLACE VIEW user_subscriptions_detailed AS
SELECT
    s.*,
    sp.name as plan_name,
    sp.description as plan_description,
    sp.features,
    p.username,
    p.full_name
FROM subscriptions s
LEFT JOIN subscription_plans sp ON s.subscription_plan_id = sp.id
LEFT JOIN profiles p ON s.user_id = p.id;

CREATE OR REPLACE VIEW user_subscription_summary AS
SELECT
    user_id,
    COUNT(*) as total_subscriptions,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
    MAX(current_period_end) as latest_period_end
FROM subscriptions
GROUP BY user_id;

-- Grant access to views
GRANT SELECT ON user_subscriptions_detailed TO authenticated;
GRANT SELECT ON user_subscription_summary TO authenticated;

-- Seed data for purchases (from original 002/003, adapted)
-- (Insert sample data if needed, but since merged, add here or in 003)

-- Seed sample data for subscriptions (updated with provided IDs)
DELETE FROM subscription_prices;
DELETE FROM subscription_plans;

INSERT INTO subscription_plans (name, description, stripe_product_id, features, is_active, sort_order) VALUES
    ('Monthly Subscription', 'Monthly plan for $10', 'prod_Spk57CLc5GXpg1', '["Feature 1", "Feature 2"]'::jsonb, true, 1),
    ('Yearly Subscription', 'Yearly plan for $100', 'prod_Spk57CLc5GXpg1', '["All monthly features", "Extra savings"]'::jsonb, true, 2) -- Note: Same product ID for multiple prices
ON CONFLICT (stripe_product_id) DO NOTHING;

INSERT INTO subscription_prices (subscription_plan_id, stripe_price_id, amount_cents, currency, interval_type, interval_count, token_amount, trial_period_days, is_active)
SELECT
    sp.id,
    price_data.stripe_price_id,
    price_data.amount_cents,
    'usd',
    price_data.interval_type,
    price_data.interval_count,
    price_data.token_amount,
    price_data.trial_days,
    true
FROM subscription_plans sp
CROSS JOIN (VALUES
    ('price_1Ru4bTQdTny8lgOgP5qX1jJ7', 1000, 'month', 1, 1000, 0), -- $10 monthly
    ('price_1Ru4bTQdTny8lgOgJKLaFPVf', 10000, 'year', 1, 12000, 0) -- $100 yearly
) AS price_data(stripe_price_id, amount_cents, interval_type, interval_count, token_amount, trial_days)
WHERE sp.stripe_product_id = 'prod_Spk57CLc5GXpg1'
ON CONFLICT (stripe_price_id) DO NOTHING;

-- Note: For packages seeding (purchases), add to 003_purchase_completion.sql similarly, using the provided IDs:
-- e.g., INSERT INTO packages (stripe_product_id) VALUES ('prod_SqniwA0Verdhlk');
-- Then INSERT INTO package_prices with the price IDs (1.49: price_1Rv67RQdTny8lgOgpa3vAoNV, etc.)

-- Example queries
-- Get user's purchases: SELECT * FROM purchases WHERE user_id = 'uuid-here';
-- Get user's subscription: SELECT * FROM subscriptions WHERE user_id = 'uuid-here';
