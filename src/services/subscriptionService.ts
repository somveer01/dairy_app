import { ref, get, set, update } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { Supplier, SubscriptionInfo, SubscriptionPlanType, SubscriptionStatus } from '../types';
import { formatToDisplayDate } from '../utils/dateUtils';

export const ADMIN_PHONES = ['8721873433', '8840850515'];
export const DEFAULT_UPI_ID = '8721873433@upi';

export interface PlanPricingItem {
  plan: SubscriptionPlanType;
  titleHi: string;
  titleEn: string;
  durationDays: number;
  price: number;
  originalPrice: number;
  tagHi?: string;
  tagEn?: string;
}

export const SUBSCRIPTION_PLANS: PlanPricingItem[] = [
  {
    plan: 'monthly',
    titleHi: '1 महीना (Monthly)',
    titleEn: '1 Month (Monthly)',
    durationDays: 30,
    price: 99,
    originalPrice: 149
  },
  {
    plan: 'half_yearly',
    titleHi: '6 महीने (6 Months)',
    titleEn: '6 Months',
    durationDays: 180,
    price: 499,
    originalPrice: 599,
    tagHi: 'लोकप्रिय',
    tagEn: 'Popular'
  },
  {
    plan: 'annual',
    titleHi: '1 वर्ष (Annual)',
    titleEn: '1 Year (Annual)',
    durationDays: 365,
    price: 899,
    originalPrice: 1199,
    tagHi: 'सर्वश्रेष्ठ बचत (Best Value)',
    tagEn: 'Best Value'
  },
  {
    plan: 'lifetime',
    titleHi: 'आजीवन (Lifetime)',
    titleEn: 'Lifetime Access',
    durationDays: 3650,
    price: 1999,
    originalPrice: 2999,
    tagHi: 'एक बार भुगतान',
    tagEn: 'One-Time'
  }
];

export interface SubscriptionStatusResult {
  status: SubscriptionStatus;
  plan: SubscriptionPlanType;
  daysRemaining: number;
  isLocked: boolean;
  isGrace: boolean;
  expiryDateStr: string;
  planNameHi: string;
  planNameEn: string;
}

export const SubscriptionService = {
  isAdmin(phone?: string | null): boolean {
    if (!phone) return false;
    const clean = phone.replace(/\D/g, '').slice(-10);
    return ADMIN_PHONES.includes(clean);
  },

  /**
   * Initializes or normalizes subscription for a supplier.
   * If supplier was created before subscription system (current user),
   * they receive 1 year free annual subscription.
   * If new supplier, they receive 30 days free trial.
   */
  ensureSubscription(supplier: Supplier): SubscriptionInfo {
    if (supplier.subscription && supplier.subscription.currentPeriodEnd) {
      return supplier.subscription;
    }

    const now = Date.now();
    // Check if supplier was registered before launch (current users get 1 year free)
    const isExistingUser = supplier.createdAt && supplier.createdAt < now - (60 * 1000);

    if (isExistingUser) {
      const oneYearFromNow = now + (365 * 24 * 60 * 60 * 1000);
      return {
        plan: 'annual',
        status: 'active',
        trialStartDate: supplier.createdAt || now,
        trialEndDate: now + (30 * 24 * 60 * 60 * 1000),
        currentPeriodStart: now,
        currentPeriodEnd: oneYearFromNow,
        approvedBy: 'system_grandfather_1yr',
        notes: 'Grandfathered 1 Year Free Access for Early Adopters'
      };
    }

    // New users get 30 days free trial
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return {
      plan: 'free_trial',
      status: 'trial_active',
      trialStartDate: now,
      trialEndDate: now + thirtyDays,
      currentPeriodStart: now,
      currentPeriodEnd: now + thirtyDays,
      notes: 'Initial 30-Day Free Trial'
    };
  },

  /**
   * Calculate live subscription status, days left, and lock status.
   */
  getSubscriptionStatus(supplier: Supplier | null): SubscriptionStatusResult {
    if (!supplier) {
      return {
        status: 'expired',
        plan: 'free_trial',
        daysRemaining: 0,
        isLocked: false,
        isGrace: false,
        expiryDateStr: '-',
        planNameHi: 'अतिथी (Guest)',
        planNameEn: 'Guest'
      };
    }

    // Admin phones never lock out
    if (this.isAdmin(supplier.phone)) {
      return {
        status: 'active',
        plan: 'lifetime',
        daysRemaining: 9999,
        isLocked: false,
        isGrace: false,
        expiryDateStr: 'आजीवन (Lifetime Admin)',
        planNameHi: '👑 सुपर एडमिन',
        planNameEn: 'Super Admin'
      };
    }

    const sub = this.ensureSubscription(supplier);
    const now = Date.now();
    const diffMs = sub.currentPeriodEnd - now;
    const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const GRACE_PERIOD_DAYS = 3;

    let status: SubscriptionStatus = sub.status;
    let isLocked = false;
    let isGrace = false;

    if (daysRemaining > 0) {
      status = sub.plan === 'free_trial' ? 'trial_active' : 'active';
      isLocked = false;
    } else if (daysRemaining >= -GRACE_PERIOD_DAYS) {
      status = 'grace_period';
      isGrace = true;
      isLocked = false;
    } else {
      status = 'expired';
      isLocked = true;
    }

    const expiryDateStr = formatToDisplayDate(new Date(sub.currentPeriodEnd));

    let planNameHi = '30 दिन मुफ़्त ट्रायल';
    let planNameEn = '30-Day Free Trial';

    if (sub.plan === 'monthly') {
      planNameHi = '1 महीना प्लान';
      planNameEn = 'Monthly Plan';
    } else if (sub.plan === 'half_yearly') {
      planNameHi = '6 महीने प्लान';
      planNameEn = '6-Month Plan';
    } else if (sub.plan === 'annual') {
      planNameHi = '1 वर्ष प्लान';
      planNameEn = 'Annual Plan';
    } else if (sub.plan === 'lifetime') {
      planNameHi = 'आजीवन सदस्यता (Lifetime)';
      planNameEn = 'Lifetime Plan';
    }

    return {
      status,
      plan: sub.plan,
      daysRemaining: Math.max(0, daysRemaining),
      isLocked,
      isGrace,
      expiryDateStr,
      planNameHi,
      planNameEn
    };
  },

  /**
   * Generates standard Indian UPI Intent URL
   */
  generateUpiUrl(plan: SubscriptionPlanType, supplier: Supplier, customUpiId?: string): string {
    const p = SUBSCRIPTION_PLANS.find(item => item.plan === plan) || SUBSCRIPTION_PLANS[2];
    const upiId = customUpiId || DEFAULT_UPI_ID;
    const cleanPhone = supplier.phone ? supplier.phone.replace(/\D/g, '').slice(-10) : 'dairy';
    const note = `DairyApp_${cleanPhone}_${plan}`;
    return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('Dairy App Subscription')}&am=${p.price}&cu=INR&tn=${encodeURIComponent(note)}`;
  },

  /**
   * Generates a QR code image URL for scanning
   */
  generateQrCodeUrl(upiUrl: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
  },

  /**
   * Super Admin action: Activate or extend subscription for any supplier
   */
  async activateSubscriptionByAdmin(
    targetSupplierId: string,
    plan: SubscriptionPlanType,
    approvedByPhone: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const targetPlan = SUBSCRIPTION_PLANS.find(p => p.plan === plan) || SUBSCRIPTION_PLANS[2];
      const now = Date.now();
      const newExpiry = now + (targetPlan.durationDays * 24 * 60 * 60 * 1000);

      const subData: SubscriptionInfo = {
        plan,
        status: 'active',
        trialStartDate: now,
        trialEndDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: newExpiry,
        lastPaymentDate: now,
        lastPaymentAmount: targetPlan.price,
        approvedBy: approvedByPhone,
        notes: notes || `Activated by Admin ${approvedByPhone}`
      };

      const suppRef = ref(rtdb, `suppliers/${targetSupplierId}`);
      await update(suppRef, {
        'profile/subscription': subData,
        'profile/updatedAt': now
      });

      return {
        success: true,
        message: `✓ Successfully activated ${targetPlan.titleEn} for ${targetSupplierId} until ${formatToDisplayDate(new Date(newExpiry))}!`
      };
    } catch (err: any) {
      console.warn('Super Admin activate subscription error:', err);
      return {
        success: false,
        message: err?.message || 'Failed to activate subscription in cloud database.'
      };
    }
  }
};
