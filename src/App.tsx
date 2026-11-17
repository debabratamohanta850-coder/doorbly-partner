import React, { Suspense, lazy, useState } from 'react';
import { PartnerProvider, usePartner } from './context/PartnerContext';
import { PartnerHeader } from './components/layout/PartnerHeader';
import { BottomNav } from './components/layout/BottomNav';
import { HomeDashboard } from './components/home/HomeDashboard';
import { PWAInstallBanner } from './components/layout/PWAInstallBanner';
import { DoorblyLogoIcon } from './constants/branding';
import { testFirestoreConnection } from './services/firebase';
import { partnerAuthService } from './services/partnerAuth';
import { locationService } from './services/locationService';
import { AlertCircle, CheckCircle2, Info, Maximize2, Phone, MessageSquare, X } from 'lucide-react';
import { ProcessingLoader } from './components/common/ProcessingLoader';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { GoOnlineVerificationModal } from './components/layout/GoOnlineVerificationModal';
import { AuthScreen } from './components/auth/AuthScreen';
import { DrawerMenu } from './components/layout/DrawerMenu';
import { IncomingJobModal } from './components/home/IncomingJobModal';
import { ActiveJobView } from './components/jobs/ActiveJobView';
import { MyJobsList } from './components/jobs/MyJobsList';
import { WalletDashboard } from './components/wallet/WalletDashboard';
import { EarningsView } from './components/earnings/EarningsView';
import { MembershipView } from './components/membership/MembershipView';
import { ServiceSelectionView } from './components/profile/ServiceSelectionView';
import { KYCDocumentsView } from './components/profile/KYCDocumentsView';
import { ProfileView } from './components/profile/ProfileView';
import { NotificationCenter } from './components/notifications/NotificationCenter';
import { SupportView } from './components/support/SupportView';
import { PartnerGuidelinesView } from './components/support/PartnerGuidelinesView';
import { SettingsView } from './components/settings/SettingsView';

const AdminConsole = lazy(() =>
  import('./components/admin/AdminConsole').then((module) => ({
    default: module.AdminConsole
  }))
);

// Validate Firestore connection on boot per Firebase skill guidelines
testFirestoreConnection().catch(() => {});

const MainAppContent: React.FC = () => {
  const {
    partner,
    isOnline,
    isLoading,
    isSupabaseSyncing,
    activeTab,
    activeJob,
    incomingRequest,
    isAdminUnlocked,
    viewMode,
    setViewMode,
    lockAdmin,
    logout,
    actionNotice,
    dismissNotice
  } = usePartner();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMinimised, setIsMinimised] = useState(false);

  if (isLoading) {
    return (
      <ProcessingLoader
        variant="fullscreen"
        label="Processing & syncing data from Supabase..."
        subLabel="Preparing your live partner workspace"
      />
    );
  }

  if (!partner) {
    return (
      <div className="min-h-screen flex flex-col">
        <PWAInstallBanner />
        <div className="flex-1">
          <AuthScreen />
        </div>
      </div>
    );
  }

  // Only render AdminConsole if current signed-in user is verified as an Admin
  if (
    isAdminUnlocked &&
    partnerAuthService.isAuthorizedAdmin(partnerAuthService.getStoredUser()) &&
    viewMode === 'admin'
  ) {
    return (
      <Suspense
        fallback={
          <ProcessingLoader
            variant="fullscreen"
            label="Loading Admin Console..."
            subLabel="Connecting live fleet telemetry & records"
          />
        }
      >
        <AdminConsole
          onSwitchToPartnerView={() => setViewMode('partner')}
          onLogoutAdmin={() => lockAdmin()}
          onFullLogout={logout}
        />
      </Suspense>
    );
  }

  // Real-time Minimised Mode: allows partner to quickly make a call or switch to another app while radar runs in background
  if (isMinimised) {
    const callNumber = activeJob?.customer_phone || '';
    return (
      <div className="min-h-[100dvh] bg-slate-950/90 flex flex-col justify-end p-4 pb-6 w-full">
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200 space-y-3 w-full max-w-md sm:max-w-lg md:max-w-xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <DoorblyLogoIcon className="w-8 h-8 rounded-lg shrink-0" />
              <div>
                <div className="text-xs text-slate-900 flex items-center gap-1.5">
                  <span>Doorbly Minimised</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnline ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {isOnline
                    ? 'Background radar active · Switch app or make a call'
                    : 'App minimised · Ready to switch apps or call'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsMinimised(false)}
              className="px-3 py-1.5 rounded-xl bg-[#0F766E] text-white text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
          </div>

          {/* Quick Device Actions: Open Phone Call, SMS, or Maps */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
            <a
              href={`tel:${callNumber}`}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-teal-50 text-[#0F766E] border border-teal-100 hover:bg-teal-100/70 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{activeJob ? 'Call Customer' : 'Phone Call'}</span>
            </a>

            <a
              href={`sms:${callNumber}`}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Messages</span>
            </a>

            <a
              href={locationService.getBookingNavigationUrl(activeJob)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <span>🗺 Go to Location</span>
            </a>
          </div>
        </div>

        {/* Keep incoming job alerts active even when minimised */}
        {incomingRequest && <IncomingJobModal />}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex flex-col w-full relative overflow-x-hidden selection:bg-teal-700 selection:text-white">
      {isSupabaseSyncing && (
        <ProcessingLoader
          variant="bar"
          label="Syncing data from Supabase..."
          className="fixed top-0 left-0 right-0 z-50"
        />
      )}

      {actionNotice && (
        <div
          role="status"
          className={`fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md rounded-2xl px-4 py-3 shadow-xl border flex items-center justify-between gap-3 text-xs ${
            actionNotice.type === 'error'
              ? 'bg-rose-950/95 text-rose-100 border-rose-700'
              : actionNotice.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-100 border-emerald-700'
              : 'bg-slate-900/95 text-slate-100 border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {actionNotice.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-teal-400 shrink-0" />
            )}
            <span className="truncate">{actionNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Direct Install App Banner */}
      <PWAInstallBanner />

      {/* Responsive Top Header */}
      <PartnerHeader onOpenMenu={() => setIsMenuOpen(true)} />

      {/* Main View Area - Fluid Auto-Adjusted Container (< 10ms Instant Navigation) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-24 md:pb-28 overflow-y-auto min-w-0">
        {activeTab === 'home' && <HomeDashboard />}
        {activeTab === 'jobs' && (activeJob ? <ActiveJobView /> : <MyJobsList />)}
        {activeTab === 'wallet' && <WalletDashboard />}
        {activeTab === 'earnings' && <EarningsView />}
        {activeTab === 'membership' && <MembershipView />}
        {activeTab === 'services' && <ServiceSelectionView />}
        {activeTab === 'documents' && <KYCDocumentsView />}
        {activeTab === 'profile' && <ProfileView />}
        {activeTab === 'notifications' && <NotificationCenter />}
        {activeTab === 'guidelines' && <PartnerGuidelinesView />}
        {activeTab === 'support' && <SupportView />}
        {activeTab === 'settings' && (isAdminUnlocked ? <SettingsView /> : <HomeDashboard />)}
      </main>

      {/* Mobile/Desktop Responsive Navigation */}
      <BottomNav onMinimize={() => setIsMinimised(true)} />

      {/* Instant Modals & Drawers */}
      {isMenuOpen && <DrawerMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />}
      {incomingRequest && <IncomingJobModal />}

      {/* Screen Lock 4-Digit Code Security Verification Modal */}
      <GoOnlineVerificationModal />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <PartnerProvider>
        <MainAppContent />
      </PartnerProvider>
    </ErrorBoundary>
  );
}
