import {
  SubscriptionPlan,
  PartnerSubscription,
  SubscriptionPayment,
  JobCommissionRecord,
  TaxConfiguration,
  SubscriptionAuditLog,
  PlanCode,
  PartnerMembership,
  SubscriptionStatus,
  SubscriptionExpiryPolicy,
  BookingStatus,
  CollectionPaymentMethod,
  CommissionSettlement,
  SettlementPaymentMethod,
  CommissionLedgerSummary,
  WalletTransaction,
  WithdrawalRequest
} from '../types';
import { supabaseService } from './supabaseClient';
import { supabaseDataEngine } from './supabaseDataEngine';
import { partnerAuthService } from './partnerAuth';

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_starter',
    plan_code: 'starter',
    plan_name: 'Starter',
    monthly_price: 0,
    commission_percent: 20,
    tax_configuration: {
      is_tax_applicable: false,
      default_tax_percent: 0
    },
    benefits: [
      '₹0 per month — No paid subscription required',
      'Company commission: 20% per completed job',
      'Partner retains 80% (₹800 per ₹1,000 order)',
      'Standard access to eligible nearby customer jobs',
      'Partner wallet and detailed earnings history',
      'Standard job notifications'
    ],
    is_active: true,
    is_recommended: false,
    created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2026-01-01T00:00:00Z').toISOString()
  },
  {
    id: 'plan_growth',
    plan_code: 'growth',
    plan_name: 'Growth',
    monthly_price: 370,
    commission_percent: 12,
    tax_configuration: {
      is_tax_applicable: true,
      default_tax_percent: 18
    },
    benefits: [
      'Low company commission: only 12% per completed job',
      'Partner retains 88% (₹880 per ₹1,000 order)',
      'Priority job notifications where supported',
      'Partner wallet and detailed earnings reports',
      'Subscription expiry and renewal reminders',
      'Dedicated door-to-door booking visibility'
    ],
    is_active: true,
    is_recommended: true,
    created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2026-01-01T00:00:00Z').toISOString()
  },
  {
    id: 'plan_professional',
    plan_code: 'professional',
    plan_name: 'Professional',
    monthly_price: 799,
    commission_percent: 7,
    tax_configuration: {
      is_tax_applicable: true,
      default_tax_percent: 18
    },
    benefits: [
      'Ultra-low commission: only 7% per completed job',
      'Partner retains 93% (₹930 per ₹1,000 order)',
      'Priority access to high-value eligible jobs where supported',
      'Advanced earnings reports and performance analytics',
      'Priority partner phone and chat support',
      'Subscription expiry and auto-renewal reminders'
    ],
    is_active: true,
    is_recommended: false,
    created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    updated_at: new Date('2026-01-01T00:00:00Z').toISOString()
  }
];

export const DEFAULT_TAX_CONFIG: TaxConfiguration = {
  id: 'tax_config_in',
  tax_name: 'Goods & Services Tax (GST)',
  tax_rate_percent: 18, // Configurable illustrative rate (e.g., 18% -> ₹66.60 on ₹370, total ₹436.60)
  is_active: true,
  hsn_sac_code: '998314', // SAC for Information technology software and subscription services
  gstin_number: '21AAACD1234F1Z5',
  place_of_supply: 'Odisha (21) / Inter-State',
  verification_required_notice:
    'Configurable tax rate: Rates and applicability must be verified against legal service classification and GST registration status before live deployment.',
  expiry_policy: 'fallback_starter',
  updated_at: new Date().toISOString()
};

const STORAGE_KEY_PLANS = 'doorbly_subscription_plans';
const STORAGE_KEY_TAX = 'doorbly_subscription_tax_config';
const STORAGE_KEY_SUBSCRIPTIONS = 'doorbly_partner_subscriptions_store';
const STORAGE_KEY_PAYMENTS = 'doorbly_subscription_payments_store';
const STORAGE_KEY_COMMISSIONS = 'doorbly_job_commission_records_store';
const STORAGE_KEY_SETTLEMENTS = 'doorbly_commission_settlements_store';
const STORAGE_KEY_AUDIT_LOGS = 'doorbly_subscription_audit_logs';

export interface PriceBreakdown {
  plan_code: PlanCode;
  plan_name: string;
  monthly_price: number;
  commission_percent: number;
  tax_rate_percent: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  total_payable: number;
  partner_retention_percent: number;
  partner_retention_per_1000: number;
  company_commission_per_1000: number;
  tax_disclaimer: string;
}

class SubscriptionService {
  private ensureAuthorizedAdmin(): string {
    const user = partnerAuthService.getStoredUser();
    if (!partnerAuthService.isAuthorizedAdmin(user)) {
      throw new Error('Unauthorized: Only Master Admin can modify subscription plans, commission rates, or partner statuses.');
    }
    return user!.email;
  }

  /**
   * Calculate precise Indian Rupee price breakdown with tax
   */
  public calculateBreakdown(plan: SubscriptionPlan, taxConfig: TaxConfiguration): PriceBreakdown {
    const isStarter = plan.plan_code === 'starter' || plan.monthly_price === 0;
    const taxRate = isStarter || !plan.tax_configuration.is_tax_applicable ? 0 : taxConfig.tax_rate_percent;

    // e.g. for ₹370 at 18%: tax = 370 * 0.18 = 66.60; total = 436.60
    const rawTax = isStarter ? 0 : (plan.monthly_price * taxRate) / 100;
    const taxAmount = Math.round(rawTax * 100) / 100;
    const halfTax = Math.round((taxAmount / 2) * 100) / 100;
    const totalPayable = Math.round((plan.monthly_price + taxAmount) * 100) / 100;

    const commissionPercent = plan.commission_percent;
    const partnerRetentionPercent = 100 - commissionPercent;
    const companyCommissionPer1000 = Math.round((1000 * commissionPercent) / 100);
    const partnerRetentionPer1000 = 1000 - companyCommissionPer1000;

    return {
      plan_code: plan.plan_code,
      plan_name: plan.plan_name,
      monthly_price: plan.monthly_price,
      commission_percent: commissionPercent,
      tax_rate_percent: taxRate,
      tax_amount: taxAmount,
      cgst_amount: halfTax,
      sgst_amount: halfTax,
      total_payable: totalPayable,
      partner_retention_percent: partnerRetentionPercent,
      partner_retention_per_1000: partnerRetentionPer1000,
      company_commission_per_1000: companyCommissionPer1000,
      tax_disclaimer: isStarter
        ? 'No tax applicable on ₹0 Starter plan.'
        : `Includes ${taxConfig.tax_name} @ ${taxRate}%. ${taxConfig.verification_required_notice}`
    };
  }

  /**
   * Synchronous (< 1ms) snapshot for zero-latency PartnerContext & MembershipView boot
   */
  public getInstantSubscriptionSnapshot(partnerId?: string): {
    plans: SubscriptionPlan[];
    taxConfig: TaxConfiguration;
    activeSubscription: PartnerSubscription | null;
  } {
    let plans = supabaseDataEngine.peekCache<SubscriptionPlan[]>('subscription:plans');
    if (!plans || plans.length === 0) {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_PLANS);
        if (cached) {
          const parsed = JSON.parse(cached) as SubscriptionPlan[];
          if (parsed && parsed.length > 0) plans = parsed;
        }
      } catch {
        // ignore
      }
    }
    if (!plans || plans.length === 0) plans = DEFAULT_SUBSCRIPTION_PLANS;

    let taxConfig = supabaseDataEngine.peekCache<TaxConfiguration>('subscription:taxConfig');
    if (!taxConfig) {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_TAX);
        if (cached) taxConfig = JSON.parse(cached) as TaxConfiguration;
      } catch {
        // ignore
      }
    }
    if (!taxConfig) taxConfig = DEFAULT_TAX_CONFIG;

    let activeSubscription: PartnerSubscription | null = null;
    if (partnerId) {
      const localSubs = this.getLocalSubscriptions(partnerId);
      const cachedActive = supabaseDataEngine.peekCache<PartnerSubscription>(`subscription:active:${partnerId}`);
      const latestSub = localSubs[0] || null;
      activeSubscription =
        cachedActive ||
        localSubs.find(
          (s) => s.status === 'active' && new Date(s.expires_at).getTime() >= Date.now()
        ) ||
        (latestSub && (latestSub.status === 'suspended' || latestSub.status === 'expired') ? latestSub : null);
    }

    return { plans, taxConfig, activeSubscription };
  }

  /**
   * Get all active subscription plans
   */
  public async getPlans(): Promise<SubscriptionPlan[]> {
    const readLocalPlans = (): SubscriptionPlan[] => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_PLANS);
        if (cached) {
          const parsed = JSON.parse(cached) as SubscriptionPlan[];
          if (parsed && parsed.length > 0) return parsed;
        }
      } catch {
        // ignore
      }
      localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(DEFAULT_SUBSCRIPTION_PLANS));
      return DEFAULT_SUBSCRIPTION_PLANS;
    };

    return supabaseDataEngine.fetchWithEngine(
      'subscription:plans',
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_subscription_plans')
              .select('*')
              .order('monthly_price', { ascending: true });

            if (!error && data && data.length > 0) {
              localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(data));
              return data as SubscriptionPlan[];
            }
          } catch (e) {
            console.warn('getPlans Supabase error:', e);
          }
        }

        return readLocalPlans();
      },
      { instantFallback: readLocalPlans }
    );
  }

  /**
   * Get Tax Configuration
   */
  public async getTaxConfiguration(): Promise<TaxConfiguration> {
    const readLocalTax = (): TaxConfiguration => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_TAX);
        if (cached) {
          return JSON.parse(cached) as TaxConfiguration;
        }
      } catch {
        // ignore
      }
      localStorage.setItem(STORAGE_KEY_TAX, JSON.stringify(DEFAULT_TAX_CONFIG));
      return DEFAULT_TAX_CONFIG;
    };

    return supabaseDataEngine.fetchWithEngine(
      'subscription:taxConfig',
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_tax_configurations')
              .select('*')
              .eq('id', DEFAULT_TAX_CONFIG.id)
              .maybeSingle();

            if (!error && data) {
              localStorage.setItem(STORAGE_KEY_TAX, JSON.stringify(data));
              return data as TaxConfiguration;
            }
          } catch (e) {
            console.warn('getTaxConfiguration Supabase notice:', e);
          }
        }

        return readLocalTax();
      },
      { instantFallback: readLocalTax }
    );
  }

  /**
   * Update Tax Configuration & Expiry Policy from Admin Panel
   */
  public async updateTaxConfiguration(
    updates: Partial<TaxConfiguration>,
    adminEmail?: string
  ): Promise<TaxConfiguration> {
    const resolvedAdminEmail = adminEmail || this.ensureAuthorizedAdmin();
    const current = await this.getTaxConfiguration();
    const updated: TaxConfiguration = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY_TAX, JSON.stringify(updated));
    supabaseDataEngine.primeCache('subscription:taxConfig', updated);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () =>
            await client
              .from('doorbly_tax_configurations')
              .upsert(updated)
              .select(),
          ['subscription:taxConfig']
        );
      } catch (e) {
        console.warn('Failed to upsert tax configuration in Supabase:', e);
      }
    }

    // Log admin audit
    this.recordAuditLog({
      subscription_id: 'tax_config',
      partner_id: 'system',
      admin_email: resolvedAdminEmail,
      action: 'UPDATE_TAX_CONFIG',
      previous_state: JSON.stringify(current),
      new_state: JSON.stringify(updated),
      reason: 'Admin adjusted tax rate or expiry policy settings'
    });

    return updated;
  }

  /**
   * Create a new Subscription Plan from Admin Panel
   */
  public async createPlan(
    input: {
      plan_code: string;
      plan_name: string;
      monthly_price: number;
      commission_percent: number;
      is_tax_applicable?: boolean;
      benefits?: string[];
      is_active?: boolean;
      is_recommended?: boolean;
    },
    adminEmail?: string
  ): Promise<SubscriptionPlan[]> {
    const resolvedAdminEmail = adminEmail || this.ensureAuthorizedAdmin();
    const plans = await this.getPlans();
    const sanitizedCode = input.plan_code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!sanitizedCode) {
      throw new Error('Plan code is required.');
    }
    if (plans.some((p) => p.plan_code.toLowerCase() === sanitizedCode)) {
      throw new Error(`A plan with code "${sanitizedCode}" already exists.`);
    }

    const nowIso = new Date().toISOString();
    const taxCfg = await this.getTaxConfiguration();
    const price = Math.max(0, Number(input.monthly_price) || 0);
    const commissionPct = Math.min(100, Math.max(0, Number(input.commission_percent) || 0));
    const isTaxApplicable = price > 0 ? (input.is_tax_applicable ?? true) : false;

    const newPlan: SubscriptionPlan = {
      id: `plan_${sanitizedCode}_${Date.now()}`,
      plan_code: sanitizedCode,
      plan_name: input.plan_name.trim(),
      monthly_price: price,
      commission_percent: commissionPct,
      tax_configuration: {
        is_tax_applicable: isTaxApplicable,
        default_tax_percent: isTaxApplicable ? taxCfg.tax_rate_percent : 0
      },
      benefits:
        input.benefits && input.benefits.length > 0
          ? input.benefits
          : [
              `₹${price} monthly subscription`,
              `Doorbly commission: ${commissionPct}% per completed job`,
              `Partner retains ${100 - commissionPct}% earnings`
            ],
      is_active: input.is_active ?? true,
      is_recommended: input.is_recommended ?? false,
      created_at: nowIso,
      updated_at: nowIso
    };

    const nextPlans = [...plans, newPlan].sort((a, b) => a.monthly_price - b.monthly_price);
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(nextPlans));
    supabaseDataEngine.primeCache('subscription:plans', nextPlans);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => await client.from('doorbly_subscription_plans').upsert(newPlan).select(),
          ['subscription:plans']
        );
      } catch (e) {
        console.warn('Failed to create plan in Supabase:', e);
      }
    }

    this.recordAuditLog({
      subscription_id: newPlan.id,
      partner_id: 'system',
      admin_email: resolvedAdminEmail,
      action: 'CREATE_PLAN',
      previous_state: 'null',
      new_state: JSON.stringify(newPlan),
      reason: `Admin created subscription plan ${newPlan.plan_name} (${newPlan.commission_percent}% comm.)`
    });

    return nextPlans;
  }

  /**
   * Update Plan settings from Admin Panel (historical commission snapshots remain untouched)
   */
  public async updatePlan(
    planId: string,
    updates: Partial<SubscriptionPlan>,
    adminEmail?: string
  ): Promise<SubscriptionPlan[]> {
    const resolvedAdminEmail = adminEmail || this.ensureAuthorizedAdmin();
    const plans = await this.getPlans();
    const targetIdx = plans.findIndex((p) => p.id === planId);
    if (targetIdx === -1) return plans;

    const previous = plans[targetIdx];
    const cleanPrice =
      updates.monthly_price !== undefined
        ? Math.max(0, Number(updates.monthly_price) || 0)
        : previous.monthly_price;
    const cleanCommission =
      updates.commission_percent !== undefined
        ? Math.min(100, Math.max(0, Number(updates.commission_percent) || 0))
        : previous.commission_percent;

    const updated: SubscriptionPlan = {
      ...previous,
      ...updates,
      monthly_price: cleanPrice,
      commission_percent: cleanCommission,
      updated_at: new Date().toISOString()
    };
    plans[targetIdx] = updated;

    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(plans));
    supabaseDataEngine.primeCache('subscription:plans', plans);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () =>
            await client
              .from('doorbly_subscription_plans')
              .upsert(updated)
              .select(),
          ['subscription:plans']
        );
      } catch (e) {
        console.warn('Failed to upsert plan in Supabase:', e);
      }
    }

    this.recordAuditLog({
      subscription_id: planId,
      partner_id: 'system',
      admin_email: resolvedAdminEmail,
      action: 'UPDATE_PLAN_TERMS',
      previous_state: JSON.stringify(previous),
      new_state: JSON.stringify(updated),
      reason: `Admin updated plan ${updated.plan_name} (historical job commissions preserved)`
    });

    return plans;
  }

  /**
   * Get Active Partner Subscription (respects Admin Expiry Policy & Suspended state)
   */
  public async getActiveSubscription(partnerId: string): Promise<PartnerSubscription | null> {
    const readLocalActiveSub = (): PartnerSubscription | null => {
      const localSubs = this.getLocalSubscriptions(partnerId);
      const active = localSubs.find(
        (s) => s.status === 'active' && new Date(s.expires_at).getTime() >= Date.now()
      );
      if (active) return active;
      const suspended = localSubs.find((s) => s.status === 'suspended');
      if (suspended) return suspended;
      return localSubs[0] || null;
    };

    return supabaseDataEngine.fetchWithEngine(
      `subscription:active:${partnerId}`,
      async () => {
        const taxCfg = await this.getTaxConfiguration();
        const expiryPolicy: SubscriptionExpiryPolicy = taxCfg.expiry_policy || 'fallback_starter';

        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data: allSubs, error } = await client
              .from('doorbly_partner_subscriptions')
              .select('*')
              .eq('partner_id', partnerId)
              .order('start_at', { ascending: false })
              .limit(10);

            if (!error && allSubs && allSubs.length > 0) {
              const typedSubs = allSubs as PartnerSubscription[];
              this.saveLocalSubscriptions(partnerId, typedSubs);

              // Check if latest sub is explicitly suspended by admin
              const suspendedSub = typedSubs.find((s) => s.status === 'suspended');
              const activeSub = typedSubs.find((s) => s.status === 'active');

              if (activeSub) {
                if (new Date(activeSub.expires_at).getTime() < Date.now()) {
                  await this.handleSubscriptionExpiry(activeSub, expiryPolicy);
                  if (expiryPolicy === 'fallback_starter') {
                    return await this.createDefaultStarterSubscription(partnerId);
                  }
                  return { ...activeSub, status: 'expired' };
                }
                return activeSub;
              }

              if (suspendedSub) {
                return suspendedSub;
              }

              if (expiryPolicy === 'require_renewal') {
                return typedSubs[0];
              }
            }
          } catch (e) {
            console.warn('getActiveSubscription Supabase error:', e);
          }
        }

        // Check local store
        const localSubs = this.getLocalSubscriptions(partnerId);
        const active = localSubs.find((s) => s.status === 'active');
        if (active) {
          if (new Date(active.expires_at).getTime() < Date.now()) {
            await this.handleSubscriptionExpiry(active, expiryPolicy);
            active.status = 'expired';
            this.saveLocalSubscriptions(partnerId, localSubs);
            if (expiryPolicy === 'fallback_starter') {
              return await this.createDefaultStarterSubscription(partnerId);
            }
            return active;
          }
          return active;
        }

        const suspendedLocal = localSubs.find((s) => s.status === 'suspended');
        if (suspendedLocal) {
          return suspendedLocal;
        }

        const latestExpired = localSubs.find((s) => s.status === 'expired');
        if (latestExpired && expiryPolicy === 'require_renewal') {
          return latestExpired;
        }

        // Default fallback: Starter plan (₹0/mo, 20% commission)
        return await this.createDefaultStarterSubscription(partnerId);
      },
      { instantFallback: readLocalActiveSub }
    );
  }

  /**
   * Create or fetch default Starter subscription for partner
   */
  public async createDefaultStarterSubscription(partnerId: string): Promise<PartnerSubscription> {
    const plans = await this.getPlans();
    const starterPlan =
      plans.find((p) => p.plan_code === 'starter') ||
      DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.plan_code === 'starter')!;
    const now = new Date();
    const expiry = new Date(now.getTime() + 365 * 86400000); // 1-year starter cycle

    const newSub: PartnerSubscription = {
      id: `sub_${partnerId}_starter_${Date.now()}`,
      partner_id: partnerId,
      plan_id: starterPlan.id,
      plan_code: starterPlan.plan_code,
      plan_name: starterPlan.plan_name,
      commission_percent: starterPlan.commission_percent,
      status: 'active',
      start_at: now.toISOString(),
      expires_at: expiry.toISOString(),
      auto_renew: true,
      payment_status: 'free',
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const localSubs = this.getLocalSubscriptions(partnerId);
    // Deactivate previous active
    localSubs.forEach((s) => {
      if (s.status === 'active') s.status = 'expired';
    });
    localSubs.unshift(newSub);
    this.saveLocalSubscriptions(partnerId, localSubs);
    supabaseDataEngine.primeCache(`subscription:active:${partnerId}`, newSub);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client.from('doorbly_partner_subscriptions').upsert(newSub);
      } catch {
        // ignore
      }
    }

    return newSub;
  }

  /**
   * Step 1 of Paid Upgrade / Renewal: Create Pending Payment Request & Pending Subscription
   * NEVER activates a paid subscription before payment verification completes.
   */
  public async createSubscriptionPaymentRequest(
    partnerId: string,
    planCode: PlanCode,
    options?: {
      paymentGateway?: string;
      durationDays?: number;
      partnerName?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    isFreeActivation?: boolean;
    subscription?: PartnerSubscription;
    payment?: SubscriptionPayment;
  }> {
    const plans = await this.getPlans();
    const selectedPlan =
      plans.find((p) => p.plan_code === planCode) ||
      DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.plan_code === planCode);
    if (!selectedPlan) {
      return { success: false, message: 'Invalid subscription plan selected.' };
    }

    const isStarter = selectedPlan.plan_code === 'starter' || selectedPlan.monthly_price === 0;
    if (isStarter) {
      const freeRes = await this.subscribeToPlan(partnerId, planCode, {
        paymentGateway: 'Free Starter Tier',
        gatewayPaymentRef: `STARTER_${Date.now()}`,
        durationDays: 365,
        partnerName: options?.partnerName
      });
      return {
        success: freeRes.success,
        message: freeRes.message,
        isFreeActivation: true,
        subscription: freeRes.subscription,
        payment: freeRes.payment
      };
    }

    const taxConfig = await this.getTaxConfiguration();
    const breakdown = this.calculateBreakdown(selectedPlan, taxConfig);
    const durationDays = Math.max(1, options?.durationDays || 30);
    const now = new Date();
    const estimatedExpiry = new Date(now.getTime() + durationDays * 86400000).toISOString();

    const subscriptionId = `sub_${partnerId}_${Date.now()}`;
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const paymentRequestId = `REQ-DBY-${Math.floor(100000 + Math.random() * 900000)}`;
    const invoiceNumber = this.generateInvoiceNumber();
    const gatewayName = options?.paymentGateway || 'UPI / QR Gateway';

    const paymentRecord: SubscriptionPayment = {
      id: paymentId,
      partner_subscription_id: subscriptionId,
      partner_id: partnerId,
      plan_id: selectedPlan.id,
      plan_code: selectedPlan.plan_code,
      payment_request_id: paymentRequestId,
      amount_before_tax: breakdown.monthly_price,
      tax_rate_percent: breakdown.tax_rate_percent,
      tax_amount: breakdown.tax_amount,
      total_amount: breakdown.total_payable,
      currency: 'INR',
      payment_gateway: gatewayName,
      gateway_payment_reference: 'AWAITING_PAYMENT',
      payment_status: 'pending',
      invoice_number: invoiceNumber,
      duration_days: durationDays,
      created_at: now.toISOString()
    };

    const pendingSubRecord: PartnerSubscription = {
      id: subscriptionId,
      partner_id: partnerId,
      plan_id: selectedPlan.id,
      plan_code: selectedPlan.plan_code,
      plan_name: selectedPlan.plan_name,
      commission_percent: selectedPlan.commission_percent,
      status: 'pending_payment',
      start_at: now.toISOString(),
      expires_at: estimatedExpiry,
      auto_renew: true,
      payment_status: 'pending',
      latest_payment_id: paymentId,
      status_reason: `Payment Request ${paymentRequestId} generated; awaiting payment verification`,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const localSubs = this.getLocalSubscriptions(partnerId);
    localSubs.unshift(pendingSubRecord);
    this.saveLocalSubscriptions(partnerId, localSubs);

    const allPayments = this.getAllLocalPayments();
    allPayments.unshift(paymentRecord);
    this.saveAllLocalPayments(allPayments);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => {
            await client.from('doorbly_partner_subscriptions').insert(pendingSubRecord);
            await client.from('doorbly_subscription_payments').insert(paymentRecord);
          },
          [`subscription:history:${partnerId}`, 'admin:subscriptions', 'admin:payments']
        );
      } catch (e) {
        console.warn('Failed to store pending payment request in Supabase:', e);
      }
    }

    supabaseDataEngine.invalidate(`subscription:history:${partnerId}`);
    supabaseDataEngine.invalidate('admin:subscriptions');
    supabaseDataEngine.invalidate('admin:payments');

    return {
      success: true,
      message: `Payment request ${paymentRequestId} generated for ₹${breakdown.total_payable.toFixed(2)}. Complete payment and submit your transaction reference for verification.`,
      isFreeActivation: false,
      subscription: pendingSubRecord,
      payment: paymentRecord
    };
  }

  /**
   * Step 2 (Partner): Submit genuine payment reference / UTR for an existing pending payment request.
   * Calls gateway verification webhook if configured (`VITE_PAYMENT_GATEWAY_VERIFY_URL`), otherwise records
   * proof on pending payment for Admin/Gateway verification without falsely activating early.
   */
  public async submitSubscriptionPaymentProof(
    paymentId: string,
    gatewayPaymentRef: string,
    paymentGateway?: string
  ): Promise<{
    success: boolean;
    verifiedAndActivated: boolean;
    message: string;
    payment?: SubscriptionPayment;
    subscription?: PartnerSubscription;
  }> {
    const cleanRef = gatewayPaymentRef.trim();
    if (cleanRef.length < 8 || !/^[A-Za-z0-9_-]+$/.test(cleanRef)) {
      return {
        success: false,
        verifiedAndActivated: false,
        message: 'Please enter a valid 8+ character alphanumeric UPI UTR / Gateway Transaction Reference ID.'
      };
    }

    // Duplicate transaction reference check across all payments
    const existingAll = await this.getAllPaymentsAdmin();
    const duplicate = existingAll.find(
      (p) =>
        p.id !== paymentId &&
        p.payment_status === 'completed' &&
        p.gateway_payment_reference.trim().toLowerCase() === cleanRef.toLowerCase()
    );
    if (duplicate) {
      return {
        success: false,
        verifiedAndActivated: false,
        message: 'This transaction reference has already been used for another subscription payment.'
      };
    }

    const allPayments = this.getAllLocalPayments();
    let targetPayment =
      allPayments.find((p) => p.id === paymentId) ||
      existingAll.find((p) => p.id === paymentId);
    if (!targetPayment) {
      return {
        success: false,
        verifiedAndActivated: false,
        message: 'Payment request record could not be located.'
      };
    }

    if (targetPayment.payment_status === 'completed') {
      return {
        success: true,
        verifiedAndActivated: true,
        message: 'This payment has already been verified and activated.',
        payment: targetPayment
      };
    }

    targetPayment = {
      ...targetPayment,
      gateway_payment_reference: cleanRef,
      payment_gateway: paymentGateway || targetPayment.payment_gateway
    };

    const nextPayments = [targetPayment, ...allPayments.filter((p) => p.id !== paymentId)];
    this.saveAllLocalPayments(nextPayments);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () =>
            await client
              .from('doorbly_subscription_payments')
              .update({
                gateway_payment_reference: cleanRef,
                payment_gateway: targetPayment!.payment_gateway
              })
              .eq('id', paymentId)
              .eq('payment_status', 'pending'),
          ['admin:payments', `subscription:history:${targetPayment.partner_id}`]
        );
      } catch (e) {
        console.warn('submitSubscriptionPaymentProof update notice:', e);
      }
    }

    // Optional live backend gateway verification endpoint if configured
    const verifyUrl = (import.meta as unknown as { env: Record<string, string> }).env
      ?.VITE_PAYMENT_GATEWAY_VERIFY_URL;
    if (verifyUrl) {
      try {
        const resp = await fetch(verifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: paymentId,
            payment_request_id: targetPayment.payment_request_id,
            gateway_payment_reference: cleanRef,
            amount: targetPayment.total_amount,
            partner_id: targetPayment.partner_id
          })
        });
        const body = (await resp.json()) as { verified?: boolean; message?: string };
        if (resp.ok && body.verified) {
          const act = await this.verifyAndActivateSubscriptionPayment(paymentId, {
            gatewayRef: cleanRef,
            actorEmail: 'gateway_webhook',
            skipAdminCheck: true
          });
          if (act.success) {
            return {
              success: true,
              verifiedAndActivated: true,
              message: act.message,
              payment: act.payment,
              subscription: act.subscription
            };
          }
        }
      } catch (err) {
        console.warn('Gateway webhook verification failed:', err);
      }
    }

    supabaseDataEngine.invalidate('admin:payments');
    await supabaseService.createNotification(targetPayment.partner_id, {
      title: `Upgrade Payment Submitted (${targetPayment.plan_code.toUpperCase()})`,
      message: `Transaction ref ${cleanRef} submitted for Request ${targetPayment.payment_request_id || paymentId}. Your current plan stays active until payment verification completes.`,
      type: 'MEMBERSHIP_UPDATE'
    });

    return {
      success: true,
      verifiedAndActivated: false,
      message: `Transaction reference ${cleanRef} submitted for verification. Plan will activate immediately once payment is verified by Admin / Payment Gateway.`,
      payment: targetPayment
    };
  }

  /**
   * Step 3 (Gateway Webhook or Authorized Admin): Verify successful payment & activate upgraded plan
   * Applies the new commission percentage strictly from verified activation date forward.
   */
  public async verifyAndActivateSubscriptionPayment(
    paymentId: string,
    options?: {
      gatewayRef?: string;
      actorEmail?: string;
      skipAdminCheck?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    payment?: SubscriptionPayment;
    subscription?: PartnerSubscription;
  }> {
    const actorEmail = options?.skipAdminCheck
      ? options.actorEmail || 'gateway_webhook'
      : options?.actorEmail || this.ensureAuthorizedAdmin();

    const allPayments = await this.getAllPaymentsAdmin();
    const target = allPayments.find((p) => p.id === paymentId);
    if (!target) {
      return { success: false, message: 'Subscription payment record not found.' };
    }

    const effectiveRef = (options?.gatewayRef || target.gateway_payment_reference || '').trim();
    if (!effectiveRef || effectiveRef === 'AWAITING_PAYMENT') {
      return {
        success: false,
        message: 'Cannot verify payment without a valid gateway / UTR transaction reference.'
      };
    }

    const duplicate = allPayments.find(
      (p) =>
        p.id !== paymentId &&
        p.payment_status === 'completed' &&
        p.gateway_payment_reference.trim().toLowerCase() === effectiveRef.toLowerCase()
    );
    if (duplicate) {
      return {
        success: false,
        message: `Duplicate transaction reference ${effectiveRef} already verified on invoice ${duplicate.invoice_number}.`
      };
    }

    const client = supabaseService.getClient();
    const now = new Date();
    const durationDays = Math.max(1, Number(target.duration_days) || 30);
    const expiresAt = new Date(now.getTime() + durationDays * 86400000).toISOString();

    const plans = await this.getPlans();
    const planDef =
      plans.find((p) => p.id === target.plan_id || p.plan_code === target.plan_code) ||
      DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.plan_code === target.plan_code);

    if (client) {
      try {
        await client.rpc('verify_subscription_payment_and_activate', {
          p_payment_id: paymentId,
          p_gateway_ref: effectiveRef,
          p_actor_email: actorEmail
        });
      } catch (e) {
        console.warn('verify_subscription_payment_and_activate RPC fallback notice:', e);
      }
    }

    const completedPayment: SubscriptionPayment = {
      ...target,
      gateway_payment_reference: effectiveRef,
      payment_status: 'completed',
      verified_by: actorEmail,
      verified_at: now.toISOString()
    };

    const localPayments = this.getAllLocalPayments();
    this.saveAllLocalPayments([
      completedPayment,
      ...localPayments.filter((p) => p.id !== paymentId)
    ]);

    const partnerSubs = this.getLocalSubscriptions(target.partner_id);
    const existingSub = partnerSubs.find((s) => s.id === target.partner_subscription_id);
    const updatedSubs = partnerSubs.map((s) =>
      s.status === 'active' && s.id !== target.partner_subscription_id
        ? { ...s, status: 'cancelled' as SubscriptionStatus, updated_at: now.toISOString() }
        : s
    );

    const activatedSub: PartnerSubscription = {
      id: target.partner_subscription_id,
      partner_id: target.partner_id,
      plan_id: target.plan_id,
      plan_code: target.plan_code,
      plan_name: planDef?.plan_name || existingSub?.plan_name || String(target.plan_code),
      commission_percent: planDef?.commission_percent ?? existingSub?.commission_percent ?? 20,
      status: 'active',
      start_at: now.toISOString(),
      expires_at: expiresAt,
      auto_renew: true,
      payment_status: target.total_amount === 0 ? 'free' : 'paid',
      latest_payment_id: paymentId,
      status_reason: `Verified by ${actorEmail} (Ref: ${effectiveRef})`,
      created_at: existingSub?.created_at || target.created_at,
      updated_at: now.toISOString()
    };

    const finalPartnerSubs = [
      activatedSub,
      ...updatedSubs.filter((s) => s.id !== activatedSub.id)
    ];
    this.saveLocalSubscriptions(target.partner_id, finalPartnerSubs);

    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => {
            await client
              .from('doorbly_partner_subscriptions')
              .update({ status: 'cancelled', updated_at: now.toISOString() })
              .eq('partner_id', target.partner_id)
              .eq('status', 'active')
              .neq('id', activatedSub.id);
            await client.from('doorbly_partner_subscriptions').upsert(activatedSub);
            await client
              .from('doorbly_subscription_payments')
              .update({
                payment_status: 'completed',
                gateway_payment_reference: effectiveRef,
                verified_by: actorEmail,
                verified_at: now.toISOString()
              })
              .eq('id', paymentId);
          },
          [
            `subscription:active:${target.partner_id}`,
            `subscription:history:${target.partner_id}`,
            'admin:subscriptions',
            'admin:payments'
          ]
        );
      } catch (e) {
        console.warn('verifyAndActivateSubscriptionPayment Supabase upsert notice:', e);
      }
    }

    supabaseDataEngine.primeCache(`subscription:active:${target.partner_id}`, activatedSub);
    supabaseDataEngine.invalidate(`subscription:history:${target.partner_id}`);
    supabaseDataEngine.invalidate('admin:subscriptions');
    supabaseDataEngine.invalidate('admin:payments');

    // Sync PartnerMembership and record separate subscription payment ledger entry
    const membershipUpdate: PartnerMembership = {
      id: `mem_${target.partner_id}`,
      partner_id: target.partner_id,
      plan_name: `${activatedSub.plan_name} Plan (${activatedSub.commission_percent}% Comm.)`,
      monthly_fee: target.total_amount,
      status: 'active',
      start_date: activatedSub.start_at,
      expiry_date: activatedSub.expires_at,
      payment_status: 'paid',
      payment_reference: effectiveRef,
      plan_code: activatedSub.plan_code
    };
    await supabaseService.updateMembership(membershipUpdate);

    await supabaseService.recordLedgerTransaction(target.partner_id, {
      id: `tx_sub_${paymentId}`,
      reference_id: effectiveRef,
      payment_method: target.payment_gateway,
      type: 'debit',
      category: 'subscription_payment',
      amount: target.total_amount,
      description: `Subscription Upgrade (${activatedSub.plan_name}) Invoice #${target.invoice_number}`,
      status: 'completed'
    });

    this.recordAuditLog({
      subscription_id: activatedSub.id,
      partner_id: target.partner_id,
      admin_email: actorEmail,
      action: 'VERIFY_AND_ACTIVATE_UPGRADE',
      previous_state: 'pending',
      new_state: `${activatedSub.plan_name} (${activatedSub.commission_percent}%)`,
      reason: `Payment verified (${effectiveRef}) · Invoice ${target.invoice_number}`
    });

    await supabaseService.createNotification(target.partner_id, {
      title: `${activatedSub.plan_name} Upgrade Activated!`,
      message: `Payment verified (Ref: ${effectiveRef}). Invoice #${target.invoice_number} issued. Commission rate is now ${activatedSub.commission_percent}% from ${now.toLocaleDateString('en-IN')} onwards.`,
      type: 'MEMBERSHIP_UPDATE'
    });

    return {
      success: true,
      message: `${activatedSub.plan_name} subscription verified & activated! Invoice #${target.invoice_number} generated.`,
      payment: completedPayment,
      subscription: activatedSub
    };
  }

  /**
   * Reject a pending subscription payment request (Admin)
   */
  public async rejectSubscriptionPayment(
    paymentId: string,
    reason: string,
    adminEmail?: string
  ): Promise<boolean> {
    const resolvedAdminEmail = adminEmail || this.ensureAuthorizedAdmin();
    const allPayments = await this.getAllPaymentsAdmin();
    const target = allPayments.find((p) => p.id === paymentId);
    if (!target || target.payment_status === 'completed') return false;

    const nowIso = new Date().toISOString();
    const rejectedPay: SubscriptionPayment = {
      ...target,
      payment_status: 'failed',
      verified_by: resolvedAdminEmail,
      verified_at: nowIso,
      rejection_reason: reason
    };

    const localPays = this.getAllLocalPayments();
    this.saveAllLocalPayments([rejectedPay, ...localPays.filter((p) => p.id !== paymentId)]);

    const partnerSubs = this.getLocalSubscriptions(target.partner_id).map((s) =>
      s.id === target.partner_subscription_id
        ? { ...s, status: 'cancelled' as SubscriptionStatus, payment_status: 'failed' as const, status_reason: reason, updated_at: nowIso }
        : s
    );
    this.saveLocalSubscriptions(target.partner_id, partnerSubs);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => {
            await client
              .from('doorbly_subscription_payments')
              .update({
                payment_status: 'failed',
                verified_by: resolvedAdminEmail,
                verified_at: nowIso,
                rejection_reason: reason
              })
              .eq('id', paymentId);
            await client
              .from('doorbly_partner_subscriptions')
              .update({ status: 'cancelled', payment_status: 'failed', status_reason: reason, updated_at: nowIso })
              .eq('id', target.partner_subscription_id);
          },
          ['admin:payments', 'admin:subscriptions', `subscription:history:${target.partner_id}`]
        );
      } catch (e) {
        console.warn('rejectSubscriptionPayment error:', e);
      }
    }

    supabaseDataEngine.invalidate('admin:payments');
    supabaseDataEngine.invalidate('admin:subscriptions');
    await supabaseService.createNotification(target.partner_id, {
      title: `Subscription Payment Rejected`,
      message: `Your upgrade request (${target.payment_request_id || paymentId}) was rejected: ${reason}`,
      type: 'MEMBERSHIP_UPDATE'
    });
    return true;
  }

  /**
   * Purchase / Activate Free Starter Tier or Direct Admin-Verified Plan
   */
  public async subscribeToPlan(
    partnerId: string,
    planCode: PlanCode,
    options?: {
      paymentGateway?: string;
      gatewayPaymentRef?: string;
      durationDays?: number;
      partnerName?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    subscription?: PartnerSubscription;
    payment?: SubscriptionPayment;
    invoiceNumber?: string;
  }> {
    const plans = await this.getPlans();
    const selectedPlan = plans.find((p) => p.plan_code === planCode) || DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.plan_code === planCode);
    if (!selectedPlan) {
      return { success: false, message: 'Invalid subscription plan selected.' };
    }

    const isStarter = selectedPlan.plan_code === 'starter' || selectedPlan.monthly_price === 0;
    if (!isStarter) {
      // Paid tiers must always go through payment request & verification unless explicitly verified by ref
      if (!options?.gatewayPaymentRef) {
        const reqRes = await this.createSubscriptionPaymentRequest(partnerId, planCode, options);
        return {
          success: reqRes.success,
          message: reqRes.message,
          subscription: reqRes.subscription,
          payment: reqRes.payment
        };
      }
    }

    const taxConfig = await this.getTaxConfiguration();
    const breakdown = this.calculateBreakdown(selectedPlan, taxConfig);
    const durationDays = options?.durationDays || 30;

    const now = new Date();
    const expiresAt = isStarter
      ? new Date(now.getTime() + 365 * 86400000).toISOString()
      : new Date(now.getTime() + durationDays * 86400000).toISOString();

    const subscriptionId = `sub_${partnerId}_${Date.now()}`;
    const invoiceNumber = this.generateInvoiceNumber();
    const paymentId = `pay_${Date.now()}`;

    const gatewayRef = options?.gatewayPaymentRef || 'FREE_ACTIVATION';
    const gatewayName = options?.paymentGateway || 'Free Starter Tier';

    const paymentRecord: SubscriptionPayment = {
      id: paymentId,
      partner_subscription_id: subscriptionId,
      partner_id: partnerId,
      plan_id: selectedPlan.id,
      plan_code: selectedPlan.plan_code,
      amount_before_tax: breakdown.monthly_price,
      tax_rate_percent: breakdown.tax_rate_percent,
      tax_amount: breakdown.tax_amount,
      total_amount: breakdown.total_payable,
      currency: 'INR',
      payment_gateway: gatewayName,
      gateway_payment_reference: gatewayRef,
      payment_status: 'completed',
      invoice_number: invoiceNumber,
      duration_days: durationDays,
      created_at: now.toISOString()
    };

    const subscriptionRecord: PartnerSubscription = {
      id: subscriptionId,
      partner_id: partnerId,
      plan_id: selectedPlan.id,
      plan_code: selectedPlan.plan_code,
      plan_name: selectedPlan.plan_name,
      commission_percent: selectedPlan.commission_percent,
      status: 'active',
      start_at: now.toISOString(),
      expires_at: expiresAt,
      auto_renew: true,
      payment_status: isStarter ? 'free' : 'paid',
      latest_payment_id: paymentId,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const localSubs = this.getLocalSubscriptions(partnerId);
    localSubs.forEach((s) => {
      if (s.status === 'active') s.status = 'cancelled';
    });
    localSubs.unshift(subscriptionRecord);
    this.saveLocalSubscriptions(partnerId, localSubs);

    const allPayments = this.getAllLocalPayments();
    allPayments.unshift(paymentRecord);
    this.saveAllLocalPayments(allPayments);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => {
            await client
              .from('doorbly_partner_subscriptions')
              .update({ status: 'cancelled' })
              .eq('partner_id', partnerId)
              .eq('status', 'active');

            await client.from('doorbly_partner_subscriptions').insert(subscriptionRecord);
            await client.from('doorbly_subscription_payments').insert(paymentRecord);
          },
          [
            `subscription:active:${partnerId}`,
            `subscription:history:${partnerId}`,
            'admin:subscriptions',
            'admin:payments'
          ]
        );
      } catch (e) {
        console.warn('Failed to persist subscription in Supabase:', e);
      }
    }

    supabaseDataEngine.primeCache(`subscription:active:${partnerId}`, subscriptionRecord);
    supabaseDataEngine.invalidate(`subscription:history:${partnerId}`);
    supabaseDataEngine.invalidate('admin:subscriptions');
    supabaseDataEngine.invalidate('admin:payments');

    const membershipUpdate: PartnerMembership = {
      id: `mem_${partnerId}`,
      partner_id: partnerId,
      plan_name: `${selectedPlan.plan_name} Plan (${selectedPlan.commission_percent}% Comm.)`,
      monthly_fee: breakdown.total_payable,
      status: 'active',
      start_date: now.toISOString(),
      expiry_date: expiresAt,
      payment_status: isStarter ? ('free' as PartnerMembership['payment_status']) : 'paid',
      payment_reference: gatewayRef,
      plan_code: selectedPlan.plan_code
    };
    await supabaseService.updateMembership(membershipUpdate);

    await supabaseService.createNotification(partnerId, {
      title: isStarter
        ? 'Starter Plan Activated (20% Comm.)'
        : `${selectedPlan.plan_name} Subscription Active! (${selectedPlan.commission_percent}% Comm.)`,
      message: isStarter
        ? 'Your ₹0 Starter Plan is active. You keep 80% of actual collected earnings on completed jobs.'
        : `Payment verified for ${selectedPlan.plan_name} (₹${breakdown.total_payable}). Invoice #${invoiceNumber} generated.`,
      type: 'MEMBERSHIP_UPDATE'
    });

    return {
      success: true,
      message: isStarter
        ? 'Starter plan activated successfully! Zero fees, 20% company commission.'
        : `${selectedPlan.plan_name} subscription activated successfully! Invoice #${invoiceNumber}`,
      subscription: subscriptionRecord,
      payment: paymentRecord,
      invoiceNumber
    };
  }

  /**
   * Handle expired subscription according to admin-configured Expiry Policy
   */
  private async handleSubscriptionExpiry(
    expiredSub: PartnerSubscription,
    policy: SubscriptionExpiryPolicy = 'fallback_starter'
  ): Promise<void> {
    expiredSub.status = 'expired';
    expiredSub.updated_at = new Date().toISOString();

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client
          .from('doorbly_partner_subscriptions')
          .update({ status: 'expired', updated_at: expiredSub.updated_at })
          .eq('id', expiredSub.id);
      } catch {
        // ignore
      }
    }

    await supabaseService.createNotification(expiredSub.partner_id, {
      title: `Subscription Expired: ${expiredSub.plan_name}`,
      message:
        policy === 'fallback_starter'
          ? 'Your subscription has expired. In accordance with the expiry policy, your account has automatically switched to Starter (20% commission). Renew Growth or Professional to reduce commission.'
          : 'Your subscription has expired. Online job dispatch is paused until you renew or activate Starter/Growth/Professional.',
      type: 'MEMBERSHIP_UPDATE'
    });
  }

  /**
   * Resolve the subscription & plan rate effective at completion timestamp
   */
  private async resolveEffectiveSubscriptionForJob(
    partnerId: string,
    completedAtIso: string
  ): Promise<{
    subscriptionId: string;
    planCode: PlanCode;
    planName: string;
    commissionPercent: number;
  }> {
    const completedMs = new Date(completedAtIso).getTime();
    const [plans, activeOrLatestSub] = await Promise.all([
      this.getPlans(),
      this.getActiveSubscription(partnerId)
    ]);

    const starterPlan =
      plans.find((p) => p.plan_code === 'starter') ||
      DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.plan_code === 'starter')!;

    // Check partner subscription history for the plan effective at completedAtIso
    const history = await this.getPartnerSubscriptionHistory(partnerId);
    const ordered = [...history].sort(
      (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
    );

    const effectiveSub =
      ordered.find((s) => {
        const startMs = new Date(s.start_at).getTime();
        const expiryMs = new Date(s.expires_at).getTime();
        return (
          s.status === 'active' &&
          startMs <= completedMs &&
          expiryMs >= completedMs
        );
      }) ||
      (activeOrLatestSub &&
      activeOrLatestSub.status === 'active' &&
      new Date(activeOrLatestSub.start_at).getTime() <= completedMs &&
      new Date(activeOrLatestSub.expires_at).getTime() >= completedMs
        ? activeOrLatestSub
        : null);

    if (effectiveSub) {
      // Automatically fetch commission percentage from partner's active subscription plan
      const currentPlanDef = plans.find(
        (p) => p.id === effectiveSub.plan_id || p.plan_code === effectiveSub.plan_code
      );
      return {
        subscriptionId: effectiveSub.id,
        planCode: effectiveSub.plan_code,
        planName: currentPlanDef?.plan_name || effectiveSub.plan_name,
        commissionPercent: currentPlanDef?.commission_percent ?? effectiveSub.commission_percent
      };
    }

    // Expired / Suspended / No active subscription -> apply configured fallback (Starter plan rate)
    return {
      subscriptionId: activeOrLatestSub?.id || 'starter_fallback',
      planCode: starterPlan.plan_code,
      planName: starterPlan.plan_name,
      commissionPercent: starterPlan.commission_percent
    };
  }

  /**
   * Automatic Commission Calculation for Completed Job based on Actual Collected Amount
   * Conditions enforced:
   * - Calculated ONLY after successful job completion (COMPLETED)
   * - Never calculates twice for the same job_id
   * - Commission % fetched automatically from active subscription plan at collection confirmation timestamp
   * - Doorbly Commission recorded as accrued payable until verified settlement
   * - Stores immutable booking transaction snapshot
   */
  public async calculateAndRecordJobCommission(
    jobId: string,
    partnerId: string,
    commissionableAmount: number,
    options?: {
      completedAt?: string;
      bookingStatus?: BookingStatus;
      collectionId?: string;
      paymentMethod?: CollectionPaymentMethod;
      paymentReference?: string;
    }
  ): Promise<{
    commissionPercent: number;
    commissionAmount: number;
    partnerEarnings: number;
    planCode: PlanCode;
    planName: string;
    record: JobCommissionRecord;
    alreadyRecorded: boolean;
  }> {
    if (options?.bookingStatus && options.bookingStatus !== 'COMPLETED') {
      throw new Error(`Commission cannot be calculated for booking status "${options.bookingStatus}".`);
    }

    const existing = await this.getJobCommissionRecordByJobId(jobId);
    if (existing) {
      return {
        commissionPercent: existing.commission_percent,
        commissionAmount: existing.commission_amount,
        partnerEarnings: existing.partner_earnings,
        planCode: existing.plan_code_at_transaction,
        planName: existing.plan_name_at_transaction || String(existing.plan_code_at_transaction),
        record: existing,
        alreadyRecorded: true
      };
    }

    const completedAtIso = options?.completedAt || new Date().toISOString();
    const safeAmount = Math.round(Math.max(0, Number(commissionableAmount) || 0) * 100) / 100;

    // Resolve active subscription plan at effective collection date (never recalculates historical bookings)
    const resolved = await this.resolveEffectiveSubscriptionForJob(partnerId, completedAtIso);
    const commissionPercent = resolved.commissionPercent;

    // Formula: Doorbly Commission = Actual Customer Collection × Active Plan Commission % / 100
    const commissionAmount = Math.round(((safeAmount * commissionPercent) / 100) * 100) / 100;
    const partnerEarnings = Math.round((safeAmount - commissionAmount) * 100) / 100;

    const record: JobCommissionRecord = {
      id: `comm_${jobId}`,
      job_id: jobId,
      collection_id: options?.collectionId,
      partner_id: partnerId,
      subscription_id: resolved.subscriptionId,
      plan_code_at_transaction: resolved.planCode,
      plan_name_at_transaction: resolved.planName,
      commissionable_amount: safeAmount,
      commission_percent: commissionPercent,
      commission_amount: commissionAmount,
      tax_amount_if_applicable: 0,
      partner_earnings: partnerEarnings,
      payment_method: options?.paymentMethod,
      payment_reference: options?.paymentReference,
      transaction_status: 'credited',
      settlement_status: 'accrued',
      snapshot_locked: true,
      booking_completed_at: completedAtIso,
      created_at: new Date().toISOString()
    };

    const client = supabaseService.getClient();
    if (client) {
      try {
        const { error } = await supabaseDataEngine.executeWrite(
          async () => await client.from('doorbly_job_commission_records').insert(record),
          ['admin:commissions', `commissions:${partnerId}`]
        );
        if (error) {
          const conflictExisting = await this.getJobCommissionRecordByJobId(jobId);
          if (conflictExisting) {
            return {
              commissionPercent: conflictExisting.commission_percent,
              commissionAmount: conflictExisting.commission_amount,
              partnerEarnings: conflictExisting.partner_earnings,
              planCode: conflictExisting.plan_code_at_transaction,
              planName:
                conflictExisting.plan_name_at_transaction ||
                String(conflictExisting.plan_code_at_transaction),
              record: conflictExisting,
              alreadyRecorded: true
            };
          }
        }
      } catch (e) {
        console.warn('Failed to insert commission record in Supabase:', e);
      }
    }

    const commissions = this.getAllLocalCommissions();
    if (!commissions.some((c) => c.job_id === jobId)) {
      commissions.unshift(record);
      this.saveAllLocalCommissions(commissions);
    }

    supabaseDataEngine.invalidate(`commissions:${partnerId}`);
    supabaseDataEngine.invalidate('admin:commissions');

    return {
      commissionPercent,
      commissionAmount,
      partnerEarnings,
      planCode: resolved.planCode,
      planName: resolved.planName,
      record,
      alreadyRecorded: false
    };
  }

  /**
   * Get job commission record for a job
   */
  public async getJobCommissionRecordByJobId(jobId: string): Promise<JobCommissionRecord | null> {
    const client = supabaseService.getClient();
    if (client) {
      try {
        const { data } = await client
          .from('doorbly_job_commission_records')
          .select('*')
          .eq('job_id', jobId)
          .maybeSingle();

        if (data) return data as JobCommissionRecord;
      } catch {
        // ignore
      }
    }

    const all = this.getAllLocalCommissions();
    return all.find((c) => c.job_id === jobId) || null;
  }

  /**
   * Get all immutable commission records for a partner (real completed bookings only)
   */
  public async getPartnerCommissionHistory(partnerId: string): Promise<JobCommissionRecord[]> {
    return supabaseDataEngine.fetchWithEngine(
      `commissions:${partnerId}`,
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_job_commission_records')
              .select('*')
              .eq('partner_id', partnerId)
              .order('created_at', { ascending: false });

            if (!error && data) {
              return data as JobCommissionRecord[];
            }
          } catch {
            // ignore
          }
        }

        return this.getAllLocalCommissions().filter((c) => c.partner_id === partnerId);
      },
      {
        instantFallback: () =>
          this.getAllLocalCommissions().filter((c) => c.partner_id === partnerId)
      }
    );
  }

  /**
   * Get subscription payment and invoices history for partner
   */
  public async getPartnerPaymentsAndInvoices(partnerId: string): Promise<SubscriptionPayment[]> {
    const all = this.getAllLocalPayments();
    const partnerPayments = all.filter((p) => p.partner_id === partnerId);

    const client = supabaseService.getClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('doorbly_subscription_payments')
          .select('*')
          .eq('partner_id', partnerId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as SubscriptionPayment[];
        }
      } catch {
        // ignore
      }
    }

    return partnerPayments;
  }

  /**
   * Get complete partner subscription history (Supabase + Local fallback, never erases previous plans)
   */
  public async getPartnerSubscriptionHistory(partnerId: string): Promise<PartnerSubscription[]> {
    return supabaseDataEngine.fetchWithEngine(
      `subscription:history:${partnerId}`,
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_partner_subscriptions')
              .select('*')
              .eq('partner_id', partnerId)
              .order('created_at', { ascending: false });

            if (!error && data && data.length > 0) {
              const typed = data as PartnerSubscription[];
              this.saveLocalSubscriptions(partnerId, typed);
              return typed;
            }
          } catch {
            // ignore
          }
        }

        return this.getLocalSubscriptions(partnerId);
      },
      { instantFallback: () => this.getLocalSubscriptions(partnerId) }
    );
  }

  private readAllLocalSubscriptions(): PartnerSubscription[] {
    const all: PartnerSubscription[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SUBSCRIPTIONS);
      if (raw) {
        const dict = JSON.parse(raw) as Record<string, PartnerSubscription[]>;
        Object.values(dict).forEach((arr) => all.push(...arr));
      }
    } catch {
      // ignore
    }
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getInstantAdminSubscriptionSnapshot(): {
    plans: SubscriptionPlan[];
    taxConfig: TaxConfiguration;
    subscriptions: PartnerSubscription[];
    payments: SubscriptionPayment[];
    commissions: JobCommissionRecord[];
  } {
    const base = this.getInstantSubscriptionSnapshot();
    const subscriptions =
      supabaseDataEngine.peekCache<PartnerSubscription[]>('admin:subscriptions') ??
      this.readAllLocalSubscriptions();
    const payments =
      supabaseDataEngine.peekCache<SubscriptionPayment[]>('admin:payments') ??
      this.getAllLocalPayments();
    const commissions =
      supabaseDataEngine.peekCache<JobCommissionRecord[]>('admin:commissions') ??
      this.getAllLocalCommissions();
    return {
      plans: base.plans,
      taxConfig: base.taxConfig,
      subscriptions,
      payments,
      commissions
    };
  }

  /**
   * Get all partner subscriptions for Admin Panel
   */
  public async getAllSubscriptionsAdmin(): Promise<PartnerSubscription[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:subscriptions',
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_partner_subscriptions')
              .select('*')
              .order('created_at', { ascending: false });

            if (!error && data) return data as PartnerSubscription[];
          } catch {
            // ignore
          }
        }

        return this.readAllLocalSubscriptions();
      },
      { instantFallback: () => this.readAllLocalSubscriptions() }
    );
  }

  /**
   * Get all payments for Admin Panel
   */
  public async getAllPaymentsAdmin(): Promise<SubscriptionPayment[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:payments',
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_subscription_payments')
              .select('*')
              .order('created_at', { ascending: false });

            if (!error && data) return data as SubscriptionPayment[];
          } catch {
            // ignore
          }
        }
        return this.getAllLocalPayments();
      },
      { instantFallback: () => this.getAllLocalPayments() }
    );
  }

  /**
   * Get all commission records for Admin Panel
   */
  public async getAllCommissionRecordsAdmin(): Promise<JobCommissionRecord[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:commissions',
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_job_commission_records')
              .select('*')
              .order('created_at', { ascending: false });

            if (!error && data) return data as JobCommissionRecord[];
          } catch {
            // ignore
          }
        }
        return this.getAllLocalCommissions();
      },
      { instantFallback: () => this.getAllLocalCommissions() }
    );
  }

  /**
   * Admin manual correction / status control of subscription with audit log
   * Supports: active, suspended, expired, cancelled
   */
  public async adminManualCorrectSubscription(
    subscriptionId: string,
    partnerId: string,
    updates: {
      planCode?: PlanCode;
      status?: SubscriptionStatus;
      expiresAt?: string;
      reason: string;
      adminEmail?: string;
    }
  ): Promise<boolean> {
    const resolvedAdminEmail = updates.adminEmail || this.ensureAuthorizedAdmin();
    const subs = this.getLocalSubscriptions(partnerId);
    let target = subs.find((s) => s.id === subscriptionId);

    const client = supabaseService.getClient();
    if (!target && client) {
      try {
        const { data } = await client
          .from('doorbly_partner_subscriptions')
          .select('*')
          .eq('id', subscriptionId)
          .maybeSingle();
        if (data) {
          target = data as PartnerSubscription;
          subs.unshift(target);
        }
      } catch {
        // ignore
      }
    }

    if (!target) return false;

    const previous = { ...target };
    if (updates.status) {
      target.status = updates.status;
      if (updates.status === 'expired' && !updates.expiresAt) {
        target.expires_at = new Date().toISOString();
      }
    }
    if (updates.expiresAt) target.expires_at = updates.expiresAt;
    if (updates.reason) target.status_reason = updates.reason;
    if (updates.planCode) {
      const plans = await this.getPlans();
      const plan = plans.find((p) => p.plan_code === updates.planCode);
      if (plan) {
        target.plan_id = plan.id;
        target.plan_code = plan.plan_code;
        target.plan_name = plan.plan_name;
        target.commission_percent = plan.commission_percent;
      }
    }
    target.updated_at = new Date().toISOString();

    this.saveLocalSubscriptions(partnerId, subs);

    if (client) {
      try {
        await client
          .from('doorbly_partner_subscriptions')
          .upsert(target);
      } catch {
        // ignore
      }
    }

    this.recordAuditLog({
      subscription_id: subscriptionId,
      partner_id: partnerId,
      admin_email: resolvedAdminEmail,
      action: updates.status ? `ADMIN_SET_${updates.status.toUpperCase()}` : 'MANUAL_CORRECTION',
      previous_state: JSON.stringify(previous),
      new_state: JSON.stringify(target),
      reason: updates.reason
    });

    supabaseDataEngine.invalidate(`subscription:active:${partnerId}`);
    supabaseDataEngine.invalidate('admin:subscriptions');
    return true;
  }

  /**
   * Admin assign or activate a subscription for any partner (creates row if none exists)
   */
  public async adminAssignPartnerSubscription(
    partnerId: string,
    options: {
      planCode: PlanCode;
      status: SubscriptionStatus;
      durationDays: number;
      reason: string;
      adminEmail?: string;
    }
  ): Promise<PartnerSubscription | null> {
    const resolvedAdminEmail = options.adminEmail || this.ensureAuthorizedAdmin();
    const plans = await this.getPlans();
    const plan = plans.find((p) => p.plan_code === options.planCode);
    if (!plan) return null;

    const now = new Date();
    const expiresAt =
      options.status === 'expired'
        ? now.toISOString()
        : new Date(now.getTime() + Math.max(1, options.durationDays) * 86400000).toISOString();

    const newSub: PartnerSubscription = {
      id: `sub_${partnerId}_${Date.now()}`,
      partner_id: partnerId,
      plan_id: plan.id,
      plan_code: plan.plan_code,
      plan_name: plan.plan_name,
      commission_percent: plan.commission_percent,
      status: options.status,
      start_at: now.toISOString(),
      expires_at: expiresAt,
      auto_renew: options.status === 'active',
      payment_status: plan.monthly_price === 0 ? 'free' : 'paid',
      latest_payment_id: `ADMIN_ASSIGN_${Date.now()}`,
      status_reason: options.reason,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const subs = this.getLocalSubscriptions(partnerId);
    subs.forEach((s) => {
      if (s.status === 'active') s.status = 'cancelled';
    });
    subs.unshift(newSub);
    this.saveLocalSubscriptions(partnerId, subs);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client
          .from('doorbly_partner_subscriptions')
          .update({ status: 'cancelled' })
          .eq('partner_id', partnerId)
          .eq('status', 'active');
        await client.from('doorbly_partner_subscriptions').insert(newSub);
      } catch {
        // ignore
      }
    }

    this.recordAuditLog({
      subscription_id: newSub.id,
      partner_id: partnerId,
      admin_email: resolvedAdminEmail,
      action: 'ADMIN_ASSIGN_SUBSCRIPTION',
      previous_state: 'none',
      new_state: JSON.stringify(newSub),
      reason: options.reason
    });

    supabaseDataEngine.invalidate(`subscription:active:${partnerId}`);
    supabaseDataEngine.invalidate('admin:subscriptions');
    return newSub;
  }

  /**
   * COMMISSION SETTLEMENT & LEDGER ACCOUNTING
   * Tracks gross collections, commission accrued, commission settled (only after verification),
   * outstanding commission payable, partner net earnings, withdrawals, and subscription payments separately.
   */
  public computeLedgerSummary(params: {
    commissions: JobCommissionRecord[];
    settlements: CommissionSettlement[];
    withdrawals: WithdrawalRequest[];
    payments: SubscriptionPayment[];
    walletTransactions?: WalletTransaction[];
  }): CommissionLedgerSummary {
    const validComms = params.commissions.filter((c) => c.transaction_status !== 'reversed');
    const totalGrossCollections = validComms.reduce(
      (s, c) => s + (Number(c.commissionable_amount) || 0),
      0
    );
    const totalCommissionAccrued = validComms.reduce(
      (s, c) => s + (Number(c.commission_amount) || 0),
      0
    );
    const totalPartnerNetEarnings = validComms.reduce(
      (s, c) => s + (Number(c.partner_earnings) || 0),
      0
    );

    const totalCommissionSettled = params.settlements
      .filter((s) => s.verification_status === 'verified')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const pendingSettlementVerification = params.settlements
      .filter((s) => s.verification_status === 'pending_verification')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const outstandingCommission = Math.max(
      0,
      Math.round((totalCommissionAccrued - totalCommissionSettled) * 100) / 100
    );

    const totalWithdrawals = params.withdrawals
      .filter((w) => w.status === 'completed' || w.status === 'processing' || w.status === 'requested')
      .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    const totalSubscriptionPayments = params.payments
      .filter((p) => p.payment_status === 'completed')
      .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);

    return {
      totalGrossCollections: Math.round(totalGrossCollections * 100) / 100,
      totalCommissionAccrued: Math.round(totalCommissionAccrued * 100) / 100,
      totalCommissionSettled: Math.round(totalCommissionSettled * 100) / 100,
      pendingSettlementVerification: Math.round(pendingSettlementVerification * 100) / 100,
      outstandingCommission,
      totalPartnerNetEarnings: Math.round(totalPartnerNetEarnings * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
      totalSubscriptionPayments: Math.round(totalSubscriptionPayments * 100) / 100,
      completedJobsCount: validComms.length
    };
  }

  public async getPartnerSettlements(partnerId: string): Promise<CommissionSettlement[]> {
    return supabaseDataEngine.fetchWithEngine(
      `settlements:${partnerId}`,
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_commission_settlements')
              .select('*')
              .eq('partner_id', partnerId)
              .order('created_at', { ascending: false });
            if (!error && data) {
              return data as CommissionSettlement[];
            }
          } catch {
            // ignore
          }
        }
        return this.getAllLocalSettlements().filter((s) => s.partner_id === partnerId);
      },
      { instantFallback: () => this.getAllLocalSettlements().filter((s) => s.partner_id === partnerId) }
    );
  }

  public async getAllSettlementsAdmin(): Promise<CommissionSettlement[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:settlements',
      async () => {
        const client = supabaseService.getClient();
        if (client) {
          try {
            const { data, error } = await client
              .from('doorbly_commission_settlements')
              .select('*')
              .order('created_at', { ascending: false });
            if (!error && data) {
              return data as CommissionSettlement[];
            }
          } catch {
            // ignore
          }
        }
        return this.getAllLocalSettlements();
      },
      { instantFallback: () => this.getAllLocalSettlements() }
    );
  }

  /**
   * Partner submits a commission settlement payment with real transaction reference.
   * Status stays strictly 'pending_verification' — never marks itself settled until verified!
   */
  public async submitCommissionSettlementRequest(
    partnerId: string,
    input: {
      amount: number;
      paymentMethod: SettlementPaymentMethod;
      paymentReference: string;
      notes?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    settlement?: CommissionSettlement;
  }> {
    const cleanRef = input.paymentReference.trim();
    if (cleanRef.length < 6 || !/^[A-Za-z0-9_-]+$/.test(cleanRef)) {
      return {
        success: false,
        message: 'Please enter a valid 6+ character payment transaction / UTR reference.'
      };
    }

    const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (amount <= 0) {
      return { success: false, message: 'Settlement amount must be greater than ₹0.' };
    }

    const [comms, settlements] = await Promise.all([
      this.getPartnerCommissionHistory(partnerId),
      this.getPartnerSettlements(partnerId)
    ]);

    const accrued = comms
      .filter((c) => c.transaction_status !== 'reversed')
      .reduce((sum, c) => sum + (Number(c.commission_amount) || 0), 0);
    const verifiedSettled = settlements
      .filter((s) => s.verification_status === 'verified')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const pendingSettled = settlements
      .filter((s) => s.verification_status === 'pending_verification')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const remainingAllocatable = Math.round((accrued - verifiedSettled - pendingSettled) * 100) / 100;
    if (amount > remainingAllocatable + 0.01) {
      return {
        success: false,
        message: `Settlement exceeds payable balance (₹${Math.max(0, remainingAllocatable).toFixed(2)} remaining after ₹${pendingSettled.toFixed(2)} pending verification).`
      };
    }

    const allGlobalSettlements = await this.getAllSettlementsAdmin();
    if (
      allGlobalSettlements.some(
        (s) =>
          s.verification_status !== 'rejected' &&
          s.payment_reference.trim().toLowerCase() === cleanRef.toLowerCase()
      )
    ) {
      return {
        success: false,
        message: `Payment reference ${cleanRef} has already been submitted for settlement.`
      };
    }

    const nowIso = new Date().toISOString();
    const receiptNo = `SET-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const record: CommissionSettlement = {
      id: `settle_${partnerId}_${Date.now()}`,
      partner_id: partnerId,
      amount,
      payment_method: input.paymentMethod,
      payment_reference: cleanRef,
      receipt_number: receiptNo,
      verification_status: 'pending_verification',
      notes: input.notes?.trim() || undefined,
      created_at: nowIso
    };

    const localAll = this.getAllLocalSettlements();
    localAll.unshift(record);
    this.saveAllLocalSettlements(localAll);

    const client = supabaseService.getClient();
    if (client) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => await client.from('doorbly_commission_settlements').insert(record),
          [`settlements:${partnerId}`, 'admin:settlements']
        );
      } catch (e) {
        console.warn('submitCommissionSettlementRequest Supabase notice:', e);
      }
    }

    supabaseDataEngine.invalidate(`settlements:${partnerId}`);
    supabaseDataEngine.invalidate('admin:settlements');

    await supabaseService.createNotification(partnerId, {
      title: `Settlement Submitted (₹${amount.toFixed(2)})`,
      message: `Receipt #${receiptNo} (Ref: ${cleanRef}) submitted for verification. Outstanding commission updates once payment is verified.`,
      type: 'PAYMENT_UPDATE'
    });

    return {
      success: true,
      message: `Settlement receipt #${receiptNo} submitted! Status is Pending Verification until confirmed.`,
      settlement: record
    };
  }

  /**
   * Admin verifies or rejects a submitted commission settlement payment
   */
  public async adminVerifyCommissionSettlement(
    settlementId: string,
    nextStatus: 'verified' | 'rejected',
    notes?: string,
    adminEmail?: string
  ): Promise<{ success: boolean; message: string; settlement?: CommissionSettlement }> {
    const resolvedAdminEmail = adminEmail || this.ensureAuthorizedAdmin();
    const all = await this.getAllSettlementsAdmin();
    const target = all.find((s) => s.id === settlementId);
    if (!target) {
      return { success: false, message: 'Settlement record not found.' };
    }
    if (target.verification_status !== 'pending_verification') {
      return { success: false, message: `Settlement is already ${target.verification_status}.` };
    }

    const nowIso = new Date().toISOString();
    const updated: CommissionSettlement = {
      ...target,
      verification_status: nextStatus,
      verified_by: resolvedAdminEmail,
      verified_at: nowIso,
      notes: notes?.trim() || target.notes
    };

    const client = supabaseService.getClient();
    if (client) {
      try {
        await client.rpc('verify_commission_settlement', {
          p_settlement_id: settlementId,
          p_status: nextStatus,
          p_admin_email: resolvedAdminEmail,
          p_notes: notes?.trim() || null
        });
      } catch (e) {
        console.warn('verify_commission_settlement RPC fallback notice:', e);
      }

      try {
        await supabaseDataEngine.executeWrite(
          async () =>
            await client
              .from('doorbly_commission_settlements')
              .update({
                verification_status: nextStatus,
                verified_by: resolvedAdminEmail,
                verified_at: nowIso,
                notes: updated.notes
              })
              .eq('id', settlementId),
          [`settlements:${target.partner_id}`, 'admin:settlements', 'admin:commissions', `commissions:${target.partner_id}`]
        );
      } catch (e) {
        console.warn('adminVerifyCommissionSettlement Supabase notice:', e);
      }
    }

    const localAll = this.getAllLocalSettlements();
    this.saveAllLocalSettlements([updated, ...localAll.filter((s) => s.id !== settlementId)]);

    if (nextStatus === 'verified') {
      // Mark local accrued commission snapshots for this partner as settled
      const localComms = this.getAllLocalCommissions().map((c) =>
        c.partner_id === target.partner_id && (!c.settlement_status || c.settlement_status === 'accrued')
          ? { ...c, settlement_status: 'settled' as const, settlement_id: settlementId, settled_at: nowIso }
          : c
      );
      this.saveAllLocalCommissions(localComms);

      await supabaseService.recordLedgerTransaction(target.partner_id, {
        id: `tx_settle_${settlementId}`,
        reference_id: target.payment_reference,
        payment_method: target.payment_method,
        type: 'debit',
        category: 'commission_settlement',
        amount: target.amount,
        description: `Doorbly Commission Settled · Receipt #${target.receipt_number} (${target.payment_reference})`,
        status: 'completed'
      });
    }

    supabaseDataEngine.invalidate(`settlements:${target.partner_id}`);
    supabaseDataEngine.invalidate('admin:settlements');
    supabaseDataEngine.invalidate(`commissions:${target.partner_id}`);
    supabaseDataEngine.invalidate('admin:commissions');

    await supabaseService.createNotification(target.partner_id, {
      title:
        nextStatus === 'verified'
          ? `Commission Settlement Verified! ₹${target.amount.toFixed(2)}`
          : `Commission Settlement Rejected`,
      message:
        nextStatus === 'verified'
          ? `Receipt #${target.receipt_number} (Ref: ${target.payment_reference}) verified by Admin. Outstanding Doorbly commission reduced by ₹${target.amount.toFixed(2)}.`
          : `Receipt #${target.receipt_number} was rejected: ${updated.notes || 'Payment reference could not be matched.'}`,
      type: 'PAYMENT_UPDATE'
    });

    return {
      success: true,
      message:
        nextStatus === 'verified'
          ? `Settlement #${target.receipt_number} verified and reconciled.`
          : `Settlement #${target.receipt_number} marked rejected.`,
      settlement: updated
    };
  }

  /**
   * Generate sequential/unique invoice number
   */
  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    return `INV-${year}-${randomSuffix}`;
  }

  /**
   * Record Audit Log
   */
  private recordAuditLog(log: Omit<SubscriptionAuditLog, 'id' | 'created_at'>): void {
    const fullLog: SubscriptionAuditLog = {
      ...log,
      id: `audit_${Date.now()}`,
      created_at: new Date().toISOString()
    };
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
      const list: SubscriptionAuditLog[] = stored ? JSON.parse(stored) : [];
      list.unshift(fullLog);
      localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(list.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  // --- Local storage helpers ---
  private getLocalSubscriptions(partnerId: string): PartnerSubscription[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SUBSCRIPTIONS);
      if (data) {
        const parsed = JSON.parse(data) as Record<string, PartnerSubscription[]>;
        return parsed[partnerId] || [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveLocalSubscriptions(partnerId: string, subs: PartnerSubscription[]): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SUBSCRIPTIONS);
      const dict: Record<string, PartnerSubscription[]> = data ? JSON.parse(data) : {};
      dict[partnerId] = subs;
      localStorage.setItem(STORAGE_KEY_SUBSCRIPTIONS, JSON.stringify(dict));
    } catch {
      // ignore
    }
  }

  private getAllLocalPayments(): SubscriptionPayment[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_PAYMENTS);
      if (data) return JSON.parse(data) as SubscriptionPayment[];
    } catch {
      // ignore
    }
    return [];
  }

  private saveAllLocalPayments(payments: SubscriptionPayment[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(payments));
    } catch {
      // ignore
    }
  }

  private getAllLocalCommissions(): JobCommissionRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_COMMISSIONS);
      if (data) return JSON.parse(data) as JobCommissionRecord[];
    } catch {
      // ignore
    }
    return [];
  }

  private saveAllLocalCommissions(commissions: JobCommissionRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_COMMISSIONS, JSON.stringify(commissions));
    } catch {
      // ignore
    }
  }

  private getAllLocalSettlements(): CommissionSettlement[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SETTLEMENTS);
      if (data) return JSON.parse(data) as CommissionSettlement[];
    } catch {
      // ignore
    }
    return [];
  }

  private saveAllLocalSettlements(settlements: CommissionSettlement[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_SETTLEMENTS, JSON.stringify(settlements));
    } catch {
      // ignore
    }
  }
}

export const subscriptionService = new SubscriptionService();
