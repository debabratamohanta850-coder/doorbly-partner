import React, { useState } from 'react';
import { usePartner } from '../../context/PartnerContext';
import { DoorblyLogoIcon } from '../../constants/branding';
import { Bell, ShieldAlert, Menu, Power, Loader2 } from 'lucide-react';

interface PartnerHeaderProps {
  onOpenMenu: () => void;
}

export const PartnerHeader: React.FC<PartnerHeaderProps> = ({ onOpenMenu }) => {
  const {
    partner,
    isOnline,
    toggleOnline,
    unreadNotificationCount,
    activeTab,
    setActiveTab,
    isAdminUnlocked,
    setViewMode
  } = usePartner();

  const [isUpdating, setIsUpdating] = useState(false);
  const [idAlertMessage, setIdAlertMessage] = useState<string | null>(null);

  const handleToggle = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const res = await toggleOnline();
      if (!res.success && !res.message.toLowerCase().includes('verification required')) {
        setIdAlertMessage(res.message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const navItems = [
    { tab: 'home' as const, label: 'Dashboard' },
    { tab: 'jobs' as const, label: 'My Jobs' },
    { tab: 'wallet' as const, label: 'Wallet' },
    { tab: 'earnings' as const, label: 'Earnings' },
    { tab: 'membership' as const, label: 'Membership' },
    { tab: 'documents' as const, label: 'KYC Docs' },
    { tab: 'guidelines' as const, label: 'Guidelines' },
    { tab: 'support' as const, label: 'Support' }
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#0F766E] text-white shadow-md safe-top w-full">
      <div className="w-full max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 flex items-center justify-between py-2 sm:py-3 gap-2 sm:gap-4">
        {/* Brand Zone (Wordmark, Logo & Mobile/Tablet Menu) */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0">
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="p-2 -ml-1 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>

          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2 cursor-pointer select-none min-w-0"
          >
            <DoorblyLogoIcon className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg shrink-0 shadow-xs" />
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-sm sm:text-base tracking-tight leading-none text-white whitespace-nowrap">
                DOORBLY
              </span>
              <span className="hidden min-[360px]:block text-[9px] uppercase tracking-wider text-teal-200 leading-none mt-0.5 whitespace-nowrap">
                Partner Network
              </span>
            </div>
          </div>
        </div>

        {/* Responsive Desktop Navigation Bar */}
        <nav className="hidden lg:flex flex-1 min-w-0 items-center justify-center gap-1 xl:gap-1.5 overflow-x-auto no-scrollbar py-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => setActiveTab(item.tab)}
                className={`py-1.5 px-2.5 xl:px-3 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-white text-[#0F766E] shadow-xs font-bold'
                    : 'text-teal-100 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
              </button>
            );
          })}

          {isAdminUnlocked && (
            <button
              onClick={() => setViewMode('admin')}
              className="py-1.5 px-2.5 xl:px-3 rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ml-1"
            >
              <span>Admin Console</span>
            </button>
          )}
        </nav>

        {/* Right Action Zone: Online/Offline Switch + Notification Bell + Partner Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Online / Offline Switch Button */}
          <button
            onClick={handleToggle}
            disabled={isUpdating}
            role="switch"
            aria-checked={isOnline}
            aria-label={isOnline ? 'Go Offline' : 'Go Online'}
            className={`relative w-[92px] sm:w-28 h-8 rounded-full p-1 transition-all duration-300 flex items-center select-none shadow-xs border cursor-pointer shrink-0 ${
              isOnline
                ? 'bg-emerald-100 border-emerald-300/90 text-emerald-950'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span
              className={`absolute left-2 sm:left-2.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
                isOnline ? 'opacity-100 translate-x-0 text-emerald-900' : 'opacity-0 -translate-x-1'
              }`}
            >
              ONLINE
            </span>

            <span
              className={`absolute right-2 sm:right-2.5 text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider transition-all duration-200 ${
                isOnline ? 'opacity-0 translate-x-1' : 'opacity-100 translate-x-0 text-slate-600'
              }`}
            >
              OFFLINE
            </span>

            <div
              className={`w-6 h-6 rounded-full shadow-md flex items-center justify-center transition-transform duration-300 ease-out transform ${
                isOnline
                  ? 'translate-x-[58px] sm:translate-x-[76px] bg-emerald-600 text-white'
                  : 'translate-x-0 bg-slate-800 text-white'
              }`}
            >
              {isUpdating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <Power className="w-3.5 h-3.5 stroke-[3] text-white" />
              )}
            </div>
          </button>

          {/* Bell Icon */}
          <button
            onClick={() => setActiveTab('notifications')}
            aria-label="Notifications"
            className="relative p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-2 right-2 w-4 h-4 bg-amber-400 text-slate-950 font-bold text-[9px] rounded-full flex items-center justify-center shadow-xs">
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>

          {/* Desktop Partner Chip */}
          {partner && (
            <button
              onClick={() => setActiveTab('profile')}
              aria-label="Partner Profile"
              className="hidden xl:flex items-center gap-2 py-1 px-2.5 rounded-xl bg-teal-800/80 hover:bg-teal-800 text-white border border-teal-600/40 transition-colors cursor-pointer shrink-0"
            >
              <div className="w-6 h-6 rounded-lg bg-teal-700 flex items-center justify-center text-xs font-bold text-teal-100">
                {partner.name?.charAt(0) || 'P'}
              </div>
              <span className="text-xs font-medium max-w-[100px] truncate">{partner.name}</span>
            </button>
          )}
        </div>
      </div>

      {/* ID Verification Failure Modal */}
      {idAlertMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full text-slate-900 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="font-normal text-base text-slate-900">
                Only Approved Partners Can Go Online
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {idAlertMessage}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between text-slate-500">
                <span>Partner ID:</span>
                <span className="font-mono text-slate-800">{partner?.id || 'Unknown'}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Approval Status:</span>
                <span className="capitalize text-amber-600">
                  {partner?.status?.replace('_', ' ') || 'Pending Verification'}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  setIdAlertMessage(null);
                  setActiveTab('documents');
                }}
                className="w-full py-3 px-4 bg-[#0F766E] hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Submit Documents & Complete Registration
              </button>

              <button
                onClick={() => setIdAlertMessage(null)}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
