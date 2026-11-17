import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  SubscriptionPlan,
  PartnerSubscription,
  SubscriptionPayment,
  JobCommissionRecord,
  CustomerCollection,
  CommissionSettlement,
  TaxConfiguration,
  PlanCode,
  PartnerProfile,
  ServiceBooking,
  SubscriptionStatus,
  SubscriptionExpiryPolicy
} from '../../types';
import { subscriptionService } from '../../services/subscriptionService';
import { supabaseService } from '../../services/supabaseClient';
import { InvoiceModal } from '../subscription/InvoiceModal';
import { ProcessingLoader } from '../common/ProcessingLoader';
import {
  ShieldCheck,
  TrendingUp,
  Coins,
  Receipt,
  Users,
  Settings,
  Edit2,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  FileText,
  Save,
  Plus,
  Download,
  MapPin,
  BarChart3,
  PlayCircle,
  PauseCircle,
  Clock,
  Banknote,
  Landmark,
  XCircle
} from 'lucide-react';

interface SubscriptionAdminViewProps {
  allPartners?: PartnerProfile[];
  allBookings?: ServiceBooking[];
}

export const SubscriptionAdminView: React.FC<SubscriptionAdminViewProps> = ({
  allPartners = [],
  allBookings = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    | 'overview'
    | 'plans'
    | 'subscriptions'
    | 'collections'
    | 'settlements'
    | 'reports'
    | 'tax'
    | 'payments'
    | 'commissions'
  >('overview');

  const snapRef = useRef<ReturnType<typeof subscriptionService.getInstantAdminSubscriptionSnapshot> | null>(null);
  if (!snapRef.current) {
    snapRef.current = subscriptionService.getInstantAdminSubscriptionSnapshot();
  }
  const initialSnap = snapRef.current;

  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => initialSnap.plans);
  const [taxConfig, setTaxConfig] = useState<TaxConfiguration | null>(() => initialSnap.taxConfig);
  const [subscriptions, setSubscriptions] = useState<PartnerSubscription[]>(() => initialSnap.subscriptions);
  const [payments, setPayments] = useState<SubscriptionPayment[]>(() => initialSnap.payments);
  const [commissions, setCommissions] = useState<JobCommissionRecord[]>(() => initialSnap.commissions);
  const [collections, setCollections] = useState<CustomerCollection[]>([]);
  const [settlements, setSettlements] = useState<CommissionSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Plan Modal state
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanCode, setNewPlanCode] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState<number>(499);
  const [newPlanCommission, setNewPlanCommission] = useState<number>(10);
  const [newPlanTaxApplicable, setNewPlanTaxApplicable] = useState<boolean>(true);
  const [newPlanRecommended, setNewPlanRecommended] = useState<boolean>(false);
  const [newPlanBenefitsText, setNewPlanBenefitsText] = useState<string>('');
  const [createPlanError, setCreatePlanError] = useState<string | null>(null);

  // Editing Plan state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [editPlanName, setEditPlanName] = useState<string>('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editCommission, setEditCommission] = useState<number>(0);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editIsTaxApplicable, setEditIsTaxApplicable] = useState<boolean>(true);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Editing Tax & Expiry Policy state
  const [taxRateInput, setTaxRateInput] = useState<number>(() => initialSnap.taxConfig.tax_rate_percent);
  const [taxNameInput, setTaxNameInput] = useState<string>(() => initialSnap.taxConfig.tax_name);
  const [sacCodeInput, setSacCodeInput] = useState<string>(() => initialSnap.taxConfig.hsn_sac_code);
  const [gstinInput, setGstinInput] = useState<string>(() => initialSnap.taxConfig.gstin_number);
  const [posInput, setPosInput] = useState<string>(() => initialSnap.taxConfig.place_of_supply);
  const [expiryPolicyInput, setExpiryPolicyInput] = useState<SubscriptionExpiryPolicy>(
    () => initialSnap.taxConfig.expiry_policy || 'fallback_starter'
  );
  const [taxSaveSuccess, setTaxSaveSuccess] = useState(false);

  // Assign Subscription to Partner Modal
  const [showAssignSubModal, setShowAssignSubModal] = useState(false);
  const [assignPartnerId, setAssignPartnerId] = useState<string>('');
  const [assignPlanCode, setAssignPlanCode] = useState<PlanCode>('growth');
  const [assignStatus, setAssignStatus] = useState<SubscriptionStatus>('active');
  const [assignDays, setAssignDays] = useState<number>(30);
  const [assignReason, setAssignReason] = useState<string>('Admin manual subscription assignment');

  // Manual Correction state
  const [correctingSub, setCorrectingSub] = useState<PartnerSubscription | null>(null);
  const [correctionPlanCode, setCorrectionPlanCode] = useState<PlanCode>('growth');
  const [correctionStatus, setCorrectionStatus] = useState<SubscriptionStatus>('active');
  const [correctionDays, setCorrectionDays] = useState<number>(30);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionSuccess, setCorrectionSuccess] = useState<string | null>(null);

  // Reports Search & Filter
  const [reportSearch, setReportSearch] = useState('');
  const [reportSubView, setReportSubView] = useState<'partner' | 'district' | 'periods'>('partner');

  // Invoice viewer modal state
  const [viewInvoicePayment, setViewInvoicePayment] = useState<SubscriptionPayment | null>(null);

  // Payment status & settlement/collection filters + rejection modal
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'completed' | 'pending' | 'failed' | 'refunded'>('all');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'pending_verification' | 'verified' | 'rejected'>('all');
  const [rejectTarget, setRejectTarget] = useState<{
    kind: 'payment' | 'settlement';
    id: string;
    label: string;
  } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const notifyFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setActionFeedback({ type, text });
    setTimeout(() => setActionFeedback(null), 4500);
  };

  const loadAllData = async (showPanelLoader = false) => {
    if (showPanelLoader) setIsLoading(true);
    setIsSyncing(true);
    try {
      const [pls, tx, subs, pymts, comms, colls, setts] = await Promise.all([
        subscriptionService.getPlans(),
        subscriptionService.getTaxConfiguration(),
        subscriptionService.getAllSubscriptionsAdmin(),
        subscriptionService.getAllPaymentsAdmin(),
        subscriptionService.getAllCommissionRecordsAdmin(),
        supabaseService.getAllCollectionsAdmin(showPanelLoader),
        subscriptionService.getAllSettlementsAdmin()
      ]);
      setPlans(pls);
      setTaxConfig(tx);
      setSubscriptions(subs);
      setPayments(pymts);
      setCommissions(comms);
      setCollections(colls);
      setSettlements(setts);

      if (tx) {
        setTaxRateInput(tx.tax_rate_percent);
        setTaxNameInput(tx.tax_name);
        setSacCodeInput(tx.hsn_sac_code);
        setGstinInput(tx.gstin_number);
        setPosInput(tx.place_of_supply);
        setExpiryPolicyInput(tx.expiry_policy || 'fallback_starter');
      }
    } catch (e) {
      console.warn('Subscription admin load error:', e);
    } finally {
      setIsSyncing(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const partnerMap = useMemo(() => {
    const map = new Map<string, PartnerProfile>();
    allPartners.forEach((p) => map.set(p.id, p));
    return map;
  }, [allPartners]);

  const collectionByBookingId = useMemo(() => {
    const map = new Map<string, CustomerCollection>();
    collections.forEach((c) => {
      if (!map.has(c.booking_id)) {
        map.set(c.booking_id, c);
      }
    });
    return map;
  }, [collections]);

  // Unified real completed job financial dataset (prefers immutable JobCommissionRecord, merges any completed ServiceBooking without duplicate job_id)
  const unifiedCompletedTxns = useMemo(() => {
    const byJobId = new Map<
      string,
      {
        jobId: string;
        partnerId: string;
        planCode: string;
        estimatedAmount: number;
        jobValue: number;
        commissionPercent: number;
        commissionAmount: number;
        partnerEarnings: number;
        paymentMethod: string;
        paymentReference: string;
        confirmationMode: string;
        settlementStatus: 'accrued' | 'settled' | 'waived';
        completedAt: string;
      }
    >();

    commissions.forEach((c) => {
      if (c.transaction_status === 'reversed') return;
      const coll = collectionByBookingId.get(c.job_id);
      byJobId.set(c.job_id, {
        jobId: c.job_id,
        partnerId: c.partner_id,
        planCode: String(c.plan_code_at_transaction),
        estimatedAmount: Number(coll?.estimated_amount) || Number(c.commissionable_amount) || 0,
        jobValue: Number(c.commissionable_amount) || 0,
        commissionPercent: Number(c.commission_percent) || 0,
        commissionAmount: Number(c.commission_amount) || 0,
        partnerEarnings: Number(c.partner_earnings) || 0,
        paymentMethod: String(c.payment_method || coll?.payment_method || 'cash'),
        paymentReference: c.payment_reference || coll?.payment_reference || '',
        confirmationMode: String(coll?.confirmation_mode || 'receipt'),
        settlementStatus: c.settlement_status || 'accrued',
        completedAt: c.booking_completed_at || coll?.collected_at || c.created_at
      });
    });

    allBookings.forEach((b) => {
      if (b.status !== 'COMPLETED' || !b.assigned_partner_id) return;
      if (byJobId.has(b.id)) return;
      const coll = collectionByBookingId.get(b.id);
      const val = Number(coll?.actual_collected_amount ?? b.actual_collected_amount ?? b.customer_price) || 0;
      const earn = Number(b.partner_earning) || 0;
      const comm =
        b.commission_amount !== undefined ? Number(b.commission_amount) || 0 : Math.max(0, val - earn);
      const pct =
        b.commission_percent !== undefined
          ? Number(b.commission_percent)
          : val > 0
          ? Math.round((comm / val) * 10000) / 100
          : 20;
      byJobId.set(b.id, {
        jobId: b.id,
        partnerId: b.assigned_partner_id,
        planCode: String(b.plan_code_at_transaction || 'starter'),
        estimatedAmount: Number(coll?.estimated_amount ?? b.estimated_price ?? b.customer_price) || val,
        jobValue: val,
        commissionPercent: pct,
        commissionAmount: comm,
        partnerEarnings: earn,
        paymentMethod: String(coll?.payment_method || b.collection_payment_method || 'cash'),
        paymentReference: coll?.payment_reference || b.collection_payment_reference || '',
        confirmationMode: String(coll?.confirmation_mode || b.customer_confirmation_mode || 'receipt'),
        settlementStatus: b.commission_settlement_status || 'accrued',
        completedAt: b.collection_confirmed_at || b.completed_at || b.created_at
      });
    });

    return Array.from(byJobId.values()).sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  }, [commissions, allBookings, collectionByBookingId]);

  // Period Collections (Daily / Weekly / Monthly / All-Time)
  const periodAnalytics = useMemo(() => {
    const now = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];
    const weekCutoff = now - 7 * 86400000;
    const monthCutoff = now - 30 * 86400000;

    const makeBucket = () => ({ jobs: 0, jobValue: 0, commission: 0, partnerEarnings: 0, subscriptionFees: 0 });
    const daily = makeBucket();
    const weekly = makeBucket();
    const monthly = makeBucket();
    const allTime = makeBucket();

    const dailySeries = new Map<string, { date: string; jobs: number; jobValue: number; commission: number; partnerEarnings: number }>();

    unifiedCompletedTxns.forEach((tx) => {
      const ts = new Date(tx.completedAt).getTime();
      const dayKey = tx.completedAt.split('T')[0];

      allTime.jobs += 1;
      allTime.jobValue += tx.jobValue;
      allTime.commission += tx.commissionAmount;
      allTime.partnerEarnings += tx.partnerEarnings;

      if (tx.completedAt.startsWith(todayStr)) {
        daily.jobs += 1;
        daily.jobValue += tx.jobValue;
        daily.commission += tx.commissionAmount;
        daily.partnerEarnings += tx.partnerEarnings;
      }
      if (ts >= weekCutoff) {
        weekly.jobs += 1;
        weekly.jobValue += tx.jobValue;
        weekly.commission += tx.commissionAmount;
        weekly.partnerEarnings += tx.partnerEarnings;
      }
      if (ts >= monthCutoff) {
        monthly.jobs += 1;
        monthly.jobValue += tx.jobValue;
        monthly.commission += tx.commissionAmount;
        monthly.partnerEarnings += tx.partnerEarnings;
      }

      const existingDay = dailySeries.get(dayKey) || {
        date: dayKey,
        jobs: 0,
        jobValue: 0,
        commission: 0,
        partnerEarnings: 0
      };
      existingDay.jobs += 1;
      existingDay.jobValue += tx.jobValue;
      existingDay.commission += tx.commissionAmount;
      existingDay.partnerEarnings += tx.partnerEarnings;
      dailySeries.set(dayKey, existingDay);
    });

    payments.forEach((p) => {
      if (p.payment_status !== 'completed') return;
      const amt = Number(p.total_amount) || 0;
      const ts = new Date(p.created_at).getTime();
      allTime.subscriptionFees += amt;
      if (p.created_at.startsWith(todayStr)) daily.subscriptionFees += amt;
      if (ts >= weekCutoff) weekly.subscriptionFees += amt;
      if (ts >= monthCutoff) monthly.subscriptionFees += amt;
    });

    const dateRows = Array.from(dailySeries.values()).sort((a, b) => b.date.localeCompare(a.date));

    return { daily, weekly, monthly, allTime, dateRows };
  }, [unifiedCompletedTxns, payments]);

  // Partner-Wise Commission & Settlement Report
  const partnerWiseReport = useMemo(() => {
    const settledByPartner = new Map<string, number>();
    settlements.forEach((s) => {
      if (s.verification_status === 'verified') {
        settledByPartner.set(s.partner_id, (settledByPartner.get(s.partner_id) || 0) + (Number(s.amount) || 0));
      }
    });

    const rows = new Map<
      string,
      {
        partnerId: string;
        partnerName: string;
        mobile: string;
        district: string;
        activePlan: string;
        completedJobs: number;
        totalJobValue: number;
        doorblyCommission: number;
        commissionSettled: number;
        outstandingCommission: number;
        partnerEarnings: number;
      }
    >();

    // Seed with partners who have transactions or exist in partner registry
    allPartners.forEach((p) => {
      const activeSub = subscriptions.find((s) => s.partner_id === p.id && s.status === 'active');
      const settled = settledByPartner.get(p.id) || 0;
      rows.set(p.id, {
        partnerId: p.id,
        partnerName: p.name,
        mobile: p.mobile || '—',
        district: (p.district || p.city || 'Unspecified').trim() || 'Unspecified',
        activePlan: activeSub ? `${activeSub.plan_name} (${activeSub.commission_percent}%)` : 'Starter (20%)',
        completedJobs: 0,
        totalJobValue: 0,
        doorblyCommission: 0,
        commissionSettled: settled,
        outstandingCommission: 0,
        partnerEarnings: 0
      });
    });

    unifiedCompletedTxns.forEach((tx) => {
      const p = partnerMap.get(tx.partnerId);
      const activeSub = subscriptions.find((s) => s.partner_id === tx.partnerId && s.status === 'active');
      const settled = settledByPartner.get(tx.partnerId) || 0;
      const curr = rows.get(tx.partnerId) || {
        partnerId: tx.partnerId,
        partnerName: p?.name || `Partner (${tx.partnerId.substring(0, 8)})`,
        mobile: p?.mobile || '—',
        district: (p?.district || p?.city || 'Unspecified').trim() || 'Unspecified',
        activePlan: activeSub
          ? `${activeSub.plan_name} (${activeSub.commission_percent}%)`
          : `${tx.planCode} (${tx.commissionPercent}%)`,
        completedJobs: 0,
        totalJobValue: 0,
        doorblyCommission: 0,
        commissionSettled: settled,
        outstandingCommission: 0,
        partnerEarnings: 0
      };
      curr.completedJobs += 1;
      curr.totalJobValue += tx.jobValue;
      curr.doorblyCommission += tx.commissionAmount;
      curr.partnerEarnings += tx.partnerEarnings;
      curr.outstandingCommission = Math.max(0, curr.doorblyCommission - curr.commissionSettled);
      rows.set(tx.partnerId, curr);
    });

    const term = reportSearch.trim().toLowerCase();
    return Array.from(rows.values())
      .filter((r) =>
        !term
          ? true
          : r.partnerName.toLowerCase().includes(term) ||
            r.partnerId.toLowerCase().includes(term) ||
            r.district.toLowerCase().includes(term) ||
            r.mobile.includes(term)
      )
      .sort((a, b) => b.totalJobValue - a.totalJobValue);
  }, [allPartners, subscriptions, unifiedCompletedTxns, settlements, partnerMap, reportSearch]);

  // District-Wise Earnings Report
  const districtWiseReport = useMemo(() => {
    const byDistrict = new Map<
      string,
      {
        district: string;
        partnerCount: number;
        completedJobs: number;
        totalJobValue: number;
        doorblyCommission: number;
        commissionSettled: number;
        outstandingCommission: number;
        partnerEarnings: number;
      }
    >();

    partnerWiseReport.forEach((row) => {
      const distKey = row.district || 'Unspecified';
      const entry = byDistrict.get(distKey) || {
        district: distKey,
        partnerCount: 0,
        completedJobs: 0,
        totalJobValue: 0,
        doorblyCommission: 0,
        commissionSettled: 0,
        outstandingCommission: 0,
        partnerEarnings: 0
      };
      entry.partnerCount += 1;
      entry.completedJobs += row.completedJobs;
      entry.totalJobValue += row.totalJobValue;
      entry.doorblyCommission += row.doorblyCommission;
      entry.commissionSettled += row.commissionSettled;
      entry.outstandingCommission += row.outstandingCommission;
      entry.partnerEarnings += row.partnerEarnings;
      byDistrict.set(distKey, entry);
    });

    return Array.from(byDistrict.values()).sort((a, b) => b.totalJobValue - a.totalJobValue);
  }, [partnerWiseReport]);

  // Global Accrued / Settled / Outstanding Accounting Summary
  const adminLedgerStats = useMemo(() => {
    const totalGrossCollections = periodAnalytics.allTime.jobValue;
    const totalCommissionAccrued = periodAnalytics.allTime.commission;
    const totalPartnerNetEarnings = periodAnalytics.allTime.partnerEarnings;
    const totalCommissionSettled = settlements
      .filter((s) => s.verification_status === 'verified')
      .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const pendingSettlements = settlements.filter((s) => s.verification_status === 'pending_verification');
    const pendingSettlementAmount = pendingSettlements.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const outstandingCommission = Math.max(0, totalCommissionAccrued - totalCommissionSettled);
    return {
      totalGrossCollections,
      totalCommissionAccrued,
      totalCommissionSettled,
      pendingSettlementCount: pendingSettlements.length,
      pendingSettlementAmount,
      outstandingCommission,
      totalPartnerNetEarnings
    };
  }, [periodAnalytics, settlements]);

  // Live Plan counts
  const activeSubs = subscriptions.filter((s) => s.status === 'active' && new Date(s.expires_at).getTime() >= Date.now());
  const totalActiveSubs = activeSubs.length;
  const starterCount = activeSubs.filter((s) => s.plan_code === 'starter').length;
  const growthCount = activeSubs.filter((s) => s.plan_code === 'growth').length;
  const proCount = activeSubs.filter((s) => s.plan_code === 'professional').length;

  const pendingPaymentsCount = payments.filter((p) => p.payment_status === 'pending').length;
  const failedPaymentsCount = payments.filter((p) => p.payment_status === 'failed' || p.payment_status === 'refunded').length;

  const formatInr = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const exportCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
    const csvLines = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ];
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatePlanError(null);
    try {
      const benefits = newPlanBenefitsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const updated = await subscriptionService.createPlan({
        plan_code: newPlanCode || newPlanName,
        plan_name: newPlanName,
        monthly_price: Number(newPlanPrice) || 0,
        commission_percent: Number(newPlanCommission) || 0,
        is_tax_applicable: newPlanTaxApplicable,
        is_recommended: newPlanRecommended,
        benefits
      });
      setPlans(updated);
      setShowCreatePlanModal(false);
      setNewPlanName('');
      setNewPlanCode('');
      setNewPlanBenefitsText('');
      notifyFeedback(`Plan "${newPlanName}" created successfully!`);
    } catch (err: unknown) {
      setCreatePlanError(err instanceof Error ? err.message : 'Failed to create plan.');
    }
  };

  const handleStartEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setEditPlanName(plan.plan_name);
    setEditPrice(plan.monthly_price);
    setEditCommission(plan.commission_percent);
    setEditIsActive(plan.is_active);
    setEditIsTaxApplicable(plan.tax_configuration?.is_tax_applicable ?? plan.monthly_price > 0);
    setEditSuccessMsg(null);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      const updated = await subscriptionService.updatePlan(editingPlan.id, {
        plan_name: editPlanName.trim() || editingPlan.plan_name,
        monthly_price: editPrice,
        commission_percent: editCommission,
        is_active: editIsActive,
        tax_configuration: {
          is_tax_applicable: editPrice > 0 ? editIsTaxApplicable : false,
          default_tax_percent: editPrice > 0 && editIsTaxApplicable ? taxConfig?.tax_rate_percent ?? 18 : 0
        }
      });
      setPlans(updated);
      setEditSuccessMsg(`Plan "${editPlanName}" updated! Past commission snapshots remain preserved.`);
      setTimeout(() => {
        setEditingPlan(null);
        setEditSuccessMsg(null);
      }, 1100);
    } catch (err: unknown) {
      notifyFeedback(err instanceof Error ? err.message : 'Failed to update plan', 'error');
    }
  };

  const handleSaveTaxConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await subscriptionService.updateTaxConfiguration({
        tax_rate_percent: Number(taxRateInput) || 0,
        tax_name: taxNameInput.trim(),
        hsn_sac_code: sacCodeInput.trim(),
        gstin_number: gstinInput.trim(),
        place_of_supply: posInput.trim(),
        expiry_policy: expiryPolicyInput
      });
      setTaxConfig(updated);
      setTaxSaveSuccess(true);
      setTimeout(() => setTaxSaveSuccess(false), 2500);
    } catch (err: unknown) {
      notifyFeedback(err instanceof Error ? err.message : 'Failed to save tax settings', 'error');
    }
  };

  const handleQuickSubscriptionStatus = async (
    sub: PartnerSubscription,
    nextStatus: 'active' | 'suspended' | 'expired'
  ) => {
    const ok = await subscriptionService.adminManualCorrectSubscription(sub.id, sub.partner_id, {
      status: nextStatus,
      expiresAt:
        nextStatus === 'active' && new Date(sub.expires_at).getTime() < Date.now()
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : undefined,
      reason: `Admin quick action: set subscription status to ${nextStatus}`
    });
    if (ok) {
      notifyFeedback(`Subscription updated to "${nextStatus.toUpperCase()}".`);
      await loadAllData();
    } else {
      notifyFeedback('Failed to update subscription status.', 'error');
    }
  };

  const handleAssignPartnerSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignPartnerId) return;
    try {
      const created = await subscriptionService.adminAssignPartnerSubscription(assignPartnerId, {
        planCode: assignPlanCode,
        status: assignStatus,
        durationDays: assignDays,
        reason: assignReason.trim() || 'Admin subscription assignment'
      });
      if (created) {
        setShowAssignSubModal(false);
        notifyFeedback(`Assigned ${created.plan_name} (${created.status}) to partner.`);
        await loadAllData();
      }
    } catch (err: unknown) {
      notifyFeedback(err instanceof Error ? err.message : 'Failed to assign subscription', 'error');
    }
  };

  const handleStartManualCorrection = (sub: PartnerSubscription) => {
    setCorrectingSub(sub);
    setCorrectionPlanCode(sub.plan_code);
    setCorrectionStatus(sub.status);
    setCorrectionDays(30);
    setCorrectionReason('');
    setCorrectionError(null);
    setCorrectionSuccess(null);
  };

  const handleSaveManualCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingSub) return;
    if (!correctionReason.trim()) {
      setCorrectionError('Audit requirement: Reason for manual correction must be specified.');
      return;
    }

    const newExpiry =
      correctionStatus === 'expired'
        ? new Date().toISOString()
        : correctionStatus === 'active'
        ? new Date(Date.now() + Math.max(1, correctionDays) * 86400000).toISOString()
        : undefined;
    try {
      const ok = await subscriptionService.adminManualCorrectSubscription(
        correctingSub.id,
        correctingSub.partner_id,
        {
          planCode: correctionPlanCode,
          status: correctionStatus,
          expiresAt: newExpiry,
          reason: correctionReason.trim()
        }
      );

      if (ok) {
        setCorrectionSuccess('Subscription updated and audit log recorded.');
        setTimeout(() => {
          setCorrectingSub(null);
          setCorrectionSuccess(null);
          loadAllData();
        }, 900);
      } else {
        setCorrectionError('Failed to update subscription.');
      }
    } catch (err: unknown) {
      setCorrectionError(err instanceof Error ? err.message : 'Unauthorized or update error.');
    }
  };

  const handleVerifySubscriptionPayment = async (payment: SubscriptionPayment) => {
    setProcessingId(payment.id);
    try {
      const res = await subscriptionService.verifyAndActivateSubscriptionPayment(payment.id);
      if (res.success) {
        notifyFeedback(res.message, 'success');
        await loadAllData();
      } else {
        notifyFeedback(res.message, 'error');
      }
    } catch (err: unknown) {
      notifyFeedback(err instanceof Error ? err.message : 'Verification failed.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifySettlement = async (settlement: CommissionSettlement) => {
    setProcessingId(settlement.id);
    try {
      const res = await subscriptionService.adminVerifyCommissionSettlement(settlement.id, 'verified');
      if (res.success) {
        notifyFeedback(res.message, 'success');
        await loadAllData();
      } else {
        notifyFeedback(res.message, 'error');
      }
    } catch (err: unknown) {
      notifyFeedback(err instanceof Error ? err.message : 'Settlement verification failed.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    const reason = rejectReasonInput.trim();
    if (!reason) {
      notifyFeedback('Please provide a rejection reason.', 'error');
      return;
    }
    setProcessingId(rejectTarget.id);
    try {
      if (rejectTarget.kind === 'payment') {
        const ok = await subscriptionService.rejectSubscriptionPayment(rejectTarget.id, reason);
        if (ok) {
          notifyFeedback(`Rejected upgrade payment ${rejectTarget.label}.`, 'success');
          await loadAllData();
        } else {
          notifyFeedback('Could not reject subscription payment.', 'error');
        }
      } else {
        const res = await subscriptionService.adminVerifyCommissionSettlement(rejectTarget.id, 'rejected', reason);
        if (res.success) {
          notifyFeedback(`Rejected settlement ${rejectTarget.label}.`, 'success');
          await loadAllData();
        } else {
          notifyFeedback(res.message, 'error');
        }
      }
      setRejectTarget(null);
      setRejectReasonInput('');
    } catch (err: unknown) {
      notifyFeedback(err instanceof Error ? err.message : 'Rejection action failed.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPayments = payments.filter((p) =>
    paymentFilter === 'all' ? true : p.payment_status === paymentFilter
  );

  const filteredSettlements = settlements.filter((s) =>
    settlementFilter === 'all' ? true : s.verification_status === settlementFilter
  );

  const filteredCollections = useMemo(() => {
    const q = collectionSearch.trim().toLowerCase();
    if (!q) return unifiedCompletedTxns;
    return unifiedCompletedTxns.filter((tx) => {
      const pName = partnerMap.get(tx.partnerId)?.name?.toLowerCase() || '';
      return (
        tx.jobId.toLowerCase().includes(q) ||
        tx.partnerId.toLowerCase().includes(q) ||
        pName.includes(q) ||
        tx.paymentMethod.toLowerCase().includes(q) ||
        tx.paymentReference.toLowerCase().includes(q)
      );
    });
  }, [unifiedCompletedTxns, collectionSearch, partnerMap]);

  return (
    <div className="space-y-4 text-slate-100">
      {/* Top Banner & Sub-Tabs */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-900/60 border border-teal-500/40 text-teal-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white truncate">
                Subscription &amp; Commission Control Panel
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Plans, commission rates, partner statuses, expiry policy, and district/period reports
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadAllData(true)}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5 shrink-0"
            title="Refresh All Records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        {actionFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                : 'bg-rose-950/80 border border-rose-700 text-rose-300'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
        )}

        {isSyncing && (
          <ProcessingLoader
            variant="bar"
            theme="dark"
            label="Syncing subscription & commission records from Supabase..."
            className="rounded-full"
          />
        )}

        {/* Sub-Tabs Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-t border-slate-800/80 pt-2.5">
          {[
            { id: 'overview', label: 'Overview & Accounting', icon: TrendingUp },
            { id: 'collections', label: `Collections (${unifiedCompletedTxns.length})`, icon: Banknote },
            {
              id: 'settlements',
              label:
                adminLedgerStats.pendingSettlementCount > 0
                  ? `Settlements (${adminLedgerStats.pendingSettlementCount} pending)`
                  : `Settlements (${settlements.length})`,
              icon: Landmark
            },
            {
              id: 'payments',
              label:
                pendingPaymentsCount > 0
                  ? `Upgrades & Fees (${pendingPaymentsCount} pending)`
                  : `Subscription Fees (${payments.length})`,
              icon: Receipt
            },
            { id: 'subscriptions', label: `Subscriptions (${subscriptions.length})`, icon: Users },
            { id: 'plans', label: `Plans (${plans.length})`, icon: ShieldCheck },
            { id: 'reports', label: 'Reports & CSV', icon: BarChart3 },
            { id: 'commissions', label: `Snapshots (${unifiedCompletedTxns.length})`, icon: Coins },
            { id: 'tax', label: `Tax & Policy (${taxConfig?.tax_rate_percent ?? 18}%)`, icon: Settings }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
                className={`py-1.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <ProcessingLoader
          variant="panel"
          theme="dark"
          label="Processing subscription & tax records from Supabase..."
          subLabel="Fetching active plans, partner subscriptions, collections, settlements, and commission audit logs"
        />
      ) : activeSubTab === 'overview' && (
        <div className="space-y-4">
          {/* Pending Verifications Alert Banner */}
          {(pendingPaymentsCount > 0 || adminLedgerStats.pendingSettlementCount > 0) && (
            <div className="bg-amber-950/50 border border-amber-700/70 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-amber-200 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Verification Queue: {pendingPaymentsCount} subscription upgrade request(s) ·{' '}
                  {adminLedgerStats.pendingSettlementCount} commission settlement(s) (₹
                  {formatInr(adminLedgerStats.pendingSettlementAmount)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                {pendingPaymentsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentFilter('pending');
                      setActiveSubTab('payments');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer"
                  >
                    Verify Upgrades →
                  </button>
                )}
                {adminLedgerStats.pendingSettlementCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettlementFilter('pending_verification');
                      setActiveSubTab('settlements');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-[11px] cursor-pointer"
                  >
                    Reconcile Settlements →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* KPI Cards Row (Gross Collections, Commission Accrued, Settled vs Outstanding, Partner Net, Separate Subscription Revenue) */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block truncate">
                Total Customer Collections
              </span>
              <div className="text-2xl font-black text-white font-mono tabular-nums truncate">
                ₹{formatInr(adminLedgerStats.totalGrossCollections)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Actual collected across {unifiedCompletedTxns.length} completed services
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block truncate">
                Commission Accrued (Gross Fee)
              </span>
              <div className="text-2xl font-black text-amber-400 font-mono tabular-nums truncate">
                ₹{formatInr(adminLedgerStats.totalCommissionAccrued)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Snapshot locked at collection time
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-900/70 space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block truncate">
                Settled Commission (Verified)
              </span>
              <div className="text-2xl font-black text-emerald-400 font-mono tabular-nums truncate">
                ₹{formatInr(adminLedgerStats.totalCommissionSettled)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {settlements.filter((s) => s.verification_status === 'verified').length} reconciled settlement receipt(s)
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-rose-900/70 space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider block truncate">
                Outstanding Doorbly Commission
              </span>
              <div className="text-2xl font-black text-rose-400 font-mono tabular-nums truncate">
                ₹{formatInr(adminLedgerStats.outstandingCommission)}
              </div>
              <div className="text-[10px] text-amber-300 truncate">
                Pending verify: ₹{formatInr(adminLedgerStats.pendingSettlementAmount)} ({adminLedgerStats.pendingSettlementCount})
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block truncate">
                Total Partner Net Earnings
              </span>
              <div className="text-2xl font-black text-teal-400 font-mono tabular-nums truncate">
                ₹{formatInr(adminLedgerStats.totalPartnerNetEarnings)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {totalActiveSubs} active subs (S:{starterCount} · G:{growthCount} · P:{proCount})
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block truncate">
                Subscription Fees (Separate)
              </span>
              <div className="text-2xl font-black text-sky-400 font-mono tabular-nums truncate">
                ₹{formatInr(periodAnalytics.allTime.subscriptionFees)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {payments.filter((p) => p.payment_status === 'completed').length} verified invoices · {pendingPaymentsCount} pending
              </div>
            </div>
          </div>

          {/* Daily, Weekly & Monthly Commission Collections Summary */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Daily, Weekly &amp; Monthly Commission Collections</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('reports');
                  setReportSubView('periods');
                }}
                className="text-xs font-bold text-teal-400 hover:underline cursor-pointer"
              >
                View Date Ledger →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: 'Daily (Today)', data: periodAnalytics.daily, accent: 'border-emerald-700/70 bg-emerald-950/20' },
                { label: 'Weekly (Last 7 Days)', data: periodAnalytics.weekly, accent: 'border-teal-700/70 bg-teal-950/20' },
                { label: 'Monthly (Last 30 Days)', data: periodAnalytics.monthly, accent: 'border-amber-700/70 bg-amber-950/20' }
              ].map((bucket) => (
                <div key={bucket.label} className={`p-4 rounded-xl border ${bucket.accent} space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white">{bucket.label}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 text-[10px] font-bold">
                      {bucket.data.jobs} Jobs
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Doorbly Commission:</span>
                      <span className="font-mono font-black text-amber-400">₹{formatInr(bucket.data.commission)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Partner Earnings:</span>
                      <span className="font-mono font-bold text-emerald-400">₹{formatInr(bucket.data.partnerEarnings)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Completed Job Value:</span>
                      <span className="font-mono text-slate-200">₹{formatInr(bucket.data.jobValue)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-800/80">
                      <span className="text-slate-400">Subscription Fees (Sep.):</span>
                      <span className="font-mono text-teal-300">₹{formatInr(bucket.data.subscriptionFees)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Plan-wise Partner Distribution Card */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 text-xs">
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-400" />
              <span>Plan-wise Partner Distribution</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.map((p) => {
                const count = activeSubs.filter((s) => s.plan_code === p.plan_code).length;
                return (
                  <div key={p.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-slate-100 uppercase truncate">{p.plan_name}</span>
                      <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 font-mono text-[10px] shrink-0">
                        {p.commission_percent}% Comm.
                      </span>
                    </div>
                    <div className="text-xl font-black text-white tabular-nums">{count} Active</div>
                    <p className="text-[11px] text-slate-400">
                      ₹{p.monthly_price}/month{p.monthly_price > 0 && p.tax_configuration?.is_tax_applicable ? ' + tax' : ''}. Partner retains {100 - p.commission_percent}%.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PLANS MANAGEMENT TAB */}
      {activeSubTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-white">
                Configured Subscription Plans ({plans.length})
              </h3>
              <span className="text-[11px] text-slate-400">
                Historical completed job commission records stay locked even if plan rates change.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreatePlanError(null);
                setShowCreatePlanModal(true);
              }}
              className="py-2 px-3.5 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Plan</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 text-xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm uppercase text-white truncate">{plan.plan_name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                        plan.is_active
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white tabular-nums">₹{plan.monthly_price}</span>
                    <span className="text-slate-400 text-[11px]">
                      / month {plan.monthly_price > 0 && plan.tax_configuration?.is_tax_applicable ? '+ applicable tax' : ''}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Doorbly Commission:</span>
                      <span className="font-black text-teal-400">{plan.commission_percent}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Partner Retains:</span>
                      <span className="font-black text-emerald-400">
                        {100 - plan.commission_percent}% (₹{1000 - (1000 * plan.commission_percent) / 100} / ₹1k)
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 text-[11px] text-slate-400">
                    {plan.benefits.slice(0, 3).map((b, i) => (
                      <div key={i} className="flex items-center gap-1.5 truncate">
                        <Check className="w-3 h-3 text-teal-400 shrink-0" />
                        <span className="truncate">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleStartEditPlan(plan)}
                    className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-teal-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Plan Terms</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Create Plan Modal */}
          {showCreatePlanModal && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <form
                onSubmit={handleCreatePlan}
                className="bg-slate-900 rounded-3xl max-w-md w-full p-5 border border-slate-700 space-y-4 shadow-2xl text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="font-black text-sm text-white">Create Subscription Plan</div>
                  <button
                    type="button"
                    onClick={() => setShowCreatePlanModal(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Plan Name *</label>
                      <input
                        type="text"
                        required
                        value={newPlanName}
                        onChange={(e) => {
                          setNewPlanName(e.target.value);
                          if (!newPlanCode) {
                            setNewPlanCode(
                              e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
                            );
                          }
                        }}
                        placeholder="e.g. Enterprise"
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Plan Code Slug *</label>
                      <input
                        type="text"
                        required
                        value={newPlanCode}
                        onChange={(e) => setNewPlanCode(e.target.value)}
                        placeholder="e.g. enterprise"
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Monthly Fee (₹) *</label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={newPlanPrice}
                        onChange={(e) => setNewPlanPrice(Number(e.target.value))}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Doorbly Commission (%) *</label>
                      <input
                        type="number"
                        min={0}
                        max={80}
                        step="0.1"
                        required
                        value={newPlanCommission}
                        onChange={(e) => setNewPlanCommission(Number(e.target.value))}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Benefits (One per line)</label>
                    <textarea
                      rows={3}
                      value={newPlanBenefitsText}
                      onChange={(e) => setNewPlanBenefitsText(e.target.value)}
                      placeholder="Lowest commission rate&#10;Dedicated account manager&#10;Priority job dispatch"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPlanTaxApplicable}
                        onChange={(e) => setNewPlanTaxApplicable(e.target.checked)}
                        className="rounded text-teal-600"
                      />
                      <span>Apply Tax ({taxConfig?.tax_rate_percent ?? 18}%)</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPlanRecommended}
                        onChange={(e) => setNewPlanRecommended(e.target.checked)}
                        className="rounded text-teal-600"
                      />
                      <span>Mark Recommended</span>
                    </label>
                  </div>
                </div>

                {createPlanError && (
                  <div className="p-2.5 rounded-xl bg-rose-950 text-rose-300 border border-rose-800 text-[11px]">
                    {createPlanError}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreatePlanModal(false)}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Plan</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Edit Plan Modal */}
          {editingPlan && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <form
                onSubmit={handleSavePlan}
                className="bg-slate-900 rounded-3xl max-w-sm w-full p-5 border border-slate-700 space-y-4 shadow-2xl text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="font-black text-sm text-white">
                    Edit {editingPlan.plan_name} Plan
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPlan(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Plan Name</label>
                    <input
                      type="text"
                      value={editPlanName}
                      onChange={(e) => setEditPlanName(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">
                      Monthly Subscription Fee (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">
                      Doorbly Commission (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={80}
                      step="0.1"
                      value={editCommission}
                      onChange={(e) => setEditCommission(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={editIsTaxApplicable}
                      onChange={(e) => setEditIsTaxApplicable(e.target.checked)}
                      className="rounded text-teal-600"
                    />
                    <span>Apply applicable subscription tax</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="rounded text-teal-600"
                    />
                    <span>Plan is actively selectable by partners</span>
                  </label>
                </div>

                {editSuccessMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{editSuccessMsg}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPlan(null)}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAX SETTINGS & EXPIRY POLICY TAB */}
      {activeSubTab === 'tax' && (
        <form
          onSubmit={handleSaveTaxConfig}
          className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-400" />
                <span>Tax Settings &amp; Subscription Expiry Policy</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Configure tax rates on monthly subscriptions and automatic behavior when a partner subscription expires.
              </p>
            </div>

            <button
              type="submit"
              className="py-2 px-4 bg-[#0F766E] hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Settings</span>
            </button>
          </div>

          {/* Subscription Expiry Policy Control */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
            <label className="font-bold text-teal-300 block">
              Expired Subscription Policy
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 ${
                  expiryPolicyInput === 'fallback_starter'
                    ? 'bg-teal-950/60 border-teal-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="expiry_policy"
                  checked={expiryPolicyInput === 'fallback_starter'}
                  onChange={() => setExpiryPolicyInput('fallback_starter')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold">Auto-Fallback to Starter Plan (20% Commission)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    When Growth/Professional expires, partner automatically transitions to ₹0 Starter (20% commission) with zero downtime.
                  </div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 ${
                  expiryPolicyInput === 'require_renewal'
                    ? 'bg-amber-950/60 border-amber-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="expiry_policy"
                  checked={expiryPolicyInput === 'require_renewal'}
                  onChange={() => setExpiryPolicyInput('require_renewal')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold">Pause Online Dispatch Until Renewed</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Marks subscription Expired and prevents going online until partner renews or activates a plan; in-flight jobs use Starter rate.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-300 block mb-1">
                Tax Rate (%) — e.g. 18% GST
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={40}
                value={taxRateInput}
                onChange={(e) => setTaxRateInput(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Growth (₹370) calculates tax of ₹{((370 * taxRateInput) / 100).toFixed(2)}, total payable ₹{(370 + (370 * taxRateInput) / 100).toFixed(2)}.
              </span>
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">
                Tax Nomenclature / Label
              </label>
              <input
                type="text"
                value={taxNameInput}
                onChange={(e) => setTaxNameInput(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">
                HSN / SAC Code
              </label>
              <input
                type="text"
                value={sacCodeInput}
                onChange={(e) => setSacCodeInput(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-slate-300 block mb-1">
                GSTIN Registration Number
              </label>
              <input
                type="text"
                value={gstinInput}
                onChange={(e) => setGstinInput(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
              />
            </div>

            <div className="md:col-span-2">
              <label className="font-bold text-slate-300 block mb-1">
                Place of Supply Default
              </label>
              <input
                type="text"
                value={posInput}
                onChange={(e) => setPosInput(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
              />
            </div>
          </div>

          {taxSaveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Tax settings &amp; expiry policy saved and synced across partner app.</span>
            </div>
          )}
        </form>
      )}

      {/* PARTNER SUBSCRIPTIONS TAB (Activate, Suspend, Expire, Assign) */}
      {activeSubTab === 'subscriptions' && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm text-white">
                Partner Subscriptions &amp; Status Controls ({subscriptions.length})
              </h3>
              <span className="text-[11px] text-slate-400">
                Activate, suspend, expire, or assign subscriptions with immutable audit logging.
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setAssignPartnerId(allPartners[0]?.id || '');
                setShowAssignSubModal(true);
              }}
              className="py-2 px-3 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Assign Partner Subscription</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                  <th className="py-2.5 pr-2">Partner</th>
                  <th className="py-2.5 px-2">Plan</th>
                  <th className="py-2.5 px-2">Comm %</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2">Effective</th>
                  <th className="py-2.5 px-2">Expires At</th>
                  <th className="py-2.5 pl-2 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {subscriptions.map((sub) => {
                  const p = partnerMap.get(sub.partner_id);
                  const isDateExpired = new Date(sub.expires_at).getTime() < Date.now();
                  const effectiveStatus =
                    sub.status === 'active' && isDateExpired ? 'expired' : sub.status;
                  return (
                    <tr key={sub.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 pr-2">
                        <div className="font-bold text-white">{p?.name || 'Partner'}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {sub.partner_id.substring(0, 14)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-bold text-white capitalize">{sub.plan_name}</span>
                      </td>
                      <td className="py-2.5 px-2 font-bold text-teal-400">
                        {sub.commission_percent}%
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            effectiveStatus === 'active'
                              ? 'bg-emerald-950 text-emerald-400'
                              : effectiveStatus === 'suspended'
                              ? 'bg-amber-950 text-amber-400'
                              : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {effectiveStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-[11px] text-slate-400">
                        {new Date(sub.start_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-2 text-[11px] text-slate-400">
                        {new Date(sub.expires_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                          {effectiveStatus !== 'active' && (
                            <button
                              type="button"
                              onClick={() => void handleQuickSubscriptionStatus(sub, 'active')}
                              className="px-2 py-1 rounded-lg bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <PlayCircle className="w-3 h-3" />
                              <span>Activate</span>
                            </button>
                          )}
                          {effectiveStatus !== 'suspended' && (
                            <button
                              type="button"
                              onClick={() => void handleQuickSubscriptionStatus(sub, 'suspended')}
                              className="px-2 py-1 rounded-lg bg-amber-900/70 hover:bg-amber-800 text-amber-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <PauseCircle className="w-3 h-3" />
                              <span>Suspend</span>
                            </button>
                          )}
                          {effectiveStatus !== 'expired' && (
                            <button
                              type="button"
                              onClick={() => void handleQuickSubscriptionStatus(sub, 'expired')}
                              className="px-2 py-1 rounded-lg bg-rose-900/70 hover:bg-rose-800 text-rose-200 text-[10px] font-bold cursor-pointer"
                            >
                              Expire
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartManualCorrection(sub)}
                            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-teal-300 border border-slate-700 text-[10px] font-bold cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Assign Subscription Modal */}
          {showAssignSubModal && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <form
                onSubmit={handleAssignPartnerSubscription}
                className="bg-slate-900 rounded-3xl max-w-md w-full p-5 border border-slate-700 space-y-4 shadow-2xl text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="font-black text-sm text-white">Assign Partner Subscription</div>
                  <button
                    type="button"
                    onClick={() => setShowAssignSubModal(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Partner *</label>
                    <select
                      required
                      value={assignPartnerId}
                      onChange={(e) => setAssignPartnerId(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    >
                      {allPartners.length === 0 ? (
                        <option value="">No registered partners available</option>
                      ) : (
                        allPartners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.mobile || p.id.substring(0, 10)})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Subscription Plan</label>
                    <select
                      value={assignPlanCode}
                      onChange={(e) => setAssignPlanCode(e.target.value as PlanCode)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.plan_code}>
                          {p.plan_name} (₹{p.monthly_price}/mo · {p.commission_percent}% Comm.)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Status</label>
                      <select
                        value={assignStatus}
                        onChange={(e) => setAssignStatus(e.target.value as SubscriptionStatus)}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Duration (Days)</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={assignDays}
                        onChange={(e) => setAssignDays(Number(e.target.value))}
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Audit Reason</label>
                    <input
                      type="text"
                      value={assignReason}
                      onChange={(e) => setAssignReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAssignSubModal(false)}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!assignPartnerId}
                    className="py-2 px-4 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    Save Subscription
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Manual Correction Modal */}
          {correctingSub && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <form
                onSubmit={handleSaveManualCorrection}
                className="bg-slate-900 rounded-3xl max-w-md w-full p-5 border border-slate-700 space-y-4 shadow-2xl text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <div className="font-black text-sm text-white">Update Partner Subscription</div>
                    <div className="text-[10px] text-slate-400">
                      {partnerMap.get(correctingSub.partner_id)?.name || correctingSub.partner_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCorrectingSub(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Target Plan</label>
                    <select
                      value={correctionPlanCode}
                      onChange={(e) => setCorrectionPlanCode(e.target.value as PlanCode)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.plan_code}>
                          {p.plan_name} ({p.commission_percent}% Commission)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Status</label>
                    <select
                      value={correctionStatus}
                      onChange={(e) => setCorrectionStatus(e.target.value as SubscriptionStatus)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-300 block mb-1">
                      Duration (Days from Now)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={correctionDays}
                      disabled={correctionStatus !== 'active'}
                      onChange={(e) => setCorrectionDays(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:border-teal-500 focus:outline-hidden disabled:opacity-45 disabled:cursor-not-allowed"
                    />
                    {correctionStatus !== 'active' && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        {correctionStatus === 'expired'
                          ? 'Expiry date will be set to immediate expiration.'
                          : 'Existing expiry date is preserved for suspended/cancelled status.'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="font-bold text-amber-300 block mb-1">
                      Mandatory Audit Log Reason *
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g. Plan adjustment or administrative suspension..."
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {correctionError && (
                  <div className="p-2.5 rounded-xl bg-rose-950 text-rose-300 border border-rose-800 text-[11px]">
                    {correctionError}
                  </div>
                )}
                {correctionSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px]">
                    {correctionSuccess}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectingSub(null)}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold cursor-pointer"
                  >
                    Apply Changes
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* PARTNER-WISE, DISTRICT-WISE & PERIOD COMMISSION REPORTS TAB */}
      {activeSubTab === 'reports' && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-400" />
                <span>Commission &amp; District Earnings Reports (Live Completed Bookings Only)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All totals compute exclusively from completed booking commission snapshots. Zero estimated or dummy figures.
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'partner', label: 'Partner-Wise' },
                { id: 'district', label: 'District-Wise' },
                { id: 'periods', label: 'Daily / Weekly / Monthly' }
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setReportSubView(v.id as typeof reportSubView)}
                  className={`py-1.5 px-3 rounded-lg font-bold text-xs cursor-pointer ${
                    reportSubView === v.id
                      ? 'bg-[#0F766E] text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {reportSubView === 'partner' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  type="text"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Search partner name, mobile, district..."
                  className="flex-1 min-w-[200px] p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-teal-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      `doorbly_partner_commission_report_${new Date().toISOString().split('T')[0]}.csv`,
                      [
                        'Partner ID',
                        'Partner Name',
                        'Mobile',
                        'District',
                        'Plan',
                        'Completed Jobs',
                        'Actual Collections',
                        'Commission Accrued',
                        'Commission Settled',
                        'Outstanding Commission',
                        'Partner Net Earnings'
                      ],
                      partnerWiseReport.map((r) => [
                        r.partnerId,
                        r.partnerName,
                        r.mobile,
                        r.district,
                        r.activePlan,
                        r.completedJobs,
                        r.totalJobValue.toFixed(2),
                        r.doorblyCommission.toFixed(2),
                        r.commissionSettled.toFixed(2),
                        r.outstandingCommission.toFixed(2),
                        r.partnerEarnings.toFixed(2)
                      ])
                    )
                  }
                  className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                      <th className="py-2.5 pr-2">Partner</th>
                      <th className="py-2.5 px-2">District</th>
                      <th className="py-2.5 px-2">Plan</th>
                      <th className="py-2.5 px-2 text-right">Jobs</th>
                      <th className="py-2.5 px-2 text-right">Collections</th>
                      <th className="py-2.5 px-2 text-right">Accrued Fee</th>
                      <th className="py-2.5 px-2 text-right">Settled</th>
                      <th className="py-2.5 px-2 text-right">Outstanding</th>
                      <th className="py-2.5 pl-2 text-right">Partner Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {partnerWiseReport.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-slate-500">
                          No matching partner records found.
                        </td>
                      </tr>
                    ) : (
                      partnerWiseReport.map((r) => (
                        <tr key={r.partnerId} className="hover:bg-slate-900/50">
                          <td className="py-2.5 pr-2">
                            <div className="font-bold text-white">{r.partnerName}</div>
                            <div className="text-[10px] text-slate-400">{r.mobile}</div>
                          </td>
                          <td className="py-2.5 px-2 text-slate-300">{r.district}</td>
                          <td className="py-2.5 px-2 text-teal-300 font-semibold">{r.activePlan}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{r.completedJobs}</td>
                          <td className="py-2.5 px-2 text-right font-mono">₹{formatInr(r.totalJobValue)}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                            ₹{formatInr(r.doorblyCommission)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                            ₹{formatInr(r.commissionSettled)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-400">
                            ₹{formatInr(r.outstandingCommission)}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-mono font-bold text-teal-300">
                            ₹{formatInr(r.partnerEarnings)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportSubView === 'district' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-400" />
                  <span>Grouped across {districtWiseReport.length} districts</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      `doorbly_district_earnings_report_${new Date().toISOString().split('T')[0]}.csv`,
                      [
                        'District',
                        'Partners',
                        'Completed Jobs',
                        'Actual Collections',
                        'Commission Accrued',
                        'Commission Settled',
                        'Outstanding Commission',
                        'Partner Net Earnings'
                      ],
                      districtWiseReport.map((d) => [
                        d.district,
                        d.partnerCount,
                        d.completedJobs,
                        d.totalJobValue.toFixed(2),
                        d.doorblyCommission.toFixed(2),
                        d.commissionSettled.toFixed(2),
                        d.outstandingCommission.toFixed(2),
                        d.partnerEarnings.toFixed(2)
                      ])
                    )
                  }
                  className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                      <th className="py-2.5 pr-2">District</th>
                      <th className="py-2.5 px-2 text-right">Partners</th>
                      <th className="py-2.5 px-2 text-right">Jobs</th>
                      <th className="py-2.5 px-2 text-right">Collections</th>
                      <th className="py-2.5 px-2 text-right">Accrued Fee</th>
                      <th className="py-2.5 px-2 text-right">Settled</th>
                      <th className="py-2.5 px-2 text-right">Outstanding</th>
                      <th className="py-2.5 pl-2 text-right">Partner Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {districtWiseReport.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500">
                          No district records available yet.
                        </td>
                      </tr>
                    ) : (
                      districtWiseReport.map((d) => (
                        <tr key={d.district} className="hover:bg-slate-900/50">
                          <td className="py-2.5 pr-2 font-bold text-white">{d.district}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{d.partnerCount}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{d.completedJobs}</td>
                          <td className="py-2.5 px-2 text-right font-mono">₹{formatInr(d.totalJobValue)}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                            ₹{formatInr(d.doorblyCommission)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-emerald-400">
                            ₹{formatInr(d.commissionSettled)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-400">
                            ₹{formatInr(d.outstandingCommission)}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-mono font-bold text-teal-300">
                            ₹{formatInr(d.partnerEarnings)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportSubView === 'periods' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    exportCsv(
                      `doorbly_daily_commission_report_${new Date().toISOString().split('T')[0]}.csv`,
                      ['Date', 'Completed Jobs', 'Actual Collections', 'Doorbly Commission', 'Partner Net Earnings'],
                      periodAnalytics.dateRows.map((row) => [
                        row.date,
                        row.jobs,
                        row.jobValue.toFixed(2),
                        row.commission.toFixed(2),
                        row.partnerEarnings.toFixed(2)
                      ])
                    )
                  }
                  className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Daily CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { title: 'Today (Daily)', data: periodAnalytics.daily },
                  { title: 'Last 7 Days (Weekly)', data: periodAnalytics.weekly },
                  { title: 'Last 30 Days (Monthly)', data: periodAnalytics.monthly },
                  { title: 'All-Time Total', data: periodAnalytics.allTime }
                ].map((box) => (
                  <div key={box.title} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-teal-400 block">{box.title}</span>
                    <div className="text-lg font-black text-amber-400 font-mono">₹{formatInr(box.data.commission)}</div>
                    <div className="text-[11px] text-slate-400">
                      {box.data.jobs} jobs · Collections ₹{formatInr(box.data.jobValue)}
                    </div>
                    <div className="text-[11px] text-emerald-400">
                      Partner Net: ₹{formatInr(box.data.partnerEarnings)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                      <th className="py-2.5 pr-2">Completion Date</th>
                      <th className="py-2.5 px-2 text-right">Completed Jobs</th>
                      <th className="py-2.5 px-2 text-right">Actual Collections</th>
                      <th className="py-2.5 px-2 text-right">Doorbly Commission</th>
                      <th className="py-2.5 pl-2 text-right">Partner Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {periodAnalytics.dateRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          No completed bookings recorded yet.
                        </td>
                      </tr>
                    ) : (
                      periodAnalytics.dateRows.map((row) => (
                        <tr key={row.date} className="hover:bg-slate-900/50">
                          <td className="py-2.5 pr-2 font-mono text-white">{row.date}</td>
                          <td className="py-2.5 px-2 text-right font-mono">{row.jobs}</td>
                          <td className="py-2.5 px-2 text-right font-mono">₹{formatInr(row.jobValue)}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                            ₹{formatInr(row.commission)}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-mono font-bold text-emerald-400">
                            ₹{formatInr(row.partnerEarnings)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CUSTOMER COLLECTIONS LEDGER TAB */}
      {activeSubTab === 'collections' && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-teal-400" />
                <span>Partner Customer Collections ({filteredCollections.length})</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Actual amounts collected from customers (Cash, UPI, Approved) with plan rates &amp; deduction breakdown.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  `doorbly_customer_collections_${new Date().toISOString().split('T')[0]}.csv`,
                  [
                    'Booking ID',
                    'Partner',
                    'Estimated Amt',
                    'Actual Collected',
                    'Method',
                    'Payment Ref',
                    'Confirmation',
                    'Plan',
                    'Rate %',
                    'Doorbly Commission',
                    'Partner Net',
                    'Settlement Status',
                    'Collected At'
                  ],
                  filteredCollections.map((tx) => [
                    tx.jobId,
                    partnerMap.get(tx.partnerId)?.name || tx.partnerId,
                    tx.estimatedAmount.toFixed(2),
                    tx.jobValue.toFixed(2),
                    tx.paymentMethod.toUpperCase(),
                    tx.paymentReference || 'N/A',
                    tx.confirmationMode.toUpperCase(),
                    tx.planCode,
                    tx.commissionPercent,
                    tx.commissionAmount.toFixed(2),
                    tx.partnerEarnings.toFixed(2),
                    tx.settlementStatus.toUpperCase(),
                    tx.completedAt
                  ])
                )
              }
              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <input
            type="text"
            value={collectionSearch}
            onChange={(e) => setCollectionSearch(e.target.value)}
            placeholder="Search by booking ID, partner name, payment method or TXN ref..."
            className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:border-teal-500 focus:outline-hidden"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                  <th className="py-2.5 pr-2">Booking / Partner</th>
                  <th className="py-2.5 px-2 text-right">Est. vs Actual</th>
                  <th className="py-2.5 px-2">Method &amp; Ref</th>
                  <th className="py-2.5 px-2">Confirm</th>
                  <th className="py-2.5 px-2">Plan Rate</th>
                  <th className="py-2.5 px-2 text-right">Doorbly Fee</th>
                  <th className="py-2.5 px-2 text-right">Partner Net</th>
                  <th className="py-2.5 pl-2 text-right">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredCollections.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      No customer collections recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredCollections.map((tx) => (
                    <tr key={tx.jobId} className="hover:bg-slate-900/50">
                      <td className="py-2.5 pr-2">
                        <div className="font-mono text-white text-[11px]">#{tx.jobId.substring(0, 8)}</div>
                        <div className="text-[10px] text-slate-400">
                          {partnerMap.get(tx.partnerId)?.name || tx.partnerId.substring(0, 12)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono">
                        <div className="font-bold text-white">₹{formatInr(tx.jobValue)}</div>
                        {Math.abs(tx.estimatedAmount - tx.jobValue) > 0.01 && (
                          <div className="text-[10px] text-slate-500">Est: ₹{formatInr(tx.estimatedAmount)}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="uppercase font-bold text-teal-300 text-[10px]">
                          {tx.paymentMethod.replace('_', ' ')}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {tx.paymentReference || 'Cash Drawer'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 uppercase text-[10px] font-bold text-slate-300">
                        {tx.confirmationMode}
                      </td>
                      <td className="py-2.5 px-2 text-[11px]">
                        <span className="capitalize font-bold text-white">{tx.planCode}</span>{' '}
                        <span className="text-teal-400">({tx.commissionPercent}%)</span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                        ₹{formatInr(tx.commissionAmount)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-400">
                        ₹{formatInr(tx.partnerEarnings)}
                      </td>
                      <td className="py-2.5 pl-2 text-right text-[10px] text-slate-400">
                        {new Date(tx.completedAt).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COMMISSION SETTLEMENTS RECONCILIATION TAB */}
      {activeSubTab === 'settlements' && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-teal-400" />
                <span>Commission Settlements Reconciliation ({filteredSettlements.length})</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Verify partner remittance UTR/TXN references before reducing Doorbly outstanding commission.
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'pending_verification', 'verified', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSettlementFilter(st)}
                  className={`py-1 px-2.5 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${
                    settlementFilter === st
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  exportCsv(
                    `doorbly_commission_settlements_${new Date().toISOString().split('T')[0]}.csv`,
                    ['Receipt #', 'Partner', 'Amount', 'Method', 'Payment Reference', 'Status', 'Verified By', 'Created At'],
                    filteredSettlements.map((s) => [
                      s.receipt_number,
                      partnerMap.get(s.partner_id)?.name || s.partner_id,
                      Number(s.amount).toFixed(2),
                      s.payment_method,
                      s.payment_reference,
                      s.verification_status,
                      s.verified_by || 'Pending',
                      s.created_at
                    ])
                  )
                }
                className="py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1 cursor-pointer text-[10px]"
              >
                <Download className="w-3 h-3" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                  <th className="py-2.5 pr-2">Receipt #</th>
                  <th className="py-2.5 px-2">Partner</th>
                  <th className="py-2.5 px-2 text-right">Amount</th>
                  <th className="py-2.5 px-2">Method &amp; UTR / TXN Ref</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2">Submitted / Notes</th>
                  <th className="py-2.5 pl-2 text-right">Reconcile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredSettlements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      No commission settlements found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredSettlements.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 pr-2 font-mono font-bold text-teal-400">{s.receipt_number}</td>
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-white">
                          {partnerMap.get(s.partner_id)?.name || s.partner_id.substring(0, 12)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.partner_id.substring(0, 10)}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-400">
                        ₹{formatInr(Number(s.amount) || 0)}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="uppercase text-[10px] font-bold text-slate-200">
                          {s.payment_method.replace('_', ' ')}
                        </div>
                        <div className="font-mono text-[10px] text-teal-300">{s.payment_reference}</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            s.verification_status === 'verified'
                              ? 'bg-emerald-950 text-emerald-400'
                              : s.verification_status === 'pending_verification'
                              ? 'bg-amber-950 text-amber-400'
                              : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {s.verification_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-[10px] text-slate-400">
                        <div>{new Date(s.created_at).toLocaleString('en-IN')}</div>
                        {s.verified_by && <div className="text-emerald-400">By: {s.verified_by}</div>}
                        {s.notes && <div className="text-slate-400 italic truncate max-w-[180px]">{s.notes}</div>}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        {s.verification_status === 'pending_verification' ? (
                          <div className="inline-flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              disabled={processingId === s.id}
                              onClick={() => void handleVerifySettlement(s)}
                              className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                              <span>Verify &amp; Settle</span>
                            </button>
                            <button
                              type="button"
                              disabled={processingId === s.id}
                              onClick={() => {
                                setRejectReasonInput('');
                                setRejectTarget({ kind: 'settlement', id: s.id, label: s.receipt_number });
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-rose-200 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold">Reconciled</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENTS & INVOICES TAB (Subscription Upgrades Verified Strictly Before Activation) */}
      {activeSubTab === 'payments' && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-white">
                Subscription Upgrade Requests &amp; Fee Invoices ({filteredPayments.length})
              </h3>
              <p className="text-[11px] text-slate-400">
                Maintained strictly separately from job commissions. Pending paid upgrades activate only after payment verification.
              </p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(['all', 'pending', 'completed', 'failed', 'refunded'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setPaymentFilter(st)}
                  className={`py-1 px-2.5 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                    paymentFilter === st
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  exportCsv(
                    `doorbly_subscription_payments_${new Date().toISOString().split('T')[0]}.csv`,
                    [
                      'Invoice #',
                      'Request ID',
                      'Partner',
                      'Plan',
                      'Base Amount',
                      'Tax Amount',
                      'Total Amount',
                      'Gateway Ref',
                      'Status',
                      'Verified By',
                      'Created At'
                    ],
                    filteredPayments.map((p) => [
                      p.invoice_number,
                      p.payment_request_id || '—',
                      partnerMap.get(p.partner_id)?.name || p.partner_id,
                      p.plan_code,
                      p.amount_before_tax.toFixed(2),
                      p.tax_amount.toFixed(2),
                      p.total_amount.toFixed(2),
                      p.gateway_payment_reference,
                      p.payment_status,
                      p.verified_by || 'Pending',
                      p.created_at
                    ])
                  )
                }
                className="py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1 cursor-pointer text-[10px]"
              >
                <Download className="w-3 h-3" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                  <th className="py-2.5 pr-2">Invoice / Req #</th>
                  <th className="py-2.5 px-2">Partner</th>
                  <th className="py-2.5 px-2">Plan</th>
                  <th className="py-2.5 px-2">UTR / TXN Ref</th>
                  <th className="py-2.5 px-2">Base + Tax</th>
                  <th className="py-2.5 px-2">Total</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 pl-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/50">
                    <td className="py-2.5 pr-2">
                      <div className="font-mono font-bold text-teal-400">{p.invoice_number}</div>
                      {p.payment_request_id && (
                        <div className="font-mono text-[10px] text-slate-500">{p.payment_request_id}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-slate-200">
                      {partnerMap.get(p.partner_id)?.name || p.partner_id.substring(0, 12)}
                    </td>
                    <td className="py-2.5 px-2 capitalize font-bold text-white">{p.plan_code}</td>
                    <td className="py-2.5 px-2 font-mono text-[10px]">
                      <span
                        className={
                          p.gateway_payment_reference === 'AWAITING_PAYMENT'
                            ? 'text-amber-400'
                            : 'text-slate-200'
                        }
                      >
                        {p.gateway_payment_reference}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[11px]">
                      ₹{p.amount_before_tax.toFixed(2)} + ₹{p.tax_amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 font-mono font-bold text-emerald-400">
                      ₹{p.total_amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          p.payment_status === 'completed'
                            ? 'bg-emerald-950 text-emerald-400'
                            : p.payment_status === 'pending'
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {p.payment_status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                        {p.payment_status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={
                                processingId === p.id || p.gateway_payment_reference === 'AWAITING_PAYMENT'
                              }
                              onClick={() => void handleVerifySubscriptionPayment(p)}
                              title={
                                p.gateway_payment_reference === 'AWAITING_PAYMENT'
                                  ? 'Partner has not submitted a payment reference yet'
                                  : 'Verify payment reference & activate upgraded plan'
                              }
                              className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                            >
                              <Check className="w-3 h-3" />
                              <span>Verify &amp; Activate</span>
                            </button>
                            <button
                              type="button"
                              disabled={processingId === p.id}
                              onClick={() => {
                                setRejectReasonInput('');
                                setRejectTarget({
                                  kind: 'payment',
                                  id: p.id,
                                  label: p.payment_request_id || p.invoice_number
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-rose-200 font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewInvoicePayment(p)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-teal-300 border border-slate-700 cursor-pointer inline-flex items-center gap-1"
                          title="View Official Tax Invoice"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold">Invoice</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JOB COMMISSIONS IMMUTABLE LEDGER TAB */}
      {activeSubTab === 'commissions' && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm text-white">
                Immutable Job Commission Snapshots ({unifiedCompletedTxns.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Permanent booking transaction snapshots (one record per completed job). Changes to future plan rates never alter past snapshots.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  `doorbly_commission_snapshots_${new Date().toISOString().split('T')[0]}.csv`,
                  [
                    'Job ID',
                    'Partner',
                    'Plan at Txn',
                    'Actual Collection',
                    'Comm %',
                    'Doorbly Commission',
                    'Partner Net',
                    'Method',
                    'Settlement Status',
                    'Completed At'
                  ],
                  unifiedCompletedTxns.map((c) => [
                    c.jobId,
                    partnerMap.get(c.partnerId)?.name || c.partnerId,
                    c.planCode,
                    c.jobValue.toFixed(2),
                    c.commissionPercent,
                    c.commissionAmount.toFixed(2),
                    c.partnerEarnings.toFixed(2),
                    c.paymentMethod,
                    c.settlementStatus,
                    c.completedAt
                  ])
                )
              }
              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
                  <th className="py-2.5 pr-2">Job ID</th>
                  <th className="py-2.5 px-2">Partner</th>
                  <th className="py-2.5 px-2">Plan at Txn</th>
                  <th className="py-2.5 px-2">Actual Collected</th>
                  <th className="py-2.5 px-2">Comm %</th>
                  <th className="py-2.5 px-2">Doorbly Fee</th>
                  <th className="py-2.5 px-2">Partner Net</th>
                  <th className="py-2.5 px-2">Settlement</th>
                  <th className="py-2.5 pl-2 text-right">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {unifiedCompletedTxns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-500">
                      No completed booking commission snapshots yet.
                    </td>
                  </tr>
                ) : (
                  unifiedCompletedTxns.map((c) => (
                    <tr key={c.jobId} className="hover:bg-slate-900/50">
                      <td className="py-2.5 pr-2 font-mono text-[11px] text-slate-200">
                        #{c.jobId.substring(0, 8)}
                      </td>
                      <td className="py-2.5 px-2 text-slate-300">
                        {partnerMap.get(c.partnerId)?.name || c.partnerId.substring(0, 10)}
                      </td>
                      <td className="py-2.5 px-2 font-bold uppercase text-white">{c.planCode}</td>
                      <td className="py-2.5 px-2 font-mono">₹{formatInr(c.jobValue)}</td>
                      <td className="py-2.5 px-2 font-bold text-teal-400">{c.commissionPercent}%</td>
                      <td className="py-2.5 px-2 font-mono font-bold text-amber-400">
                        ₹{formatInr(c.commissionAmount)}
                      </td>
                      <td className="py-2.5 px-2 font-mono font-bold text-emerald-400">
                        ₹{formatInr(c.partnerEarnings)}
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            c.settlementStatus === 'settled'
                              ? 'bg-emerald-950 text-emerald-400'
                              : 'bg-amber-950 text-amber-400'
                          }`}
                        >
                          {c.settlementStatus}
                        </span>
                      </td>
                      <td className="py-2.5 pl-2 text-right text-[11px] text-slate-400">
                        {new Date(c.completedAt).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clean Rejection Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReject}
            className="bg-slate-900 rounded-3xl max-w-sm w-full p-5 border border-slate-700 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="font-black text-sm text-white">
                Reject {rejectTarget.kind === 'payment' ? 'Subscription Payment' : 'Commission Settlement'}
              </div>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-300">
              Provide a clear audit reason for rejecting{' '}
              <span className="font-mono font-bold text-teal-400">{rejectTarget.label}</span>:
            </p>
            <textarea
              required
              rows={3}
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder="e.g. UTR reference not found in bank statement or mismatched amount..."
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:border-rose-500 focus:outline-hidden"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingId === rejectTarget.id}
                className="py-2 px-4 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold cursor-pointer disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invoice Viewer Modal */}
      {viewInvoicePayment && (
        <InvoiceModal
          payment={viewInvoicePayment}
          plan={plans.find((p) => p.plan_code === viewInvoicePayment.plan_code)}
          taxConfig={taxConfig}
          partnerName={partnerMap.get(viewInvoicePayment.partner_id)?.name}
          partnerPhone={partnerMap.get(viewInvoicePayment.partner_id)?.mobile}
          onClose={() => setViewInvoicePayment(null)}
        />
      )}
    </div>
  );
};
