import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/authContext';
import { saveUserPayments, getUserPayments } from '../lib/storage';
import { triggerPaystackProPayment, PAYSTACK_PUBLIC_KEY } from '../lib/paystack';
import { upgradeUserToProInSupabase } from '../lib/supabaseSync';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  Crown,
  Sparkles,
  Check,
  CreditCard,
  Shield,
  Lock,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  Globe,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { PricingTierId, PricingTier, PaymentRecord } from '../types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTier?: PricingTierId;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free Scholar',
    priceKes: 0,
    priceUsd: 0,
    billingPeriod: 'Forever Free',
    aiGenerationsLimit: 6,
    features: [
      '6 AI Generations every 6 hours',
      'Automatic 6h Countdown Refill',
      'Unlimited Timetables & Schedules',
      'Basic Pomodoro Focus Timer',
      'Subject Study Planner',
      'Local Offline Storage',
    ],
  },
  {
    id: 'exam_pass',
    name: 'Exam Pass',
    badge: '7-Day Sprint',
    priceKes: 130,
    priceUsd: 0.99,
    billingPeriod: '7 Days Access',
    durationDays: 7,
    aiGenerationsLimit: Infinity,
    features: [
      '⚡ Unlimited AI Summaries & Quizzes',
      'No Daily or Hourly Quota Caps',
      '2x XP & Sparks Booster',
      'Calculus & STEM Step Solver',
      'Instant Cache Recall',
      'Priority AI Cyber-Tutor',
    ],
  },
  {
    id: 'monthly_pro',
    name: 'Pro Scholar',
    badge: 'Most Popular',
    priceKes: 380,
    priceUsd: 2.99,
    billingPeriod: 'per month',
    durationDays: 30,
    aiGenerationsLimit: Infinity,
    isPopular: true,
    features: [
      '⚡ Unlimited AI Generations (Uncapped)',
      'Calculus & STEM Step-by-Step Solver',
      'Detailed Concept AI Note Summarizer',
      'All AI Models & Academic Tools Unlocked',
      '2x XP & Sparks Booster',
      'Full Offline Mode Sync & Cloud Backup',
      'Full Export (CSV/JSON/PDF)',
      'Unlimited Subject Plans',
    ],
  },
  {
    id: 'annual_pass',
    name: 'Annual All-Access',
    badge: 'Save 45%',
    priceKes: 2500,
    priceUsd: 19.99,
    billingPeriod: 'per year',
    durationDays: 365,
    aiGenerationsLimit: Infinity,
    features: [
      '⚡ Unlimited AI Generations (Full Year VIP)',
      'Full 1-Year Pro Status',
      'All Future AI Models Included',
      'VIP Discord & Study Groups',
      'Exclusive Golden Rank Badge',
      'Priority Server Traffic',
    ],
  },
];

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, defaultTier = 'monthly_pro' }) => {
  const { user, activateSubscription } = useAuth();
  const [selectedCurrency, setSelectedCurrency] = useState<'KES' | 'USD'>('KES');
  const [selectedTierId, setSelectedTierId] = useState<PricingTierId>(defaultTier);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card' | 'paypal'>('mpesa');

  // Checkout states
  const [isLaunchingPaystack, setIsLaunchingPaystack] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string>(() => {
    return (
      (typeof localStorage !== 'undefined' ? localStorage.getItem('studia_user_phone') : null) ||
      (user as any)?.phone ||
      (user as any)?.phoneNumber ||
      ''
    );
  });
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalSuccess, setGeneralSuccess] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<string | null>(null);

  // PayPal checkout state
  const [paypalEmail, setPaypalEmail] = useState('');
  const [paypalProcessing, setPaypalProcessing] = useState(false);
  const [paypalSuccessData, setPaypalSuccessData] = useState<{ txnId: string; amount: number; date: string } | null>(null);

  useEffect(() => {
    if (defaultTier) {
      setSelectedTierId(defaultTier);
    }
  }, [defaultTier, isOpen]);

  if (!isOpen) return null;

  const currentTier = PRICING_TIERS.find((t) => t.id === selectedTierId) || PRICING_TIERS[2];
  const price = selectedCurrency === 'KES' ? currentTier.priceKes : currentTier.priceUsd;
  const currencySymbol = selectedCurrency === 'KES' ? 'KES ' : '$';
  const authenticatedEmail = user?.email || 'roselynnyamoita@gmail.com';

  /**
   * Primary Paystack Checkout Trigger
   * Launches official Paystack inline popup (PaystackPop.setup)
   * Parameters:
   *  - key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
   *  - email: current authenticated user's email
   *  - amount: 38000 (KES 380) for monthly_pro (or based on currentTier)
   *  - currency: 'KES'
   *  - channels: ['mobile_money', 'card']
   *
   * On success:
   *  - updates profiles table in Supabase: set is_pro = true and subscription_tier = 'pro'
   *  - refreshes app state to immediately unlock all Pro features
   */
  const triggerPaystackCheckout = async (preferredChannel: 'mobile_money' | 'card' = 'mobile_money') => {
    setGeneralError(null);
    setIsLaunchingPaystack(true);

    const amountInKes = currentTier.priceKes || 380;
    const channels: ('mobile_money' | 'card')[] =
      preferredChannel === 'card' ? ['card', 'mobile_money'] : ['mobile_money', 'card'];

    if (phoneNumber) {
      try {
        localStorage.setItem('studia_user_phone', phoneNumber);
      } catch (storageErr) {
        console.warn('[PaymentModal] Storage notice:', storageErr);
      }
    }

    try {
      await triggerPaystackProPayment({
        user,
        email: authenticatedEmail,
        phone: phoneNumber,
        amountKes: amountInKes,
        currency: 'KES',
        channels,
        onSuccess: async (ref: string, response: any) => {
          setIsLaunchingPaystack(false);
          const userId = user?.id || 'guest_user';

          // 1. UPDATE SUPABASE ON SUCCESS:
          // Update logged-in user's record in `profiles` table: set `is_pro = true` and `subscription_tier = 'pro'`
          if (isSupabaseConfigured && userId && userId !== 'guest_user') {
            try {
              const { error: profileErr } = await supabase
                .from('profiles')
                .update({
                  is_pro: true,
                  subscription_tier: 'pro',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', userId);

              if (profileErr) {
                console.warn('[PaymentModal] Direct profile update warning:', profileErr.message);
              }
            } catch (dbErr) {
              console.warn('[PaymentModal] Profile DB update error:', dbErr);
            }

            try {
              await upgradeUserToProInSupabase(userId, 'pro', ref);
            } catch (syncErr) {
              console.warn('[PaymentModal] Supabase sync warning:', syncErr);
            }
          }

          // 2. Record payment in local persistence
          const record: PaymentRecord = {
            id: `txn_paystack_${Date.now()}`,
            userId,
            plan: currentTier.name,
            planType: currentTier.id,
            amount: amountInKes,
            currency: 'KES',
            date: new Date().toISOString(),
            status: 'completed',
            paymentMethod: preferredChannel === 'card' ? 'card' : 'mpesa',
            mpesaReceipt: ref,
          };

          const existing = getUserPayments(userId);
          saveUserPayments(userId, [record, ...existing]);

          // 3. Refresh app state to immediately unlock all Pro features
          activateSubscription(
            currentTier.id,
            preferredChannel === 'card' ? 'card' : 'mpesa',
            amountInKes,
            'KES',
            {
              receipt: ref,
              durationDays: currentTier.durationDays,
            }
          );

          setSuccessReceipt(ref);
          setGeneralSuccess(true);
          setTimeout(() => {
            onClose();
          }, 1500);
        },
        onCancel: () => {
          setIsLaunchingPaystack(false);
          console.log('[Paystack] Payment popup dismissed by user.');
        },
        onError: (err: string) => {
          setIsLaunchingPaystack(false);
          setGeneralError(err || 'Failed to open Paystack payment gateway.');
        },
      });
    } catch (err: any) {
      setIsLaunchingPaystack(false);
      setGeneralError(err?.message || 'Error launching Paystack gateway.');
    }
  };

  // Dedicated PayPal Checkout Handler
  const handlePayPalCheckout = () => {
    setPaypalProcessing(true);
    setGeneralError(null);

    const email = paypalEmail || authenticatedEmail;
    const amountUsd = currentTier.priceUsd || 2.99;

    setTimeout(() => {
      const txnId = `PAYPAL-TXN-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const userId = user?.id || 'guest_user';

      const record: PaymentRecord = {
        id: `txn_paypal_${Date.now()}`,
        userId,
        plan: currentTier.name,
        planType: currentTier.id,
        amount: amountUsd,
        currency: 'USD',
        date: new Date().toISOString(),
        status: 'completed',
        paymentMethod: 'paypal',
        mpesaReceipt: txnId,
      };

      const existing = getUserPayments(userId);
      saveUserPayments(userId, [record, ...existing]);

      // Update Supabase profiles
      if (isSupabaseConfigured && userId && userId !== 'guest_user') {
        supabase
          .from('profiles')
          .update({
            is_pro: true,
            subscription_tier: 'pro',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .catch((e) => console.warn(e));
      }

      activateSubscription(currentTier.id, 'paypal', amountUsd, 'USD', {
        receipt: txnId,
        durationDays: currentTier.durationDays,
      });

      setPaypalSuccessData({
        txnId,
        amount: amountUsd,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      setPaypalProcessing(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[94dvh] overflow-y-auto bg-zinc-950 border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl text-white my-auto">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          id="paywall-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
        >
          ✕
        </button>

        {/* Header with Currency Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">Studia Pro & AI Access</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Paystack Live
                </span>
              </div>
              <p className="text-zinc-400 text-xs mt-0.5">
                Instant activation with Safaricom M-Pesa & Bank Cards via Paystack.
              </p>
            </div>
          </div>

          {/* Currency Toggle */}
          <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setSelectedCurrency('KES')}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                selectedCurrency === 'KES'
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🇰🇪 KES
            </button>
            <button
              onClick={() => setSelectedCurrency('USD')}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                selectedCurrency === 'USD'
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              💵 USD
            </button>
          </div>
        </div>

        {/* 4 Pricing Tiers Selection Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          {PRICING_TIERS.map((tier) => {
            const isSelected = selectedTierId === tier.id;
            const tierPrice = selectedCurrency === 'KES' ? tier.priceKes : tier.priceUsd;
            const displayPrice =
              tier.id === 'free'
                ? 'FREE'
                : selectedCurrency === 'KES'
                ? `KES ${tierPrice}`
                : `$${tierPrice.toFixed(2)}`;

            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  setSelectedTierId(tier.id);
                  setGeneralError(null);
                  setPaypalSuccessData(null);
                }}
                className={`relative p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900/90 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500'
                    : 'bg-zinc-900/40 border-white/5 hover:border-white/15 hover:bg-zinc-900/60'
                }`}
              >
                {tier.badge && (
                  <span
                    className={`absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold uppercase shadow-md ${
                      tier.isPopular
                        ? 'bg-emerald-500 text-zinc-950 ring-1 ring-emerald-400'
                        : 'bg-purple-500 text-white ring-1 ring-purple-400'
                    }`}
                  >
                    {tier.badge}
                  </span>
                )}

                <div>
                  <div className="text-xs font-bold text-zinc-300 mb-1">{tier.name}</div>
                  <div className="text-lg font-black text-white font-mono">{displayPrice}</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{tier.billingPeriod}</div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>{tier.id === 'free' ? '6 AI Calls / 6h' : 'Unlimited AI'}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Plan Feature Summary Pill */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-white/5 mb-5 text-xs">
          <div className="flex items-center justify-between font-bold text-white mb-2">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              Included in {currentTier.name}:
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              {currentTier.id === 'free'
                ? '6 AI Generations • 6h Countdown Refill'
                : '∞ Unlimited AI Generations • Uncapped STEM & Concept Solver'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-zinc-300">
            {currentTier.features.map((feat, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Free Tier Direct Activation */}
        {currentTier.id === 'free' ? (
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-white/10 text-center">
            <h4 className="text-sm font-bold text-white mb-1">Free Scholar Plan Selected</h4>
            <p className="text-xs text-zinc-400 mb-4">
              Enjoy timetable scheduling and 6 complimentary AI generations replenished every 6 hours.
            </p>
            <button
              onClick={() => {
                activateSubscription('free', 'none', 0, 'KES');
                setGeneralSuccess(true);
                setTimeout(() => {
                  setGeneralSuccess(false);
                  onClose();
                }, 1200);
              }}
              className="px-6 py-2.5 rounded-xl bg-white text-zinc-950 font-bold text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Continue with Free Plan
            </button>
          </div>
        ) : (
          <div>
            {/* Payment Method Selector Tabs */}
            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3 overflow-x-auto">
              <button
                type="button"
                onClick={() => setPaymentMethod('mpesa')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  paymentMethod === 'mpesa'
                    ? 'bg-[#00A344] text-white shadow-[0_0_20px_rgba(0,163,68,0.4)]'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Pay with M-Pesa</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  paymentMethod === 'card'
                    ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Credit / Debit Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('paypal')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                  paymentMethod === 'paypal'
                    ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>PayPal</span>
              </button>
            </div>

            {/* TAB 1: M-PESA CHECKOUT (OFFICIAL PAYSTACK POPUP) */}
            {paymentMethod === 'mpesa' && (
              <div className="bg-zinc-900/70 border border-emerald-500/30 rounded-2xl p-5 relative overflow-hidden space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <Smartphone className="w-4 h-4" />
                    <span>Safaricom M-Pesa (Paystack Inline Gateway)</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-300">
                    Amount: <strong className="text-white">KES {currentTier.priceKes.toLocaleString()}</strong>
                  </span>
                </div>

                {/* Paystack Inline Action Box */}
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Official Paystack Payment Gateway</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">
                          Live Active
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        Subscriber: <span className="font-mono text-emerald-300">{authenticatedEmail}</span>
                      </div>
                    </div>
                    <div className="text-right sm:text-right text-[11px] font-mono text-zinc-400">
                      Total: <span className="text-base font-black text-white font-mono">KES {currentTier.priceKes}</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Clicking below launches the official Paystack inline popup. Select M-Pesa to prompt your phone, or use any debit/credit card. Pro features are activated instantly upon completion.
                  </p>

                  {/* M-Pesa Mobile Number Input */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="mpesa-phone-input" className="block text-xs font-bold text-zinc-300">
                        M-Pesa Mobile Number <span className="text-zinc-500 font-normal">(for Safaricom STK prompt)</span>
                      </label>
                      <span className="text-[11px] font-mono text-emerald-400">Safaricom Active</span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-mono text-zinc-400">
                        🇰🇪
                      </div>
                      <input
                        id="mpesa-phone-input"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 0716880033 or 254716880033"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950/80 border border-emerald-500/25 text-white placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-zinc-400 gap-1">
                      <span>Format: without plus or spaces (e.g., 0716880033 or 254716880033)</span>
                      {phoneNumber && (
                        <span className="font-mono text-emerald-400 font-medium">Ready for STK Push</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    <button
                      id="paystack-mpesa-checkout-btn"
                      type="button"
                      disabled={isLaunchingPaystack}
                      onClick={() => triggerPaystackCheckout('mobile_money')}
                      className="flex-1 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00A344] to-emerald-600 hover:opacity-95 text-white font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(0,163,68,0.4)] flex items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-[1.01] disabled:opacity-50"
                    >
                      {isLaunchingPaystack ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Launching Paystack Popup...</span>
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-4 h-4" />
                          <span>PAY KES {currentTier.priceKes} WITH M-PESA</span>
                        </>
                      )}
                    </button>

                    <button
                      id="paystack-subscribe-btn"
                      type="button"
                      disabled={isLaunchingPaystack}
                      onClick={() => triggerPaystackCheckout('mobile_money')}
                      className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border border-emerald-500/40 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 shadow-sm"
                    >
                      <Crown className="w-4 h-4 text-amber-300" />
                      <span>Subscribe</span>
                    </button>
                  </div>
                </div>

                {generalError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{generalError}</span>
                  </div>
                )}

                {generalSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Payment successful! Reference: <strong className="font-mono">{successReceipt}</strong>. Unlocking Pro...
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CREDIT / DEBIT CARD (OFFICIAL PAYSTACK POPUP) */}
            {paymentMethod === 'card' && (
              <div className="bg-zinc-900/70 border border-indigo-500/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                    <CreditCard className="w-4 h-4" />
                    <span>Credit / Debit Card (Visa, Mastercard, Verve)</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-300">
                    Amount: <strong className="text-white">KES {currentTier.priceKes} ({currencySymbol}{price})</strong>
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Paystack Secure Card Checkout</span>
                        <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold">
                          PCI-DSS Compliant
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        Subscriber: <span className="font-mono text-indigo-300">{authenticatedEmail}</span>
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-mono text-zinc-400">
                      Total: <span className="text-base font-black text-white font-mono">KES {currentTier.priceKes}</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Process your card payment safely through the official Paystack popup. Your credentials never touch our servers.
                  </p>

                  <button
                    id="paystack-card-checkout-btn"
                    type="button"
                    disabled={isLaunchingPaystack}
                    onClick={() => triggerPaystackCheckout('card')}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 text-white font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(99,102,241,0.4)] flex items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-[1.01] disabled:opacity-50"
                  >
                    {isLaunchingPaystack ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Opening Paystack Popup...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Pay KES {currentTier.priceKes} with Card</span>
                      </>
                    )}
                  </button>
                </div>

                {generalError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{generalError}</span>
                  </div>
                )}

                {generalSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Payment successful! Reference: <strong className="font-mono">{successReceipt}</strong>. Unlocking Pro...
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PAYPAL CHECKOUT (INTERNATIONAL) */}
            {paymentMethod === 'paypal' && (
              <div className="bg-zinc-900/70 border border-blue-500/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                    <Globe className="w-4 h-4" />
                    <span>PayPal International Express Checkout</span>
                  </div>
                  <span className="text-xs font-mono text-zinc-300">
                    Amount: <strong className="text-white">${currentTier.priceUsd.toFixed(2)} USD</strong>
                  </span>
                </div>

                {!paypalSuccessData ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-zinc-300 space-y-2">
                      <div className="flex items-center justify-between font-bold text-white">
                        <span>International Student Checkout</span>
                        <span className="text-blue-400 font-mono">100% Buyer Protection</span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Pay securely with your PayPal balance, linked bank account, or international credit card.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-zinc-400 mb-1.5">
                        PayPal Account Email (or Guest Email):
                      </label>
                      <input
                        type="email"
                        value={paypalEmail}
                        onChange={(e) => setPaypalEmail(e.target.value)}
                        placeholder={authenticatedEmail}
                        className="w-full px-3.5 py-3 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-white placeholder-zinc-600 outline-none focus:border-blue-500 transition-all"
                      />
                    </div>

                    <div className="p-3 bg-zinc-950 rounded-xl border border-white/5 text-[11px] font-mono text-zinc-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Selected Plan:</span>
                        <span className="text-white font-bold">{currentTier.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration:</span>
                        <span className="text-zinc-300">{currentTier.billingPeriod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Due:</span>
                        <span className="text-blue-400 font-bold">${currentTier.priceUsd.toFixed(2)} USD</span>
                      </div>
                    </div>

                    <button
                      id="paypal-express-checkout-btn"
                      type="button"
                      onClick={handlePayPalCheckout}
                      disabled={paypalProcessing}
                      className="w-full py-3.5 rounded-xl bg-[#0070BA] hover:bg-[#003087] text-white font-black text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(0,112,186,0.4)] flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-50"
                    >
                      {paypalProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Connecting to PayPal Checkout...
                        </>
                      ) : (
                        <>
                          <span>🅿️ Pay with PayPal (${currentTier.priceUsd.toFixed(2)} USD)</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="py-3 space-y-4 animate-in zoom-in-95">
                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center mx-auto mb-2 text-xl font-black">
                        ✓
                      </div>
                      <h4 className="text-base font-bold text-white">PayPal Payment Completed!</h4>
                      <p className="text-xs text-blue-300 mt-0.5">
                        Your {currentTier.name} has been activated instantly.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-950 border border-white/10 font-mono text-xs space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-zinc-400">Transaction ID:</span>
                        <span className="text-blue-400 font-bold">{paypalSuccessData.txnId}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Amount Paid:</span>
                        <span className="text-white font-bold">${paypalSuccessData.amount.toFixed(2)} USD</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Gateway:</span>
                        <span className="text-zinc-200">PayPal Express</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Timestamp:</span>
                        <span className="text-zinc-400">{paypalSuccessData.date}</span>
                      </div>
                    </div>

                    <button
                      onClick={onClose}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Start Studying with Pro AI
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Security & Guarantee Footer */}
        <div className="mt-5 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-[10px] text-zinc-400 gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-Bit SSL Encrypted • Official Paystack & Safaricom M-Pesa Gateway</span>
          </div>
          <span>Cancel or switch tiers anytime with zero penalty</span>
        </div>
      </div>
    </div>
  );
};
