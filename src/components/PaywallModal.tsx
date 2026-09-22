import React, { useState } from 'react';
import {
  Crown,
  Sparkles,
  Zap,
  CheckCircle2,
  X,
  Lock,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { triggerPaystackProPayment } from '../lib/paystack';
import confetti from 'canvas-confetti';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  onSuccess?: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  reason = 'You have reached your 5 free AI generations limit. Upgrade to Pro for unlimited access.',
  onSuccess,
}) => {
  const { user, unlockPremium, usageCount, isPremium } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || user?.phone || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePaystackCheckout = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    const userEmail = user?.email || 'student@studia.app';
    const userName = user?.displayName || user?.name || userEmail.split('@')[0];
    const userId = user?.id || 'guest_user';

    try {
      await triggerPaystackProPayment({
        userEmail,
        userName,
        userId,
        amountInKes: 380,
        currency: 'KES',
        phoneNumber: phoneNumber.trim() || undefined,
        planType: 'monthly_pro',
        onSuccess: async (reference) => {
          console.log('[PaywallModal] Payment succeeded, unlocking premium with reference:', reference);
          // 5. Premium Unlock: update is_premium boolean in user's Supabase profile and state
          await unlockPremium(reference);
          setSuccessMessage('Premium activated! Unlimited AI generations permanently unlocked.');
          setIsProcessing(false);

          try {
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.5 },
              colors: ['#00a344', '#10b981', '#3b82f6', '#ec4899', '#f59e0b'],
            });
          } catch {}

          if (onSuccess) onSuccess();
          setTimeout(() => {
            onClose();
          }, 1800);
        },
        onClose: () => {
          setIsProcessing(false);
        },
      });
    } catch (err: any) {
      console.error('[PaywallModal] Error triggering Paystack:', err);
      setErrorMessage(err?.message || 'Failed to initialize Paystack checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <div
      id="paywall-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="paywall-modal-container"
        className="relative w-full max-w-lg rounded-3xl bg-zinc-950 border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-hidden flex flex-col"
      >
        {/* Top Accent Gradient Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500" />

        {/* Close Button */}
        <button
          id="paywall-modal-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center border border-white/10 transition-all cursor-pointer z-10"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header Banner */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 p-0.5 shadow-lg shrink-0">
              <div className="w-full h-full rounded-[14px] bg-zinc-950 flex items-center justify-center text-amber-400">
                <Crown className="w-6 h-6" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Studia Pro Pass
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Paystack Verified</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Upgrade to Premium
              </h2>
              <p className="text-xs text-zinc-400">
                Permanent unlimited access to cutting-edge Gemini AI tools
              </p>
            </div>
          </div>

          {/* Usage Meter (5-use limit) */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-amber-500/20 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Free Plan Limit Reached</span>
              </div>
              <span className="font-mono font-bold text-amber-400">
                {Math.max(5, usageCount)} / 5 Uses (100%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full w-full" />
            </div>

            <p className="text-[11px] text-zinc-300 leading-relaxed">
              {reason}
            </p>
          </div>

          {/* Premium Unlocks Checklist */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Everything Unlocked with Premium:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Smart Note Summarizer & Flashcards</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Bypass 5-use limit forever</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Unlimited Quiz Generation</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Text-to-Speech Audio Narration</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Smart Timetable Study Planner</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Real-time Live Voice Tutor</span>
              </div>
            </div>
          </div>

          {/* Optional Phone Input for M-Pesa STK Push */}
          <div className="space-y-1.5">
            <label
              htmlFor="paywall-phone-input"
              className="text-[11px] font-medium text-zinc-400 flex items-center justify-between"
            >
              <span>M-Pesa Phone Number (Optional for STK push prompt):</span>
              <span className="text-[10px] text-zinc-500">M-Pesa • Card • Bank</span>
            </label>
            <div className="relative">
              <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                id="paywall-phone-input"
                type="tel"
                placeholder="0712 345 678 or 254..."
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Paystack Checkout Button */}
          <div className="space-y-2 pt-1">
            <button
              id="paystack-paywall-checkout-btn"
              onClick={handlePaystackCheckout}
              disabled={isProcessing}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:via-rose-400 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to Paystack...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-200" />
                  <span>Upgrade with Paystack — KES 380 / $2.99</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> 256-bit Secure Checkout
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-cyan-500" /> Paystack Instant Unlock
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
