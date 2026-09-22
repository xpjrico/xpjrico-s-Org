import React, { createContext, useContext, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { UserProfile, SubscriptionRecord, PricingTierId } from '../types';
import { getRankByXp } from './gamification';
import {
  getStoredActiveUserId,
  setStoredActiveUserId,
  getStoredUsers,
  saveStoredUsers,
  getUserSubscription,
  saveUserSubscription,
  incrementUserAiUsage,
} from './storage';
import { playNotificationChime } from './focusAudio';
import {
  supabase,
  signOutSupabase,
  isSupabaseConfigured,
  SUPABASE_URL,
  saveSessionJwtToStorage,
  clearSessionJwtFromStorage,
  getStoredSessionJwt,
  SUPABASE_STORAGE_KEY,
  SUPABASE_LEGACY_TOKEN_KEY,
  customStorageAdapter,
} from './supabase';
import {
  syncProfileToSupabase,
  upgradeUserToProInSupabase,
  incrementUsageCountInSupabase,
} from './supabaseSync';

export const FREE_AI_LIMIT = 5;

interface AuthContextType {
  user: UserProfile | null;
  subscription: SubscriptionRecord | null;
  isLoading: boolean;
  isSupabaseConfigured: boolean;
  isPremium: boolean;
  usageCount: number;
  loginWithEmail: (email: string, pass: string) => Promise<UserProfile>;
  signupWithEmail: (email: string, pass: string, name: string, photoURL?: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => void;
  addXpAndSparks: (xp: number, sparks: number) => void;
  upgradeToPro: () => void;
  unlockPremium: (receipt?: string) => Promise<void>;
  activateSubscription: (
    tierId: PricingTierId,
    paymentMethod: 'mpesa' | 'card' | 'airtel' | 'paypal' | 'none',
    amount: number,
    currency: 'KES' | 'USD',
    extraDetails?: { phoneNumber?: string; receipt?: string; durationDays?: number }
  ) => void;
  checkCanUseAi: () => {
    allowed: boolean;
    usageCount: number;
    limit: number;
    remaining: number;
    isPremium: boolean;
  };
  recordSuccessfulAiGeneration: () => Promise<number>;
  consumeAiQuota: () => {
    allowed: boolean;
    usageCount: number;
    limit: number;
    remaining: number;
    isUnlimited?: boolean;
    reason?: string;
    nextResetFormatted?: string;
  };
  refreshSubscription: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync active subscription whenever user changes
  useEffect(() => {
    const userId = user?.id || 'guest_user';
    const currentSub = getUserSubscription(userId);
    setSubscription(currentSub);
  }, [user?.id]);

  const refreshSubscription = () => {
    const userId = user?.id || 'guest_user';
    const currentSub = getUserSubscription(userId);
    setSubscription(currentSub);
  };

  // Helper to construct/merge user profile from Supabase Auth User
  const syncSupabaseUser = (sbUser: any): UserProfile => {
    const allUsers = getStoredUsers();
    const userEmail = (sbUser.email || sbUser.user_metadata?.email || '').trim();
    
    let existing = allUsers.find(
      (u) => u.id === sbUser.id || (userEmail && u.email.toLowerCase() === userEmail.toLowerCase())
    );

    const displayName =
      sbUser.user_metadata?.full_name ||
      sbUser.user_metadata?.name ||
      sbUser.user_metadata?.user_name ||
      (userEmail ? userEmail.split('@')[0] : 'Student');

    const photoURL =
      sbUser.user_metadata?.avatar_url ||
      sbUser.user_metadata?.picture ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userEmail || 'student')}&backgroundColor=0f172a`;

    if (!existing) {
      existing = {
        id: sbUser.id,
        email: userEmail || '',
        displayName: displayName,
        name: displayName,
        photoURL: photoURL,
        provider: 'google',
        isPro: false,
        xp: 0,
        sparks: 0,
        level: 1,
        rankTitle: 'Novice Scholar',
        dailyGoalMinutes: 45,
        joinedDate: sbUser.created_at || new Date().toISOString(),
        bio: 'Authenticated Scholar',
        user_metadata: sbUser.user_metadata || {},
      };
      allUsers.push(existing);
      saveStoredUsers(allUsers);
    } else {
      // Dynamically update profile details from Google provider
      if (displayName) {
        existing.displayName = displayName;
        existing.name = displayName;
      }
      if (userEmail) existing.email = userEmail;
      if (photoURL) existing.photoURL = photoURL;
      existing.user_metadata = sbUser.user_metadata || existing.user_metadata || {};
      existing.provider = 'google';
      saveStoredUsers(allUsers);
    }

    const rank = getRankByXp(existing.xp || 0);
    const resolvedUser: UserProfile = {
      ...existing,
      rankTitle: rank.title,
      level: rank.level,
    };

    setStoredActiveUserId(resolvedUser.id);
    setUser(resolvedUser);

    // Sync profile to Supabase public.profiles table
    syncProfileToSupabase({
      id: resolvedUser.id,
      email: resolvedUser.email,
      full_name: resolvedUser.displayName || resolvedUser.name || '',
      display_name: resolvedUser.displayName,
      avatar_url: resolvedUser.photoURL,
      photo_url: resolvedUser.photoURL,
      is_pro: resolvedUser.isPro,
      subscription_tier: resolvedUser.subscriptionTier,
      xp: resolvedUser.xp,
      sparks: resolvedUser.sparks,
      level: resolvedUser.level,
      rank_title: resolvedUser.rankTitle,
      daily_goal_minutes: resolvedUser.dailyGoalMinutes,
    }).catch(() => {});

    // Check remote Pro and Premium status and usage_count from Supabase public.profiles
    if (isSupabaseConfigured) {
      supabase
        .from('profiles')
        .select('is_pro, is_premium, usage_count, subscription_tier')
        .eq('id', resolvedUser.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const isPremium = Boolean(data.is_premium || data.is_pro || data.subscription_tier === 'pro');
            resolvedUser.isPro = isPremium;
            resolvedUser.isPremium = isPremium;
            resolvedUser.is_premium = isPremium;
            if (typeof data.usage_count === 'number') {
              resolvedUser.usage_count = data.usage_count;
              resolvedUser.usageCount = data.usage_count;
            }
            if (isPremium) {
              resolvedUser.subscriptionTier = 'pro';
            }
            setUser({ ...resolvedUser });
          }
        })
        .catch(() => {});
    }

    return resolvedUser;
  };

  // Load existing session on boot & subscribe to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        if (isSupabaseConfigured) {
          // 1. Check active Supabase session
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            if (session.access_token) {
              saveSessionJwtToStorage(session.access_token, session.refresh_token, session);
            }
            syncSupabaseUser(session.user);
            setIsLoading(false);
            return;
          }

          // 2. Fallback hydration: If getSession was empty but storage contains valid session tokens, restore session
          const storedSessionStr =
            customStorageAdapter.getItem(SUPABASE_STORAGE_KEY) ||
            customStorageAdapter.getItem(SUPABASE_LEGACY_TOKEN_KEY) ||
            customStorageAdapter.getItem('sb-jrcexjeloihnjvwlgvby-auth-token');
          if (storedSessionStr) {
            try {
              const parsed = JSON.parse(storedSessionStr);
              const accessTok = parsed?.access_token || parsed?.currentSession?.access_token;
              const refreshTok = parsed?.refresh_token || parsed?.currentSession?.refresh_token;
              if (accessTok && refreshTok && supabase.auth.setSession) {
                const { data: restored } = await supabase.auth.setSession({
                  access_token: accessTok,
                  refresh_token: refreshTok,
                });
                if (restored?.session?.user && mounted) {
                  saveSessionJwtToStorage(restored.session.access_token, restored.session.refresh_token, restored.session);
                  syncSupabaseUser(restored.session.user);
                  setIsLoading(false);
                  return;
                }
              }
            } catch (parseErr) {
              console.warn('[AuthContext] Error parsing stored session:', parseErr);
            }
          }

          const { data: { user: sbUser } } = await supabase.auth.getUser();
          if (sbUser && mounted) {
            syncSupabaseUser(sbUser);
            setIsLoading(false);
            return;
          }
        }

        // Fallback to local stored session if no active Supabase session
        const activeId = getStoredActiveUserId();
        if (activeId && mounted) {
          const allUsers = getStoredUsers();
          const found = allUsers.find((u) => u.id === activeId && u.email);
          if (found) {
            const rank = getRankByXp(found.xp || 0);
            setUser({
              ...found,
              rankTitle: rank.title,
              level: rank.level,
            });
          } else {
            setStoredActiveUserId(null);
          }
        }
      } catch (e) {
        console.error('Failed to load user auth state:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    // Supabase Auth listener
    let authListener: { subscription: { unsubscribe: () => void } } | null = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
        if (session?.access_token) {
          saveSessionJwtToStorage(session.access_token, session.refresh_token, session);
        }
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          syncSupabaseUser(session.user);
          playNotificationChime('levelup');
        } else if (event === 'TOKEN_REFRESHED' && session) {
          saveSessionJwtToStorage(session.access_token, session.refresh_token, session);
          if (session.user) syncSupabaseUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          clearSessionJwtFromStorage();
          setStoredActiveUserId(null);
          setUser(null);
        }
      });
      authListener = data;
    }

    // Cross-tab and iframe localStorage sync listener
    const handleStorageChange = (e: StorageEvent) => {
      if (!mounted) return;
      if (
        e.key === SUPABASE_STORAGE_KEY ||
        e.key === 'studia_session_jwt' ||
        e.key === 'sb-access-token'
      ) {
        if (!e.newValue) {
          setUser(null);
          setStoredActiveUserId(null);
        } else {
          initAuth();
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }

    return () => {
      mounted = false;
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
      }
    };
  }, []);

  const signupWithEmail = async (email: string, pass: string, name: string, photoURL?: string): Promise<UserProfile> => {
    if (!email || !email.includes('@')) {
      throw new Error('Please provide a valid email address.');
    }
    if (!pass || pass.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (!name || name.trim().length === 0) {
      throw new Error('Display name is required.');
    }

    // Direct live Supabase Sign Up
    if (isSupabaseConfigured) {
      console.log('Attempting Auth with URL:', SUPABASE_URL);
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: {
            data: {
              full_name: name.trim(),
              name: name.trim(),
              avatar_url: photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name || email)}&backgroundColor=18182b`,
            },
          },
        });

        if (error) {
          console.error('[Supabase SignUp Error]', error);
          throw new Error(error.message || 'Failed to create account in Supabase.');
        }

        if (data?.user) {
          if (data.session?.access_token) {
            saveSessionJwtToStorage(data.session.access_token, data.session.refresh_token, data.session);
          }
          const synced = syncSupabaseUser(data.user);
          playNotificationChime('levelup');
          return synced;
        }
      } catch (err: any) {
        console.error('[Supabase SignUp Exception]', err);
        const errMsg = err?.message || String(err);
        if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('TypeError')) {
          throw new Error(
            `Connection failed (Failed to fetch) while contacting Supabase at: ${SUPABASE_URL}. Please check if the project is active/unpaused, or if CORS/ad-blockers are blocking the request.`
          );
        }
        throw new Error(errMsg);
      }
    }

    const allUsers = getStoredUsers();
    const existing = allUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('An account with this email already exists. Please log in.');
    }

    // Default avatar if none provided
    const avatar =
      photoURL ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name || email)}&backgroundColor=18182b`;

    const newUser: UserProfile = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: email.trim(),
      displayName: name.trim(),
      photoURL: avatar,
      provider: 'email',
      isPro: false,
      xp: 0,
      sparks: 0,
      level: 1,
      rankTitle: 'Novice Scholar',
      dailyGoalMinutes: 45,
      joinedDate: new Date().toISOString(),
      bio: 'Ready to master my subjects with Studia!',
    };

    allUsers.push(newUser);
    saveStoredUsers(allUsers);
    setStoredActiveUserId(newUser.id);
    setUser(newUser);

    playNotificationChime('levelup');
    return newUser;
  };

  const loginWithEmail = async (email: string, pass: string): Promise<UserProfile> => {
    if (!email || !pass) {
      throw new Error('Please enter both email and password.');
    }

    // Direct live Supabase Sign In
    if (isSupabaseConfigured) {
      console.log('Attempting Auth with URL:', SUPABASE_URL);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });

        if (error) {
          console.error('[Supabase SignIn Error]', error);
          throw new Error(error.message || 'Invalid email or password. Please try again.');
        }

        if (data?.user) {
          if (data.session?.access_token) {
            saveSessionJwtToStorage(data.session.access_token, data.session.refresh_token, data.session);
          }
          const synced = syncSupabaseUser(data.user);
          playNotificationChime('start');
          return synced;
        }
      } catch (err: any) {
        console.error('[Supabase SignIn Exception]', err);
        const errMsg = err?.message || String(err);
        if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('TypeError')) {
          throw new Error(
            `Connection failed (Failed to fetch) while contacting Supabase at: ${SUPABASE_URL}. Please check if the project is active/unpaused, or if CORS/ad-blockers are blocking the request.`
          );
        }
        throw new Error(errMsg);
      }
    }

    const allUsers = getStoredUsers();
    const found = allUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!found) {
      throw new Error('No account found with this email. Please check your credentials or create an account.');
    }

    const rank = getRankByXp(found.xp || 0);
    const updated = { ...found, rankTitle: rank.title, level: rank.level };

    setStoredActiveUserId(updated.id);
    setUser(updated);
    playNotificationChime('start');
    return updated;
  };

  const logout = async () => {
    try {
      await signOutSupabase();
    } catch (e) {
      console.warn('Error signing out Supabase:', e);
    }
    clearSessionJwtFromStorage();
    setStoredActiveUserId(null);
    setUser(null);
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!user) return;
    const allUsers = getStoredUsers();
    const updatedUser = { ...user, ...updates };

    const rank = getRankByXp(updatedUser.xp || 0);
    updatedUser.rankTitle = rank.title;
    updatedUser.level = rank.level;

    const newUsersList = allUsers.map((u) => (u.id === user.id ? updatedUser : u));
    saveStoredUsers(newUsersList);
    setUser(updatedUser);
  };

  const addXpAndSparks = (xpDelta: number, sparksDelta: number) => {
    if (!user) return;
    const multiplier = user.isPro ? 2 : 1;
    const actualXpDelta = xpDelta * multiplier;
    const newXp = (user.xp || 0) + actualXpDelta;
    const newSparks = (user.sparks || 0) + sparksDelta;

    const prevRank = getRankByXp(user.xp || 0);
    const newRank = getRankByXp(newXp);

    const isLevelUp = newRank.level > prevRank.level;

    const allUsers = getStoredUsers();
    const updatedUser: UserProfile = {
      ...user,
      xp: newXp,
      sparks: newSparks,
      level: newRank.level,
      rankTitle: newRank.title,
    };

    const newUsersList = allUsers.map((u) => (u.id === user.id ? updatedUser : u));
    saveStoredUsers(newUsersList);
    setUser(updatedUser);

    if (isLevelUp) {
      playNotificationChime('levelup');
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#a855f7', '#6366f1', '#f59e0b', '#06b6d4'],
        });
      } catch {}
    }
  };

  const upgradeToPro = () => {
    activateSubscription('monthly_pro', 'card', 380, 'KES');
  };

  const activateSubscription = (
    tierId: PricingTierId,
    paymentMethod: 'mpesa' | 'card' | 'airtel' | 'paypal' | 'none',
    amount: number,
    currency: 'KES' | 'USD',
    extraDetails?: { phoneNumber?: string; receipt?: string; durationDays?: number }
  ) => {
    const userId = user?.id || 'guest_user';
    const planNames: Record<PricingTierId, string> = {
      free: 'Free Scholar',
      pro_weekly: 'Pro Weekly ($0.99)',
      pro_monthly: 'Pro Monthly ($2.99)',
      pro_yearly: 'Pro Yearly ($24.99)',
      exam_pass: '7-Day Exam Pass',
      monthly_pro: 'Monthly Premium',
      annual_pass: 'Annual All-Access Pass',
    };

    const aiLimits: Record<PricingTierId, number> = {
      free: 3,
      pro_weekly: Infinity,
      pro_monthly: Infinity,
      pro_yearly: Infinity,
      exam_pass: Infinity,
      monthly_pro: Infinity,
      annual_pass: Infinity,
    };

    let expiresAt: string | null = null;
    if (tierId === 'pro_weekly' || tierId === 'exam_pass') {
      const days = extraDetails?.durationDays || 7;
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    } else if (tierId === 'pro_monthly' || tierId === 'monthly_pro') {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (tierId === 'pro_yearly' || tierId === 'annual_pass') {
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const newSub: SubscriptionRecord = {
      id: `sub_${Date.now()}_${userId.slice(0, 6)}`,
      userId,
      planType: tierId,
      planName: planNames[tierId] || 'Premium',
      status: 'active',
      paymentMethod,
      amount,
      currency,
      phoneNumber: extraDetails?.phoneNumber,
      mpesaReceiptNumber: extraDetails?.receipt,
      createdAt: new Date().toISOString(),
      expiresAt,
      aiUsageCount: 0, // Reset usage on purchase/upgrade
      aiUsageLimit: aiLimits[tierId] ?? Infinity,
      lastUsageResetDate: new Date().toISOString(),
    };

    saveUserSubscription(userId, newSub);
    setSubscription(newSub);

    if (user) {
      const isProNow = tierId !== 'free';
      updateProfile({
        isPro: isProNow,
        isPremium: isProNow,
        is_premium: isProNow,
        subscriptionTier: isProNow ? 'pro' : 'free',
      });
      if (isProNow && user.id && user.id !== 'guest_user') {
        upgradeUserToProInSupabase(user.id, 'pro', extraDetails?.receipt).catch(() => {});
      }
    }

    playNotificationChime('levelup');
    try {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#00a344', '#f59e0b', '#a855f7', '#6366f1'],
      });
    } catch {}
  };

  const unlockPremium = async (receipt?: string) => {
    activateSubscription('monthly_pro', 'card', 380, 'KES', { receipt });
    if (user?.id && user.id !== 'guest_user') {
      await upgradeUserToProInSupabase(user.id, 'pro', receipt);
    }
  };

  const isPremium = Boolean(
    user?.is_premium ||
    user?.isPremium ||
    user?.isPro ||
    (subscription && subscription.planType !== 'free' && subscription.status === 'active')
  );

  const usageCount =
    typeof user?.usage_count === 'number'
      ? user.usage_count
      : typeof user?.usageCount === 'number'
      ? user.usageCount
      : subscription?.aiUsageCount || 0;

  const checkCanUseAi = () => {
    if (isPremium) {
      return {
        allowed: true,
        usageCount,
        limit: Infinity,
        remaining: Infinity,
        isPremium: true,
      };
    }
    const allowed = usageCount < FREE_AI_LIMIT;
    return {
      allowed,
      usageCount,
      limit: FREE_AI_LIMIT,
      remaining: Math.max(0, FREE_AI_LIMIT - usageCount),
      isPremium: false,
    };
  };

  const recordSuccessfulAiGeneration = async (): Promise<number> => {
    // 1. Increment local quota record
    const result = consumeAiQuota();
    const newCount = result.usageCount;

    // 2. Update state and local storage profile
    if (user) {
      const updated = {
        ...user,
        usage_count: newCount,
        usageCount: newCount,
      };
      updateProfile({ usage_count: newCount, usageCount: newCount });

      // 3. Increment counter in Supabase profiles table
      if (user.id && user.id !== 'guest_user') {
        incrementUsageCountInSupabase(user.id).catch((err) => {
          console.warn('Failed to increment usage_count in Supabase:', err);
        });
      }
    }
    return newCount;
  };

  const consumeAiQuota = () => {
    const userId = user?.id || 'guest_user';
    const result = incrementUserAiUsage(userId);
    refreshSubscription();
    return result;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        isLoading,
        isSupabaseConfigured,
        isPremium,
        usageCount,
        loginWithEmail,
        signupWithEmail,
        logout,
        updateProfile,
        addXpAndSparks,
        upgradeToPro,
        unlockPremium,
        activateSubscription,
        checkCanUseAi,
        recordSuccessfulAiGeneration,
        consumeAiQuota,
        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

