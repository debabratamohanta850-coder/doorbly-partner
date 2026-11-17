import React, { useState, useEffect } from 'react';
import { usePartner } from '../../context/PartnerContext';
import {
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Plus,
  FileText,
  Loader2,
  Check,
  X,
  Wallet,
  Banknote,
  CreditCard,
  Smartphone,
  CalendarClock,
  Receipt
} from 'lucide-react';
import { locationService } from '../../services/locationService';
import { DEFAULT_DOORBLY_SERVICES } from '../../services/catalogueService';
import { CollectionPaymentMethod, CustomerConfirmationMode } from '../../types';

const toLocalDatetimeInputValue = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ActiveJobView: React.FC = () => {
  const {
    activeJob,
    updateActiveJobStatus,
    completeJobWithCollection,
    setActiveTab,
    activeSubscription,
    subscriptionPlans
  } = usePartner();

  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [collectionMethod, setCollectionMethod] = useState<CollectionPaymentMethod>('cash');
  const [actualCollectedInput, setActualCollectedInput] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [collectedAtInput, setCollectedAtInput] = useState<string>(() => toLocalDatetimeInputValue());
  const [confirmationMode, setConfirmationMode] = useState<CustomerConfirmationMode>('otp');
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  const [collectionError, setCollectionError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live timer for IN_PROGRESS
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'IN_PROGRESS') {
      setElapsedSeconds(0);
      return;
    }

    const startTime = activeJob.started_at
      ? new Date(activeJob.started_at).getTime()
      : Date.now();

    const updateElapsed = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status, activeJob?.started_at]);

  if (!activeJob) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
          <Clock className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-slate-800 text-base">No Active Job</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          When you accept a service request, your active doorstep journey will appear here.
        </p>
        <button
          onClick={() => setActiveTab('home')}
          className="mt-4 px-4 py-2 bg-[#0F766E] text-white rounded-xl text-xs font-bold"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    if (hrs > 0) {
      return `${hrs}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
    }
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const navigationUrl = locationService.getBookingNavigationUrl(activeJob);
  const customerLat = activeJob.customer_latitude ?? activeJob.latitude;
  const customerLng = activeJob.customer_longitude ?? activeJob.longitude;
  const hasCoordinates =
    typeof customerLat === 'number' &&
    typeof customerLng === 'number' &&
    Number.isFinite(customerLat) &&
    Number.isFinite(customerLng) &&
    (customerLat !== 0 || customerLng !== 0);

  // Deterministic seed from coordinates for simplified SVG street layout
  const latSeed = hasCoordinates ? Math.abs(Math.round(customerLat * 1000)) % 40 : 18;
  const lngSeed = hasCoordinates ? Math.abs(Math.round(customerLng * 1000)) % 40 : 24;

  const handleNavigate = () => {
    locationService.captureAndOpenGoogleMaps(activeJob);
  };

  const handleCall = () => {
    window.location.href = `tel:${activeJob.customer_phone}`;
  };

  const handleMessage = () => {
    window.location.href = `sms:${activeJob.customer_phone}?body=Hello, this is your Doorbly Partner for booking #${activeJob.id.substring(0, 8)}.`;
  };

  const handleArrived = async () => {
    setIsProcessing(true);
    try {
      await updateActiveJobStatus('ARRIVED');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput || otpInput.trim().length !== 4) {
      setOtpError('Please enter the 4-digit start OTP provided by the customer.');
      return;
    }

    // Verify OTP against booking's otp_code or fallback
    if (activeJob.otp_code && otpInput.trim() !== activeJob.otp_code) {
      setOtpError(`Incorrect OTP. Please ask customer for correct 4-digit code.`);
      return;
    }

    setIsProcessing(true);
    try {
      const ok = await updateActiveJobStatus('IN_PROGRESS', { otp: otpInput.trim() });
      if (ok) {
        setShowOtpModal(false);
        setOtpError('');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const isSubActiveAndValid =
    activeSubscription?.status === 'active' &&
    (!activeSubscription.expires_at ||
      new Date(activeSubscription.expires_at).getTime() >= Date.now());
  const activePlanDef = isSubActiveAndValid
    ? subscriptionPlans.find(
        (p) => p.id === activeSubscription.plan_id || p.plan_code === activeSubscription.plan_code
      )
    : undefined;
  const starterPlanDef = subscriptionPlans.find((p) => p.plan_code === 'starter');
  const liveCommRate = isSubActiveAndValid
    ? activePlanDef?.commission_percent ?? activeSubscription.commission_percent
    : starterPlanDef?.commission_percent ?? 20;
  const livePlanName = isSubActiveAndValid
    ? activePlanDef?.plan_name ?? activeSubscription.plan_name
    : `${starterPlanDef?.plan_name ?? 'Starter'} (Fallback)`;
  const liveEstimatedAmt = Math.max(0, Number(activeJob.estimated_price ?? activeJob.customer_price) || 0);
  const activeCollectionAmt = showCompleteModal
    ? Math.max(0, Number(actualCollectedInput) || 0)
    : liveEstimatedAmt;
  const liveCommAmt = Math.round(((activeCollectionAmt * liveCommRate) / 100) * 100) / 100;
  const livePartnerAmt = Math.round((activeCollectionAmt - liveCommAmt) * 100) / 100;

  const openCollectionModal = () => {
    setActualCollectedInput(liveEstimatedAmt > 0 ? String(liveEstimatedAmt) : '');
    setCollectionMethod('cash');
    setPaymentReference('');
    setCollectedAtInput(toLocalDatetimeInputValue());
    setConfirmationMode(activeJob.otp_code ? 'otp' : 'receipt');
    setConfirmationCode('');
    setCollectionError('');
    setShowCompleteModal(true);
  };

  const handleCompleteServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollectionError('');

    const parsedAmt = Math.round((Number(actualCollectedInput) || 0) * 100) / 100;
    if (parsedAmt <= 0) {
      setCollectionError('Please enter the actual amount collected from the customer (must be greater than ₹0).');
      return;
    }
    if (collectionMethod !== 'cash' && paymentReference.trim().length < 6) {
      setCollectionError('Please enter a valid 6+ character UPI / payment transaction reference.');
      return;
    }
    if (confirmationMode === 'otp' && !confirmationCode.trim()) {
      setCollectionError('Please enter the customer booking OTP to confirm payment collection.');
      return;
    }
    if (confirmationMode === 'receipt' && !confirmationCode.trim()) {
      setCollectionError('Please enter the receipt number / customer confirmation reference.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await completeJobWithCollection({
        actualAmount: parsedAmt,
        paymentMethod: collectionMethod,
        paymentReference: paymentReference.trim() || undefined,
        collectedAt: collectedAtInput ? new Date(collectedAtInput).toISOString() : new Date().toISOString(),
        confirmationMode,
        confirmationCode: confirmationCode.trim(),
        notes: newNote.trim() || undefined
      });
      if (res.success) {
        setShowCompleteModal(false);
        setActiveTab('wallet');
      } else {
        setCollectionError(res.message || 'Could not confirm customer collection.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setIsProcessing(true);
    try {
      await updateActiveJobStatus(activeJob.status, { notes: newNote.trim() });
      setNewNote('');
      setShowNoteModal(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Top Banner Status */}
      <div className="bg-[#0F766E] text-white p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-teal-100 font-semibold mb-1">
          <span className="uppercase tracking-wider">ACTIVE SERVICE STEP</span>
          <span className="font-mono">#{activeJob.id.substring(0, 8)}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black text-white leading-tight">
              {activeJob.status === 'ASSIGNED' && 'En Route to Doorstep'}
              {activeJob.status === 'ARRIVED' && 'Arrived at Location'}
              {activeJob.status === 'IN_PROGRESS' && 'Service in Progress'}
            </h2>
            <p className="text-xs text-teal-100 mt-0.5">
              {activeJob.status === 'ASSIGNED' && 'Head toward the customer location & tap arrived.'}
              {activeJob.status === 'ARRIVED' && 'Ask customer for Start OTP to commence work.'}
              {activeJob.status === 'IN_PROGRESS' && `Service timer: ${formatTimer(elapsedSeconds)}`}
            </p>
          </div>

          {activeJob.status === 'IN_PROGRESS' && (
            <div className="bg-black/30 backdrop-blur-xs px-3 py-1.5 rounded-xl font-mono text-sm font-bold text-amber-300 whitespace-nowrap shrink-0 tabular-nums">
              {formatTimer(elapsedSeconds)}
            </div>
          )}
        </div>
      </div>

      {/* Service Booking Order Card (Light Blue) */}
      <div className="bg-gradient-to-br from-sky-50 via-sky-100/85 to-sky-50 rounded-2xl p-4 border border-sky-200 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-3 border-b border-sky-200/80 pb-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sky-900 uppercase tracking-wider text-[11px] truncate">
              Service Booking Order #{activeJob.id.substring(0, 8)}
            </div>
            <div className="text-sm text-slate-900 mt-0.5 break-words">
              {activeJob.service_name}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCall}
              aria-label="Call Customer"
              className="p-2.5 rounded-xl bg-white text-[#0F766E] border border-sky-200 hover:bg-sky-100 active:scale-95 transition-all cursor-pointer"
            >
              <Phone className="w-4 h-4" />
            </button>
            <button
              onClick={handleMessage}
              aria-label="Message Customer"
              className="p-2.5 rounded-xl bg-white text-slate-700 border border-sky-200 hover:bg-sky-100 active:scale-95 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Required Fields: Booking Amount, Work Details, Customer Name, Contact Number, GPS Location */}
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600">Booking Amount:</span>
            <span className="text-slate-900 text-sm tabular-nums">
              ₹{activeJob.customer_price}{' '}
              <span className="text-[11px] text-[#0F766E]">(Earning: ₹{activeJob.partner_earning})</span>
            </span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <span className="text-slate-600 shrink-0">Work Details:</span>
            <span className="text-slate-900 text-right min-w-0 break-words">
              {activeJob.service_name}
              {activeJob.service_description
                ? ` — ${activeJob.service_description}`
                : ` (${activeJob.service_category})`}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600">Customer Name:</span>
            <span className="text-slate-900 truncate max-w-full">{activeJob.customer_name}</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600">Contact Number:</span>
            <span className="text-slate-900 font-mono">{activeJob.customer_phone}</span>
          </div>
        </div>

        {/* GPS Location & Direct Google Maps Navigation */}
        <div className="pt-2.5 border-t border-sky-200/80 space-y-3">
          <div className="text-xs text-slate-700">
            <div className="text-sky-800 text-[11px]">📍 GPS Location</div>
            <p className="text-slate-900 text-sm leading-snug mt-0.5">
              {locationService.getBookingGpsLocationText(activeJob)}
            </p>
            {activeJob.distance_km && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                Approx {activeJob.distance_km} km away
              </p>
            )}
          </div>

          {/* Static SVG Map Preview (Zero external APIs or SDKs) */}
          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleNavigate}
            aria-label="Open customer location in Google Maps"
            className="block relative w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group"
          >
            <svg
              viewBox="0 0 400 160"
              className="w-full h-full object-cover"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Simplified static map preview of customer coordinates"
            >
              {/* Base Map Land Background */}
              <rect width="400" height="160" fill="#F1F5F9" />

              {/* Green Park / Sector Zones */}
              <rect x={12 + (latSeed % 20)} y="10" width="85" height="52" rx="8" fill="#DCFCE7" opacity="0.75" />
              <rect x={270 - (lngSeed % 25)} y="92" width="110" height="56" rx="8" fill="#DCFCE7" opacity="0.7" />
              <rect x="145" y="18" width="75" height="40" rx="6" fill="#E2E8F0" opacity="0.8" />
              <rect x="40" y="96" width="95" height="48" rx="6" fill="#E2E8F0" opacity="0.8" />

              {/* Water Canal / River Accent */}
              <path
                d={`M 0 ${135 - (latSeed % 15)} Q 140 ${110 + (lngSeed % 15)}, 260 145 T 400 125`}
                fill="none"
                stroke="#BAE6FD"
                strokeWidth="12"
                strokeLinecap="round"
              />

              {/* Minor Local Grid Streets */}
              <g stroke="#FFFFFF" strokeWidth="4">
                <line x1="0" y1={38 + (latSeed % 10)} x2="400" y2={38 + (latSeed % 10)} />
                <line x1="0" y1={115 - (lngSeed % 10)} x2="400" y2={115 - (lngSeed % 10)} />
                <line x1={75 + (latSeed % 15)} y1="0" x2={75 + (latSeed % 15)} y2="160" />
                <line x1={165 + (lngSeed % 15)} y1="0" x2={165 + (lngSeed % 15)} y2="160" />
                <line x1={315 - (latSeed % 15)} y1="0" x2={315 - (latSeed % 15)} y2="160" />
              </g>

              {/* Major Arterial Roads */}
              <path
                d={`M 0 ${78 + (latSeed % 12)} L 400 ${72 - (lngSeed % 12)}`}
                stroke="#FDE68A"
                strokeWidth="7"
              />
              <path
                d={`M ${235 + (lngSeed % 14)} 0 L ${215 - (latSeed % 14)} 160`}
                stroke="#FFFFFF"
                strokeWidth="6"
              />

              {/* Dashed Navigation Route Path from Partner to Customer */}
              <path
                d={`M 68 122 Q 145 ${78 + (latSeed % 12)}, 225 ${75 - (lngSeed % 8)} T 292 54`}
                fill="none"
                stroke="#0F766E"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                strokeLinecap="round"
              />

              {/* Partner Starting Point Dot */}
              <circle cx="68" cy="122" r="6" fill="#0F766E" stroke="#FFFFFF" strokeWidth="2" />

              {/* Customer Destination Pulse & Pin */}
              <circle cx="292" cy="54" r="16" fill="#0F766E" opacity="0.18" />
              <circle cx="292" cy="54" r="8" fill="#0F766E" stroke="#FFFFFF" strokeWidth="2.5" />
              <circle cx="292" cy="54" r="3" fill="#FFFFFF" />
            </svg>

            {/* Top-Left Live Coordinate Badge */}
            <div className="absolute top-2 left-2 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-200/90 text-[10px] font-mono text-slate-700 shadow-2xs">
              {hasCoordinates
                ? `${customerLat.toFixed(4)}° N, ${customerLng.toFixed(4)}° E`
                : 'Saved Address Destination'}
            </div>

            {/* Bottom-Right Map Preview Hint */}
            <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 group-hover:bg-[#0F766E] transition-colors">
              <MapPin className="w-3 h-3 text-teal-300" />
              <span>Tap to open Google Maps</span>
            </div>
          </a>

          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              const lat = activeJob.customer_latitude ?? activeJob.latitude;
              const lng = activeJob.customer_longitude ?? activeJob.longitude;
              const addr = activeJob.customer_address || activeJob.customer_location_address || '';
              const captured = lat && lng ? `${lat},${lng}` : addr;
              if (captured && navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(captured).catch(() => {});
              }
            }}
            className="w-full py-3 px-4 bg-[#0F766E] hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <span>🗺 Go to Location</span>
          </a>
        </div>
      </div>

      {/* Booked Service & Earnings Details */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Service Booked
          </span>
          <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md">
            {activeJob.service_category}
          </span>
        </div>

        <div>
          <h4 className="font-extrabold text-slate-900 text-base">
            {activeJob.service_name}
          </h4>
          {activeJob.service_description && (
            <p className="text-xs text-slate-500 mt-1">
              {activeJob.service_description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">
              Estimated Duration
            </span>
            <span className="font-bold text-slate-800">
              {activeJob.estimated_duration || '1 Hour'}
            </span>
          </div>

          <div className="bg-teal-50/70 p-2.5 rounded-xl">
            <span className="text-[10px] uppercase text-teal-700 font-semibold block">
              Your Earning
            </span>
            <span className="font-extrabold text-base text-slate-900 flex items-baseline">
              <span className="text-xs mr-0.5 font-bold">₹</span>
              {activeJob.partner_earning}
            </span>
          </div>
        </div>
      </div>

      {/* Work Notes / Action Log if available */}
      {activeJob.work_notes && activeJob.work_notes.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">
            Work Notes Log
          </h4>
          <div className="space-y-1.5 text-xs text-slate-700">
            {activeJob.work_notes.map((note, idx) => (
              <div key={idx} className="p-2 bg-slate-50 rounded-lg flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-Progress Quick Tool Buttons */}
      {activeJob.status === 'IN_PROGRESS' && (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setShowNoteModal(true)}
            className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <FileText className="w-4 h-4 text-teal-700" />
            <span>Add Note</span>
          </button>

          <button
            onClick={() => setShowAddServiceModal(true)}
            className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <Plus className="w-4 h-4 text-teal-700" />
            <span>Add Service</span>
          </button>

          <button
            onClick={() => setActiveTab('support')}
            className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Report Issue</span>
          </button>
        </div>
      )}

      {/* Primary Lifecycle Step Action Button */}
      <div className="sticky bottom-16 z-20 pt-2">
        {activeJob.status === 'ASSIGNED' && (
          <button
            onClick={handleArrived}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-[#0F766E] hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-base rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <MapPin className="w-5 h-5 text-amber-300" />
                <span>I'VE ARRIVED AT DOORSTEP</span>
              </>
            )}
          </button>
        )}

        {activeJob.status === 'ARRIVED' && (
          <button
            onClick={() => {
              setOtpInput(activeJob.otp_code || '');
              setShowOtpModal(true);
            }}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-[#0F766E] hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-base rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <ShieldCheck className="w-5 h-5 text-amber-300" />
            <span>ENTER CUSTOMER OTP & START</span>
          </button>
        )}

        {activeJob.status === 'IN_PROGRESS' && (
          <button
            onClick={openCollectionModal}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-base rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span>COLLECT PAYMENT &amp; COMPLETE</span>
          </button>
        )}
      </div>

      {/* Customer OTP Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-slate-900">
                Customer Start PIN
              </h3>
              <button
                onClick={() => setShowOtpModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Ask the customer for the 4-digit verification code shown on their Doorbly app.
            </p>

            <form onSubmit={handleStartServiceSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={4}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • •"
                  className="w-full text-center text-3xl font-mono tracking-widest py-3 border-2 border-slate-300 rounded-2xl focus:border-[#0F766E] focus:outline-hidden font-bold"
                  autoFocus
                />
                {otpError && (
                  <p className="text-xs text-rose-600 mt-1.5 font-medium">{otpError}</p>
                )}
                {activeJob.otp_code && (
                  <p className="text-[11px] text-teal-700 bg-teal-50 p-2 rounded-lg mt-2 font-mono">
                    Customer OTP is: <strong>{activeJob.otp_code}</strong>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="flex-1 py-3 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || otpInput.length < 4}
                  className="flex-1 py-3 bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50"
                >
                  {isProcessing ? 'Verifying...' : 'Start Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Payment Collection & Commission Deduction Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
          <form
            onSubmit={handleCompleteServiceSubmit}
            className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#0F766E] block">
                  CUSTOMER PAYMENT COLLECTION
                </span>
                <h3 className="font-extrabold text-base text-slate-900">
                  Confirm Actual Collection &amp; Complete
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Estimate vs Actual Amount Input */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Booking Estimate</span>
                <span className="font-mono font-bold text-slate-700">₹{liveEstimatedAmt.toFixed(2)}</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Actual Amount Collected from Customer (₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={actualCollectedInput}
                  onChange={(e) => setActualCollectedInput(e.target.value)}
                  placeholder="Enter exact amount collected"
                  className="w-full text-lg font-black font-mono p-2.5 bg-white border-2 border-[#0F766E]/40 rounded-xl focus:border-[#0F766E] focus:outline-hidden text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Doorbly calculates commission on actual customer collection — do not rely on estimate if scope changed.
                </p>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Collection Payment Method *
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setCollectionMethod('cash')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                    collectionMethod === 'cash'
                      ? 'border-[#0F766E] bg-teal-50/80 ring-1 ring-[#0F766E]'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-900">
                    <Banknote className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>Cash</span>
                  </div>
                  <span className="text-[9px] text-slate-500">Direct cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCollectionMethod('upi')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                    collectionMethod === 'upi'
                      ? 'border-[#0F766E] bg-teal-50/80 ring-1 ring-[#0F766E]'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-900">
                    <Smartphone className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>UPI</span>
                  </div>
                  <span className="text-[9px] text-slate-500">UTR / Ref req.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCollectionMethod('other_approved')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                    collectionMethod === 'other_approved'
                      ? 'border-[#0F766E] bg-teal-50/80 ring-1 ring-[#0F766E]'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-900">
                    <CreditCard className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>Card / Other</span>
                  </div>
                  <span className="text-[9px] text-slate-500">Approved mode</span>
                </button>
              </div>
            </div>

            {/* Transaction Reference + Collection Date/Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Payment Reference {collectionMethod !== 'cash' ? '*' : '(Optional)'}
                </label>
                <input
                  type="text"
                  required={collectionMethod !== 'cash'}
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder={collectionMethod === 'cash' ? 'Optional Cash Slip #' : '12-digit UPI UTR / Ref'}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1">
                  <CalendarClock className="w-3 h-3 text-[#0F766E]" />
                  <span>Collection Date &amp; Time *</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={collectedAtInput}
                  onChange={(e) => setCollectedAtInput(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Customer Confirmation Mode (OTP or Receipt Confirmation) */}
            <div className="p-3 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-sky-950">Customer Confirmation *</span>
                <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-sky-200 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmationMode('otp');
                      setConfirmationCode('');
                    }}
                    className={`px-2 py-1 rounded-md cursor-pointer ${
                      confirmationMode === 'otp' ? 'bg-[#0F766E] text-white' : 'text-slate-600'
                    }`}
                  >
                    Booking OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmationMode('receipt');
                      setConfirmationCode(`RCPT-${activeJob.id.substring(0, 6).toUpperCase()}`);
                    }}
                    className={`px-2 py-1 rounded-md cursor-pointer ${
                      confirmationMode === 'receipt' ? 'bg-[#0F766E] text-white' : 'text-slate-600'
                    }`}
                  >
                    Receipt
                  </button>
                </div>
              </div>

              {confirmationMode === 'otp' ? (
                <div>
                  <input
                    type="text"
                    maxLength={6}
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value.replace(/\s+/g, ''))}
                    placeholder="Enter customer booking OTP (e.g. 4-digit code)"
                    className="w-full text-xs font-mono font-bold p-2.5 bg-white border border-sky-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
                  />
                  {activeJob.otp_code && (
                    <p className="text-[10px] text-sky-800 mt-1">
                      Booking completion OTP on file: <strong className="font-mono">{activeJob.otp_code}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-sky-700 shrink-0" />
                  <input
                    type="text"
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    placeholder="Customer signed receipt # or acknowledgment ID"
                    className="w-full text-xs font-mono p-2.5 bg-white border border-sky-300 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
                  />
                </div>
              )}
            </div>

            {/* Live Commission Deduction & Wallet Ledger Breakdown */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 rounded-2xl p-3.5 border border-emerald-200 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-700">
                <span>Actual Customer Collection</span>
                <span className="font-bold text-slate-900 font-mono">₹{activeCollectionAmt.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1">
                  <span>Doorbly Commission ({livePlanName})</span>
                  <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">
                    {liveCommRate}%
                  </span>
                </span>
                <span className="font-bold text-amber-700 font-mono">-₹{liveCommAmt.toFixed(2)}</span>
              </div>
              <div className="border-t border-emerald-200/80 pt-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-emerald-950 block">Partner Net Earnings</span>
                  <span className="text-[10px] text-emerald-700">
                    Credited to wallet ledger; ₹{liveCommAmt.toFixed(2)} recorded as commission payable
                  </span>
                </div>
                <span className="text-lg font-black text-emerald-900 font-mono shrink-0">
                  ₹{livePartnerAmt.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Optional Completion / Service Note
              </label>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Work completed & customer confirmed payment..."
                rows={2}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
              />
            </div>

            {collectionError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {collectionError}
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 py-3 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="flex-1 py-3 bg-[#0F766E] hover:bg-teal-700 active:scale-[0.99] text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Confirm Collection</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Add Work Note</h3>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. Copper pipe cleaned, gas pressure tested at 130 PSI"
              rows={3}
              className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:border-[#0F766E] focus:outline-hidden"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNoteModal(false)}
                className="flex-1 py-2.5 text-xs text-slate-600 border border-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim() || isProcessing}
                className="flex-1 py-2.5 text-xs bg-[#0F766E] text-white font-bold rounded-xl disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Additional Service Modal */}
      {showAddServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">
                Catalogue Add-on Services
              </h3>
              <button
                onClick={() => setShowAddServiceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Only standard Doorbly catalogue services may be added with customer agreement:
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2 divide-y divide-slate-100">
              {DEFAULT_DOORBLY_SERVICES.slice(0, 5).map((srv) => (
                <div key={srv.id} className="pt-2 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-800">{srv.name}</div>
                    <div className="text-slate-500 text-[11px]">Price: ₹{srv.base_customer_price} · Earn: ₹{srv.base_partner_earning}</div>
                  </div>
                  <button
                    onClick={async () => {
                      await updateActiveJobStatus(activeJob.status, {
                        notes: `Add-on service added: ${srv.name} (₹${srv.base_customer_price})`
                      });
                      setShowAddServiceModal(false);
                    }}
                    className="py-1 px-2.5 bg-teal-50 text-[#0F766E] font-bold rounded-lg text-xs hover:bg-teal-100 cursor-pointer"
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
