-- Fix: Convert multiple fake packages to single product with multiple prices
-- This assumes you have one Stripe product with 6 different price points

-- First, let's clean up the existing data
DELETE FROM package_prices;
DELETE FROM packages;

-- Insert the SINGLE product with the correct Stripe product ID
INSERT INTO packages (name, description, stripe_product_id, token_amount, bonus_percentage, features) VALUES
    ('Token Packages', 'Flexible token packages with bulk discounts', 'prod_SqniwA0Verdhlk', 100, 0, 
     '["Flexible token amounts", "Bulk discounts", "All features", "Priority support"]'::jsonb)
ON CONFLICT (stripe_product_id) DO NOTHING;

-- Now insert the 6 different price tiers for this single product
-- Replace the price IDs with your actual Stripe price IDs
-- The amounts should match what you see in your app (A$1.49, A$30.99, A$62.99, A$159.99)

INSERT INTO package_prices (package_id, stripe_price_id, amount_cents, currency, interval_type) 
SELECT 
    packages.id,
    price_data.stripe_price_id,
    price_data.amount_cents,
    'aud',
    'one_time'
FROM packages
CROSS JOIN (VALUES
    ('price_1Rv67RQdTny8lgOgpa3vAoNV', 149),   -- A$1.49 - Starter (100 tokens)
    ('price_1Rv67RQdTny8lgOgx2CpLumG', 749),   -- A$30.99 - Popular (500 tokens)  
    ('price_1Rv67RQdTny8lgOg3GUHGWpw', 1499),   -- A$62.99 - Pro (1000 tokens)
    ('price_1Rv67RQdTny8lgOg39n1b1oS', 3099),  -- A$159.99 - Business (5000 tokens)
    ('price_1Rv67RQdTny8lgOgJR7IzIeY', 6299), -- Replace with actual price for Enterprise
    ('price_1Rv67RQdTny8lgOgb2EwXy2v', 15999)  -- Replace with actual price for Ultimate
) AS price_data(stripe_price_id, amount_cents)
WHERE packages.stripe_product_id = 'prod_SqniwA0Verdhlk';

-- Update the packages table to create different token tiers
-- We'll modify the purchase logic to determine token amount based on price tier
-- For now, let's create a function to map price amounts to token amounts

CREATE OR REPLACE FUNCTION get_token_amount_from_price(price_cents BIGINT) 
RETURNS BIGINT AS $$
BEGIN
    RETURN CASE 
        WHEN price_cents = 149 THEN 100      -- A$1.49 = 100 tokens
        WHEN price_cents = 749 THEN 500     -- A$7.49 = 500 tokens
        WHEN price_cents = 1499 THEN 1000    -- A$14.99 = 1000 tokens
        WHEN price_cents = 3099 THEN 5000   -- A$30.99 = 5000 tokens
        WHEN price_cents = 6299 THEN 25000   -- A$162.99 = 5000 tokens
        WHEN price_cents = 15999 THEN 100000   -- A$159.99 = 5000 tokens
        -- Add your other price tiers here
        ELSE 100 -- Default fallback
    END;
END;
$$ LANGUAGE plpgsql;

-- Update the purchase trigger to use price-based token calculation
CREATE OR REPLACE FUNCTION update_profile_purchase_stats()
RETURNS TRIGGER AS $$
DECLARE
    token_amount BIGINT := 0;
    package_price_info RECORD;
BEGIN
    -- Only update stats when status changes to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        
        -- Get price information to determine token amount
        IF NEW.package_price_id IS NOT NULL THEN
            SELECT amount_cents INTO package_price_info
            FROM package_prices 
            WHERE id = NEW.package_price_id;
            
            IF FOUND THEN
                -- Calculate tokens based on price tier
                token_amount := get_token_amount_from_price(package_price_info.amount_cents);
                
                -- Update tokens_purchased in the purchase record
                UPDATE purchases 
                SET tokens_purchased = token_amount 
                WHERE id = NEW.id;
                
                -- Create token transaction record
                INSERT INTO user_token_transactions (
                    user_id, package_id, purchase_id, transaction_type, 
                    token_amount, description, metadata
                ) VALUES (
                    NEW.user_id, NEW.package_id, NEW.id, 'purchase',
                    token_amount, 
                    'Token purchase: ' || token_amount || ' tokens for ' || (package_price_info.amount_cents / 100.0) || ' AUD',
                    jsonb_build_object(
                        'price_cents', package_price_info.amount_cents,
                        'currency', 'aud',
                        'stripe_price_id', NEW.stripe_price_id
                    )
                );
                
                -- Update user profile token balances
                UPDATE profiles 
                SET 
                    total_tokens = total_tokens + token_amount,
                    tokens_remaining = tokens_remaining + token_amount,
                    total_purchases = total_purchases + 1,
                    total_spent_cents = total_spent_cents + NEW.amount_paid,
                    last_purchase_at = NEW.completed_at,
                    updated_at = NOW()
                WHERE id = NEW.user_id;
                
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: After running this, you need to:
-- 1. Replace 'prod_YOUR_ACTUAL_PRODUCT_ID' with your real Stripe product ID
-- 2. Replace all the 'price_REPLACE_WITH_ACTUAL_ID_X' with your real Stripe price IDs
-- 3. Update the amount_cents values to match your actual prices
-- 4. Update the get_token_amount_from_price function with correct token amounts
