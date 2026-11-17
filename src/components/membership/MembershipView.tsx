import React, { useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { DEFAULT_SUBSCRIPTION_PLANS, subscriptionService, DEFAULT_TAX_CONFIG } from '../../services/subscriptionService';
import { SubscriptionPayment, SubscriptionPlan } from '../../types';
import { AtmSubscriptionCards } from '../subscription/AtmSubscriptionCards';
import { SubscriptionCheckoutModal } from '../subscription/SubscriptionCheckoutModal';
import { InvoiceModal } from '../subscription/InvoiceModal';
import { ProcessingLoader } from '../common/ProcessingLoader';
import {
  ShieldCheck,
  FileText,
  Download,
  ArrowUpRight,
  Clock,
  History,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export const MembershipView: React.FC = () => {
  const {
    partner,
    activeSubscription,
    subscriptionPlans,
    taxConfig,
    subscriptionHistory,
    subscriptionPayments,
    isSupabaseSyncing,
    refreshAll
  } = usePartner();

  const plans: SubscriptionPlan[] =
    subscriptionPlans && subscriptionPlans.length > 0
      ? subscriptionPlans
      : DEFAULT_SUBSCRIPTION_PLANS;

  const [selectedInvoice, setSelectedInvoice] = useState<SubscriptionPayment | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<{
    plan: SubscriptionPlan;
    pendingPayment?: SubscriptionPayment | null;
  } | null>(null);

  const currentPlanDef = plans.find(
    (p) =>
      p.id === activeSubscription?.plan_id ||
      p.plan_code === (activeSubscription?.plan_code || 'starter')
  );
  const currentMonthlyPrice = currentPlanDef?.monthly_price ?? 0;
  const isStarter = (activeSubscription?.plan_code || 'starter') === 'starter';
  const daysRemaining = activeSubscription?.expires_at
    ? Math.max(0, Math.ceil((new Date(activeSubscription.expires_at).getTime() - Date.now()) / 86400000))
    : 0;

  const pendingPayments = subscriptionPayments.filter((p) => p.payment_status === 'pending');

  // Recommended next upgrade target
  const nextUpgradePlan =
    plans.find(
      (p) =>
        p.monthly_price > currentMonthlyPrice &&
        p.is_active
    ) || currentPlanDef || plans[0];

  const handleOpenPendingProof = (payment: SubscriptionPayment) => {
    const planDef =
      plans.find((p) => p.id === payment.plan_id || p.plan_code === payment.plan_code) ||
      plans[0];
    setCheckoutTarget({ plan: planDef, pendingPayment: payment });
  };

  return (
    <div className="space-y-5 pb-24 text-slate-800">
      {/* View Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="text-xs uppercase font-extrabold text-[#0F766E] tracking-wider">
            PARTNER SUBSCRIPTION &amp; COMMISSIONS
          </span>
          <h2 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
            My Subscription
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Upgrade or renew your subscription plan to lower Doorbly commissions. Paid upgrades activate only after verified payment and apply strictly from the activation date forward.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refreshAll()}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSupabaseSyncing ? 'animate-spin' : ''}`} />
          <span>Sync</span>
        </button>
      </div>

      {/* Active Subscription Summary Banner */}
      {activeSubscription && (
        <div className="bg-gradient-to-br from-[#0F766E] to-teal-800 text-white rounded-3xl p-5 shadow-md relative overflow-hidden space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-300" />
              <span className="font-extrabold text-xs uppercase tracking-wider text-teal-100">
                CURRENT SUBSCRIPTION PLAN
              </span>
            </div>

            <span
              className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border backdrop-blur-xs ${
                activeSubscription.status === 'active'
                  ? 'bg-emerald-400/20 text-emerald-100 border-emerald-300/40'
                  : activeSubscription.status === 'suspended'
                  ? 'bg-rose-500/30 text-rose-100 border-rose-300/40'
                  : 'bg-amber-400/25 text-amber-100 border-amber-300/40'
              }`}
            >
              STATUS: {activeSubscription.status.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-2xl font-black tracking-tight capitalize">
                {activeSubscription.plan_name} Plan
              </div>
              <p className="text-xs text-teal-100 mt-0.5">
                Monthly Subscription Price:{' '}
                <strong>
                  {currentMonthlyPrice === 0 ? '₹0 / month' : `₹${currentMonthlyPrice} / month + tax`}
                </strong>
                {' · '}Commission: <strong>{activeSubscription.commission_percent}%</strong>
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase font-bold text-teal-200 block">
                Partner Net Retention
              </span>
              <span className="text-xl font-black text-amber-300">
                {100 - activeSubscription.commission_percent}%
              </span>
            </div>
          </div>

          {/* Dates & Upgrade/Renew CTA Grid */}
          <div className="pt-3 border-t border-teal-600/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs items-center">
            <div>
              <span className="text-teal-200 block text-[10px] uppercase font-bold">Activation Date</span>
              <span className="font-semibold text-white">
                {activeSubscription.start_at
                  ? new Date(activeSubscription.start_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })
                  : 'Active'}
              </span>
            </div>

            <div>
              <span className="text-teal-200 block text-[10px] uppercase font-bold">Expiry Date</span>
              <span className="font-semibold text-white">
                {activeSubscription.expires_at
                  ? new Date(activeSubscription.expires_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })
                  : 'N/A'}
              </span>
            </div>

            <div>
              <span className="text-teal-200 block text-[10px] uppercase font-bold">Remaining Validity</span>
              <span className="font-bold text-amber-300">
                {activeSubscription.status === 'suspended'
                  ? 'Suspended'
                  : activeSubscription.status === 'expired'
                  ? 'Expired — Renew Now'
                  : isStarter
                  ? 'Active (Free)'
                  : `${daysRemaining} Days`}
              </span>
            </div>

            <div className="flex sm:justify-end gap-1.5">
              {!isStarter && currentPlanDef && (
                <button
                  type="button"
                  onClick={() => setCheckoutTarget({ plan: currentPlanDef })}
                  className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] cursor-pointer"
                >
                  Renew
                </button>
              )}
              {nextUpgradePlan && nextUpgradePlan.plan_code !== activeSubscription.plan_code && (
                <button
                  type="button"
                  onClick={() => setCheckoutTarget({ plan: nextUpgradePlan })}
                  className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <span>Upgrade</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pending Payment Requests Banner (awaiting UTR or Admin/Gateway verification) */}
      {pendingPayments.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Pending Subscription Upgrade Payment Verification ({pendingPayments.length})</span>
          </div>
          <p className="text-[11px] text-amber-800">
            Paid plans remain inactive until transaction payment is verified. Submit or update your UPI UTR / Gateway reference below if you have paid.
          </p>

          <div className="space-y-2">
            {pendingPayments.map((pay) => {
              const hasProof =
                pay.gateway_payment_reference &&
                pay.gateway_payment_reference !== 'AWAITING_PAYMENT';
              return (
                <div
                  key={pay.id}
                  className="bg-white rounded-xl p-3 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span className="uppercase">{pay.plan_code} Plan</span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {pay.payment_request_id || pay.invoice_number}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Payable: <strong className="font-mono">₹{pay.total_amount.toFixed(2)}</strong> ·{' '}
                      {hasProof ? (
                        <span className="text-emerald-700 font-semibold">
                          UTR Submitted: <span className="font-mono">{pay.gateway_payment_reference}</span> (Awaiting Verification)
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">Awaiting Payment Reference / UTR</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenPendingProof(pay)}
                    className="px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-[11px] cursor-pointer"
                  >
                    {hasProof ? 'Update UTR Ref' : 'Enter Payment Ref'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscription Cards Section */}
      <div className="space-y-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
            Upgrade or Renew Subscription Plan
          </h3>
          <p className="text-[11px] text-slate-500">
            Tap any plan card below to compare rates, view GST breakdown, and initiate an upgrade.
          </p>
        </div>

        <AtmSubscriptionCards onPlanActivated={refreshAll} />
      </div>

      {/* Detailed Plan Comparison Table with Direct Upgrade/Renew Actions */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3.5">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">
            Subscription Plan Comparison
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare monthly pricing, GST applicability, and commission retention across all available plans.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-2 font-bold">Benefit / Metric</th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    className={`py-2.5 px-2 text-center font-bold ${
                      plan.is_recommended
                        ? 'text-[#0F766E] bg-teal-50/50 rounded-t-lg'
                        : plan.plan_code === 'professional'
                        ? 'text-purple-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {plan.plan_name}
                    {plan.is_recommended ? ' (Rec.)' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
              <tr>
                <td className="py-2.5 pr-2 font-semibold">Monthly Price</td>
                {plans.map((plan) => (
                  <td
                    key={plan.id}
                    className={`py-2.5 px-2 text-center font-mono font-bold ${
                      plan.is_recommended ? 'text-[#0F766E] bg-teal-50/50' : ''
                    }`}
                  >
                    {plan.monthly_price === 0 ? '₹0' : `₹${plan.monthly_price} + tax`}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 pr-2 font-semibold">Total Incl. GST</td>
                {plans.map((plan) => {
                  const bd = subscriptionService.calculateBreakdown(plan, taxConfig || DEFAULT_TAX_CONFIG);
                  return (
                    <td
                      key={plan.id}
                      className={`py-2.5 px-2 text-center font-mono ${
                        plan.is_recommended ? 'bg-teal-50/50' : ''
                      }`}
                    >
                      ₹{bd.total_payable.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="py-2.5 pr-2 font-semibold">Doorbly Commission</td>
                {plans.map((plan) => (
                  <td
                    key={plan.id}
                    className={`py-2.5 px-2 text-center font-bold ${
                      plan.is_recommended ? 'text-[#0F766E] bg-teal-50/50' : 'text-rose-600'
                    }`}
                  >
                    {plan.commission_percent}%
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 pr-2 font-semibold">Partner Keeps on ₹1,000</td>
                {plans.map((plan) => {
                  const keepPer1000 = Math.round(1000 - (1000 * plan.commission_percent) / 100);
                  return (
                    <td
                      key={plan.id}
                      className={`py-2.5 px-2 text-center font-mono font-bold ${
                        plan.is_recommended ? 'text-[#0F766E] bg-teal-50/50' : 'text-slate-900'
                      }`}
                    >
                      ₹{keepPer1000} ({100 - plan.commission_percent}%)
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="py-3 pr-2 font-semibold">Action</td>
                {plans.map((plan) => {
                  const isCurrent =
                    activeSubscription?.plan_code === plan.plan_code &&
                    activeSubscription?.status === 'active';
                  return (
                    <td
                      key={plan.id}
                      className={`py-3 px-2 text-center ${
                        plan.is_recommended ? 'bg-teal-50/50 rounded-b-lg' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setCheckoutTarget({ plan })}
                        className={`px-3 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer ${
                          isCurrent
                            ? 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                            : 'bg-[#0F766E] hover:bg-teal-700 text-white'
                        }`}
                      >
                        {isCurrent ? 'Renew Plan' : plan.monthly_price === 0 ? 'Switch' : 'Upgrade'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Previous & Current Subscription History */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-[#0F766E]" />
              <span>Subscription Plan History ({subscriptionHistory.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete audit trail of active, past, and expired subscription cycles.
            </p>
          </div>
        </div>

        {subscriptionHistory.length === 0 ? (
          <div className="p-4 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
            Active on Starter Tier. Upgraded subscription periods are archived here.
          </div>
        ) : (
          <div className="space-y-2">
            {subscriptionHistory.map((sub) => (
              <div
                key={sub.id}
                className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900">{sub.plan_name}</span>
                    <span className="font-mono text-[11px] font-bold text-[#0F766E]">
                      {sub.commission_percent}% Fee
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                        sub.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sub.status === 'pending_payment'
                          ? 'bg-amber-100 text-amber-800'
                          : sub.status === 'suspended'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {sub.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {new Date(sub.start_at).toLocaleDateString('en-IN')} →{' '}
                    {new Date(sub.expires_at).toLocaleDateString('en-IN')}
                    {sub.status_reason ? ` · ${sub.status_reason}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription Payments & Tax Invoices History */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0F766E]" />
              <span>Subscription Payment History &amp; Invoices</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Track payment verification statuses and download official GST invoices.
            </p>
          </div>

          <span className="text-[11px] font-bold text-slate-500">
            {subscriptionPayments.length} {subscriptionPayments.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        {isSupabaseSyncing && subscriptionPayments.length === 0 ? (
          <ProcessingLoader
            variant="panel"
            label="Loading subscription payment history..."
          />
        ) : subscriptionPayments.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">
            No subscription payment requests yet. Paid upgrades generate payment requests and verified GST tax invoices here.
          </div>
        ) : (
          <div className="space-y-2">
            {subscriptionPayments.map((payment) => (
              <div
                key={payment.id}
                className="p-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/60 hover:bg-white transition-colors flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {payment.invoice_number}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                        payment.payment_status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : payment.payment_status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {payment.payment_status}
                    </span>
                  </div>

                  <div className="text-slate-500 text-[11px] mt-1">
                    {payment.plan_code.toUpperCase()} Plan · {payment.payment_gateway} · Ref:{' '}
                    <span className="font-mono">{payment.gateway_payment_reference}</span> ·{' '}
                    {new Date(payment.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </div>

                  {payment.rejection_reason && (
                    <div className="text-[11px] text-rose-700 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>Rejected: {payment.rejection_reason}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-black text-slate-900 font-mono text-sm">
                      ₹{payment.total_amount.toFixed(2)}
                    </div>
                    {payment.tax_amount > 0 && (
                      <div className="text-[10px] text-slate-400">
                        incl. ₹{payment.tax_amount.toFixed(2)} GST
                      </div>
                    )}
                  </div>

                  {payment.payment_status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(payment)}
                      className="p-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#0F766E] border border-teal-200/80 transition-colors cursor-pointer"
                      title="View & Download Invoice"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  ) : payment.payment_status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => handleOpenPendingProof(payment)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] cursor-pointer"
                    >
                      Submit UTR
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Checkout / Verification Modal */}
      {checkoutTarget && (
        <SubscriptionCheckoutModal
          plan={checkoutTarget.plan}
          taxConfig={taxConfig}
          pendingPayment={checkoutTarget.pendingPayment}
          onClose={() => setCheckoutTarget(null)}
          onSuccess={() => {
            refreshAll();
          }}
        />
      )}

      {/* Invoice Viewer Modal */}
      {selectedInvoice && (
        <InvoiceModal
          payment={selectedInvoice}
          plan={plans.find((p) => p.plan_code === selectedInvoice.plan_code)}
          taxConfig={taxConfig}
          partnerName={partner?.name}
          partnerPhone={partner?.mobile}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
};
