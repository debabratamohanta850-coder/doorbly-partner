import React, { useState } from 'react';
import { SubscriptionPlan, PlanCode } from '../../types';
import {
  subscriptionService,
  PriceBreakdown,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_TAX_CONFIG
} from '../../services/subscriptionService';
import { usePartner } from '../../context/PartnerContext';
import { DoorblyLogoIcon } from '../../constants/branding';
import { Check, Sparkles } from 'lucide-react';
import { SubscriptionCheckoutModal } from './SubscriptionCheckoutModal';

interface AtmSubscriptionCardsProps {
  layout?: 'grid' | 'dashboard-carousel';
  onPlanActivated?: () => void;
}

interface PlanAtmConfig {
  planLetter: string;
  cardType: string;
  cardNumber: string;
  cardGradient: string;
  borderStyle: string;
  chipGradient: string;
}

const PLAN_ATM_CONFIGS: Record<PlanCode, PlanAtmConfig> = {
  starter: {
    planLetter: 'PLAN A',
    cardType: 'TITANIUM SMART PASS',
    cardNumber: '4018  7131  0040  1001',
    cardGradient: 'from-slate-900 via-slate-800 to-zinc-950',
    borderStyle: 'border-slate-700/80 hover:border-slate-500 shadow-slate-950/40',
    chipGradient: 'from-amber-300 via-yellow-100 to-amber-500 border-amber-600/70'
  },
  growth: {
    planLetter: 'PLAN B',
    cardType: 'EMERALD PLATINUM DEBIT',
    cardNumber: '5412  8820  0040  2002',
    cardGradient: 'from-[#08332f] via-[#0F766E] to-teal-950',
    borderStyle: 'border-teal-400/80 hover:border-teal-300 shadow-teal-950/50 ring-1 ring-teal-400/40',
    chipGradient: 'from-amber-200 via-yellow-100 to-amber-400 border-amber-500/80'
  },
  professional: {
    planLetter: 'PLAN C',
    cardType: 'OBSIDIAN BLACK ELITE VIP',
    cardNumber: '3782  9940  0040  3003',
    cardGradient: 'from-purple-950 via-slate-950 to-neutral-950',
    borderStyle: 'border-amber-400/70 hover:border-amber-300 shadow-purple-950/50 ring-1 ring-amber-400/35',
    chipGradient: 'from-yellow-200 via-amber-100 to-yellow-500 border-yellow-600/80'
  }
};

export const AtmSubscriptionCards: React.FC<AtmSubscriptionCardsProps> = ({
  layout = 'grid',
  onPlanActivated
}) => {
  const { partner, activeSubscription, subscriptionPlans, taxConfig, refreshAll } = usePartner();
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<SubscriptionPlan | null>(null);

  const plans: SubscriptionPlan[] =
    subscriptionPlans && subscriptionPlans.length > 0
      ? subscriptionPlans
      : DEFAULT_SUBSCRIPTION_PLANS;

  const activePlanCode: PlanCode = activeSubscription?.plan_code || 'starter';

  return (
    <div className="w-full">
      <div
        className={
          layout === 'dashboard-carousel'
            ? 'flex overflow-x-auto snap-x snap-mandatory gap-3.5 pb-1 no-scrollbar'
            : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 justify-items-center'
        }
      >
        {plans.map((plan: SubscriptionPlan) => {
          const config = PLAN_ATM_CONFIGS[plan.plan_code as PlanCode] || PLAN_ATM_CONFIGS.starter;
          const isCurrentPlan = activePlanCode === plan.plan_code && activeSubscription?.status === 'active';
          const isRecommended = Boolean(plan.is_recommended);

          const breakdown: PriceBreakdown = subscriptionService.calculateBreakdown(
            plan,
            taxConfig || DEFAULT_TAX_CONFIG
          );

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlanForCheckout(plan)}
              aria-label={`Select ${plan.plan_name} subscription card`}
              className={`text-left relative overflow-hidden rounded-2xl p-3.5 sm:p-5 text-white flex flex-col justify-between border shadow-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.985] cursor-pointer select-none bg-gradient-to-br min-h-[190px] sm:min-h-[205px] aspect-[1.586/1] ${
                layout === 'dashboard-carousel'
                  ? 'min-w-[288px] w-[calc(100vw-3.25rem)] max-w-[340px] sm:min-w-[320px] sm:w-[330px] shrink-0 snap-center'
                  : 'w-full max-w-[380px]'
              } ${config.cardGradient} ${config.borderStyle}`}
            >
              {/* Glossy ATM Card Surface Reflections */}
              <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-black/40 blur-xl pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/15 via-transparent to-black/40 pointer-events-none" />

              {/* Top Row: Bank/Issuer Branding & Card Status */}
              <div className="relative z-10 flex items-center justify-between gap-2 w-full min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/15 backdrop-blur-md p-1 border border-white/20 flex items-center justify-center shrink-0">
                    <DoorblyLogoIcon className="w-full h-full rounded" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-white leading-none truncate">
                      DOORBLY PAY
                    </div>
                    <div className="text-[8px] font-mono tracking-wider text-white/70 leading-none mt-1 truncate">
                      {config.cardType}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {isCurrentPlan ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-emerald-300 whitespace-nowrap">
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>ACTIVE</span>
                    </span>
                  ) : isRecommended ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-amber-300 whitespace-nowrap">
                      <Sparkles className="w-3 h-3" />
                      <span>POPULAR</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-white/70 whitespace-nowrap">
                      {config.planLetter}
                    </span>
                  )}
                </div>
              </div>

              {/* Middle Row: EMV Chip + Contactless NFC + Tier Commission Info */}
              <div className="relative z-10 flex items-center justify-between w-full gap-2 my-auto py-1 min-w-0">
                <div className="flex items-center gap-2 shrink-0">
                  {/* Metallic Gold EMV Smart Chip */}
                  <div
                    className={`w-9 h-6 sm:w-10 sm:h-7 rounded-md bg-gradient-to-tr ${config.chipGradient} shadow-inner relative overflow-hidden flex flex-col justify-between p-1 shrink-0`}
                  >
                    <div className="w-full h-full border border-amber-800/30 rounded-xs flex items-center justify-between">
                      <div className="w-1.5 h-full border-r border-amber-800/30" />
                      <div className="w-1.5 h-full border-l border-amber-800/30" />
                    </div>
                  </div>

                  {/* Contactless Waves Symbol */}
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 rotate-90 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  </svg>
                </div>

                {/* Clean Card Tier & Retention Summary */}
                <div className="text-right font-mono min-w-0">
                  <div className="text-[11px] sm:text-xs text-white leading-none truncate">
                    {plan.plan_name}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-emerald-300 mt-1 leading-none whitespace-nowrap">
                    {plan.commission_percent}% Fee · Keep {breakdown.partner_retention_percent}%
                  </div>
                </div>
              </div>

              {/* 16-Digit Embossed Card Number */}
              <div className="relative z-10 font-mono text-xs sm:text-sm tracking-[0.14em] sm:tracking-[0.2em] text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] whitespace-nowrap truncate">
                {config.cardNumber}
              </div>

              {/* Bottom Row: Cardholder, Valid Thru, Price & Card Network Circles */}
              <div className="relative z-10 pt-1.5 border-t border-white/15 flex items-end justify-between w-full gap-1.5 sm:gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <span className="text-[8px] uppercase tracking-wider text-white/60 block leading-none">
                    CARDHOLDER
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-white uppercase tracking-wider truncate block mt-0.5">
                    {partner?.name || 'VALUED PARTNER'}
                  </span>
                </div>

                <div className="shrink-0">
                  <span className="text-[8px] uppercase tracking-wider text-white/60 block leading-none">
                    VALID THRU
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono text-white/95 mt-0.5 block whitespace-nowrap">
                    {activeSubscription?.expires_at && isCurrentPlan
                      ? new Date(activeSubscription.expires_at).toLocaleDateString('en-IN', {
                          month: '2-digit',
                          year: '2-digit'
                        })
                      : '12/28'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[8px] uppercase tracking-wider text-white/60 block leading-none">
                      MONTHLY
                    </span>
                    <span className="text-xs sm:text-sm font-mono text-amber-300 leading-tight block whitespace-nowrap tabular-nums">
                      ₹{plan.monthly_price}
                    </span>
                  </div>

                  {/* Overlapping Dual Card Network Emblem */}
                  <div className="flex -space-x-2 shrink-0">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-400/85 shadow-xs" />
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-500/80 shadow-xs" />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Subscription Checkout & Payment Modal */}
      {selectedPlanForCheckout && (
        <SubscriptionCheckoutModal
          plan={selectedPlanForCheckout}
          taxConfig={taxConfig}
          onClose={() => setSelectedPlanForCheckout(null)}
          onSuccess={async () => {
            setSelectedPlanForCheckout(null);
            await refreshAll();
            if (onPlanActivated) onPlanActivated();
          }}
        />
      )}
    </div>
  );
};
