-- ==============================================================================
-- STUDIA AI SAAS - SUPABASE SQL DATABASE SCHEMA
-- Features: Auth, PostgreSQL, Row Level Security (RLS), Subscriptions, Usage Logs
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Subscriptions Table
-- Tracks user subscription tier in USD ('free' | 'pro_weekly' | 'pro_monthly' | 'pro_yearly')
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'pro_weekly', 'pro_monthly', 'pro_yearly')) DEFAULT 'free',
    status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'expired', 'trialing')) DEFAULT 'active',
    usage_count INT NOT NULL DEFAULT 0,
    daily_usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    current_period_start TIMESTAMPTZ DEFAULT now(),
    current_period_end TIMESTAMPTZ,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    paystack_customer_code TEXT,
    paystack_subscription_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- 3. Create AI Usage Event Logs (for interactive analytics & time-series graphs)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_type TEXT NOT NULL CHECK (feature_type IN ('summarizer', 'quiz', 'audio_synth', 'video_note', 'tutor')),
    tokens_consumed INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create User Profiles Table (if not already existing)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    is_pro BOOLEAN DEFAULT false,
    subscription_tier TEXT DEFAULT 'free',
    xp INT DEFAULT 0,
    sparks INT DEFAULT 0,
    level INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_date ON public.ai_usage_logs(user_id, created_at);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for Subscriptions
CREATE POLICY "Users can view own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
    ON public.subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to subscriptions"
    ON public.subscriptions FOR ALL
    USING (true);

-- 8. RLS Policies for AI Usage Logs
CREATE POLICY "Users can view own usage logs"
    ON public.ai_usage_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage logs"
    ON public.ai_usage_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 9. RLS Policies for Profiles
CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- 10. Trigger to automatically provision Free Subscription & Profile on New User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER AS $$
BEGIN
    -- Create profile
    INSERT INTO public.profiles (id, email, full_name, avatar_url, is_pro, subscription_tier)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
        false,
        'free'
    )
    ON CONFLICT (id) DO NOTHING;

    -- Create default free subscription
    INSERT INTO public.subscriptions (user_id, plan_type, status, usage_count, daily_usage_date)
    VALUES (NEW.id, 'free', 'active', 0, CURRENT_DATE)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- 11. RPC Function to increment usage safely with daily auto-reset
CREATE OR REPLACE FUNCTION public.increment_user_action(p_user_id UUID, p_feature_type TEXT)
RETURNS JSON AS $$
DECLARE
    v_sub RECORD;
    v_allowed BOOLEAN := false;
    v_new_count INT := 0;
    v_limit INT := 3;
BEGIN
    SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.subscriptions (user_id, plan_type, status, usage_count, daily_usage_date)
        VALUES (p_user_id, 'free', 'active', 0, CURRENT_DATE)
        RETURNING * INTO v_sub;
    END IF;

    -- Reset usage if day has passed
    IF v_sub.daily_usage_date < CURRENT_DATE THEN
        UPDATE public.subscriptions
        SET usage_count = 0, daily_usage_date = CURRENT_DATE, updated_at = now()
        WHERE user_id = p_user_id;
        v_sub.usage_count := 0;
    END IF;

    -- Pro tiers have unlimited usage
    IF v_sub.plan_type IN ('pro_weekly', 'pro_monthly', 'pro_yearly') AND v_sub.status = 'active' THEN
        v_allowed := true;
        v_new_count := v_sub.usage_count + 1;
        v_limit := -1; -- -1 indicates unlimited
        
        UPDATE public.subscriptions
        SET usage_count = v_new_count, updated_at = now()
        WHERE user_id = p_user_id;
    ELSE
        -- Free Tier: 3 daily actions
        v_limit := 3;
        IF v_sub.usage_count < 3 THEN
            v_allowed := true;
            v_new_count := v_sub.usage_count + 1;
            UPDATE public.subscriptions
            SET usage_count = v_new_count, updated_at = now()
            WHERE user_id = p_user_id;
        ELSE
            v_allowed := false;
            v_new_count := v_sub.usage_count;
        END IF;
    END IF;

    -- Log action if allowed
    IF v_allowed THEN
        INSERT INTO public.ai_usage_logs (user_id, feature_type, tokens_consumed)
        VALUES (p_user_id, p_feature_type, 1);
    END IF;

    RETURN json_build_object(
        'allowed', v_allowed,
        'usage_count', v_new_count,
        'limit', v_limit,
        'plan_type', v_sub.plan_type,
        'remaining', CASE WHEN v_limit = -1 THEN -1 ELSE GREATEST(0, v_limit - v_new_count) END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
