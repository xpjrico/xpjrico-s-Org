import { UserProfile } from '../types';
import { upgradeUserToProInSupabase } from './supabaseSync';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Paystack Public Key configuration
 * Strictly reads import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
 * with fallback to active live/test key for development.
 */
export const PAYSTACK_PUBLIC_KEY: string =
  (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string)?.trim() ||
  'pk_live_ab1899c4ebfb933fd535c0e0fc4ca52446fbc66e';

export interface PaystackPaymentOptions {
  user?: UserProfile | null;
  email?: string;
  userEmail?: string;
  userName?: string;
  userId?: string;
  phone?: string;
  phoneNumber?: string;
  amountKes?: number; // In standard KES (e.g., 380 for KES 380/month => 38000 minor units)
  amountInKes?: number;
  currency?: string; // Default: 'KES'
  channels?: ('mobile_money' | 'card')[];
  planType?: string;
  metadata?: Record<string, any>;
  onSuccess?: (reference: string, response?: any) => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
  onError?: (error: string) => void;
}

/**
 * Formats phone number for Paystack M-Pesa STK push.
 * Strips leading '+', extra spaces, dashes, or non-numeric characters.
 * Ensures clean numeric format (e.g. "0716880033" or "254716880033").
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  // Strip all non-digit characters (+, spaces, hyphens, etc.)
  let clean = phone.replace(/[^0-9]/g, '').trim();

  // If user entered 9 digits starting with 7 or 1 (e.g., 716880033 or 110123456), prefix with 0
  if (clean.length === 9 && (clean.startsWith('7') || clean.startsWith('1'))) {
    clean = '0' + clean;
  }
  return clean;
}

/**
 * Dynamically ensures the official Paystack inline script is loaded in the document
 */
export function loadPaystackScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).PaystackPop !== 'undefined') {
      return resolve((window as any).PaystackPop);
    }

    const scriptSrc = 'https://js.paystack.co/v1/inline.js';
    let script = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.src = scriptSrc;
      script.async = true;
      document.head.appendChild(script);
    }

    script.onload = () => {
      resolve((window as any).PaystackPop);
    };

    script.onerror = () => {
      // Secondary fallback to v2 inline if v1 is unreachable
      const fallback = document.createElement('script');
      fallback.src = 'https://js.paystack.co/v2/inline.js';
      fallback.async = true;
      fallback.onload = () => resolve((window as any).PaystackPop);
      fallback.onerror = () => reject(new Error('Failed to load Paystack payment script. Please check your connection.'));
      document.head.appendChild(fallback);
    };
  });
}

/**
 * Triggers the official Paystack Inline Popup (PaystackPop.setup)
 * Parameters:
 *  - key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
 *  - email: current authenticated user's email
 *  - amount: 38000 (KES 380)
 *  - currency: 'KES'
 *  - channels: ['mobile_money', 'card']
 *
 * In onSuccess:
 *  - updates public.profiles table: set is_pro = true and subscription_tier = 'pro'
 *  - triggers state refresh to unlock Pro features immediately
 */
export async function triggerPaystackProPayment(options: PaystackPaymentOptions): Promise<void> {
  const {
    user,
    email,
    amountKes = 380,
    currency = 'KES',
    channels = ['mobile_money', 'card'],
    onSuccess,
    onCancel,
    onError,
  } = options;

  // 1. Current authenticated user's email & ID
  const targetEmail =
    user?.email ||
    email ||
    'roselynnyamoita@gmail.com';
  const userId = user?.id || 'guest_user';

  // 2. Amount in subunit cents: 38000 (KES 380)
  const subunitAmount = Math.round((amountKes || 380) * 100);

  // 3. Active Paystack Public Key from environment variable
  const activeKey =
    (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string) ||
    PAYSTACK_PUBLIC_KEY;

  // 4. Clean and format user phone number if available
  const rawPhone =
    options.phone ||
    options.phoneNumber ||
    user?.phone ||
    user?.phoneNumber ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('studia_user_phone') : null) ||
    '';
  const userPhoneNumber = formatPhoneNumber(rawPhone);

  // 5. Force 'mobile_money' in channels array
  const requestedChannels = channels && channels.length > 0 ? channels : ['mobile_money', 'card'];
  const finalChannels = requestedChannels.includes('mobile_money')
    ? requestedChannels
    : ['mobile_money', ...requestedChannels];

  // 6. Metadata to help Paystack pre-fill M-Pesa phone number
  const customFields = [
    ...(userPhoneNumber
      ? [
          {
            display_name: 'Mobile Number',
            variable_name: 'mobile_number',
            value: userPhoneNumber,
          },
        ]
      : []),
    ...(options.metadata?.custom_fields || []),
  ];

  const metadata: Record<string, any> = {
    ...options.metadata,
    ...(customFields.length > 0 ? { custom_fields: customFields } : {}),
  };

  // 7. Generate unique transaction reference
  const generatedRef = `studia_pro_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

  try {
    const PaystackPop = await loadPaystackScript();

    const handlePaymentSuccess = async (response: any) => {
      const reference = response?.reference || response?.trxref || generatedRef;
      console.log('[Paystack] Payment successful. Reference:', reference);

      // 1. SUPABASE PRO UNLOCK ON SUCCESS:
      // Update logged-in user's record in `profiles` table: set `is_pro = true` and `subscription_tier = 'pro'`
      if (isSupabaseConfigured && userId && userId !== 'guest_user') {
        try {
          const { error: directErr } = await supabase
            .from('profiles')
            .update({
              is_premium: true,
              is_pro: true,
              subscription_tier: 'pro',
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId);

          if (directErr) {
            console.warn('[Paystack] Direct profiles update warning:', directErr.message);
          }
        } catch (dbErr) {
          console.warn('[Paystack] Direct update exception:', dbErr);
        }

        // Also call upgrade helper for RPC and users table
        try {
          await upgradeUserToProInSupabase(userId, 'pro', reference);
        } catch (rpcErr) {
          console.warn('[Paystack] Upgrade helper exception:', rpcErr);
        }
      }

      // 2. Invoke caller's onSuccess callback to immediately refresh app state
      if (onSuccess) {
        await onSuccess(reference, response);
      }
    };

    // Launch official Paystack inline popup: PaystackPop.setup()
    // CRITICAL: Paystack inline JS validates `typeof options.callback === 'function'` using
    // `Object.prototype.toString.call(t) === "[object Function]"`.
    // Async functions return `"[object AsyncFunction]"`, which fails Paystack's check and causes
    // "Attribute callback must be a valid function".
    // Therefore, `callback` and `onClose` MUST be regular, non-async JavaScript functions.
    if (PaystackPop && typeof PaystackPop.setup === 'function') {
      const setupConfig: Record<string, any> = {
        key: activeKey,
        email: targetEmail,
        amount: subunitAmount,
        currency: currency,
        channels: finalChannels,
        ref: generatedRef,
        metadata: metadata,
        callback: function (response: any) {
          handlePaymentSuccess(response);
        },
        onClose: function () {
          console.log('[Paystack] Payment modal closed');
          if (options.onClose) {
            options.onClose();
          }
          if (onCancel) {
            onCancel();
          }
        },
      };

      if (userPhoneNumber) {
        setupConfig.phone = userPhoneNumber;
      }

      const handler = PaystackPop.setup(setupConfig);

      if (handler && typeof handler.openIframe === 'function') {
        handler.openIframe();
        return;
      }
    }

    // Fallback if loaded via v2 wrapper
    if (typeof (window as any).PaystackPop === 'function') {
      try {
        const popup = new (window as any).PaystackPop();
        if (popup && typeof popup.newTransaction === 'function') {
          popup.newTransaction({
            key: activeKey,
            email: targetEmail,
            amount: subunitAmount,
            currency: currency,
            channels: finalChannels,
            ref: generatedRef,
            metadata: metadata,
            ...(userPhoneNumber ? { phone: userPhoneNumber } : {}),
            onSuccess: function (response: any) {
              handlePaymentSuccess(response);
            },
            onCancel: function () {
              console.log('[Paystack] Payment modal closed');
              if (onCancel) {
                onCancel();
              }
            },
          });
          return;
        }
      } catch (v2Err) {
        console.warn('[Paystack] v2 fallback notice:', v2Err);
      }
    }

    throw new Error('Paystack inline payment gateway failed to initialize.');
  } catch (error: any) {
    console.error('[Paystack] Checkout failed to launch:', error);
    onError?.(error?.message || 'Failed to launch Paystack payment popup.');
  }
}

/**
 * React hook interface for triggering Paystack payments
 */
export function usePaystackPop() {
  return {
    triggerPaystack: triggerPaystackProPayment,
    publicKey: PAYSTACK_PUBLIC_KEY,
  };
}
