import React, { useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { BarChart2 } from 'lucide-react';

export const EarningsView: React.FC = () => {
  const { wallet, myJobs, commissionRecords, ledgerSummary, activeSubscription, subscriptionPlans, setActiveTab } = usePartner();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');

  const isSubEffective =
    activeSubscription?.status === 'active' &&
    (!activeSubscription.expires_at ||
      new Date(activeSubscription.expires_at).getTime() >= Date.now());
  const starterDef = subscriptionPlans.find((p) => p.plan_code === 'starter');
  const effectivePlanLabel = isSubEffective
    ? `${activeSubscription.plan_name} (${activeSubscription.commission_percent}%)`
    : `${starterDef?.plan_name || 'Starter'} (${starterDef?.commission_percent ?? 20}%)`;

  const completedJobs = myJobs.filter(j => j.status === 'COMPLETED');
  const commMap = new Map(commissionRecords.map(c => [c.job_id, c]));

  // Filter based on period
  const todayStr = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const periodJobs = completedJobs.filter(job => {
    const jobDate = job.completed_at || job.created_at;
    if (period === 'today') return jobDate.startsWith(todayStr);
    if (period === 'week') return jobDate >= sevenDaysAgo;
    if (period === 'month') return jobDate >= thirtyDaysAgo;
    return true;
  });

  const periodGrossValue = periodJobs.reduce((sum, j) => {
    const rec = commMap.get(j.id);
    return sum + (rec ? Number(rec.commissionable_amount) : Number(j.customer_price) || 0);
  }, 0);

  const periodCommissionAmount = periodJobs.reduce((sum, j) => {
    const rec = commMap.get(j.id);
    if (rec) return sum + (Number(rec.commission_amount) || 0);
    if (j.commission_amount !== undefined) return sum + (Number(j.commission_amount) || 0);
    return sum + Math.max(0, (Number(j.customer_price) || 0) - (Number(j.partner_earning) || 0));
  }, 0);

  const periodPartnerEarnings = periodJobs.reduce((sum, j) => {
    const rec = commMap.get(j.id);
    return sum + (rec ? Number(rec.partner_earnings) : Number(j.partner_earning) || 0);
  }, 0);

  return (
    <div className="space-y-4 pb-20">
      {/* Title */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Earnings & Metrics
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Actual completed booking payouts &amp; immutable Doorbly subscription commission snapshots.
        </p>

        {/* Period Selector Tabs */}
        <div className="mt-3 flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl text-xs font-semibold">
          {([
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'all', label: 'All Time' }
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id)}
              className={`flex-1 py-1.5 px-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                period === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Metric Hero Card & Financial Summary Grid (Responsive Dual-Column on md+) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
        <div className="bg-[#0F766E] text-white p-6 rounded-3xl shadow-md flex flex-col justify-between">
          <div>
            <span className="text-xs uppercase font-bold text-teal-200 tracking-wider">
              Partner Net Earning ({period.toUpperCase()})
            </span>
            <div className="text-3xl sm:text-4xl font-black text-white mt-1 flex items-baseline tabular-nums">
              <span className="text-xl sm:text-2xl mr-1 font-bold">₹</span>
              {periodPartnerEarnings.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-teal-100 mt-1">
              {periodJobs.length} completed services · Active Plan:{' '}
              <strong>{effectivePlanLabel}</strong>
            </p>
          </div>
          <div className="pt-4 border-t border-teal-600/40 mt-4 flex items-center justify-between text-xs text-teal-100">
            <span>Doorbly Commission Deducted</span>
            <span className="font-bold text-amber-200 tabular-nums">
              ₹{periodCommissionAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Detailed Metrics Table */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Financial Summary</h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Completed Jobs</span>
              <span className="font-extrabold text-slate-800 tabular-nums">{periodJobs.length}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Total Job Value (Gross)</span>
              <span className="font-bold text-slate-800 tabular-nums">₹{periodGrossValue.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Doorbly Commission (Auto)</span>
              <span className="font-bold text-amber-700 tabular-nums">-₹{periodCommissionAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Total Partner Earnings (Net)</span>
              <span className="font-bold text-teal-800 tabular-nums">₹{periodPartnerEarnings.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Commission Settled (Verified)</span>
              <span className="font-bold text-emerald-700 tabular-nums">₹{ledgerSummary.totalCommissionSettled.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Outstanding Doorbly Commission</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-700 tabular-nums">₹{ledgerSummary.outstandingCommission.toLocaleString('en-IN')}</span>
                {ledgerSummary.outstandingCommission > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('wallet')}
                    className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] cursor-pointer"
                  >
                    Settle
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-1.5 text-sm pt-2">
              <span className="font-extrabold text-slate-900">Available Wallet Balance</span>
              <span className="font-black text-slate-900 tabular-nums">₹{wallet.available_balance.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Graph Area: strictly only if real historical data exists */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
        <h3 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[#0F766E]" />
          <span>Earnings Trend</span>
        </h3>

        {periodJobs.length >= 2 ? (
          <div className="h-36 flex items-end gap-2 pt-4 border-b border-slate-200 pb-2">
            {periodJobs.slice(-7).map((job, idx) => {
              const heightPercent = Math.max(15, Math.min(100, (job.partner_earning / 2000) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] text-slate-500 font-mono">₹{job.partner_earning}</span>
                  <div
                    className="w-full bg-[#0F766E] rounded-t-md transition-all group-hover:bg-teal-800"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-[9px] text-slate-400 truncate max-w-full">
                    {new Date(job.completed_at || job.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            <p>Insufficient historical data to render graph.</p>
            <p className="text-[11px] mt-0.5">Complete at least 2 services to see your earnings trajectory.</p>
          </div>
        )}
      </div>
    </div>
  );
};
