import React, { useState } from 'react';
import { SubscriptionPlan, TaxConfiguration, SubscriptionPayment } from '../../types';
import { subscriptionService, PriceBreakdown, DEFAULT_TAX_CONFIG } from '../../services/subscriptionService';
import { usePartner } from '../../context/PartnerContext';
import {
  X,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Smartphone,
  Lock,
  Loader2,
  ArrowRight,
  Clock,
  ShieldCheck,
  Building
} from 'lucide-react';
import { InvoiceModal } from './InvoiceModal';

import starterIllustration from '../../assets/images/plan_starter_illustration_1792949301105.jpg';
import growthIllustration from '../../assets/images/plan_growth_illustration_1792949317578.jpg';
import professionalIllustration from '../../assets/images/plan_professional_illustration_1792949333786.jpg';

const PLAN_ILLUSTRATIONS: Record<string, string> = {
  starter: starterIllustration,
  growth: growthIllustration,
  professional: professionalIllustration
};

interface SubscriptionCheckoutModalProps {
  plan: SubscriptionPlan;
  taxConfig: TaxConfiguration | null;
  pendingPayment?: SubscriptionPayment | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubscriptionCheckoutModal: React.FC<SubscriptionCheckoutModalProps> = ({
  plan,
  taxConfig,
  pendingPayment = null,
  onClose,
  onSuccess
}) => {
  const {
    partner,
    activeSubscription,
    createSubscriptionUpgradeRequest,
    submitSubscriptionPaymentProof
  } = usePartner();

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'free'>(
    plan.monthly_price === 0 ? 'free' : 'upi'
  );
  const [step, setStep] = useState<'review' | 'submit_proof' | 'submitted'>(
    pendingPayment ? 'submit_proof' : 'review'
  );
  const [activePaymentReq, setActivePaymentReq] = useState<SubscriptionPayment | null>(
    pendingPayment
  );
  const [txnRefInput, setTxnRefInput] = useState<string>(
    pendingPayment?.gateway_payment_reference &&
      pendingPayment.gateway_payment_reference !== 'AWAITING_PAYMENT'
      ? pendingPayment.gateway_payment_reference
      : ''
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [completedPayment, setCompletedPayment] = useState<SubscriptionPayment | null>(null);

  const effectiveTaxConfig: TaxConfiguration = taxConfig || DEFAULT_TAX_CONFIG;
  const breakdown: PriceBreakdown = subscriptionService.calculateBreakdown(
    plan,
    effectiveTaxConfig
  );
  const isStarter = plan.plan_code === 'starter' || plan.monthly_price === 0;

  const currentCommissionPct = activeSubscription?.commission_percent ?? 20;
  const currentPlanName = activeSubscription?.plan_name || 'Starter';
  const currentKeepPer1000 = Math.round(1000 - (1000 * currentCommissionPct) / 100);
  const extraKeepPer1000 = breakdown.partner_retention_per_1000 - currentKeepPer1000;

  const selectedGatewayLabel =
    paymentMethod === 'upi'
      ? 'UPI / BHIM / QR Gateway'
      : paymentMethod === 'card'
      ? 'Credit / Debit Card Gateway'
      : 'Bank Transfer (IMPS / NEFT)';

  // Step 1: Starter activates directly; Paid plans ONLY create a pending payment request (never early activation)
  const handleGeneratePaymentRequest = async () => {
    if (!acceptedTerms) {
      setPaymentError('Please accept the Doorbly Partner Subscription terms and conditions to proceed.');
      return;
    }

    setPaymentError(null);
    setIsProcessing(true);

    try {
      const res = await createSubscriptionUpgradeRequest(plan.plan_code, {
        paymentGateway: isStarter ? 'Free Starter Tier' : selectedGatewayLabel,
        durationDays: isStarter ? 365 : 30
      });

      if (!res.success) {
        setPaymentError(res.message || 'Could not generate payment request.');
        setIsProcessing(false);
        return;
      }

      if (res.isFreeActivation) {
        setIsProcessing(false);
        onSuccess();
        onClose();
        return;
      }

      if (res.payment) {
        setActivePaymentReq(res.payment);
        setStep('submit_proof');
      }
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to create upgrade request.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Partner submits genuine UTR / Gateway transaction reference for verification
  const handleVerifyAndSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaymentReq) return;
    setPaymentError(null);

    if (txnRefInput.trim().length < 8) {
      setPaymentError('Please enter a valid 8+ character alphanumeric UPI UTR / Gateway Transaction Reference ID.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await submitSubscriptionPaymentProof(
        activePaymentReq.id,
        txnRefInput.trim(),
        selectedGatewayLabel
      );

      if (!res.success) {
        setPaymentError(res.message || 'Could not submit payment reference.');
        return;
      }

      if (res.verifiedAndActivated && res.payment) {
        setCompletedPayment(res.payment);
        onSuccess();
      } else {
        if (res.payment) setActivePaymentReq(res.payment);
        setStep('submitted');
        onSuccess();
      }
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Verification submission failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (completedPayment) {
    return (
      <InvoiceModal
        payment={completedPayment}
        plan={plan}
        taxConfig={taxConfig}
        partnerName={partner?.name}
        partnerPhone={partner?.mobile}
        onClose={() => {
          setCompletedPayment(null);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        {/* Modal Illustration Header */}
        <div className="relative h-28 w-full overflow-hidden bg-slate-900 border-b border-slate-100">
          <img
            src={PLAN_ILLUSTRATIONS[plan.plan_code] || starterIllustration}
            alt={plan.plan_name}
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />

          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white z-10">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-300 block">
                {step === 'review'
                  ? 'STEP 1 · PLAN & TAX BREAKDOWN'
                  : step === 'submit_proof'
                  ? 'STEP 2 · VERIFY PAYMENT PROOF'
                  : 'PENDING VERIFICATION'}
              </span>
              <h3 className="text-lg font-black tracking-tight text-white leading-tight">
                {plan.plan_name} Plan
              </h3>
            </div>
            <div className="text-right">
              <span className="text-xl font-black font-mono leading-none block">
                {plan.monthly_price === 0 ? '₹0' : `₹${breakdown.total_payable.toFixed(2)}`}
              </span>
              <span className="text-[10px] text-white/80">
                {plan.monthly_price === 0 ? 'Free Forever' : 'Incl. Applicable GST'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md text-white/90 hover:text-white flex items-center justify-center transition-colors cursor-pointer z-20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: Plan Comparison + Tax Breakdown */}
        {step === 'review' && (
          <>
            <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto text-xs text-slate-700">
              {/* Current Plan vs Selected Upgrade Comparison */}
              <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-100 space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase text-slate-500 font-bold block">Current Plan</span>
                    <span className="font-bold text-slate-900">
                      {currentPlanName} ({currentCommissionPct}%)
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#0F766E] shrink-0" />
                  <div className="text-right min-w-0">
                    <span className="text-[10px] uppercase text-teal-700 font-bold block">Upgrading To</span>
                    <span className="font-black text-[#0F766E]">
                      {plan.plan_name} ({plan.commission_percent}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-teal-200/70 text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">You Keep Per ₹1,000</span>
                    <span className="font-extrabold text-emerald-800 text-xs font-mono">
                      ₹{breakdown.partner_retention_per_1000} ({breakdown.partner_retention_percent}%)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px]">Commission Savings</span>
                    <span
                      className={`font-extrabold text-xs font-mono ${
                        extraKeepPer1000 >= 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {extraKeepPer1000 > 0
                        ? `+₹${extraKeepPer1000} / job`
                        : extraKeepPer1000 === 0
                        ? 'Same Rate'
                        : `₹${extraKeepPer1000} / job`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Plan Key Benefits Checklist */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Plan Benefits Included
                </span>
                <div className="space-y-1">
                  {plan.benefits.map((benefit, i) => (
                    <div key={i} className="flex items-start gap-2 text-slate-600 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transparent Price & Tax Breakdown */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/90 space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Subscription Fee &amp; Applicable Tax
                </span>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Monthly Plan Fee (30 Days):</span>
                  <span className="font-mono font-bold text-slate-900">
                    ₹{breakdown.monthly_price.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Applicable Tax ({breakdown.tax_rate_percent}% GST):</span>
                  <span className="font-mono font-semibold text-slate-800">
                    ₹{breakdown.tax_amount.toFixed(2)}
                  </span>
                </div>

                {breakdown.tax_amount > 0 && (
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 px-2.5 py-1.5 bg-slate-100 rounded-lg">
                    <span>CGST ({breakdown.tax_rate_percent / 2}%): ₹{breakdown.cgst_amount.toFixed(2)}</span>
                    <span className="text-right">SGST ({breakdown.tax_rate_percent / 2}%): ₹{breakdown.sgst_amount.toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-black text-slate-900 text-sm">
                  <span className="text-[#0F766E]">Total Payable:</span>
                  <span className="font-mono text-base text-[#0F766E]">
                    ₹{breakdown.total_payable.toFixed(2)}
                  </span>
                </div>

                <p className="text-[10px] text-slate-500 leading-tight pt-1">
                  * New {plan.commission_percent}% commission rate takes effect ONLY after payment verification, without modifying historical bookings.
                </p>
              </div>

              {/* Preferred Payment Method Selector */}
              {!isStarter && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Choose Payment Channel
                  </span>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('upi')}
                      className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                        paymentMethod === 'upi'
                          ? 'bg-teal-50 border-[#0F766E] text-[#0F766E]'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Smartphone className="w-4 h-4 text-[#0F766E]" />
                      <div className="font-bold text-[11px]">UPI / QR</div>
                      <div className="text-[9px] text-slate-500">GPay, PhonePe</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                        paymentMethod === 'card'
                          ? 'bg-teal-50 border-[#0F766E] text-[#0F766E]'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-[#0F766E]" />
                      <div className="font-bold text-[11px]">Card</div>
                      <div className="text-[9px] text-slate-500">Gateway Ref</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('netbanking')}
                      className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                        paymentMethod === 'netbanking'
                          ? 'bg-teal-50 border-[#0F766E] text-[#0F766E]'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Building className="w-4 h-4 text-[#0F766E]" />
                      <div className="font-bold text-[11px]">IMPS / NEFT</div>
                      <div className="text-[9px] text-slate-500">Bank Transfer</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Terms Acceptance */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 rounded text-[#0F766E] focus:ring-[#0F766E]"
                />
                <span>
                  I accept Doorbly Partner Subscription terms: paid plans activate only upon payment verification, apply {plan.commission_percent}% commission from activation forward, and preserve past job records.
                </span>
              </label>

              {paymentError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}
            </div>

            {/* Footer CTA */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Total Payable</span>
                <span className="font-extrabold text-sm text-slate-900 font-mono">
                  ₹{breakdown.total_payable.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="py-2 px-3 rounded-lg border border-slate-300 text-slate-600 font-semibold text-[11px] hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleGeneratePaymentRequest}
                  disabled={isProcessing}
                  className="py-2 px-3.5 rounded-lg bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-[11px] shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Request...</span>
                    </>
                  ) : isStarter ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Activate Starter</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Generate Payment Request</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* STEP 2: Real Payment Submission & Reference Verification */}
        {step === 'submit_proof' && activePaymentReq && (
          <form onSubmit={handleVerifyAndSubmitProof} className="p-5 space-y-4 text-xs text-slate-700">
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-800">
                  Payment Request Created
                </span>
                <span className="font-mono font-bold text-amber-950">
                  {activePaymentReq.payment_request_id || activePaymentReq.invoice_number}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-800 pt-1 border-t border-amber-200/70">
                <span>Payable Total (incl. GST):</span>
                <span className="font-mono font-black text-base text-[#0F766E]">
                  ₹{activePaymentReq.total_amount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Merchant Payment Instructions */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Doorbly Official Merchant Account
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Merchant UPI ID</span>
                  <span className="font-mono font-bold text-slate-900 select-all">doorbly.pay@icici</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Invoice Ref #</span>
                  <span className="font-mono font-bold text-slate-900">{activePaymentReq.invoice_number}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Complete the payment of <strong>₹{activePaymentReq.total_amount.toFixed(2)}</strong> via UPI / Gateway, then enter your transaction UTR / Reference ID below for verification.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">
                UPI UTR / Gateway Transaction Reference *
              </label>
              <input
                type="text"
                required
                value={txnRefInput}
                onChange={(e) => setTxnRefInput(e.target.value)}
                placeholder="e.g. 419283746510 (min 8 characters)"
                className="w-full p-3 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden font-mono text-xs font-bold"
                autoFocus
              />
            </div>

            {paymentError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Pay Later
              </button>
              <button
                type="submit"
                disabled={isProcessing || txnRefInput.trim().length < 8}
                className="flex-1 py-3 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Submit for Verification</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Pending Verification Confirmation (Never falsely activated!) */}
        {step === 'submitted' && activePaymentReq && (
          <div className="p-6 text-center space-y-4 text-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-base text-slate-900">
                Payment Reference Submitted
              </h4>
              <p className="text-slate-600 mt-1 leading-relaxed">
                Transaction Ref <strong className="font-mono text-slate-900">{activePaymentReq.gateway_payment_reference}</strong> for Request{' '}
                <strong className="font-mono text-slate-900">{activePaymentReq.payment_request_id}</strong> is now pending verification.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 text-left space-y-1">
              <div>• Your existing plan remains active until payment verification completes.</div>
              <div>• Once verified by Payment Gateway or Admin, your {plan.plan_name} ({plan.commission_percent}% commission) plan activates immediately and your GST invoice unlocks.</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-extrabold text-xs cursor-pointer"
            >
              Done &amp; Return to My Subscription
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
