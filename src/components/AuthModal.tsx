import React, { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { Sparkles, Mail, Lock, User, AlertCircle, X, ShieldCheck, LogIn, UserPlus } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithEmail, signupWithEmail, isSupabaseConfigured } = useAuth();
  
  // Modes: 'login' | 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Form State with blank inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!name.trim()) {
          throw new Error('Please enter your full name.');
        }
        if (!email.trim() || !email.includes('@')) {
          throw new Error('Please enter a valid email address.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        await signupWithEmail(email.trim(), password, name.trim());
      } else {
        if (!email.trim() || !email.includes('@')) {
          throw new Error('Please enter a valid email address.');
        }
        if (!password) {
          throw new Error('Please enter your password.');
        }
        await loginWithEmail(email.trim(), password);
      }
      if (onClose) onClose();
    } catch (err: any) {
      console.error('Authentication error:', err);
      // Clean up Supabase error strings for clear user guidance
      let msg = err?.message || 'Authentication failed. Please check your credentials.';
      if (msg.toLowerCase().includes('invalid login credentials')) {
        msg = 'Invalid email or password. Please verify your credentials or create an account.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white my-auto overflow-hidden">
        {/* Close Button */}
        {onClose && (
          <button
            id="close-auth-modal-btn"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Ambient Neon Glows */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3 shadow-sm">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Welcome to Studia
          </h2>
          <p className="text-zinc-400 text-xs mt-1.5 max-w-xs mx-auto">
            {mode === 'signup'
              ? 'Create your account to sync revision timetables, track study streaks, and unlock AI tools.'
              : 'Sign in to access your notes, quizzes, focus sessions, and study schedules.'}
          </p>

          {/* Live Supabase Connected Badge */}
          {isSupabaseConfigured && (
            <div className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Supabase Backend Connected</span>
            </div>
          )}
        </div>

        {/* Tab Switcher: Sign In / Create Account */}
        <div className="grid grid-cols-2 p-1 bg-zinc-900/80 rounded-2xl border border-white/10 mb-5 text-xs font-semibold">
          <button
            id="auth-login-tab"
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-zinc-950 font-bold shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            id="auth-signup-tab"
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-zinc-950 font-bold shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed break-words">{error}</span>
          </div>
        )}

        {/* Dynamic Functional Email & Password Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
                <input
                  id="signup-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 focus:border-indigo-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 focus:border-indigo-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                id="auth-password-input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 6 characters)"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 focus:border-indigo-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 transition-colors"
              />
            </div>
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : mode === 'signup' ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In with Email</span>
              </>
            )}
          </button>
        </form>

        {/* Feature summary */}
        <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Secure authentication with live cloud database sync</span>
        </div>
      </div>
    </div>
  );
};
