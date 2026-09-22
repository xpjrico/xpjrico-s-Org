-- ==============================================================================
-- STUDIA SUPABASE POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Complete persistence schema for user profiles, notes, timetables, quizzes,
-- study sessions, and study streaks.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PUBLIC PROFILES TABLE
-- Stores user profiles linked directly to auth.users(id)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    photo_url TEXT,
    is_pro BOOLEAN DEFAULT FALSE,
    subscription_tier TEXT DEFAULT 'free',
    xp INTEGER DEFAULT 0,
    sparks INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    rank_title TEXT DEFAULT 'Novice Scholar',
    daily_goal_minutes INTEGER DEFAULT 45,
    bio TEXT DEFAULT 'Authenticated Scholar',
    major TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backwards-compatibility alias: users view or table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    full_name TEXT,
    photo_url TEXT,
    avatar_url TEXT,
    is_pro BOOLEAN DEFAULT FALSE,
    subscription_tier TEXT DEFAULT 'free',
    xp INTEGER DEFAULT 0,
    sparks INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    rank_title TEXT DEFAULT 'Novice Scholar',
    daily_goal_minutes INTEGER DEFAULT 45,
    bio TEXT,
    major TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. AUTOMATIC PROFILE CREATION TRIGGER & FUNCTION
-- Automatically inserts a corresponding record into public.profiles whenever a user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    user_full_name TEXT;
    user_avatar TEXT;
BEGIN
    user_full_name := COALESCE(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'user_name',
        split_part(new.email, '@', 1)
    );

    user_avatar := COALESCE(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture',
        'https://api.dicebear.com/7.x/bottts/svg?seed=' || encode(digest(new.email, 'sha256'), 'hex') || '&backgroundColor=0f172a'
    );

    -- Insert into public.profiles
    INSERT INTO public.profiles (id, email, full_name, display_name, avatar_url, photo_url)
    VALUES (
        new.id,
        new.email,
        user_full_name,
        user_full_name,
        user_avatar,
        user_avatar
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
        updated_at = NOW();

    -- Also keep public.users table synchronized
    INSERT INTO public.users (id, email, display_name, full_name, photo_url, avatar_url)
    VALUES (
        new.id,
        new.email,
        user_full_name,
        user_full_name,
        user_avatar,
        user_avatar
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        photo_url = COALESCE(EXCLUDED.photo_url, public.users.photo_url),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. NOTES TABLE
-- Includes user_id foreign key referencing auth.users(id)
CREATE TABLE IF NOT EXISTS public.notes (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    subject TEXT DEFAULT 'General',
    tags TEXT[] DEFAULT '{}',
    color TEXT DEFAULT '#6366f1',
    summary TEXT,
    teacher_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TIMETABLES & TIMETABLE SLOTS TABLE
-- Includes user_id foreign key referencing auth.users(id)
CREATE TABLE IF NOT EXISTS public.timetables (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    day TEXT NOT NULL,
    start_time TEXT NOT NULL, -- e.g. "09:00"
    end_time TEXT NOT NULL,   -- e.g. "10:30"
    subject TEXT NOT NULL,
    room TEXT NOT NULL,
    instructor TEXT,
    teacher_id TEXT,
    color TEXT DEFAULT '#6366f1',
    type TEXT DEFAULT 'Lecture',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backward compatibility table
CREATE TABLE IF NOT EXISTS public.timetable_slots (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    day TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    subject TEXT NOT NULL,
    room TEXT NOT NULL,
    instructor TEXT,
    teacher_id TEXT,
    color TEXT DEFAULT '#6366f1',
    type TEXT DEFAULT 'Lecture',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. QUIZZES TABLE
-- Includes user_id foreign key referencing auth.users(id)
CREATE TABLE IF NOT EXISTS public.quizzes (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    note_id TEXT,
    title TEXT NOT NULL,
    subject TEXT DEFAULT 'General Study',
    questions JSONB NOT NULL DEFAULT '[]', -- Array of { id, question, options, correctIndex, explanation, conceptTag }
    difficulty TEXT DEFAULT 'medium',
    attempts INTEGER DEFAULT 0,
    high_score INTEGER DEFAULT 0,
    last_score INTEGER DEFAULT 0,
    last_taken_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. STUDY STREAKS TABLE
-- Tracks real study streaks and stats bound to auth.users(id)
CREATE TABLE IF NOT EXISTS public.study_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_study_date DATE,
    total_minutes INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    weekly_activity JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. STUDY SESSIONS TABLE
-- Detailed log of focus timer and study sessions referencing auth.users(id)
CREATE TABLE IF NOT EXISTS public.study_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    timestamp BIGINT,
    duration_minutes INTEGER DEFAULT 25,
    tag TEXT DEFAULT 'General',
    xp_earned INTEGER DEFAULT 0,
    sparks_earned INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. TEACHERS DIRECTORY TABLE
-- Faculty and instructor cards bound to auth.users(id)
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    email TEXT NOT NULL,
    office_hours TEXT,
    office_location TEXT,
    room_link TEXT,
    notes TEXT,
    rating NUMERIC(2, 1) DEFAULT 5.0,
    color TEXT DEFAULT '#6366f1',
    department TEXT,
    avatar TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. CACHED SUMMARIES & QUIZZES (Content-hash lookup to save AI credits)
CREATE TABLE IF NOT EXISTS public.cached_summaries (
    id TEXT PRIMARY KEY DEFAULT ('cache_' || gen_random_uuid()::text),
    content_hash TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content_preview TEXT,
    summary TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    format TEXT DEFAULT 'auto',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cached_quizzes (
    id TEXT PRIMARY KEY DEFAULT ('quiz_cache_' || gen_random_uuid()::text),
    content_hash TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    questions JSONB NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    question_count INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id TEXT PRIMARY KEY DEFAULT ('sub_' || gen_random_uuid()::text),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_type TEXT NOT NULL DEFAULT 'free',
    plan_name TEXT NOT NULL DEFAULT 'Free Scholar',
    payment_method TEXT NOT NULL DEFAULT 'none',
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'KES',
    phone_number TEXT,
    mpesa_receipt_number TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    ai_usage_count INTEGER DEFAULT 0,
    ai_usage_limit INTEGER DEFAULT 6,
    last_usage_reset_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. HIGH-PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_timetables_user_id ON public.timetables(user_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_user_id ON public.timetable_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON public.quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON public.study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_cached_summaries_hash ON public.cached_summaries(content_hash);
CREATE INDEX IF NOT EXISTS idx_cached_quizzes_hash ON public.cached_quizzes(content_hash);

-- 13. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict user boundary: users can only SELECT, INSERT, UPDATE, and DELETE their own records (auth.uid() = user_id)

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
    ON public.profiles FOR DELETE
    USING (auth.uid() = id);

-- USERS TABLE POLICIES
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
CREATE POLICY "Users can view own record"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
CREATE POLICY "Users can insert own record"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own record"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- NOTES POLICIES
DROP POLICY IF EXISTS "Users can select own notes" ON public.notes;
CREATE POLICY "Users can select own notes"
    ON public.notes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
CREATE POLICY "Users can insert own notes"
    ON public.notes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
CREATE POLICY "Users can update own notes"
    ON public.notes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
CREATE POLICY "Users can delete own notes"
    ON public.notes FOR DELETE
    USING (auth.uid() = user_id);

-- TIMETABLES POLICIES
DROP POLICY IF EXISTS "Users can select own timetables" ON public.timetables;
CREATE POLICY "Users can select own timetables"
    ON public.timetables FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own timetables" ON public.timetables;
CREATE POLICY "Users can insert own timetables"
    ON public.timetables FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own timetables" ON public.timetables;
CREATE POLICY "Users can update own timetables"
    ON public.timetables FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own timetables" ON public.timetables;
CREATE POLICY "Users can delete own timetables"
    ON public.timetables FOR DELETE
    USING (auth.uid() = user_id);

-- TIMETABLE_SLOTS POLICIES
DROP POLICY IF EXISTS "Users can select own timetable_slots" ON public.timetable_slots;
CREATE POLICY "Users can select own timetable_slots"
    ON public.timetable_slots FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own timetable_slots" ON public.timetable_slots;
CREATE POLICY "Users can insert own timetable_slots"
    ON public.timetable_slots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own timetable_slots" ON public.timetable_slots;
CREATE POLICY "Users can update own timetable_slots"
    ON public.timetable_slots FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own timetable_slots" ON public.timetable_slots;
CREATE POLICY "Users can delete own timetable_slots"
    ON public.timetable_slots FOR DELETE
    USING (auth.uid() = user_id);

-- QUIZZES POLICIES
DROP POLICY IF EXISTS "Users can select own quizzes" ON public.quizzes;
CREATE POLICY "Users can select own quizzes"
    ON public.quizzes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own quizzes" ON public.quizzes;
CREATE POLICY "Users can insert own quizzes"
    ON public.quizzes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own quizzes" ON public.quizzes;
CREATE POLICY "Users can update own quizzes"
    ON public.quizzes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own quizzes" ON public.quizzes;
CREATE POLICY "Users can delete own quizzes"
    ON public.quizzes FOR DELETE
    USING (auth.uid() = user_id);

-- STUDY_STREAKS POLICIES
DROP POLICY IF EXISTS "Users can select own study_streaks" ON public.study_streaks;
CREATE POLICY "Users can select own study_streaks"
    ON public.study_streaks FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own study_streaks" ON public.study_streaks;
CREATE POLICY "Users can insert own study_streaks"
    ON public.study_streaks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own study_streaks" ON public.study_streaks;
CREATE POLICY "Users can update own study_streaks"
    ON public.study_streaks FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own study_streaks" ON public.study_streaks;
CREATE POLICY "Users can delete own study_streaks"
    ON public.study_streaks FOR DELETE
    USING (auth.uid() = user_id);

-- STUDY_SESSIONS POLICIES
DROP POLICY IF EXISTS "Users can select own study_sessions" ON public.study_sessions;
CREATE POLICY "Users can select own study_sessions"
    ON public.study_sessions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own study_sessions" ON public.study_sessions;
CREATE POLICY "Users can insert own study_sessions"
    ON public.study_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own study_sessions" ON public.study_sessions;
CREATE POLICY "Users can update own study_sessions"
    ON public.study_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own study_sessions" ON public.study_sessions;
CREATE POLICY "Users can delete own study_sessions"
    ON public.study_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- TEACHERS POLICIES
DROP POLICY IF EXISTS "Users can select own teachers" ON public.teachers;
CREATE POLICY "Users can select own teachers"
    ON public.teachers FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own teachers" ON public.teachers;
CREATE POLICY "Users can insert own teachers"
    ON public.teachers FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own teachers" ON public.teachers;
CREATE POLICY "Users can update own teachers"
    ON public.teachers FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own teachers" ON public.teachers;
CREATE POLICY "Users can delete own teachers"
    ON public.teachers FOR DELETE
    USING (auth.uid() = user_id);

-- CACHED DATA POLICIES (Shared read for optimization)
DROP POLICY IF EXISTS "Anyone can read cached summaries" ON public.cached_summaries;
CREATE POLICY "Anyone can read cached summaries"
    ON public.cached_summaries FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert cached summaries" ON public.cached_summaries;
CREATE POLICY "Authenticated users can insert cached summaries"
    ON public.cached_summaries FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can read cached quizzes" ON public.cached_quizzes;
CREATE POLICY "Anyone can read cached quizzes"
    ON public.cached_quizzes FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert cached quizzes" ON public.cached_quizzes;
CREATE POLICY "Authenticated users can insert cached quizzes"
    ON public.cached_quizzes FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- SUBSCRIPTIONS POLICIES
DROP POLICY IF EXISTS "Users can select own subscription" ON public.subscriptions;
CREATE POLICY "Users can select own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own subscription" ON public.subscriptions;
CREATE POLICY "Users can manage own subscription"
    ON public.subscriptions FOR ALL
    USING (auth.uid() = user_id);

-- Migration safety: Ensure subscription_tier exists if table was previously created
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';

-- Function to upgrade user to Pro status in profiles & subscriptions
CREATE OR REPLACE FUNCTION public.upgrade_user_to_pro(
    target_user_id UUID,
    p_tier TEXT DEFAULT 'pro',
    p_receipt TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update public.profiles
    UPDATE public.profiles
    SET is_pro = TRUE,
        subscription_tier = p_tier,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Update public.users compatibility table
    UPDATE public.users
    SET is_pro = TRUE,
        subscription_tier = p_tier,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Upsert active subscription record
    INSERT INTO public.subscriptions (
        user_id,
        plan_type,
        plan_name,
        status,
        payment_method,
        amount,
        currency,
        mpesa_receipt_number,
        ai_usage_limit,
        expires_at
    )
    VALUES (
        target_user_id,
        'monthly_pro',
        'Monthly Pro Plan',
        'active',
        'paystack',
        500,
        'KES',
        p_receipt,
        999999,
        NOW() + INTERVAL '30 days'
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', target_user_id,
        'tier', p_tier,
        'is_pro', true
    );
END;
$$;
