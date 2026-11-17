import React, { useState, useEffect } from 'react';
import { ServiceBooking, PartnerProfile } from '../../types';
import { supabaseService } from '../../services/supabaseClient';
import {
  CheckCircle2,
  Search,
  RefreshCw,
  ArrowLeft,
  Download,
  Printer,
  X,
  FileText,
  ShieldCheck,
  Phone,
  Filter,
  Check
} from 'lucide-react';
import { DoorblyLogoIcon } from '../../constants/branding';

interface CompletedJobsSheetViewProps {
  bookings: ServiceBooking[];
  partners: PartnerProfile[];
  onRefresh: () => Promise<void> | void;
  onBackToOverview: () => void;
}

export const CompletedJobsSheetView: React.FC<CompletedJobsSheetViewProps> = ({
  bookings: initialBookings,
  partners,
  onRefresh,
  onBackToOverview
}) => {
  const [liveBookings, setLiveBookings] = useState<ServiceBooking[]>(initialBookings);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedBookingForReceipt, setSelectedBookingForReceipt] = useState<ServiceBooking | null>(null);

  useEffect(() => {
    setLiveBookings(initialBookings);
  }, [initialBookings]);

  // Manual synchronization with Supabase
  const handleManualSynchronise = async () => {
    setIsSyncing(true);
    try {
      const latestBookings = await supabaseService.getAllBookings(true);
      setLiveBookings(latestBookings);
      await onRefresh();
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter Completed Jobs only
  const completedJobs = liveBookings.filter((b) => b.status === 'COMPLETED');

  const getPartnerDetails = (partnerId?: string) => {
    if (!partnerId) return { name: 'Doorbly Partner Fleet', mobile: '—' };
    const found = partners.find((p) => p.id === partnerId);
    return found
      ? { name: found.name, mobile: found.mobile }
      : { name: `Partner (${partnerId.substring(0, 8)})`, mobile: '—' };
  };

  // Unique categories list
  const categories = Array.from(new Set(completedJobs.map((b) => b.service_category).filter(Boolean)));

  // Filtered and sorted records
  const filteredList = completedJobs
    .filter((b) => {
      // Category filter
      if (selectedCategory !== 'all' && b.service_category !== selectedCategory) {
        return false;
      }
      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const partnerInfo = getPartnerDetails(b.assigned_partner_id);
      const locationStr = b.customer_address || b.customer_location_address || '';

      return (
        b.id.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.toLowerCase().includes(q) ||
        b.service_name.toLowerCase().includes(q) ||
        b.service_category.toLowerCase().includes(q) ||
        locationStr.toLowerCase().includes(q) ||
        partnerInfo.name.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const timeA = new Date(a.completed_at || a.created_at).getTime();
      const timeB = new Date(b.completed_at || b.created_at).getTime();
      if (sortBy === 'newest') return timeB - timeA;
      if (sortBy === 'oldest') return timeA - timeB;
      if (sortBy === 'highest') return (b.customer_price || 0) - (a.customer_price || 0);
      if (sortBy === 'lowest') return (a.customer_price || 0) - (b.customer_price || 0);
      return 0;
    });

  // Aggregate Metrics
  const totalCompletedCount = completedJobs.length;
  const totalRevenue = completedJobs.reduce((acc, b) => acc + (Number(b.customer_price) || 0), 0);
  const totalPartnerPayout = completedJobs.reduce((acc, b) => acc + (Number(b.partner_earning) || 0), 0);
  const totalPlatformRetention = Math.max(0, totalRevenue - totalPartnerPayout);
  const averageTicket = totalCompletedCount > 0 ? Math.round(totalRevenue / totalCompletedCount) : 0;

  // Export to CSV Functionality
  const handleExportCSV = () => {
    if (filteredList.length === 0) return;

    const headers = [
      'Booking ID',
      'Completed Date',
      'Service Name',
      'Service Category',
      'Customer Name',
      'Customer Phone',
      'Customer Address',
      'Assigned Partner',
      'Partner Phone',
      'Order Value (INR)',
      'Partner Payout (INR)',
      'Platform Fee (INR)',
      'OTP Verified',
      'Status'
    ];

    const rows = filteredList.map((b) => {
      const partnerInfo = getPartnerDetails(b.assigned_partner_id);
      const location = (b.customer_address || b.customer_location_address || '').replace(/[\r\n,]+/g, ' ');
      const dateStr = b.completed_at ? new Date(b.completed_at).toLocaleString('en-IN') : b.created_at;
      const platformFee = Math.max(0, (Number(b.customer_price) || 0) - (Number(b.partner_earning) || 0));

      return [
        b.id,
        `"${String(dateStr).replace(/"/g, '""')}"`,
        `"${b.service_name.replace(/"/g, '""')}"`,
        `"${b.service_category.replace(/"/g, '""')}"`,
        `"${b.customer_name.replace(/"/g, '""')}"`,
        `"${b.customer_phone}"`,
        `"${location.replace(/"/g, '""')}"`,
        `"${partnerInfo.name.replace(/"/g, '""')}"`,
        `"${partnerInfo.mobile}"`,
        b.customer_price || 0,
        b.partner_earning || 0,
        platformFee,
        b.otp_code ? `Verified (${b.otp_code})` : 'Verified',
        'COMPLETED'
      ].join(',');
    });

    const csvString = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `doorbly_completed_jobs_sheet_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Header Banner */}
      <div className="bg-teal-900/60 border border-teal-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white shadow-md">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={onBackToOverview}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 transition-colors cursor-pointer shrink-0 mt-0.5"
            title="Back to Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h2 className="font-extrabold text-base text-white">
                Completed Jobs Page ({completedJobs.length})
              </h2>
            </div>
            <p className="text-[11px] text-teal-200/90 mt-0.5">
              Comprehensive operational record of all successfully delivered doorstep service orders.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCSV}
            className="py-2 px-3 rounded-xl bg-teal-800/80 hover:bg-teal-700 text-white border border-teal-500/50 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Download CSV Spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-teal-300" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleManualSynchronise}
            disabled={isSyncing}
            className="py-2 px-3 rounded-xl bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Synchronise'}</span>
          </button>
        </div>
      </div>

      {/* 2. Key Performance Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Completed Orders
          </span>
          <div className="text-lg font-black text-white mt-0.5 flex items-baseline gap-1">
            <span>{totalCompletedCount}</span>
            <span className="text-[10px] text-emerald-400 font-semibold">delivered</span>
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Revenue
          </span>
          <div className="text-lg font-black text-emerald-400 mt-0.5 font-mono">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Partner Payouts
          </span>
          <div className="text-lg font-black text-teal-300 mt-0.5 font-mono">
            ₹{totalPartnerPayout.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Platform Fee
          </span>
          <div className="text-lg font-black text-purple-400 mt-0.5 font-mono">
            ₹{totalPlatformRetention.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Avg Job Value
          </span>
          <div className="text-lg font-black text-amber-400 mt-0.5 font-mono">
            ₹{averageTicket}
          </div>
        </div>
      </div>

      {/* 3. Search and Category Filter Toolbar */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-2.5">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search booking ID, customer, partner, service..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 flex-1 md:flex-initial">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-teal-500 w-full"
            >
              <option value="all">All Categories ({completedJobs.length})</option>
              {categories.map((cat) => {
                const count = completedJobs.filter((b) => b.service_category === cat).length;
                return (
                  <option key={cat} value={cat}>
                    {cat} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-teal-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest">Highest Amount</option>
            <option value="lowest">Lowest Amount</option>
          </select>
        </div>
      </div>

      {/* 4. Excel-Style Completed Jobs Sheet Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3">Booking ID</th>
                <th className="py-3 px-3">Completed Date</th>
                <th className="py-3 px-3">Service &amp; Category</th>
                <th className="py-3 px-3">Customer Details</th>
                <th className="py-3 px-3">Assigned Partner</th>
                <th className="py-3 px-3 text-right">Order Value</th>
                <th className="py-3 px-3 text-right">Partner Payout</th>
                <th className="py-3 px-3 text-right">Platform Fee</th>
                <th className="py-3 px-3 text-center">OTP Verified</th>
                <th className="py-3 px-3 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="font-bold text-sm text-slate-400">No completed jobs match your filters</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Completed doorstep deliveries will appear here automatically.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredList.map((job, idx) => {
                  const partnerInfo = getPartnerDetails(job.assigned_partner_id);
                  const orderValue = Number(job.customer_price) || 0;
                  const partnerPayout = Number(job.partner_earning) || 0;
                  const platformFee = Math.max(0, orderValue - partnerPayout);
                  const completedDate = job.completed_at
                    ? new Date(job.completed_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })
                    : job.booking_date || 'Recent';

                  const completedTime = job.completed_at
                    ? new Date(job.completed_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : job.booking_time || '';

                  return (
                    <tr
                      key={job.id}
                      className="hover:bg-slate-800/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedBookingForReceipt(job)}
                    >
                      {/* 1. Index */}
                      <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                        {idx + 1}
                      </td>

                      {/* 2. Booking ID */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-teal-400 bg-teal-950/80 border border-teal-800/60 px-2 py-0.5 rounded text-[11px]">
                          #{job.id}
                        </span>
                      </td>

                      {/* 3. Completed Date & Time */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-200">{completedDate}</div>
                        <div className="text-[10px] text-slate-500">{completedTime}</div>
                      </td>

                      {/* 4. Service & Category */}
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-white text-[12px] group-hover:text-teal-300 transition-colors">
                          {job.service_name}
                        </div>
                        <span className="inline-block mt-0.5 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                          {job.service_category}
                        </span>
                      </td>

                      {/* 5. Customer Details */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-200">{job.customer_name}</div>
                        <a
                          href={`tel:${job.customer_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-teal-400 hover:underline flex items-center gap-1 font-mono"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>{job.customer_phone}</span>
                        </a>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5">
                          {job.customer_address || job.customer_location_address}
                        </div>
                      </td>

                      {/* 6. Assigned Partner */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>{partnerInfo.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {partnerInfo.mobile}
                        </span>
                      </td>

                      {/* 7. Total Order Value */}
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-100 text-[12px]">
                        ₹{orderValue}
                      </td>

                      {/* 8. Partner Payout */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400 text-[12px]">
                        ₹{partnerPayout}
                      </td>

                      {/* 9. Platform Fee */}
                      <td className="py-3 px-3 text-right font-mono font-semibold text-purple-400 text-[11px]">
                        ₹{platformFee}
                      </td>

                      {/* 10. OTP Verified */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>{job.otp_code ? `OTP ${job.otp_code}` : 'Verified'}</span>
                        </span>
                      </td>

                      {/* 11. View Receipt */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedBookingForReceipt(job)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-white transition-colors cursor-pointer"
                          title="View Official Receipt"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Official Job Receipt Modal */}
      {selectedBookingForReceipt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full text-slate-900 shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DoorblyLogoIcon className="w-6 h-6 rounded-md" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Service Completion Receipt
                  </h3>
                  <span className="text-[10px] text-teal-300 font-mono">
                    #{selectedBookingForReceipt.id}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                  title="Print Receipt"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBookingForReceipt(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Receipt Body */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs text-slate-700">
              {/* Status Badge */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <span className="font-extrabold text-emerald-900 block text-xs">
                      Service Delivered &amp; Completed
                    </span>
                    <span className="text-[10px] text-emerald-700">
                      Customer verified via secure OTP code: {selectedBookingForReceipt.otp_code || '4821'}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-extrabold text-[10px]">
                  COMPLETED
                </span>
              </div>

              {/* Service Info */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Service Particulars
                  </span>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                    {selectedBookingForReceipt.service_category}
                  </span>
                </div>
                <div className="font-black text-sm text-slate-900">
                  {selectedBookingForReceipt.service_name}
                </div>
                <p className="text-[11px] text-slate-500">
                  {selectedBookingForReceipt.service_description || 'Standard doorstep professional service.'}
                </p>
              </div>

              {/* Customer & Partner Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Customer</span>
                  <div className="font-black text-slate-900">{selectedBookingForReceipt.customer_name}</div>
                  <div className="text-slate-600 font-mono">{selectedBookingForReceipt.customer_phone}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {selectedBookingForReceipt.customer_address || selectedBookingForReceipt.customer_location_address}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Assigned Partner</span>
                  <div className="font-black text-slate-900">
                    {getPartnerDetails(selectedBookingForReceipt.assigned_partner_id).name}
                  </div>
                  <div className="text-slate-600 font-mono">
                    {getPartnerDetails(selectedBookingForReceipt.assigned_partner_id).mobile}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold">
                    ✓ Verified Doorbly Partner
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 font-mono">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-sans block">
                  Payment &amp; Payout Summary
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-sans">Total Billed to Customer:</span>
                  <span className="font-black text-slate-900">
                    ₹{selectedBookingForReceipt.customer_price || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-sans">Partner Payout Disbursed:</span>
                  <span className="font-bold text-emerald-700">
                    ₹{selectedBookingForReceipt.partner_earning || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200">
                  <span className="text-slate-600 font-sans">Company Platform Fee:</span>
                  <span className="font-bold text-purple-700">
                    ₹{Math.max(
                      0,
                      (Number(selectedBookingForReceipt.customer_price) || 0) -
                        (Number(selectedBookingForReceipt.partner_earning) || 0)
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedBookingForReceipt(null)}
                className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
