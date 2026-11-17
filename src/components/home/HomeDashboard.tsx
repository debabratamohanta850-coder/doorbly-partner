import React, { useEffect, useState, useCallback } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { supabaseService } from '../../services/supabaseClient';
import { OfferOfTheDay } from '../../types';
import { ActiveJobBanner } from './ActiveJobBanner';
import { AtmSubscriptionCards } from '../subscription/AtmSubscriptionCards';
import { ProcessingLoader } from '../common/ProcessingLoader';
import { BatteryLow, Radio, CheckCircle2, Clock, Coins, Lock, ShieldCheck, ArrowRight, Calendar, Wallet, ArrowDownToLine, Info } from 'lucide-react';

export const HomeDashboard: React.FC = () => {
  const {
    partner,
    wallet,
    myJobs,
    activeJob,
    activeSubscription,
    commissionRecords,
    ledgerSummary,
    withdrawals,
    isOnline,
    toggleOnline,
    setActiveTab,
    batteryState,
    lastJobPollTime
  } = usePartner();

  const [worksDone, setWorksDone] = useState<number>(wallet.total_completed_jobs || 0);
  const [upcomingQueue, setUpcomingQueue] = useState<number>(0);
  const [dailyOffer, setDailyOffer] = useState<OfferOfTheDay | null>(null);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);

  const fetchLiveHomeData = useCallback(async (silent = false) => {
    if (!silent) {
      setIsSyncingSupabase(true);
    }
    try {
      const offerPromise = supabaseService.getOfferOfTheDay();
      if (partner?.id) {
        const [counts, offer] = await Promise.all([
          supabaseService.getLiveWorkCounts(partner.id),
          offerPromise
        ]);
        setWorksDone(counts.worksDone);
        setUpcomingQueue(counts.upcomingQueue);
        setDailyOffer(offer);
      } else {
        const offer = await offerPromise;
        setDailyOffer(offer);
      }
    } finally {
      if (!silent) {
        setIsSyncingSupabase(false);
      }
    }
  }, [partner?.id]);

  useEffect(() => {
    fetchLiveHomeData(false);

    const unsubscribe = supabaseService.subscribeToRealtimeBookings(
      () => fetchLiveHomeData(true),
      () => fetchLiveHomeData(true)
    );

    const handleManualRefresh = () => {
      fetchLiveHomeData(false);
    };
    const handleVisibilityReturn = () => {
      if (document.visibilityState === 'visible') {
        fetchLiveHomeData(true);
      }
    };
    const handleSilentRefresh = () => {
      fetchLiveHomeData(true);
    };
    window.addEventListener('doorbly-realtime-refresh', handleManualRefresh);
    window.addEventListener('focus', handleSilentRefresh);
    document.addEventListener('visibilitychange', handleVisibilityReturn);

    const interval = setInterval(() => fetchLiveHomeData(true), 10000);

    return () => {
      unsubscribe();
      window.removeEventListener('doorbly-realtime-refresh', handleManualRefresh);
      window.removeEventListener('focus', handleSilentRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityReturn);
      clearInterval(interval);
    };
  }, [fetchLiveHomeData]);

  useEffect(() => {
    if (partner?.id) {
      fetchLiveHomeData(true);
    }
  }, [partner?.id, myJobs.length, activeJob?.status, fetchLiveHomeData]);

  const pollSeconds = Math.round(batteryState.jobPollingIntervalMs / 1000);
  const reasonLabel =
    batteryState.activeReason === 'low_battery'
      ? `Low Battery (${batteryState.batteryLevel}%)`
      : batteryState.activeReason === 'background'
      ? 'App in Background'
      : batteryState.activeReason === 'manual'
      ? 'Manual Eco Mode'
      : 'Normal';

  // Aggregate real completed job financials (zero dummy or estimated figures)
  const completedJobs = myJobs.filter((j) => j.status === 'COMPLETED');
  const commByJobId = new Map(commissionRecords.map((c) => [c.job_id, c]));
  const allCompletedJobIds = new Set<string>([
    ...completedJobs.map((j) => j.id),
    ...commissionRecords.map((c) => c.job_id)
  ]);

  let totalJobValue = 0;
  let totalDoorblyCommission = 0;
  let totalPartnerEarnings = 0;

  allCompletedJobIds.forEach((jobId) => {
    const commRec = commByJobId.get(jobId);
    const bookingRec = completedJobs.find((j) => j.id === jobId);
    if (commRec) {
      totalJobValue += Number(commRec.commissionable_amount) || 0;
      totalDoorblyCommission += Number(commRec.commission_amount) || 0;
      totalPartnerEarnings += Number(commRec.partner_earnings) || 0;
    } else if (bookingRec) {
      const val = Number(bookingRec.customer_price) || 0;
      const earn = Number(bookingRec.partner_earning) || 0;
      const comm =
        bookingRec.commission_amount !== undefined
          ? Number(bookingRec.commission_amount) || 0
          : Math.max(0, val - earn);
      totalJobValue += val;
      totalDoorblyCommission += comm;
      totalPartnerEarnings += earn;
    }
  });

  const displayCompletedCount = Math.max(worksDone, allCompletedJobIds.size);
  const formatInr = (amt: number) =>
    amt.toLocaleString('en-IN', { minimumFractionDigits: amt % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });

  const planExpiryText = activeSubscription?.expires_at
    ? new Date(activeSubscription.expires_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'Not Activated';

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 font-normal">
      {isSyncingSupabase && (
        <ProcessingLoader
          variant="bar"
          label="Syncing live dashboard data from Supabase..."
          className="rounded-full"
        />
      )}
      {/* Responsive KPI Strip: 2 cols on mobile, 4 cols on tablet & desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Number of Works Done (Live from Supabase) */}
        <div
          onClick={() => setActiveTab('jobs')}
          className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-2 cursor-pointer hover:border-teal-500/50 transition-colors min-w-0"
        >
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-normal text-slate-400 uppercase tracking-wider block truncate">
              Works Done
            </span>
            <div className="text-lg sm:text-xl md:text-2xl font-normal text-slate-900 mt-0.5 leading-tight tabular-nums truncate">
              {displayCompletedCount}
            </div>
            <span className="text-[10px] text-emerald-600 font-normal flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Live</span>
            </span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Card 2: Number of Next Upcoming Works in Queue (Live from Supabase) */}
        <div
          onClick={() => setActiveTab('jobs')}
          className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-2 cursor-pointer hover:border-teal-500/50 transition-colors min-w-0"
        >
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-normal text-slate-400 uppercase tracking-wider block truncate">
              In Queue
            </span>
            <div className="text-lg sm:text-xl md:text-2xl font-normal text-slate-900 mt-0.5 leading-tight tabular-nums truncate">
              {upcomingQueue}
            </div>
            <span className="text-[10px] text-amber-600 font-normal flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Upcoming</span>
            </span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Card 3: Today's Earnings */}
        <div
          onClick={() => setActiveTab('earnings')}
          className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-2 cursor-pointer hover:border-teal-500/50 transition-colors min-w-0"
        >
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-normal text-slate-400 uppercase tracking-wider block truncate">
              Today&apos;s Payout
            </span>
            <div className="text-lg sm:text-xl md:text-2xl font-normal text-slate-900 mt-0.5 leading-tight tabular-nums truncate">
              ₹{wallet.today_earnings}
            </div>
            <span className="text-[10px] text-slate-500 font-normal mt-0.5 block truncate">
              {wallet.today_completed_jobs} orders today
            </span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Card 4: Available Wallet Balance */}
        <div
          onClick={() => setActiveTab('wallet')}
          className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-2 cursor-pointer hover:border-teal-500/50 transition-colors min-w-0"
        >
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-normal text-slate-400 uppercase tracking-wider block truncate">
              Available Wallet
            </span>
            <div className="text-lg sm:text-xl md:text-2xl font-normal text-[#0F766E] mt-0.5 leading-tight tabular-nums truncate">
              ₹{wallet.available_balance}
            </div>
            <span className="text-[10px] text-teal-600 font-normal mt-0.5 block truncate">
              Instant withdraw
            </span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-teal-50 text-[#0F766E] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Responsive Workstation Grid: Single-column on mobile, Dual-column split on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* Left Column (Primary Radar & Workfeed) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Active Job Banner if any */}
          {activeJob && <ActiveJobBanner />}

          {/* Live Order Matching Radar Status (when Online) or Offline Card */}
          {isOnline ? (
            <div
              className={`rounded-2xl p-4 sm:p-5 border text-xs shadow-2xs space-y-3 transition-colors ${
                batteryState.isBatterySaverActive
                  ? 'bg-amber-50/90 border-amber-200/90 text-amber-950'
                  : 'bg-emerald-50/90 border-emerald-200/90 text-emerald-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {batteryState.isBatterySaverActive ? (
                    <BatteryLow className="w-5 h-5 text-amber-600 shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  )}
                  <span className="font-semibold text-xs sm:text-sm leading-snug">
                    {batteryState.isBatterySaverActive
                      ? `Battery Saver Active · Polling every ${pollSeconds}s`
                      : `Live GPS Radar Active · Polling every ${pollSeconds}s`}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-normal px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 ${
                    batteryState.isBatterySaverActive
                      ? 'text-amber-800 bg-amber-100/80'
                      : 'text-emerald-700 bg-emerald-100/70'
                  }`}
                >
                  Radius: {partner?.preferred_radius_km || 10} km
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/5 text-[11px] opacity-85">
                <span className="min-w-0">
                  {batteryState.isBatterySaverActive
                    ? `Reduced polling (${reasonLabel}) to save power`
                    : `Battery: ${batteryState.batteryLevel}%${batteryState.isCharging ? ' (Charging)' : ''} · Continuous scan active`}
                </span>
                <span className="whitespace-nowrap shrink-0">
                  {lastJobPollTime ? `Last scan: ${lastJobPollTime}` : 'Active'}
                </span>
              </div>
            </div>
          ) : (
            !activeJob && (
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                  <Radio className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">You are currently Offline</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Verify your 4-digit screen lock code stored in Supabase to go Online and receive bookings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleOnline(true)}
                  className="py-3 px-6 rounded-xl bg-[#0F766E] hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs shadow-xs inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  <span>Verify Code &amp; Go Online</span>
                </button>
              </div>
            )
          )}

          {/* Quick Services Overview on Tablet/Desktop */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-sm">Service Assignments &amp; Queue</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Keep track of all active bookings and customer service requests.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('jobs')}
                className="text-xs font-bold text-[#0F766E] hover:text-teal-800 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>View All Jobs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div
                onClick={() => setActiveTab('jobs')}
                className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-800 block">Active &amp; In-Progress</span>
                  <span className="text-[11px] text-slate-500">Currently accepted orders</span>
                </div>
                <span className="text-sm font-bold text-[#0F766E]">{activeJob ? '1 Active' : '0 Active'}</span>
              </div>

              <div
                onClick={() => setActiveTab('jobs')}
                className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-800 block">Completed Service Log</span>
                  <span className="text-[11px] text-slate-500">Verified and credited</span>
                </div>
                <span className="text-sm font-bold text-emerald-700">{displayCompletedCount} Done</span>
              </div>
            </div>
          </div>

          {/* Partner Commission & Financial Summary (Live from Actual Completed Bookings) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0F766E] shrink-0" />
                  <span>Subscription &amp; Commission Summary</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Auto-calculated from verified completed bookings &amp; active plan snapshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('membership')}
                className="text-xs font-bold text-[#0F766E] hover:text-teal-800 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Manage Plan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Active Plan & Expiry Banner */}
            <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-teal-300 font-bold">
                    Current Subscription Plan
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      activeSubscription?.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : activeSubscription?.status === 'suspended'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {activeSubscription?.status || 'Starter Active'}
                  </span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white truncate">
                  {activeSubscription
                    ? `${activeSubscription.plan_name} (${activeSubscription.commission_percent}% Commission)`
                    : 'Starter (20% Commission)'}
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center sm:justify-end gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Subscription Expiry Date</span>
                </span>
                <div className="text-xs sm:text-sm font-bold text-teal-200 mt-0.5 tabular-nums">
                  {planExpiryText}
                </div>
              </div>
            </div>

            {/* 6 Financial & Commission Ledger Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 min-w-0">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block truncate">
                  Actual Collections
                </span>
                <div className="text-base font-extrabold text-slate-900 mt-0.5 tabular-nums">
                  ₹{formatInr(totalJobValue)}
                </div>
                <span className="text-[10px] text-slate-400">{displayCompletedCount} completed jobs</span>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 min-w-0">
                <span className="text-[10px] text-amber-800 uppercase tracking-wider block truncate">
                  Commission Accrued
                </span>
                <div className="text-base font-extrabold text-amber-700 mt-0.5 tabular-nums">
                  ₹{formatInr(totalDoorblyCommission)}
                </div>
                <span className="text-[10px] text-amber-700/80">Settled: ₹{formatInr(ledgerSummary.totalCommissionSettled)}</span>
              </div>

              <div
                onClick={() => setActiveTab('wallet')}
                className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/70 min-w-0 cursor-pointer hover:bg-rose-50 transition-colors"
              >
                <span className="text-[10px] text-rose-800 uppercase tracking-wider block truncate">
                  Outstanding Commission
                </span>
                <div className="text-base font-extrabold text-rose-700 mt-0.5 tabular-nums">
                  ₹{formatInr(ledgerSummary.outstandingCommission)}
                </div>
                <span className="text-[10px] text-rose-700 font-semibold">
                  {ledgerSummary.outstandingCommission > 0 ? 'Tap to Settle →' : 'All Settled ✓'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70 min-w-0">
                <span className="text-[10px] text-emerald-800 uppercase tracking-wider block truncate">
                  Total Partner Earnings
                </span>
                <div className="text-base font-extrabold text-emerald-700 mt-0.5 tabular-nums">
                  ₹{formatInr(totalPartnerEarnings)}
                </div>
                <span className="text-[10px] text-emerald-700/80">Net after commission</span>
              </div>

              <div
                onClick={() => setActiveTab('wallet')}
                className="col-span-2 sm:col-span-2 p-3 rounded-xl bg-teal-50/80 border border-teal-200/80 cursor-pointer hover:bg-teal-50 transition-colors flex items-center justify-between gap-2 min-w-0"
              >
                <div className="min-w-0">
                  <span className="text-[10px] text-teal-800 uppercase tracking-wider block truncate">
                    Available Wallet Balance
                  </span>
                  <div className="text-base sm:text-lg font-black text-[#0F766E] mt-0.5 tabular-nums">
                    ₹{formatInr(wallet.available_balance)}
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[#0F766E] px-2.5 py-1 rounded-lg bg-white border border-teal-200 shrink-0 whitespace-nowrap">
                  {ledgerSummary.outstandingCommission > 0 ? 'Wallet & Settle' : 'Open Wallet'}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-[#0F766E] shrink-0 mt-0.5" />
              <span>
                Commission rates are locked automatically from your active subscription plan per completed booking and cannot be manually altered.
              </span>
            </div>

            {/* Withdrawal History Section */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>Withdrawal History ({withdrawals.length})</span>
                </h5>
                <button
                  type="button"
                  onClick={() => setActiveTab('wallet')}
                  className="text-[11px] font-bold text-[#0F766E] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Wallet className="w-3 h-3" />
                  <span>Withdraw / View All</span>
                </button>
              </div>

              {withdrawals.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 text-center text-xs text-slate-500">
                  No withdrawal requests yet. Completed job payouts credit straight to your Available Wallet Balance.
                </div>
              ) : (
                <div className="space-y-2">
                  {withdrawals.slice(0, 4).map((w) => (
                    <div
                      key={w.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 tabular-nums">
                          ₹{formatInr(w.amount)}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          A/C ••••{w.bank_account.slice(-4)} ·{' '}
                          {new Date(w.requested_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                          w.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : w.status === 'processing'
                            ? 'bg-blue-100 text-blue-700'
                            : w.status === 'rejected' || w.status === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Earnings, Special Offers & Subscription) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Medium-Size Card: Offer of the Day (Editable via Admin Panel) */}
          {dailyOffer && dailyOffer.is_active && (
            <div className="bg-teal-50/50 text-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs border border-teal-100 space-y-2.5 font-normal">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 shrink-0">
                    <Coins className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-normal uppercase tracking-wider text-teal-700 truncate">
                    Offer of the Day
                  </span>
                </div>
                {dailyOffer.reward_badge && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-100/80 text-amber-800 border border-amber-200/80 font-normal text-[11px] tracking-tight shrink-0 whitespace-nowrap">
                    {dailyOffer.reward_badge}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h4 className="font-normal text-sm text-slate-800 leading-snug">
                  {dailyOffer.title}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-normal">
                  {dailyOffer.description}
                </p>
              </div>

              <div className="pt-2 border-t border-teal-100/80 flex items-center justify-between text-[10px] text-slate-500 font-normal">
                <span>{dailyOffer.valid_until}</span>
                <span className="text-teal-700 font-normal">Doorbly Partner Exclusive</span>
              </div>
            </div>
          )}

          {/* Subscription Plans Section on Dashboard */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 tracking-tight flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
                  <span>Partner Subscription</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Keep up to 93% of completed service earnings on every job.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('membership')}
                className="text-[11px] font-extrabold text-[#0F766E] hover:text-teal-800 flex items-center gap-0.5 cursor-pointer"
              >
                <span>Details</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <AtmSubscriptionCards layout="dashboard-carousel" onPlanActivated={fetchLiveHomeData} />
          </div>
        </div>
      </div>
    </div>
  );
};
