import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import {
  PartnerProfile,
  PartnerMembership,
  ServiceBooking,
  JobRequestAlert,
  WalletSummary,
  NotificationItem,
  SupportTicket,
  BookingStatus,
  SubscriptionPlan,
  PartnerSubscription,
  SubscriptionPayment,
  TaxConfiguration,
  PlanCode,
  JobCommissionRecord,
  WithdrawalRequest,
  CustomerCollection,
  CommissionSettlement,
  CommissionLedgerSummary,
  CollectionPaymentMethod,
  CustomerConfirmationMode,
  SettlementPaymentMethod
} from '../types';
import { supabaseService } from '../services/supabaseClient';
import { supabaseDataEngine, DataEngineStats, SyncSpeedMode } from '../services/supabaseDataEngine';
import { partnerAuthService } from '../services/partnerAuth';
import { locationService, GeoLocationCoords } from '../services/locationService';
import { soundService } from '../services/soundAndVibrate';
import { BatterySaverPreference } from '../services/batteryService';
import { useBatteryStatus, UseBatteryStatusResult } from '../hooks/useBatteryStatus';
import { subscribeToForegroundFcmMessages } from '../services/firebase';
import { subscriptionService, DEFAULT_SUBSCRIPTION_PLANS, DEFAULT_TAX_CONFIG } from '../services/subscriptionService';
import { DEFAULT_DOORBLY_SERVICES } from '../services/catalogueService';

export type NavigationTab =
  | 'home'
  | 'jobs'
  | 'wallet'
  | 'earnings'
  | 'membership'
  | 'services'
  | 'notifications'
  | 'profile'
  | 'documents'
  | 'guidelines'
  | 'support'
  | 'settings';

interface PartnerContextType {
  partner: PartnerProfile | null;
  membership: PartnerMembership | null;
  activeSubscription: PartnerSubscription | null;
  subscriptionPlans: SubscriptionPlan[];
  taxConfig: TaxConfiguration | null;
  isOnline: boolean;
  isLoading: boolean;
  isSupabaseSyncing: boolean;
  activeTab: NavigationTab;
  location: GeoLocationCoords | null;
  locationError: string | null;
  wallet: WalletSummary;
  activeJob: ServiceBooking | null;
  incomingRequest: JobRequestAlert | null;
  notifications: NotificationItem[];
  myJobs: ServiceBooking[];
  commissionRecords: JobCommissionRecord[];
  customerCollections: CustomerCollection[];
  commissionSettlements: CommissionSettlement[];
  subscriptionHistory: PartnerSubscription[];
  subscriptionPayments: SubscriptionPayment[];
  ledgerSummary: CommissionLedgerSummary;
  withdrawals: WithdrawalRequest[];
  supportTickets: SupportTicket[];
  unreadNotificationCount: number;
  isAdminUnlocked: boolean;
  viewMode: 'partner' | 'admin';
  batteryState: UseBatteryStatusResult;
  lastJobPollTime: string | null;
  dataEngineStats: DataEngineStats;
  isSecurityVerified: boolean;
  showOnlineVerificationModal: boolean;
  actionNotice: { id: number; type: 'error' | 'info' | 'success'; message: string } | null;
  
  // Actions
  showNotice: (message: string, type?: 'error' | 'info' | 'success') => void;
  dismissNotice: () => void;
  setDataEngineMode: (mode: SyncSpeedMode) => void;
  setViewMode: (mode: 'partner' | 'admin') => void;
  lockAdmin: () => void;
  setActiveTab: (tab: NavigationTab) => void;
  goBack: () => void;
  setShowOnlineVerificationModal: (show: boolean) => void;
  verifyScreenCodeAndGoOnline: (code: string) => Promise<{ success: boolean; message: string }>;
  verifyFirebaseAndGoOnline: () => Promise<{ success: boolean; message: string }>;
  updateScreenLockCode: (newCode: string) => Promise<{ success: boolean; message: string }>;
  toggleOnline: (targetState?: boolean) => Promise<{ success: boolean; message: string }>;
  setBatterySaverPreference: (pref: BatterySaverPreference) => void;
  acceptIncomingJob: () => Promise<boolean>;
  rejectIncomingJob: () => void;
  updateActiveJobStatus: (status: BookingStatus, extra?: { otp?: string; notes?: string }) => Promise<boolean>;
  completeJobWithCollection: (input: {
    actualAmount: number;
    paymentMethod: CollectionPaymentMethod;
    paymentReference?: string;
    collectedAt: string;
    confirmationMode: CustomerConfirmationMode;
    confirmationCode?: string;
    notes?: string;
  }) => Promise<{
    success: boolean;
    message: string;
    commissionAmount?: number;
    commissionPercent?: number;
    partnerEarnings?: number;
  }>;
  refreshAll: () => Promise<void>;
  updatePartner: (updated: Partial<PartnerProfile>) => Promise<boolean>;
  updateMembership: (status: 'active' | 'expired' | 'pending') => Promise<void>;
  subscribeToPlan: (
    planCode: PlanCode,
    options?: {
      paymentGateway?: string;
      gatewayPaymentRef?: string;
      durationDays?: number;
    }
  ) => Promise<{ success: boolean; message: string; invoiceNumber?: string }>;
  createSubscriptionUpgradeRequest: (
    planCode: PlanCode,
    options?: {
      paymentGateway?: string;
      durationDays?: number;
    }
  ) => Promise<{
    success: boolean;
    message: string;
    isFreeActivation?: boolean;
    subscription?: PartnerSubscription;
    payment?: SubscriptionPayment;
  }>;
  submitSubscriptionPaymentProof: (
    paymentId: string,
    gatewayPaymentRef: string,
    paymentGateway?: string
  ) => Promise<{
    success: boolean;
    verifiedAndActivated: boolean;
    message: string;
    payment?: SubscriptionPayment;
    subscription?: PartnerSubscription;
  }>;
  submitCommissionSettlement: (input: {
    amount: number;
    paymentMethod: SettlementPaymentMethod;
    paymentReference: string;
    notes?: string;
  }) => Promise<{ success: boolean; message: string; settlement?: CommissionSettlement }>;
  refreshSubscription: () => Promise<void>;
  requestWithdrawal: (amount: number, bank: string, ifsc: string, holder: string) => Promise<{ success: boolean; message: string }>;
  createSupportTicket: (ticket: Omit<SupportTicket, 'id' | 'created_at' | 'partner_id'>) => Promise<boolean>;
  markNotificationRead: (id: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const PartnerContext = createContext<PartnerContextType | null>(null);

const DEFAULT_WALLET: WalletSummary = {
  available_balance: 0,
  pending_amount: 0,
  today_earnings: 0,
  week_earnings: 0,
  month_earnings: 0,
  today_completed_jobs: 0,
  total_completed_jobs: 0
};

export const PartnerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialSnapshotRef = useRef<{
    authUser: ReturnType<typeof partnerAuthService.getStoredUser>;
    partnerSnap: ReturnType<typeof supabaseService.getInstantPartnerSnapshot> | null;
    subSnap: ReturnType<typeof subscriptionService.getInstantSubscriptionSnapshot>;
  } | null>(null);

  if (!initialSnapshotRef.current) {
    const authUser = partnerAuthService.getStoredUser();
    initialSnapshotRef.current = {
      authUser,
      partnerSnap: authUser ? supabaseService.getInstantPartnerSnapshot(authUser.uid) : null,
      subSnap: subscriptionService.getInstantSubscriptionSnapshot(authUser?.uid)
    };
  }

  const bootSnap = initialSnapshotRef.current;

  const [partner, setPartner] = useState<PartnerProfile | null>(
    () => bootSnap.partnerSnap?.profile ?? null
  );
  const [membership, setMembership] = useState<PartnerMembership | null>(
    () => bootSnap.partnerSnap?.membership ?? null
  );
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    const p = bootSnap.partnerSnap?.profile;
    return p?.status === 'approved' ? Boolean(p.is_online) : false;
  });
  const [isLoading, setIsLoading] = useState<boolean>(
    () => Boolean(bootSnap.authUser && !bootSnap.partnerSnap?.profile)
  );
  const [isSupabaseSyncing, setIsSupabaseSyncing] = useState<boolean>(false);
  const [activeTab, setActiveTabState] = useState<NavigationTab>('home');
  const tabHistoryRef = useRef<NavigationTab[]>([]);

  const setActiveTab = useCallback((nextTab: NavigationTab) => {
    setActiveTabState((prevTab) => {
      if (prevTab !== nextTab) {
        tabHistoryRef.current.push(prevTab);
      }
      return nextTab;
    });
  }, []);

  const goBack = useCallback(() => {
    window.dispatchEvent(new CustomEvent('doorbly-close-modals'));
    if (tabHistoryRef.current.length > 0) {
      const previousTab = tabHistoryRef.current.pop() || 'home';
      setActiveTabState(previousTab);
    } else if (activeTab !== 'home') {
      setActiveTabState('home');
    }
  }, [activeTab]);
  const [location, setLocation] = useState<GeoLocationCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletSummary>(
    () => bootSnap.partnerSnap?.wallet ?? DEFAULT_WALLET
  );
  const [activeJob, setActiveJob] = useState<ServiceBooking | null>(
    () => bootSnap.partnerSnap?.activeJob ?? null
  );
  const [incomingRequest, setIncomingRequest] = useState<JobRequestAlert | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    () => bootSnap.partnerSnap?.notifications ?? []
  );
  const [myJobs, setMyJobs] = useState<ServiceBooking[]>(
    () => bootSnap.partnerSnap?.jobs ?? []
  );
  const [commissionRecords, setCommissionRecords] = useState<JobCommissionRecord[]>([]);
  const [customerCollections, setCustomerCollections] = useState<CustomerCollection[]>([]);
  const [commissionSettlements, setCommissionSettlements] = useState<CommissionSettlement[]>([]);
  const [subscriptionHistory, setSubscriptionHistory] = useState<PartnerSubscription[]>([]);
  const [subscriptionPayments, setSubscriptionPayments] = useState<SubscriptionPayment[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(
    () => bootSnap.partnerSnap?.tickets ?? []
  );
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() =>
    partnerAuthService.isAuthorizedAdmin(bootSnap.authUser)
  );
  const [viewMode, setViewModeState] = useState<'partner' | 'admin'>(() =>
    partnerAuthService.isAuthorizedAdmin(bootSnap.authUser) ? 'admin' : 'partner'
  );
  const prevIsAdminRef = useRef<boolean>(partnerAuthService.isAuthorizedAdmin(bootSnap.authUser));
  const [lastJobPollTime, setLastJobPollTime] = useState<string | null>(null);
  const [dataEngineStats, setDataEngineStats] = useState<DataEngineStats>(() => supabaseDataEngine.getStats());
  const [isSecurityVerified, setIsSecurityVerified] = useState<boolean>(() => {
    const authUser = bootSnap.authUser;
    return Boolean(authUser?.isAdmin || authUser?.isScreenCodeVerified);
  });
  const [showOnlineVerificationModal, setShowOnlineVerificationModal] = useState<boolean>(false);
  const [activeSubscription, setActiveSubscription] = useState<PartnerSubscription | null>(
    () => bootSnap.subSnap.activeSubscription
  );
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>(
    () => bootSnap.subSnap.plans || DEFAULT_SUBSCRIPTION_PLANS
  );
  const [taxConfig, setTaxConfig] = useState<TaxConfiguration | null>(
    () => bootSnap.subSnap.taxConfig || DEFAULT_TAX_CONFIG
  );
  const [actionNotice, setActionNotice] = useState<{
    id: number;
    type: 'error' | 'info' | 'success';
    message: string;
  } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenBookingIdsRef = useRef<Set<string>>(new Set());

  // Stable refs to prevent realtime channel teardown and effect thrashing
  const partnerRef = useRef<PartnerProfile | null>(partner);
  partnerRef.current = partner;
  const isOnlineRef = useRef<boolean>(isOnline);
  isOnlineRef.current = isOnline;
  const activeJobRef = useRef<ServiceBooking | null>(activeJob);
  activeJobRef.current = activeJob;
  const locationRef = useRef<GeoLocationCoords | null>(location);
  locationRef.current = location;
  const incomingRequestRef = useRef<JobRequestAlert | null>(incomingRequest);
  incomingRequestRef.current = incomingRequest;

  const dismissNotice = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setActionNotice(null);
  }, []);

  const showNotice = useCallback(
    (message: string, type: 'error' | 'info' | 'success' = 'info') => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
      setActionNotice({ id: Date.now(), type, message });
      noticeTimerRef.current = setTimeout(() => {
        setActionNotice(null);
        noticeTimerRef.current = null;
      }, 5000);
    },
    []
  );

  useEffect(() => {
    return supabaseDataEngine.subscribeStats((stats) => {
      setDataEngineStats(stats);
    });
  }, []);

  const setDataEngineMode = useCallback((mode: SyncSpeedMode) => {
    supabaseDataEngine.setMode(mode);
  }, []);

  // Use the Battery Status API hook to monitor device charge levels and visibility
  const batteryState = useBatteryStatus();
  const { setBatterySaverPreference } = batteryState;

  // Sync GPS power profile with batteryState.isBatterySaverActive
  useEffect(() => {
    locationService.setBatterySaverMode(batteryState.isBatterySaverActive);
  }, [batteryState.isBatterySaverActive]);

  const setViewMode = useCallback((mode: 'partner' | 'admin') => {
    if (mode === 'admin') {
      const currentAuthUser = partnerAuthService.getStoredUser();
      if (!partnerAuthService.isAuthorizedAdmin(currentAuthUser)) {
        setViewModeState('partner');
        return;
      }
    }
    setViewModeState(mode);
  }, []);

  const lockAdmin = () => {
    partnerAuthService.setDeviceAdminUnlocked(false);
    prevIsAdminRef.current = false;
    setIsAdminUnlocked(false);
    setViewModeState('partner');
  };

  // Strict safety guard: never allow non-admin users into admin mode or settings tab
  useEffect(() => {
    if (!isAdminUnlocked) {
      if (viewMode !== 'partner') setViewModeState('partner');
      if (activeTab === 'settings') setActiveTabState('home');
    }
  }, [isAdminUnlocked, viewMode, activeTab]);

  // Load active partner from auth session in parallel (< 0.1s via Super Fast Engine)
  const initPartnerSession = useCallback(async (showFullLoader = false) => {
    const authUser = partnerAuthService.getStoredUser();
    const initialAuthorizedAdmin = partnerAuthService.isAuthorizedAdmin(authUser);
    setIsAdminUnlocked(initialAuthorizedAdmin);
    if (!initialAuthorizedAdmin) {
      prevIsAdminRef.current = false;
      setViewModeState('partner');
    } else if (!prevIsAdminRef.current) {
      prevIsAdminRef.current = true;
      setViewModeState('admin');
    }

    if (authUser) {
      const partnerId = authUser.uid;
      // Immediately seed React state synchronously from L1/L2 cache if transitioning from AuthScreen
      const instantSnap = supabaseService.getInstantPartnerSnapshot(partnerId);
      const instantSub = subscriptionService.getInstantSubscriptionSnapshot(partnerId);
      if (instantSnap.profile) {
        setPartner(instantSnap.profile);
        setIsOnline(instantSnap.profile.status === 'approved' ? Boolean(instantSnap.profile.is_online) : false);
      } else if (showFullLoader) {
        setIsLoading(true);
      }
      if (instantSnap.membership) setMembership(instantSnap.membership);
      if (instantSub.activeSubscription) setActiveSubscription(instantSub.activeSubscription);
      if (instantSnap.profile) setIsLoading(false);

      setIsSupabaseSyncing(true);
      try {
        // Run all Supabase lookups + Firestore admin role check in parallel
        let [profile, mem, sub, plans, tax, isVerifiedAdmin] = await Promise.all([
          supabaseService.getPartnerProfile(partnerId),
          supabaseService.getMembership(partnerId),
          subscriptionService.getActiveSubscription(partnerId),
          subscriptionService.getPlans(),
          subscriptionService.getTaxConfiguration(),
          partnerAuthService.verifyAdminWithFirestore(authUser)
        ]);

        setIsAdminUnlocked(isVerifiedAdmin);
        if (!isVerifiedAdmin) {
          prevIsAdminRef.current = false;
          setViewModeState('partner');
        } else if (!prevIsAdminRef.current) {
          prevIsAdminRef.current = true;
          setViewModeState('admin');
        }

        const isMaster = isVerifiedAdmin;

        if (!profile) {
          // Initialize fresh partner profile without fabricated defaults
          const freshProfile: PartnerProfile = {
            id: partnerId,
            auth_id: partnerId,
            name: isMaster ? 'Debabrata Mohanta' : (authUser.displayName || 'Doorbly Partner'),
            mobile: isMaster ? (authUser.phone || '+91 99387 13179') : (authUser.phone || ''),
            email: authUser.email || '',
            photo_url: authUser.photoURL || undefined,
            address: isMaster ? 'Executive Operations Command' : '',
            district: '',
            city: isMaster ? 'Bhubaneswar' : '',
            pin_code: isMaster ? '751001' : '',
            primary_category: isMaster ? 'AC Services' : '',
            services_offered: isMaster ? ['srv_ac_foam_jet', 'srv_ac_repair', 'srv_ac_gas', 'srv_elec_switch'] : [],
            years_experience: isMaster ? 10 : 0,
            skills: isMaster ? ['Master Technician', 'Operations Lead'] : [],
            working_area: isMaster ? 'All Zones' : '',
            preferred_radius_km: 10,
            languages: ['English', 'Hindi'],
            status: isMaster ? 'approved' : 'pending_verification',
            is_online: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          setPartner(freshProfile);
          profile = await supabaseService.upsertPartnerProfile(freshProfile);
        } else {
          if (authUser.photoURL && !profile.photo_url) {
            profile.photo_url = authUser.photoURL;
          }
          let needsSave = false;
          if (isMaster && profile.status !== 'approved') {
            profile.status = 'approved';
            needsSave = true;
          }
          try {
            if (!localStorage.getItem('doorbly_radar_radius_10km_v1')) {
              profile.preferred_radius_km = 10;
              localStorage.setItem('doorbly_radar_radius_10km_v1', 'true');
              needsSave = true;
            }
          } catch {
            // ignore
          }
          if (needsSave) {
            supabaseDataEngine.dispatchBackgroundWrite(
              () => supabaseService.upsertPartnerProfile(profile!),
              ['admin:partners']
            );
          }
        }

        if (profile) {
          setPartner(profile);
          if (profile.status !== 'approved' && profile.is_online) {
            profile.is_online = false;
            supabaseDataEngine.dispatchBackgroundWrite(
              () => supabaseService.updatePartnerAvailability(partnerId, false)
            );
          }
          setIsOnline(profile.status === 'approved' ? Boolean(profile.is_online) : false);
        }

        setActiveSubscription(sub);
        setSubscriptionPlans(plans);
        setTaxConfig(tax);

        if (!mem) {
          const matchedPlan = plans.find((p) => p.plan_code === (sub?.plan_code || 'starter'));
          mem = {
            id: `mem_${partnerId}`,
            partner_id: partnerId,
            plan_name: sub?.plan_name ? `${sub.plan_name} Plan` : `${matchedPlan?.plan_name || 'Starter'} Plan`,
            monthly_fee: matchedPlan?.monthly_price ?? 0,
            status: sub?.status === 'suspended' || sub?.status === 'expired' ? 'expired' : 'active',
            start_date: sub?.start_at || new Date().toISOString(),
            expiry_date: sub?.expires_at || new Date(Date.now() + 30 * 86400000).toISOString(),
            payment_status: sub?.payment_status === 'free' ? 'paid' : (sub?.payment_status || 'paid'),
            payment_reference: sub?.latest_payment_id || 'STARTER_FREE_TIER'
          };
          supabaseDataEngine.dispatchBackgroundWrite(
            () => supabaseService.updateMembership(mem!)
          );
        }
        setMembership(mem);
      } finally {
        setIsSupabaseSyncing(false);
        setIsLoading(false);
      }
    } else {
      setPartner(null);
      setMembership(null);
      setActiveSubscription(null);
      setIsLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    await initPartnerSession(true);
  }, [initPartnerSession]);

  const refreshSubscription = useCallback(async () => {
    if (!partner?.id) return;
    setIsSupabaseSyncing(true);
    try {
      const [sub, plans, tax] = await Promise.all([
        subscriptionService.getActiveSubscription(partner.id),
        subscriptionService.getPlans(),
        subscriptionService.getTaxConfiguration()
      ]);
      setActiveSubscription(sub);
      setSubscriptionPlans(plans);
      setTaxConfig(tax);
    } catch (e) {
      console.warn('refreshSubscription notice:', e);
    } finally {
      setIsSupabaseSyncing(false);
    }
  }, [partner?.id]);

  useEffect(() => {
    initPartnerSession();
    const unsub = partnerAuthService.subscribeToFirebaseAuth((user) => {
      if (user) {
        initPartnerSession();
      }
    });
    return () => unsub();
  }, [initPartnerSession]);

  // Fetch partner dynamic data
  const refreshAll = useCallback(async () => {
    const activePartnerId = partnerRef.current?.id;
    if (!activePartnerId) return;

    setIsSupabaseSyncing(true);
    try {
      const [
        latestProfile,
        wSummary,
        active,
        jobsList,
        notifs,
        tickets,
        mem,
        sub,
        plans,
        tax,
        commList,
        wthList,
        colList,
        settleList,
        subHist,
        subPays
      ] = await Promise.all([
        supabaseService.getPartnerProfile(activePartnerId),
        supabaseService.getWalletSummary(activePartnerId),
        supabaseService.getActiveJob(activePartnerId),
        supabaseService.getPartnerJobs(activePartnerId),
        supabaseService.getNotifications(activePartnerId),
        supabaseService.getSupportTickets(activePartnerId),
        supabaseService.getMembership(activePartnerId),
        subscriptionService.getActiveSubscription(activePartnerId),
        subscriptionService.getPlans(),
        subscriptionService.getTaxConfiguration(),
        subscriptionService.getPartnerCommissionHistory(activePartnerId),
        supabaseService.getWithdrawals(activePartnerId),
        supabaseService.getPartnerCollections(activePartnerId),
        subscriptionService.getPartnerSettlements(activePartnerId),
        subscriptionService.getPartnerSubscriptionHistory(activePartnerId),
        subscriptionService.getPartnerPaymentsAndInvoices(activePartnerId)
      ]);

      if (latestProfile) {
        setPartner(latestProfile);
        if (latestProfile.status !== 'approved' && isOnlineRef.current) {
          locationService.stopTracking();
          await supabaseService.updatePartnerAvailability(activePartnerId, false);
          setIsOnline(false);
        }
      }

      setWallet(wSummary);
      setActiveJob(active);
      setMyJobs(jobsList);
      setNotifications(notifs);
      setSupportTickets(tickets);
      setCommissionRecords(commList);
      setWithdrawals(wthList);
      setCustomerCollections(colList);
      setCommissionSettlements(settleList);
      setSubscriptionHistory(subHist);
      setSubscriptionPayments(subPays);
      if (mem) setMembership(mem);
      if (sub) setActiveSubscription(sub);
      if (plans && plans.length > 0) setSubscriptionPlans(plans);
      if (tax) setTaxConfig(tax);
    } catch (e) {
      console.warn('Error refreshing data:', e);
    } finally {
      setIsSupabaseSyncing(false);
    }
  }, []);

  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  useEffect(() => {
    if (partner?.id) {
      refreshAll();
    }
  }, [partner?.id, refreshAll]);

  // Subscribe to real-time backend updates for this partner via Turbo Engine Delta Hydration
  useEffect(() => {
    const currentPartnerId = partner?.id;
    if (!currentPartnerId) return;
    const unsubscribePartnerSync = supabaseService.subscribeToPartnerRealtimeSync(
      currentPartnerId,
      (delta) => {
        if (delta) {
          if (delta.profile) {
            setPartner(delta.profile);
            if (delta.profile.status !== 'approved' && isOnlineRef.current) {
              locationService.stopTracking();
              void supabaseService.updatePartnerAvailability(currentPartnerId, false);
              setIsOnline(false);
            }
          }
          if (delta.membership) {
            setMembership(delta.membership);
          }
          if (delta.notification) {
            soundService.playJobAlertChime();
            setNotifications((prev) => [delta.notification!, ...prev.filter((n) => n.id !== delta.notification!.id)]);
          }
          return;
        }
        refreshAllRef.current();
      }
    );
    return () => {
      unsubscribePartnerSync();
    };
  }, [partner?.id]);

  // Listen for foreground Firebase Cloud Messaging (FCM) push notifications
  useEffect(() => {
    const currentPartnerId = partner?.id;
    if (!currentPartnerId) return;
    let unsubscribeFcm: (() => void) | null = null;
    let active = true;

    subscribeToForegroundFcmMessages((payload) => {
      if (!active) return;
      const title = payload.notification?.title || 'Doorbly Push Alert';
      const body = payload.notification?.body || 'You have a new update in Doorbly Partner.';
      soundService.playJobAlertChime();
      const newNotif: NotificationItem = {
        id: `FCM-${Date.now()}`,
        partner_id: currentPartnerId,
        title,
        message: body,
        type: 'NEW_SERVICE_REQUEST',
        is_read: false,
        created_at: new Date().toISOString()
      };
      setNotifications((prev) => [newNotif, ...prev]);
    }).then((unsub) => {
      if (active) {
        unsubscribeFcm = unsub;
      } else {
        unsub();
      }
    });

    return () => {
      active = false;
      if (unsubscribeFcm) unsubscribeFcm();
    };
  }, [partner?.id]);

  // Handle incoming request countdown timer
  const activeRequestId = incomingRequest?.request_id;
  useEffect(() => {
    if (!activeRequestId) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setIncomingRequest((prev) => {
        if (!prev) return null;
        const remaining = Math.max(0, Math.ceil((prev.expires_at - now) / 1000));
        if (remaining <= 0) {
          soundService.stopIncomingLoop();
          return null;
        }
        return { ...prev, expires_in_seconds: remaining };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeRequestId]);

  // Online Activation Pipeline: enforces Supabase ID registration, approval check, active membership & GPS
  const executeOnlineActivation = async (
    currentProfile: PartnerProfile
  ): Promise<{ success: boolean; message: string }> => {
    // Check 0: Fetch latest partner profile and registration status from Supabase
    const idVerification = await supabaseService.verifyPartnerIdRegistration(currentProfile.id);
    const latestProfile = idVerification.profile || currentProfile;
    if (idVerification.profile) {
      setPartner(idVerification.profile);
    }

    if (!idVerification.registered) {
      return {
        success: false,
        message:
          idVerification.message ||
          `Partner ID "${currentProfile.id}" is not registered with Doorbly. Only approved partners can go Online.`
      };
    }

    // Check 1: Strict enforcement — ONLY approved partners can go Online
    if (latestProfile.status !== 'approved') {
      return {
        success: false,
        message: `Only approved partners are allowed to go Online. Your account status is currently "${latestProfile.status.replace('_', ' ')}". Please wait for Admin approval.`
      };
    }

    // Check 2: Subscription plan must be active (Starter ₹0, Growth ₹370, or Professional ₹799)
    const validSub = await subscriptionService.getActiveSubscription(latestProfile.id);
    if (!validSub || validSub.status !== 'active') {
      setActiveSubscription(validSub);
      setActiveTab('membership');
      const reasonMsg =
        validSub?.status === 'suspended'
          ? 'Your Doorbly subscription has been suspended by Admin. Contact support or check your Membership tab.'
          : validSub?.status === 'expired'
          ? 'Your subscription has expired under the configured renewal policy. Please renew or activate a plan to go Online.'
          : 'Active Doorbly Partner Subscription is required to go Online. Please activate Starter (₹0/mo) or choose Growth / Professional.';
      return {
        success: false,
        message: reasonMsg
      };
    }
    setActiveSubscription(validSub);

    // Check 3: Location permission
    try {
      const coords = await locationService.getCurrentPosition();
      setLocation(coords);
      setLocationError(null);

      // Start continuous tracking
      locationService.startTracking((updatedCoords) => {
        setLocation(updatedCoords);
        supabaseService.updatePartnerAvailability(
          currentProfile.id,
          true,
          updatedCoords.latitude,
          updatedCoords.longitude
        );
      });

      // Update database
      await supabaseService.updatePartnerAvailability(currentProfile.id, true, coords.latitude, coords.longitude);
      setIsOnline(true);
      setPartner(prev => prev ? { ...prev, is_online: true, current_lat: coords.latitude, current_lng: coords.longitude } : null);

      soundService.playSuccessTone();
      return { success: true, message: "You're Online! Looking for nearby doorstep service requests..." };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Location permission denied.';
      setLocationError(errMsg);
      return { success: false, message: errMsg };
    }
  };

  /**
   * Verify screen lock 4-digit code in Supabase before going Online
   */
  const verifyScreenCodeAndGoOnline = async (
    code: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!partner) {
      return { success: false, message: 'Please log in first.' };
    }

    const res = await supabaseService.verifyPartnerScreenLockCodeForOnline(partner.id, partner.mobile, code);
    if (!res.success) {
      return { success: false, message: res.message };
    }

    // Mark current session verified
    setIsSecurityVerified(true);
    const updatedProfile = res.partner || {
      ...partner,
      screen_lock_code: code,
      is_screen_code_verified: true,
      screen_code_verified_at: new Date().toISOString()
    };
    setPartner(updatedProfile);

    // Proceed to activate Online status
    const onlineRes = await executeOnlineActivation(updatedProfile);
    if (onlineRes.success) {
      setShowOnlineVerificationModal(false);
    }
    return onlineRes;
  };

  /**
   * Verify Firebase authentication session before going Online
   */
  const verifyFirebaseAndGoOnline = async (): Promise<{ success: boolean; message: string }> => {
    if (!partner) {
      return { success: false, message: 'Please log in first.' };
    }

    const authUser = partnerAuthService.getStoredUser();
    if (authUser?.authProvider === 'firebase' || Boolean(authUser?.email && authUser.email.includes('@'))) {
      setIsSecurityVerified(true);
      const onlineRes = await executeOnlineActivation(partner);
      if (onlineRes.success) {
        setShowOnlineVerificationModal(false);
      }
      return onlineRes;
    }

    return {
      success: false,
      message: 'No active Firebase session found. Please enter your 4-digit screen lock code.'
    };
  };

  /**
   * Store or update 4-digit screen lock code directly in Supabase
   */
  const updateScreenLockCode = async (
    newCode: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!partner) return { success: false, message: 'Please log in first.' };
    const res = await supabaseService.storeScreenCredentials(
      partner.mobile,
      newCode,
      partner.id,
      partner.name
    );
    if (res.success) {
      setPartner(prev => prev ? {
        ...prev,
        screen_lock_code: newCode,
        is_screen_code_verified: true,
        screen_code_verified_at: new Date().toISOString()
      } : null);
      setIsSecurityVerified(true);
    }
    return res;
  };

  // Toggle Online/Offline — Enforces: "first verify then only allow the user to go online"
  const toggleOnline = async (targetState?: boolean): Promise<{ success: boolean; message: string }> => {
    if (!partner) {
      return { success: false, message: 'Please log in to change availability status.' };
    }

    const nextState = targetState !== undefined ? targetState : !isOnline;

    if (nextState) {
      // First verify! If not verified in this session, show the verification modal
      if (!isSecurityVerified) {
        setShowOnlineVerificationModal(true);
        return {
          success: false,
          message: 'Security verification required: Enter your 4-digit screen lock code to go Online.'
        };
      }

      return await executeOnlineActivation(partner);
    } else {
      // Going offline
      // Prevent accidental offline if active job is in progress
      if (activeJob && (activeJob.status === 'ASSIGNED' || activeJob.status === 'ARRIVED' || activeJob.status === 'IN_PROGRESS')) {
        return {
          success: false,
          message: 'You have an active doorstep service in progress. Please complete or update the job before going offline.'
        };
      }

      locationService.stopTracking();
      await supabaseService.updatePartnerAvailability(partner.id, false);
      setIsOnline(false);
      setPartner(prev => prev ? { ...prev, is_online: false } : null);
      if (incomingRequest) {
        soundService.stopIncomingLoop();
        setIncomingRequest(null);
      }
      return { success: true, message: "You're now Offline. You will not receive new service requests." };
    }
  };

  // Helper to evaluate and trigger an incoming booking alert
  const evaluateBookingForAlert = useCallback(
    (candidateBooking: ServiceBooking) => {
      const currentPartner = partnerRef.current;
      const currentActiveJob = activeJobRef.current;
      const currentLocation = locationRef.current;

      if (!currentPartner || currentActiveJob) return false;
      if (candidateBooking.status !== 'SEARCHING_PARTNER' && candidateBooking.status !== 'REQUEST_SENT') {
        return false;
      }
      if (seenBookingIdsRef.current.has(candidateBooking.id)) {
        return false;
      }

      const bookingCategory = (candidateBooking.service_category || '').toLowerCase();
      const bookingName = (candidateBooking.service_name || '').toLowerCase();
      const offeredList = currentPartner.services_offered || [];

      let partnerOffersService = offeredList.length === 0;
      if (!partnerOffersService) {
        partnerOffersService = offeredList.some((entry) => {
          const catalogItem = DEFAULT_DOORBLY_SERVICES.find((item) => item.id === entry);
          if (catalogItem) {
            const catName = catalogItem.category_name.toLowerCase();
            return (
              catName === bookingCategory ||
              bookingCategory.includes(catName) ||
              catName.includes(bookingCategory) ||
              bookingName.includes(catalogItem.name.toLowerCase())
            );
          }
          const term = entry.toLowerCase();
          const rootToken = term.split(/\s+/)[0].replace(/(ian|er|or|ing|s)$/, '');
          return (
            bookingCategory.includes(term) ||
            term.includes(bookingCategory) ||
            bookingName.includes(term) ||
            (rootToken.length >= 2 && (bookingCategory.includes(rootToken) || bookingName.includes(rootToken)))
          );
        });
      }

      if (!partnerOffersService && currentPartner.primary_category) {
        const primary = currentPartner.primary_category.toLowerCase();
        partnerOffersService =
          bookingCategory.includes(primary) ||
          primary.includes(bookingCategory) ||
          bookingName.includes(primary);
      }

      if (!partnerOffersService) return false;

      let dist: number | undefined;
      if (currentLocation && candidateBooking.latitude && candidateBooking.longitude) {
        dist = locationService.calculateDistanceKm(
          currentLocation.latitude,
          currentLocation.longitude,
          candidateBooking.latitude,
          candidateBooking.longitude
        );
      }

      if (dist === undefined || dist <= (currentPartner.preferred_radius_km || 10)) {
        seenBookingIdsRef.current.add(candidateBooking.id);
        const reqAlert: JobRequestAlert = {
          booking: { ...candidateBooking, distance_km: dist },
          request_id: `req_${Date.now()}`,
          expires_in_seconds: 25,
          expires_at: Date.now() + 25000
        };
        setIncomingRequest(reqAlert);
        soundService.startIncomingLoop();
        return true;
      }
      return false;
    },
    []
  );

  // Realtime subscription when Online
  useEffect(() => {
    const partnerId = partner?.id;
    if (!isOnline || !partnerId) return;

    const unsubscribe = supabaseService.subscribeToRealtimeBookings(
      (newBooking) => {
        evaluateBookingForAlert(newBooking);
      },
      (updatedBooking) => {
        // Status changes on booking
        const currentActive = activeJobRef.current;
        if (currentActive && updatedBooking.id === currentActive.id) {
          setActiveJob(updatedBooking);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOnline, partner?.id, evaluateBookingForAlert]);

  // Adaptive Job Request Polling Loop accelerated by Supabase Turbo Engine
  const hasActiveJob = Boolean(activeJob);
  useEffect(() => {
    const partnerId = partner?.id;
    if (!isOnline || !partnerId || hasActiveJob) return;

    let isCancelled = false;
    const pollIntervalMs = supabaseDataEngine.getEffectiveJobPollIntervalMs(batteryState.jobPollingIntervalMs);

    const runJobPoll = async () => {
      if (isCancelled || incomingRequestRef.current) return;
      try {
        const openRequests = await supabaseService.pollOpenJobRequests();
        if (isCancelled) return;
        setLastJobPollTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        for (const req of openRequests) {
          const triggered = evaluateBookingForAlert(req);
          if (triggered) break;
        }
      } catch (err) {
        console.warn('Adaptive job polling notice:', err);
      }
    };

    // Run initial poll then schedule at the Turbo / adaptive interval
    runJobPoll();
    const intervalId = setInterval(runJobPoll, pollIntervalMs);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [isOnline, partner?.id, hasActiveJob, batteryState.jobPollingIntervalMs, dataEngineStats.mode, evaluateBookingForAlert]);

  // Accept incoming job
  const acceptIncomingJob = async (): Promise<boolean> => {
    if (!incomingRequest || !partner) return false;

    soundService.stopIncomingLoop();
    const result = await supabaseService.acceptJob(incomingRequest.booking.id, partner.id);

    if (result.success && result.booking) {
      soundService.playSuccessTone();
      setActiveJob(result.booking);
      setIncomingRequest(null);
      await refreshAll();
      return true;
    } else {
      showNotice(result.message || 'This service request has already been assigned.', 'error');
      setIncomingRequest(null);
      return false;
    }
  };

  // Reject incoming job
  const rejectIncomingJob = () => {
    soundService.stopIncomingLoop();
    setIncomingRequest(null);
  };

  // Update active job status
  const updateActiveJobStatus = async (
    status: BookingStatus,
    extra?: { otp?: string; notes?: string }
  ): Promise<boolean> => {
    if (!activeJob || !partner) return false;

    const res = await supabaseService.updateJobStatus(activeJob.id, partner.id, status, extra);
    if (res.success && res.booking) {
      soundService.playSuccessTone();
      if (status === 'COMPLETED') {
        const earning = Number(res.booking.partner_earning) || 0;
        setWallet(prev => ({
          ...prev,
          available_balance: prev.available_balance + earning,
          today_earnings: prev.today_earnings + earning,
          week_earnings: prev.week_earnings + earning,
          month_earnings: prev.month_earnings + earning,
          today_completed_jobs: prev.today_completed_jobs + 1,
          total_completed_jobs: prev.total_completed_jobs + 1
        }));
        setActiveJob(null);
      } else {
        setActiveJob(res.booking);
      }
      await refreshAll();
      return true;
    } else {
      showNotice(res.message || 'Failed to update job status.', 'error');
      return false;
    }
  };

  // Complete active job via verified Customer Payment Collection & Commission Deduction
  const completeJobWithCollection = async (input: {
    actualAmount: number;
    paymentMethod: CollectionPaymentMethod;
    paymentReference?: string;
    collectedAt: string;
    confirmationMode: CustomerConfirmationMode;
    confirmationCode?: string;
    notes?: string;
  }) => {
    if (!activeJob || !partner) {
      return { success: false, message: 'No active job or partner session found.' };
    }
    const res = await supabaseService.confirmCustomerCollectionAndCompleteBooking(
      activeJob.id,
      partner.id,
      input
    );
    if (res.success && res.booking) {
      soundService.playSuccessTone();
      const earning = Number(res.partnerEarnings ?? res.booking.partner_earning) || 0;
      setWallet((prev) => ({
        ...prev,
        available_balance: Math.round((prev.available_balance + earning) * 100) / 100,
        today_earnings: Math.round((prev.today_earnings + earning) * 100) / 100,
        week_earnings: Math.round((prev.week_earnings + earning) * 100) / 100,
        month_earnings: Math.round((prev.month_earnings + earning) * 100) / 100,
        today_completed_jobs: prev.today_completed_jobs + 1,
        total_completed_jobs: prev.total_completed_jobs + 1
      }));
      setActiveJob(null);
      await refreshAll();
      return {
        success: true,
        message: res.message,
        commissionAmount: res.commissionAmount,
        commissionPercent: res.commissionPercent,
        partnerEarnings: res.partnerEarnings
      };
    }
    showNotice(res.message || 'Failed to confirm customer collection.', 'error');
    return { success: false, message: res.message };
  };

  // Update partner profile
  const updatePartner = async (updated: Partial<PartnerProfile>): Promise<boolean> => {
    if (!partner) return false;
    const merged = { ...partner, ...updated };
    const saved = await supabaseService.upsertPartnerProfile(merged);
    setPartner(saved);
    return true;
  };

  // Update membership status
  const updateMembership = async (status: 'active' | 'expired' | 'pending') => {
    if (!partner) return;
    const currentPlan = subscriptionPlans.find(
      (p) => p.plan_code === (activeSubscription?.plan_code || 'starter')
    );
    const newMem: PartnerMembership = {
      id: `mem_${partner.id}`,
      partner_id: partner.id,
      plan_name: `${currentPlan?.plan_name || activeSubscription?.plan_name || 'Starter'} Plan`,
      monthly_fee: currentPlan?.monthly_price ?? 0,
      status,
      start_date: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      payment_status: status === 'active' ? 'paid' : 'pending',
      payment_reference: status === 'active' ? `SUB_${Date.now()}` : undefined
    };
    const saved = await supabaseService.updateMembership(newMem);
    setMembership(saved);
  };

  // Subscribe to Plan (Starter, Growth, or Professional)
  const subscribeToPlan = async (
    planCode: PlanCode,
    options?: {
      paymentGateway?: string;
      gatewayPaymentRef?: string;
      durationDays?: number;
    }
  ): Promise<{ success: boolean; message: string; invoiceNumber?: string }> => {
    if (!partner) return { success: false, message: 'Please log in first.' };
    const res = await subscriptionService.subscribeToPlan(partner.id, planCode, {
      ...options,
      partnerName: partner.name
    });
    if (res.success && res.subscription) {
      setActiveSubscription(res.subscription);
      await refreshAll();
    }
    return res;
  };

  // Step 1 of paid subscription upgrade/renewal: generates payment request (does NOT activate paid plan early)
  const createSubscriptionUpgradeRequest = async (
    planCode: PlanCode,
    options?: {
      paymentGateway?: string;
      durationDays?: number;
    }
  ) => {
    if (!partner) return { success: false, message: 'Please log in first.' };
    const res = await subscriptionService.createSubscriptionPaymentRequest(partner.id, planCode, {
      ...options,
      partnerName: partner.name
    });
    if (res.success) {
      if (res.isFreeActivation && res.subscription) {
        setActiveSubscription(res.subscription);
      }
      await refreshAll();
    }
    return res;
  };

  // Step 2 of paid subscription upgrade: submits genuine UTR / Gateway TXN reference for verification
  const submitSubscriptionPaymentProof = async (
    paymentId: string,
    gatewayPaymentRef: string,
    paymentGateway?: string
  ) => {
    const res = await subscriptionService.submitSubscriptionPaymentProof(
      paymentId,
      gatewayPaymentRef,
      paymentGateway
    );
    if (res.success) {
      if (res.verifiedAndActivated && res.subscription) {
        setActiveSubscription(res.subscription);
      }
      await refreshAll();
    }
    return res;
  };

  // Commission Settlement payment submission (always starts as 'pending_verification')
  const submitCommissionSettlement = async (input: {
    amount: number;
    paymentMethod: SettlementPaymentMethod;
    paymentReference: string;
    notes?: string;
  }) => {
    if (!partner) return { success: false, message: 'Please log in first.' };
    const res = await subscriptionService.submitCommissionSettlementRequest(partner.id, input);
    if (res.success) {
      await refreshAll();
    }
    return res;
  };

  // Request withdrawal
  const requestWithdrawal = async (amount: number, bank: string, ifsc: string, holder: string) => {
    if (!partner) return { success: false, message: 'Not authenticated' };
    const res = await supabaseService.createWithdrawal(partner.id, amount, bank, ifsc, holder);
    if (res.success) {
      await refreshAll();
    }
    return res;
  };

  // Support ticket
  const createSupportTicket = async (ticketData: Omit<SupportTicket, 'id' | 'created_at' | 'partner_id'>) => {
    if (!partner) return false;
    await supabaseService.createSupportTicket({
      ...ticketData,
      partner_id: partner.id
    });
    await refreshAll();
    return true;
  };

  // Notification read
  const markNotificationRead = async (id: string) => {
    if (!partner) return;
    await supabaseService.markNotificationRead(partner.id, id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  // Logout
  const logout = async () => {
    if (isOnline) {
      locationService.stopTracking();
      if (partner) {
        try {
          await supabaseService.updatePartnerAvailability(partner.id, false);
        } catch {
          // ignore
        }
      }
    }
    await partnerAuthService.logout();
    setPartner(null);
    setMembership(null);
    setActiveSubscription(null);
    setCustomerCollections([]);
    setCommissionSettlements([]);
    setSubscriptionHistory([]);
    setSubscriptionPayments([]);
    setIsOnline(false);
    setActiveJob(null);
    setIncomingRequest(null);
    setActiveTab('home');
    lockAdmin();
  };

  const ledgerSummary = useMemo(
    () =>
      subscriptionService.computeLedgerSummary({
        commissions: commissionRecords,
        settlements: commissionSettlements,
        withdrawals,
        payments: subscriptionPayments
      }),
    [commissionRecords, commissionSettlements, withdrawals, subscriptionPayments]
  );

  const unreadNotificationCount = notifications.filter(n => !n.is_read).length;

  return (
    <PartnerContext.Provider
      value={{
        partner,
        membership,
        activeSubscription,
        subscriptionPlans,
        taxConfig,
        isOnline,
        isLoading,
        isSupabaseSyncing,
        activeTab,
        location,
        locationError,
        wallet,
        activeJob,
        incomingRequest,
        notifications,
        myJobs,
        commissionRecords,
        customerCollections,
        commissionSettlements,
        subscriptionHistory,
        subscriptionPayments,
        ledgerSummary,
        withdrawals,
        supportTickets,
        unreadNotificationCount,
        isAdminUnlocked,
        viewMode,
        batteryState,
        lastJobPollTime,
        dataEngineStats,
        isSecurityVerified,
        showOnlineVerificationModal,
        actionNotice,
        showNotice,
        dismissNotice,
        setShowOnlineVerificationModal,
        verifyScreenCodeAndGoOnline,
        verifyFirebaseAndGoOnline,
        updateScreenLockCode,
        setDataEngineMode,
        setViewMode,
        lockAdmin,
        setActiveTab,
        goBack,
        toggleOnline,
        setBatterySaverPreference,
        acceptIncomingJob,
        rejectIncomingJob,
        updateActiveJobStatus,
        completeJobWithCollection,
        refreshAll,
        updatePartner,
        updateMembership,
        subscribeToPlan,
        createSubscriptionUpgradeRequest,
        submitSubscriptionPaymentProof,
        submitCommissionSettlement,
        refreshSubscription,
        requestWithdrawal,
        createSupportTicket,
        markNotificationRead,
        refreshSession,
        logout
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
};

export const usePartner = (): PartnerContextType => {
  const context = useContext(PartnerContext);
  if (!context) {
    throw new Error('usePartner must be used within a PartnerProvider');
  }
  return context;
};
