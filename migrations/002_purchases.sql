-- Create purchases table for tracking user package purchases
-- This table tracks one-time purchases (not subscriptions)

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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_payment_intent ON purchases(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_price_id ON purchases(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON purchases(purchased_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_purchases_updated_at 
    BEFORE UPDATE ON purchases 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own purchases
CREATE POLICY "Users can view own purchases" ON purchases
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own purchases (for purchase creation)
CREATE POLICY "Users can insert own purchases" ON purchases
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own purchases (for status updates)
CREATE POLICY "Users can update own purchases" ON purchases
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role can manage all purchases (for admin operations)
CREATE POLICY "Service role can manage all purchases" ON purchases
    FOR ALL USING (current_setting('role') = 'service_role');

-- Create a view for user purchase history with aggregated data
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

-- Grant access to the view
GRANT SELECT ON user_purchase_summary TO authenticated;

-- Create RLS policy for the view
ALTER VIEW user_purchase_summary SET (security_invoker = true);

-- Example queries for common operations:

-- Get all purchases for a user
-- SELECT * FROM purchases WHERE user_id = 'user-uuid-here' ORDER BY purchased_at DESC;

-- Get completed purchases for a user
-- SELECT * FROM purchases WHERE user_id = 'user-uuid-here' AND status = 'completed' ORDER BY purchased_at DESC;

-- Get purchase summary for a user
-- SELECT * FROM user_purchase_summary WHERE user_id = 'user-uuid-here';

-- Get recent purchases across all users (admin query)
-- SELECT p.*, u.email FROM purchases p JOIN auth.users u ON p.user_id = u.id ORDER BY p.purchased_at DESC LIMIT 50;

-- Update purchase status after payment completion
-- UPDATE purchases SET status = 'completed', completed_at = NOW() WHERE stripe_payment_intent_id = 'pi_xxx' AND status = 'pending';
