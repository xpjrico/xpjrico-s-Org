import React from 'react';
import { useAuth } from '../lib/authContext';
import { Lock, Sparkles, Calendar, BookOpen, ShieldCheck, ArrowRight, Cpu } from 'lucide-react';

interface ProtectedRouteProps {
  featureName: string;
  featureDescription: string;
  featureIcon: 'timetable' | 'aihub' | 'notes' | 'aitools';
  onOpenAuth: () => void;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  featureName,
  featureDescription,
  featureIcon,
  onOpenAuth,
  children,
}) => {
  const { user } = useAuth();

  // If user is authenticated, render the protected component directly
  if (user) {
    return <>{children}</>;
  }

  const getIcon = () => {
    switch (featureIcon) {
      case 'timetable':
        return <Calendar className="w-8 h-8 text-cyan-400" />;
      case 'aihub':
        return <Sparkles className="w-8 h-8 text-indigo-400" />;
      case 'aitools':
        return <Cpu className="w-8 h-8 text-purple-400" />;
      case 'notes':
        return <BookOpen className="w-8 h-8 text-purple-400" />;
      default:
        return <Lock className="w-8 h-8 text-indigo-400" />;
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-6 sm:my-12 p-6 sm:p-10 rounded-3xl bg-zinc-900/40 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.6)] text-center relative overflow-hidden animate-in fade-in duration-300">
      {/* Background glow accents */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Feature Icon Shield */}
        <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-white/10 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
          {getIcon()}
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-zinc-400 mb-3">
          <Lock className="w-3 h-3 text-amber-400" />
          <span>Protected Scholar Route</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
          Unlock {featureName}
        </h2>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto mb-8">
          {featureDescription} Sign in or create an account to securely save and sync your study data across devices.
        </p>

        {/* Action Button */}
        <div className="flex items-center justify-center gap-3 w-full max-w-xs">
          <button
            id={`protected-${featureIcon}-email-btn`}
            onClick={onOpenAuth}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(99,102,241,0.3)] flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>Sign In / Create Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Benefits list */}
        <div className="mt-8 pt-6 border-t border-white/5 w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-zinc-400 font-mono">
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted Storage</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Summaries & Quizzes</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>Class Timetable Sync</span>
          </div>
        </div>
      </div>
    </div>
  );
};
