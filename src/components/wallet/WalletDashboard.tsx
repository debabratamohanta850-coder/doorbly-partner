import React, { useState, useEffect } from 'react';
import { usePartner } from '../../context/PartnerContext';
import {
  WalletTransaction,
  CommissionSettlement,
  SettlementPaymentMethod
} from '../../types';
import { supabaseService } from '../../services/supabaseClient';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Building,
  Loader2,
  X,
  ShieldCheck,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Banknote,
  Printer
} from 'lucide-react';
import { ProcessingLoader } from '../common/ProcessingLoader';

const CATEGORY_LABELS: Record<WalletTransaction['category'], { label: string; badgeClass: string }> = {
  gross_collection: {
    label: 'Gross Collection',
    badgeClass: 'bg-sky-100 text-sky-800'
  },
  job_earning: {
    label: 'Partner Net Earning',
    badgeClass: 'bg-emerald-100 text-emerald-800'
  },
  commission_accrued: {
    label: 'Doorbly Comm. Accrued',
    badgeClass: 'bg-amber-100 text-amber-800'
  },
  commission_settlement: {
    label: 'Commission Settled',
    badgeClass: 'bg-teal-100 text-teal-800'
  },
  subscription_payment: {
    label: 'Subscription Fee',
    badgeClass: 'bg-purple-100 text-purple-800'
  },
  withdrawal: {
    label: 'Bank Withdrawal',
    badgeClass: 'bg-slate-200 text-slate-800'
  },
  membership_fee: {
    label: 'Membership Fee',
    badgeClass: 'bg-purple-100 text-purple-800'
  },
  bonus: {
    label: 'Bonus',
    badgeClass: 'bg-emerald-100 text-emerald-800'
  },
  adjustment: {
    label: 'Adjustment',
    badgeClass: 'bg-slate-100 text-slate-700'
  }
};

export const WalletDashboard: React.FC = () => {
  const {
    wallet,
    partner,
    withdrawals,
    customerCollections,
    commissionSettlements,
    ledgerSummary,
    requestWithdrawal,
    submitCommissionSettlement
  } = usePartner();

  const [activeTab, setActiveTab] = useState<'transactions' | 'collections' | 'settlements' | 'withdrawals'>('transactions');
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Withdrawal form modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [accountHolder, setAccountHolder] = useState(partner?.name || '');
  const [withdrawError, setWithdrawError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Settle Doorbly Commission Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState<SettlementPaymentMethod>('upi');
  const [settleRef, setSettleRef] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleError, setSettleError] = useState('');
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<CommissionSettlement | null>(null);

  useEffect(() => {
    if (partner?.name) {
      setAccountHolder((prev) => prev || partner.name);
    }
  }, [partner?.id, partner?.name]);

  const fetchTransactions = async () => {
    if (!partner?.id) return;
    setLoadingHistory(true);
    try {
      const txList = await supabaseService.getTransactions(partner.id);
      setTransactions(txList);
    } catch (e) {
      console.warn('Error loading wallet ledger:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [partner?.id, wallet.available_balance, commissionSettlements.length, customerCollections.length]);

  const remainingSettleable = Math.max(
    0,
    Math.round((ledgerSummary.outstandingCommission - ledgerSummary.pendingSettlementVerification) * 100) / 100
  );

  const openSettleCommissionModal = () => {
    setSettleAmount(remainingSettleable > 0 ? String(remainingSettleable) : '');
    setSettleMethod('upi');
    setSettleRef('');
    setSettleNotes('');
    setSettleError('');
    setShowSettleModal(true);
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettleError('');
    const amt = Math.round((Number(settleAmount) || 0) * 100) / 100;
    if (amt <= 0) {
      setSettleError('Settlement amount must be greater than ₹0.');
      return;
    }
    if (settleRef.trim().length < 6) {
      setSettleError('Please enter a valid 6+ character payment transaction / UTR reference.');
      return;
    }

    setIsSubmittingSettle(true);
    try {
      const res = await submitCommissionSettlement({
        amount: amt,
        paymentMethod: settleMethod,
        paymentReference: settleRef.trim(),
        notes: settleNotes.trim() || undefined
      });
      if (res.success && res.settlement) {
        setShowSettleModal(false);
        setActiveReceipt(res.settlement);
        setActiveTab('settlements');
        await fetchTransactions();
      } else {
        setSettleError(res.message || 'Could not submit settlement payment.');
      }
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError('');
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount < 200) {
      setWithdrawError('Minimum withdrawal amount is ₹200.');
      return;
    }
    if (numAmount > wallet.available_balance) {
      setWithdrawError(`Amount exceeds your available balance of ₹${wallet.available_balance}.`);
      return;
    }
    if (!bankAccount.trim() || bankAccount.length < 8) {
      setWithdrawError('Please enter a valid bank account number.');
      return;
    }
    if (!ifsc.trim() || ifsc.length < 5) {
      setWithdrawError('Please enter a valid bank IFSC code.');
      return;
    }
    if (!accountHolder.trim()) {
      setWithdrawError('Please enter the bank account holder name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestWithdrawal(numAmount, bankAccount.trim(), ifsc.trim().toUpperCase(), accountHolder.trim());
      if (res.success) {
        setShowWithdrawModal(false);
        setAmount('');
        await fetchTransactions();
      } else {
        setWithdrawError(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatInr = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4 pb-20">
      {/* Wallet Balance Hero Card & Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        <div className="md:col-span-7 bg-gradient-to-br from-[#0F766E] to-teal-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-teal-100 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5 uppercase tracking-wider">
                <Wallet className="w-4 h-4 shrink-0" />
                <span>DOORBLY PARTNER WALLET</span>
              </span>
              <span className="bg-teal-800/80 px-2 py-0.5 rounded text-[10px] uppercase font-mono whitespace-nowrap">
                Direct Bank Payout
              </span>
            </div>

            <div className="mt-2">
              <span className="text-xs text-teal-200 uppercase font-medium">Available Wallet Balance</span>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline mt-0.5">
                <span className="text-xl sm:text-2xl font-bold mr-1">₹</span>
                {formatInr(wallet.available_balance)}
              </div>
              {wallet.pending_amount > 0 && (
                <div className="text-xs text-teal-200 mt-1">
                  ₹{wallet.pending_amount} pending clearance
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-teal-700/60 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setWithdrawError('');
                setShowWithdrawModal(true);
              }}
              disabled={wallet.available_balance < 200}
              className="flex-1 py-3 px-4 bg-white text-[#0F766E] hover:bg-teal-50 active:bg-teal-100 disabled:opacity-50 disabled:bg-white/20 disabled:text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>WITHDRAW TO BANK</span>
            </button>
          </div>
        </div>

        {/* Earnings Period Breakdown */}
        <div className="md:col-span-5 grid grid-cols-1 min-[360px]:grid-cols-3 md:grid-cols-1 gap-2 sm:gap-3">
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 text-center md:text-left shadow-xs flex flex-col md:flex-row md:items-center md:justify-between min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block truncate">
                Today
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5 tabular-nums truncate">
                ₹{formatInr(wallet.today_earnings)}
              </div>
            </div>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium whitespace-nowrap">
              {wallet.today_completed_jobs} jobs
            </span>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 text-center md:text-left shadow-xs flex flex-col md:flex-row md:items-center md:justify-between min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block truncate">
                This Week
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5 tabular-nums truncate">
                ₹{formatInr(wallet.week_earnings)}
              </div>
            </div>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium whitespace-nowrap">7 days</span>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 text-center md:text-left shadow-xs flex flex-col md:flex-row md:items-center md:justify-between min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block truncate">
                This Month
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5 tabular-nums truncate">
                ₹{formatInr(wallet.month_earnings)}
              </div>
            </div>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium whitespace-nowrap">30 days</span>
          </div>
        </div>
      </div>

      {/* Commission Settlement Card + Separate Accounting Ledger Breakdown */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase font-black tracking-wider text-amber-700 block">
              COMMISSION SETTLEMENT &amp; SEPARATE ACCOUNTING LEDGERS
            </span>
            <h3 className="font-extrabold text-sm text-slate-900 mt-0.5">
              Doorbly Commission Payable Balance
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Cash/UPI collected directly from customers accrues Doorbly&apos;s commission payable here until settled and verified.
            </p>
          </div>

          <button
            type="button"
            onClick={openSettleCommissionModal}
            disabled={remainingSettleable <= 0}
            className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Banknote className="w-4 h-4" />
            <span>Settle Doorbly Commission</span>
          </button>
        </div>

        {/* Highlighted Outstanding Commission vs Settled */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] uppercase font-bold text-amber-800 block">
              Outstanding Doorbly Commission
            </span>
            <div className="text-xl font-black font-mono text-amber-950 mt-0.5">
              ₹{formatInr(ledgerSummary.outstandingCommission)}
            </div>
            {ledgerSummary.pendingSettlementVerification > 0 && (
              <span className="text-[10px] text-amber-800 block mt-0.5">
                ₹{formatInr(ledgerSummary.pendingSettlementVerification)} pending admin verification
              </span>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200">
            <span className="text-[10px] uppercase font-bold text-teal-800 block">
              Commission Settled (Verified)
            </span>
            <div className="text-xl font-black font-mono text-teal-900 mt-0.5">
              ₹{formatInr(ledgerSummary.totalCommissionSettled)}
            </div>
            <span className="text-[10px] text-teal-700 block mt-0.5">
              Verified receipts only
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Total Commission Accrued
            </span>
            <div className="text-xl font-black font-mono text-slate-900 mt-0.5">
              ₹{formatInr(ledgerSummary.totalCommissionAccrued)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Across {ledgerSummary.completedJobsCount} completed jobs
            </span>
          </div>
        </div>

        {/* 4 Secondary Separate Ledger Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-100">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] text-slate-500 block">Gross Customer Collections</span>
            <span className="font-extrabold text-slate-900 font-mono">
              ₹{formatInr(ledgerSummary.totalGrossCollections)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/70">
            <span className="text-[10px] text-emerald-800 block">Partner Net Earnings</span>
            <span className="font-extrabold text-emerald-800 font-mono">
              ₹{formatInr(ledgerSummary.totalPartnerNetEarnings)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] text-slate-500 block">Partner Withdrawals</span>
            <span className="font-extrabold text-slate-900 font-mono">
              ₹{formatInr(ledgerSummary.totalWithdrawals)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-200/70">
            <span className="text-[10px] text-purple-800 block">Subscription Payments</span>
            <span className="font-extrabold text-purple-900 font-mono">
              ₹{formatInr(ledgerSummary.totalSubscriptionPayments)}
            </span>
          </div>
        </div>
      </div>

      {/* Segmented Control for Separate Ledgers */}
      <div className="bg-slate-200/80 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer truncate ${
            activeTab === 'transactions' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          All Ledger ({transactions.length})
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer truncate ${
            activeTab === 'collections' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Collections ({customerCollections.length})
        </button>
        <button
          onClick={() => setActiveTab('settlements')}
          className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer truncate ${
            activeTab === 'settlements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Settlements ({commissionSettlements.length})
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer truncate ${
            activeTab === 'withdrawals' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Withdrawals ({withdrawals.length})
        </button>
      </div>

      {/* Content Area */}
      {loadingHistory ? (
        <ProcessingLoader
          variant="panel"
          label="Syncing financial ledgers from Supabase..."
          subLabel="Loading collections, commissions, settlements, and withdrawals"
        />
      ) : activeTab === 'transactions' ? (
        transactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No ledger entries yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Confirmed customer collections, partner net earnings, accrued commissions, and settlements appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const catInfo = CATEGORY_LABELS[tx.category] || {
                label: tx.category,
                badgeClass: 'bg-slate-100 text-slate-700'
              };
              return (
                <div
                  key={tx.id}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'credit'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {tx.type === 'credit' ? (
                        <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${catInfo.badgeClass}`}>
                          {catInfo.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(tx.created_at).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <h5 className="font-bold text-slate-900 text-xs mt-1 truncate">{tx.description}</h5>
                      {tx.reference_id && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                          Ref: {tx.reference_id}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`font-black text-sm font-mono ${
                        tx.type === 'credit' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {tx.type === 'credit' ? '+' : '-'}₹{formatInr(tx.amount)}
                    </div>
                    <span className="text-[10px] text-slate-400 capitalize">{tx.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === 'collections' ? (
        customerCollections.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-xs text-slate-500">
            No confirmed customer payment collections recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {customerCollections.map((c) => (
              <div
                key={c.id}
                className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">Booking #{c.booking_id.substring(0, 8)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold uppercase">
                      {c.payment_method.replace('_', ' ')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                      {c.confirmation_mode} Verified
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Collected: {new Date(c.collected_at).toLocaleString('en-IN')}
                    {c.payment_reference ? ` · Ref: ${c.payment_reference}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-sm font-mono text-slate-900">
                    ₹{formatInr(c.actual_collected_amount)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Est: ₹{formatInr(c.estimated_amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'settlements' ? (
        commissionSettlements.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
            <Receipt className="w-7 h-7 text-slate-400 mx-auto" />
            <h4 className="font-bold text-slate-800 text-sm">No Commission Settlements Yet</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              When you settle your outstanding Doorbly commission via UPI or Bank Transfer, your payment receipt and verification status appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {commissionSettlements.map((s) => (
              <div
                key={s.id}
                className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{s.receipt_number}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        s.verification_status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.verification_status === 'rejected'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {s.verification_status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {s.payment_method.toUpperCase()} · Ref: <span className="font-mono">{s.payment_reference}</span> ·{' '}
                    {new Date(s.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="font-black text-sm font-mono text-slate-900">
                    ₹{formatInr(s.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveReceipt(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#0F766E] font-bold text-[10px] cursor-pointer"
                  >
                    Receipt
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : withdrawals.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
            <Building className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">No withdrawal requests</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            You can request bank transfers once your available wallet balance is at least ₹200.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {withdrawals.map((w) => (
            <div
              key={w.id}
              className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-sm">₹{w.amount}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-bold uppercase">
                    {w.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  A/C: {w.bank_account} · IFSC: {w.ifsc}
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-400">
                {new Date(w.requested_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settle Doorbly Commission Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">
                  SETTLE DOORBLY COMMISSION
                </span>
                <h3 className="font-extrabold text-base text-slate-900">
                  Submit Commission Payment
                </h3>
              </div>
              <button
                onClick={() => setShowSettleModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-amber-900 font-semibold">Total Outstanding Commission</span>
                <span className="font-mono font-black text-amber-950">
                  ₹{formatInr(ledgerSummary.outstandingCommission)}
                </span>
              </div>
              {ledgerSummary.pendingSettlementVerification > 0 && (
                <div className="flex items-center justify-between text-[11px] text-amber-800">
                  <span>Pending Verification Submissions</span>
                  <span className="font-mono">-₹{formatInr(ledgerSummary.pendingSettlementVerification)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-900 pt-1 border-t border-amber-200/70">
                <span>Remaining Payable</span>
                <span className="font-mono">₹{formatInr(remainingSettleable)}</span>
              </div>
            </div>

            {/* Official Doorbly Settlement Account */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] space-y-1">
              <div className="font-bold text-slate-800">Official Doorbly Settlement Payee Details</div>
              <div>UPI ID: <span className="font-mono font-bold text-slate-900 select-all">doorbly.settle@icici</span></div>
              <div>IMPS / NEFT: <span className="font-mono">Doorbly Tech Pvt Ltd · A/C 004105009812 · ICIC0000041</span></div>
            </div>

            <form onSubmit={handleSettleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Settlement Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={remainingSettleable}
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Approved Payment Method *
                </label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value as SettlementPaymentMethod)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white focus:border-[#0F766E] focus:outline-hidden font-semibold"
                >
                  <option value="upi">UPI / QR Transfer</option>
                  <option value="bank_transfer">Bank Transfer (IMPS / NEFT)</option>
                  <option value="card_netbanking">Debit Card / NetBanking</option>
                  <option value="other_approved">Other Approved Channel</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Transaction / UTR Reference Number *
                </label>
                <input
                  type="text"
                  required
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  placeholder="Enter bank/UPI UTR reference (min 6 chars)"
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Optional payment remark"
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Submitted settlements stay <strong>Pending Verification</strong> until Admin / Gateway verifies the transaction reference against Doorbly bank records.
                </span>
              </div>

              {settleError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {settleError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSettle}
                  className="flex-1 py-3 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingSettle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Submit &amp; Generate Receipt</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settlement Receipt Modal */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-[#0F766E] block">
                  COMMISSION SETTLEMENT RECEIPT
                </span>
                <h3 className="font-mono font-black text-base text-slate-900">
                  {activeReceipt.receipt_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Partner Name</span>
                <span className="font-bold text-slate-900">{partner?.name || activeReceipt.partner_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Settlement Amount</span>
                <span className="font-black font-mono text-sm text-slate-900">
                  ₹{formatInr(activeReceipt.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method</span>
                <span className="font-bold uppercase text-slate-800">{activeReceipt.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction / UTR Ref</span>
                <span className="font-mono font-bold text-slate-900">{activeReceipt.payment_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verification Status</span>
                <span
                  className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                    activeReceipt.verification_status === 'verified'
                      ? 'bg-emerald-100 text-emerald-800'
                      : activeReceipt.verification_status === 'rejected'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {activeReceipt.verification_status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Submitted At</span>
                <span className="text-slate-700">
                  {new Date(activeReceipt.created_at).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#0F766E] text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Withdraw to Bank
                </h3>
                <p className="text-xs text-slate-500">
                  Available for transfer: <strong>₹{wallet.available_balance}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Withdrawal Amount (₹)
                </label>
                <input
                  type="number"
                  min="200"
                  max={wallet.available_balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Min ₹200"
                  className="w-full text-base font-bold p-3 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Bank Account Number
                </label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="Enter bank account number"
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    value={ifsc}
                    onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                    placeholder="Enter 11-character IFSC"
                    className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Account Holder
                  </label>
                  <input
                    type="text"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="Full name as in bank"
                    className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
                  />
                </div>
              </div>

              {withdrawError && (
                <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  {withdrawError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-3 text-slate-600 font-bold text-xs border border-slate-200 rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
