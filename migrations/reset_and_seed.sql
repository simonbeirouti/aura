-- reset_and_seed.sql
-- WARNING: This script DROPS ALL objects from migrations 001, 002, and 003, then seeds test data.
-- Use ONLY for testing/development. BACK UP YOUR DATA FIRST!

-- =======================================
-- DROP SECTION: Clean up all objects
-- =======================================

-- Drop views
DROP VIEW IF EXISTS user_purchase_summary;
DROP VIEW IF EXISTS user_subscriptions_detailed;
DROP VIEW IF EXISTS user_subscription_summary;
DROP VIEW IF EXISTS user_purchases_detailed;
DROP VIEW IF EXISTS user_token_balance;

-- Drop functions
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS update_profile_subscription_stats();
DROP FUNCTION IF EXISTS update_profile_purchase_stats();
DROP FUNCTION IF EXISTS consume_user_tokens();
DROP FUNCTION IF EXISTS update_updated_at_column(); -- Shared, drop last

-- Drop triggers (specify tables)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_purchases_updated_at ON purchases;
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
DROP TRIGGER IF EXISTS update_subscription_prices_updated_at ON subscription_prices;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS update_profile_stats_on_purchase_completion ON purchases;
DROP TRIGGER IF EXISTS update_profile_subscription_stats ON subscriptions;
DROP TRIGGER IF EXISTS update_package_prices_updated_at ON package_prices;
DROP TRIGGER IF EXISTS update_user_token_transactions_updated_at ON user_token_transactions;

-- Drop policies (specify tables)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can view own purchases" ON purchases;
DROP POLICY IF EXISTS "Users can insert own purchases" ON purchases;
DROP POLICY IF EXISTS "Users can update own purchases" ON purchases;
DROP POLICY IF EXISTS "Service role can manage all purchases" ON purchases;
DROP POLICY IF EXISTS "Active subscription plans are viewable by everyone" ON subscription_plans;
DROP POLICY IF EXISTS "Service role can manage subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Active subscription prices are viewable by everyone" ON subscription_prices;
DROP POLICY IF EXISTS "Service role can manage subscription prices" ON subscription_prices;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role can manage all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Active packages are viewable by everyone" ON packages;
DROP POLICY IF EXISTS "Service role can manage packages" ON packages;
DROP POLICY IF EXISTS "Active package prices are viewable by everyone" ON package_prices;
DROP POLICY IF EXISTS "Service role can manage package prices" ON package_prices;
DROP POLICY IF EXISTS "Users can view own token transactions" ON user_token_transactions;
DROP POLICY IF EXISTS "Service role can manage user token transactions" ON user_token_transactions;
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;

-- Drop tables (CASCADE for dependencies)
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS subscription_prices CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS package_prices CASCADE;
DROP TABLE IF EXISTS user_token_transactions CASCADE;

-- Drop types
DROP TYPE IF EXISTS user_theme;

-- Clean up storage (from 001)
DELETE FROM storage.buckets WHERE id = 'avatars';

-- =======================================
-- SEED SECTION: Insert test data
-- =======================================
-- Note: Run your full migrations (001, 002, 003) AFTER this drop, THEN execute these inserts.
-- These assume the tables exist post-migration.

-- Seed from 001 (e.g., sample profile - but profiles are created on signup, so manual insert example)
-- INSERT INTO profiles (id, username, full_name, onboarding_complete) VALUES ('test-uuid', 'testuser', 'Test User', true);

-- Seed from 002 (subscriptions - using provided IDs)
DELETE FROM subscription_prices;
DELETE FROM subscription_plans;

INSERT INTO subscription_plans (name, description, stripe_product_id, features, is_active, sort_order) VALUES
    ('Monthly Subscription', 'Monthly plan for $10', 'prod_Spk57CLc5GXpg1', '["Feature 1", "Feature 2"]'::jsonb, true, 1),
    ('Yearly Subscription', 'Yearly plan for $100', 'prod_Spk57CLc5GXpg1', '["All monthly features", "Extra savings"]'::jsonb, true, 2)
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

-- Seed from 003 (packages and prices - using provided IDs)
DELETE FROM package_prices;
DELETE FROM packages;

INSERT INTO packages (name, description, stripe_product_id, features, is_active, sort_order) VALUES
    ('Token Packages', 'Flexible token packages with bulk discounts', 'prod_SqniwA0Verdhlk', 
     '["Flexible token amounts", "Bulk discounts", "All features", "Priority support"]'::jsonb, true, 0)
ON CONFLICT (stripe_product_id) DO NOTHING;

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

-- Add more test data as needed (e.g., sample purchases, subscriptions, transactions)
-- INSERT INTO purchases (user_id, stripe_payment_intent_id, ...) VALUES (...);
-- INSERT INTO subscriptions (user_id, stripe_subscription_id, ...) VALUES (...);
-- INSERT INTO user_token_transactions (user_id, ...) VALUES (...);
