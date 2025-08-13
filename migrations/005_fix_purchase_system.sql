-- Migration 005: Fix Purchase System Issues
-- This migration combines fixes for:
-- 1. Ambiguous token_amount column reference in triggers
-- 2. Missing RLS policies for user_token_transactions
-- 3. Trigger timing issues causing FK constraint violations

-- =============================================================================
-- PART 1: Fix RLS Policies for User Token Transactions
-- =============================================================================

-- Add INSERT policy for users to insert their own token transactions
DROP POLICY IF EXISTS "Users can insert own token transactions" ON user_token_transactions;
CREATE POLICY "Users can insert own token transactions" ON user_token_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy for users to update their own token transactions (if needed)
DROP POLICY IF EXISTS "Users can update own token transactions" ON user_token_transactions;
CREATE POLICY "Users can update own token transactions" ON user_token_transactions
    FOR UPDATE USING (auth.uid() = user_id);

-- Ensure the existing policies are still in place
DROP POLICY IF EXISTS "Users can view own token transactions" ON user_token_transactions;
CREATE POLICY "Users can view own token transactions" ON user_token_transactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage user token transactions" ON user_token_transactions;
CREATE POLICY "Service role can manage user token transactions" ON user_token_transactions
    FOR ALL USING (current_setting('role') = 'service_role');

-- =============================================================================
-- PART 2: Fix Purchase Stats Trigger Function
-- =============================================================================

-- Update the trigger function to work with AFTER trigger and fix ambiguous column references
CREATE OR REPLACE FUNCTION update_profile_purchase_stats()
RETURNS TRIGGER AS $$
DECLARE
    package_token_amount BIGINT := 0;
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status = 'completed') OR
       (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN
        
        -- Get token amount from package_prices with explicit table reference
        SELECT pp.token_amount INTO package_token_amount
        FROM package_prices pp 
        WHERE pp.id = NEW.package_price_id;
        
        IF package_token_amount IS NULL THEN
            RAISE EXCEPTION 'No token amount found for package price %', NEW.package_price_id;
        END IF;
        
        -- Update the purchase record with tokens_purchased (only if it's not already set)
        -- This works because we're using AFTER trigger, so the purchase record exists
        IF NEW.tokens_purchased IS NULL OR NEW.tokens_purchased = 0 THEN
            UPDATE purchases 
            SET tokens_purchased = package_token_amount
            WHERE id = NEW.id;
        END IF;
        
        -- Create token transaction record (now safe because purchase exists)
        INSERT INTO user_token_transactions (
            user_id, package_id, purchase_id, transaction_type, 
            token_amount, description, metadata
        ) VALUES (
            NEW.user_id, NEW.package_id, NEW.id, 'purchase',
            package_token_amount, 
            'Token purchase: ' || package_token_amount || ' tokens',
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
            total_tokens = COALESCE(total_tokens, 0) + package_token_amount,
            tokens_remaining = COALESCE(tokens_remaining, 0) + package_token_amount,
            last_purchase_at = NEW.completed_at,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =============================================================================
-- PART 3: Recreate Trigger with Correct Timing
-- =============================================================================

-- Recreate the trigger as AFTER instead of BEFORE to avoid FK constraint violations
DROP TRIGGER IF EXISTS update_profile_stats_on_purchase_completion ON purchases;
CREATE TRIGGER update_profile_stats_on_purchase_completion
    AFTER INSERT OR UPDATE ON purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_purchase_stats();

-- =============================================================================
-- MIGRATION SUMMARY
-- =============================================================================
-- This migration fixes the following issues:
-- 1. ✅ RLS policies allow users to insert their own token transactions
-- 2. ✅ Ambiguous column reference fixed with explicit table aliases (pp.token_amount)
-- 3. ✅ Trigger timing changed from BEFORE to AFTER to prevent FK constraint violations
-- 4. ✅ Purchase tokens_purchased field updated via separate UPDATE after insert
-- 
-- After this migration, the purchase flow should work correctly without errors.
