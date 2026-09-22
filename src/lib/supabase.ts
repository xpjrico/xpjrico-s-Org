import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase credentials for Studia
const rawEnvUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim();
export const SUPABASE_URL = rawEnvUrl
  ? rawEnvUrl.replace('jrcexjelohnjvwlgvby', 'jrcexjeloihnjvwlgvby')
  : 'https://jrcexjeloihnjvwlgvby.supabase.co';

const rawEnvKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim();
export const SUPABASE_ANON_KEY =
  rawEnvKey && !rawEnvKey.startsWith('sb_secret_')
    ? rawEnvKey
    : 'sb_publishable_P-rOXlHqf6WczxzFo6vidA_G7kCtO1e';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Storage key constants
export const SUPABASE_STORAGE_KEY = 'studia_supabase_auth_token';
export const SB_ACCESS_TOKEN_KEY = 'sb-access-token';
export const SB_REFRESH_TOKEN_KEY = 'sb-refresh-token';
export const STUDIA_SESSION_JWT_KEY = 'studia_session_jwt';
export const SUPABASE_LEGACY_TOKEN_KEY = 'supabase.auth.token';

// In-memory mirror fallback if localStorage is partitioned/restricted in strict Safari/iFrames
const inMemoryStorageFallback = new Map<string, string>();

/**
 * Retrieves the current session JWT from localStorage or in-memory fallback.
 * Checks multiple common storage keys to guarantee reliability inside iframes and across Safari ITP restrictions.
 */
export function getStoredSessionJwt(): string | null {
  try {
    // 1. Direct JWT storage keys
    const directJwt =
      customStorageAdapter.getItem(STUDIA_SESSION_JWT_KEY) ||
      customStorageAdapter.getItem(SB_ACCESS_TOKEN_KEY);
    if (directJwt && typeof directJwt === 'string' && directJwt.trim()) {
      return directJwt.trim();
    }

    // 2. Parse from Supabase Auth stored session object
    const storedSession =
      customStorageAdapter.getItem(SUPABASE_STORAGE_KEY) ||
      customStorageAdapter.getItem(SUPABASE_LEGACY_TOKEN_KEY) ||
      customStorageAdapter.getItem('sb-jrcexjeloihnjvwlgvby-auth-token');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        if (token && typeof token === 'string' && token.trim()) {
          return token.trim();
        }
      } catch {
        // ignore JSON parse error
      }
    }

    // 3. Scan for any sb-*-auth-token key if localStorage is accessible
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && (key.startsWith('sb-') && key.endsWith('-auth-token'))) {
            const val = window.localStorage.getItem(key);
            if (val) {
              try {
                const parsed = JSON.parse(val);
                const token = parsed?.access_token || parsed?.currentSession?.access_token;
                if (token && typeof token === 'string' && token.trim()) {
                  return token.trim();
                }
              } catch {
                // ignore parse error
              }
            }
          }
        }
      } catch {
        // Storage access blocked by browser policy
      }
    }
  } catch (err) {
    console.warn('[Supabase Storage] Error reading session JWT:', err);
  }

  // Fallback to in-memory store
  return inMemoryStorageFallback.get(STUDIA_SESSION_JWT_KEY) || inMemoryStorageFallback.get(SB_ACCESS_TOKEN_KEY) || null;
}

/**
 * Explicitly saves session JWT, refresh token, and full session to storage
 * so all client-side requests have access to valid tokens without relying on httpOnly cookies.
 */
export function saveSessionJwtToStorage(accessToken: string, refreshToken?: string, fullSession?: any): void {
  try {
    if (accessToken && typeof accessToken === 'string') {
      customStorageAdapter.setItem(STUDIA_SESSION_JWT_KEY, accessToken.trim());
      customStorageAdapter.setItem(SB_ACCESS_TOKEN_KEY, accessToken.trim());
    }
    if (refreshToken && typeof refreshToken === 'string') {
      customStorageAdapter.setItem(SB_REFRESH_TOKEN_KEY, refreshToken.trim());
    }
    if (fullSession) {
      const sessionStr = typeof fullSession === 'string' ? fullSession : JSON.stringify(fullSession);
      customStorageAdapter.setItem(SUPABASE_STORAGE_KEY, sessionStr);
      customStorageAdapter.setItem(SUPABASE_LEGACY_TOKEN_KEY, sessionStr);
      customStorageAdapter.setItem('sb-jrcexjeloihnjvwlgvby-auth-token', sessionStr);
    }
  } catch (err) {
    console.warn('[Supabase Storage] Error writing session JWT to storage:', err);
  }
}

/**
 * Clears all auth tokens from storage upon logout
 */
export function clearSessionJwtFromStorage(): void {
  try {
    customStorageAdapter.removeItem(STUDIA_SESSION_JWT_KEY);
    customStorageAdapter.removeItem(SB_ACCESS_TOKEN_KEY);
    customStorageAdapter.removeItem(SB_REFRESH_TOKEN_KEY);
    customStorageAdapter.removeItem(SUPABASE_STORAGE_KEY);
    customStorageAdapter.removeItem(SUPABASE_LEGACY_TOKEN_KEY);
    customStorageAdapter.removeItem('sb-jrcexjeloihnjvwlgvby-auth-token');

    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.startsWith('sb-') || k.includes('supabase.auth.token') || k.includes('studia_'))) {
            if (k !== 'studia_v1_notes' && k !== 'studia_v1_quiz_history' && k !== 'studia_v1_timetables') {
              keysToRemove.push(k);
            }
          }
        }
        keysToRemove.forEach((k) => {
          try { window.localStorage.removeItem(k); } catch {}
        });
      } catch {
        // Storage access blocked
      }
    }
  } catch (err) {
    console.warn('[Supabase Storage] Error clearing session JWT from storage:', err);
  }
  inMemoryStorageFallback.clear();
}

/**
 * Custom storage adapter with try/catch blocks.
 * Safely handles Safari and iOS iframe restrictions where window.localStorage access throws SecurityError.
 */
export const customStorageAdapter = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return inMemoryStorageFallback.get(key) || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) { }
    inMemoryStorageFallback.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) { }
    inMemoryStorageFallback.delete(key);
  }
};

export const explicitLocalStorageAdapter = customStorageAdapter;

/**
 * Client-side request interceptor:
 * 1. Reads session JWT from localStorage on every outgoing request and attaches Authorization header.
 * 2. Writes session JWT to localStorage whenever an auth response returns access/refresh tokens.
 */
const clientSideFetchWithLocalStorageJwt = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers || {});

  // 1. Read session JWT from localStorage on all client-side requests
  const storedJwt = getStoredSessionJwt();
  if (storedJwt && (!headers.has('Authorization') || headers.get('Authorization') === 'Bearer undefined')) {
    headers.set('Authorization', `Bearer ${storedJwt}`);
  }
  if (!headers.has('apikey')) {
    headers.set('apikey', SUPABASE_ANON_KEY);
  }

  const updatedInit: RequestInit = {
    ...init,
    headers,
  };

  const response = await fetch(input, updatedInit);

  // 2. Write session JWT to localStorage when received in client-side responses
  try {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (urlStr && urlStr.includes('/auth/v1/') && response.ok) {
      const cloned = response.clone();
      cloned.json().then((body) => {
        if (body?.access_token) {
          saveSessionJwtToStorage(body.access_token, body.refresh_token, body);
        } else if (body?.session?.access_token) {
          saveSessionJwtToStorage(body.session.access_token, body.session.refresh_token, body.session);
        }
      }).catch(() => {});
    }
  } catch {
    // Non-blocking background catch
  }

  return response;
};

// Safe initialization of Supabase client with explicit localStorage persistence
let supabaseClientInstance: SupabaseClient | null = null;

try {
  console.log('[Supabase Init] Initializing Supabase client with custom storage adapter at:', SUPABASE_URL);
  supabaseClientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: customStorageAdapter,
      storageKey: SUPABASE_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      fetch: clientSideFetchWithLocalStorageJwt,
    },
  });
} catch (err) {
  console.error('[Supabase Init Error] Failed to initialize client:', err);
  supabaseClientInstance = null;
}

// Safely attempt to enhance window.fetch to read/write session JWT on API and Supabase requests
try {
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    const interceptedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      try {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const isSupabaseReq = urlStr && urlStr.includes('supabase.co');
        const isApiReq = urlStr && (urlStr.startsWith('/api/') || urlStr.includes('/api/'));

        if (isSupabaseReq || isApiReq) {
          const headers = new Headers(init?.headers || {});
          if (!headers.has('Authorization') || headers.get('Authorization') === 'Bearer undefined') {
            const token = getStoredSessionJwt();
            if (token) {
              headers.set('Authorization', `Bearer ${token}`);
            }
          }
          if (isSupabaseReq && !headers.has('apikey')) {
            headers.set('apikey', SUPABASE_ANON_KEY);
          }

          const res = await nativeFetch(input, { ...init, headers });

          // If auth endpoint returned tokens, persist to storage
          if (isSupabaseReq && urlStr.includes('/auth/v1/') && res.ok) {
            try {
              const clone = res.clone();
              clone.json().then((body) => {
                if (body?.access_token) {
                  saveSessionJwtToStorage(body.access_token, body.refresh_token, body);
                } else if (body?.session?.access_token) {
                  saveSessionJwtToStorage(body.session.access_token, body.session.refresh_token, body.session);
                }
              }).catch(() => {});
            } catch {
              // Non-blocking
            }
          }
          return res;
        }
      } catch {
        // Fallback on native fetch on any error
      }
      return nativeFetch(input, init);
    };

    try {
      window.fetch = interceptedFetch;
    } catch {
      // In environments where window.fetch has only a getter or is read-only, try Object.defineProperty or safely skip
      try {
        Object.defineProperty(window, 'fetch', {
          value: interceptedFetch,
          writable: true,
          configurable: true,
        });
      } catch {
        // Window.fetch cannot be overridden in this environment; Supabase client uses global.fetch directly
      }
    }
  }
} catch {
  // Non-blocking safe catch
}

// Fallback safe query builder for offline / uninitialized state
const createEmptyQueryBuilder = () => {
  const chain: any = {
    select: () => chain,
    insert: () => Promise.resolve({ data: null, error: null }),
    upsert: () => Promise.resolve({ data: null, error: null }),
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    order: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return chain;
};

// Fallback safe client to prevent runtime exceptions if network fails
export const supabase: any =
  supabaseClientInstance || {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      setSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      }),
      signInWithPassword: async () => ({ data: { user: null }, error: new Error('Supabase client not initialized') }),
      signUp: async () => ({ data: { user: null }, error: new Error('Supabase client not initialized') }),
      signOut: async () => ({ error: null }),
    },
    from: (_tableName: string) => createEmptyQueryBuilder(),
  };

/**
 * Signs out from Supabase session and thoroughly clears storage tokens
 */
export const signOutSupabase = async () => {
  try {
    if (supabaseClientInstance?.auth) {
      const { error } = await supabaseClientInstance.auth.signOut();
      if (error) {
        console.warn('Supabase signOut notice:', error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase signOut error:', err);
  } finally {
    clearSessionJwtFromStorage();
  }
};
