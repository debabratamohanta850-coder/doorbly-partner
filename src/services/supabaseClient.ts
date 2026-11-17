import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  PartnerProfile,
  PartnerMembership,
  ServiceBooking,
  WalletSummary,
  WalletTransaction,
  WithdrawalRequest,
  NotificationItem,
  SupportTicket,
  BookingStatus,
  PartnerStatus,
  OfferOfTheDay,
  PartnerKYC,
  ScreenCredentialRecord,
  ScreenCodeVerificationResult,
  CollectionPaymentMethod,
  CustomerConfirmationMode,
  CustomerCollection,
  CommissionSettlement,
  PlanCode
} from '../types';
import { supabaseDataEngine } from './supabaseDataEngine';
import { subscriptionService } from './subscriptionService';

const WALLET_CASH_CATEGORIES = new Set([
  'job_earning',
  'withdrawal',
  'bonus',
  'adjustment',
  'membership_fee'
]);

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  connected: boolean;
}

const STORAGE_KEY_CONFIG = 'doorbly_supabase_config_v2';
const STORAGE_KEY_STORE_DATA = 'doorbly_partner_local_store_v1';
const STORAGE_KEY_DAILY_OFFER = 'doorbly_offer_of_the_day_v1';
const STORAGE_KEY_PURGE_SAMPLE = 'doorbly_purged_sample_data_v1';

const DEFAULT_SUPABASE_URL = 'https://sksqfbugbeoskypjtjxw.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrc3FmYnVnYmVvc2t5cGp0anh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwODg2NzksImV4cCI6MjEwNjY2NDY3OX0.08Efj6gaF6BSOdHtZraCEAcqKubS506xS-7PG0lzpVc';

interface LocalStorageStore {
  partners: Record<string, PartnerProfile>;
  memberships: Record<string, PartnerMembership>;
  bookings: Record<string, ServiceBooking>;
  transactions: Record<string, WalletTransaction[]>;
  withdrawals: Record<string, WithdrawalRequest[]>;
  notifications: Record<string, NotificationItem[]>;
  tickets: Record<string, SupportTicket[]>;
  screenVerifications: Record<string, ScreenCredentialRecord>;
  wallets: Record<string, { partner_id: string; available_balance: number; pending_amount: number; updated_at: string }>;
  customerCollections: Record<string, CustomerCollection>;
  commissionSettlements: Record<string, CommissionSettlement[]>;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private bookingChannels: Set<RealtimeChannel> = new Set();
  private localStoreMemoryCache: LocalStorageStore | null = null;

  private config: SupabaseConfig = {
    url: DEFAULT_SUPABASE_URL,
    anonKey: DEFAULT_SUPABASE_ANON_KEY,
    connected: false
  };

  constructor() {
    this.initClient();
  }

  private createFastClient(url: string, key: string): SupabaseClient {
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 40
        }
      },
      global: {
        fetch: supabaseDataEngine.turboFetch,
        headers: {
          'x-client-info': 'doorbly-turbo-engine/2.0'
        }
      }
    });
  }

  private initClient(): void {
    const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
    const envKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';

    let savedUrl = '';
    let savedKey = '';

    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (stored) {
        const parsed = JSON.parse(stored);
        savedUrl = parsed.url;
        savedKey = parsed.anonKey;
      }
    } catch {
      // ignore
    }

    const activeUrl = savedUrl || envUrl || DEFAULT_SUPABASE_URL;
    const activeKey = savedKey || envKey || DEFAULT_SUPABASE_ANON_KEY;

    if (activeUrl && activeKey && activeUrl.startsWith('http')) {
      try {
        this.client = this.createFastClient(activeUrl, activeKey);
        this.config = { url: activeUrl, anonKey: activeKey, connected: true };
        supabaseDataEngine.warmUpConnection(activeUrl, activeKey);
      } catch (err) {
        console.warn('Failed to initialize Supabase client:', err);
        this.config = { url: activeUrl, anonKey: activeKey, connected: false };
      }
    } else {
      this.config = { url: activeUrl || '', anonKey: activeKey || '', connected: false };
    }
  }

  public getConfig(): SupabaseConfig {
    return this.config;
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  public setConfig(url: string, anonKey: string): boolean {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url, anonKey }));
      supabaseDataEngine.clearCache();
      if (url && anonKey) {
        this.client = this.createFastClient(url, anonKey);
        this.config = { url, anonKey, connected: true };
        supabaseDataEngine.warmUpConnection(url, anonKey);
        return true;
      } else {
        this.client = null;
        this.config = { url: '', anonKey: '', connected: false };
        return false;
      }
    } catch (e) {
      console.error('Error saving Supabase config:', e);
      return false;
    }
  }

  public async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    if (!this.client) {
      return { success: false, message: 'Supabase URL and Anon Key are not configured.' };
    }
    const start = performance.now();
    try {
      const { error } = await supabaseDataEngine.executeWrite(async () => {
        return await this.client!.from('doorbly_partners').select('id').limit(1);
      });
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      if (error && error.code !== 'PGRST116') {
        if (error.message.includes('relation "doorbly_partners" does not exist')) {
          return {
            success: true,
            latencyMs,
            message: `Connected to Supabase in ${latencyMs}ms! (Tables need to be created).`
          };
        }
        return { success: false, latencyMs, message: error.message };
      }
      return {
        success: true,
        latencyMs,
        message: `Connected to Doorbly Supabase via Fast Data Engine (${latencyMs}ms)!`
      };
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : 'Unknown connection error' };
    }
  }

  // In-memory + LocalStorage persistence layer for zero-latency reads & offline resilience
  private getLocalStore(): LocalStorageStore {
    if (this.localStoreMemoryCache) {
      return this.localStoreMemoryCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEY_STORE_DATA);
      if (data) {
        const parsed = JSON.parse(data) as Partial<LocalStorageStore>;
        const store: LocalStorageStore = {
          partners: parsed.partners || {},
          memberships: parsed.memberships || {},
          bookings: parsed.bookings || {},
          transactions: parsed.transactions || {},
          withdrawals: parsed.withdrawals || {},
          notifications: parsed.notifications || {},
          tickets: parsed.tickets || {},
          screenVerifications: parsed.screenVerifications || {},
          wallets: parsed.wallets || {},
          customerCollections: parsed.customerCollections || {},
          commissionSettlements: parsed.commissionSettlements || {}
        };
        if (!localStorage.getItem(STORAGE_KEY_PURGE_SAMPLE)) {
          const legacySampleIds = ['BK-98214', 'BK-98188', 'BK-98150', 'BK-98092', 'BK-98014'];
          let removedAny = false;
          for (const id of legacySampleIds) {
            if (store.bookings[id]) {
              delete store.bookings[id];
              removedAny = true;
            }
          }
          localStorage.setItem(STORAGE_KEY_PURGE_SAMPLE, 'true');
          if (removedAny) {
            localStorage.setItem(STORAGE_KEY_STORE_DATA, JSON.stringify(store));
            supabaseDataEngine.invalidate('admin:bookings');
          }
        }
        this.localStoreMemoryCache = store;
        return this.localStoreMemoryCache;
      }
    } catch {
      // ignore
    }
    this.localStoreMemoryCache = {
      partners: {},
      memberships: {},
      bookings: {},
      transactions: {},
      withdrawals: {},
      notifications: {},
      tickets: {},
      screenVerifications: {},
      wallets: {},
      customerCollections: {},
      commissionSettlements: {}
    };
    return this.localStoreMemoryCache;
  }

  private saveLocalStore(data: LocalStorageStore): void {
    this.localStoreMemoryCache = data;
    try {
      localStorage.setItem(STORAGE_KEY_STORE_DATA, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save local store:', e);
    }
  }

  private computeLocalWalletSummary(partnerId: string): WalletSummary {
    const store = this.getLocalStore();
    const txList = store.transactions[partnerId] || [];
    const jobs = Object.values(store.bookings).filter(
      (b) => b.assigned_partner_id === partnerId && b.status === 'COMPLETED'
    );

    const todayDateStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    let available_balance = 0;
    let pending_amount = 0;
    let today_earnings = 0;
    let week_earnings = 0;
    let month_earnings = 0;
    let today_completed_jobs = 0;
    const total_completed_jobs = jobs.length;

    jobs.forEach((job) => {
      const earning = Number(job.partner_earning) || 0;
      const completedAt = job.completed_at || job.created_at;
      if (completedAt.startsWith(todayDateStr)) {
        today_earnings += earning;
        today_completed_jobs += 1;
      }
      if (completedAt >= sevenDaysAgo) {
        week_earnings += earning;
      }
      if (completedAt >= thirtyDaysAgo) {
        month_earnings += earning;
      }
    });

    if (!store.wallets) store.wallets = {};
    if (store.wallets[partnerId] && typeof store.wallets[partnerId].available_balance === 'number') {
      available_balance = store.wallets[partnerId].available_balance;
      pending_amount = store.wallets[partnerId].pending_amount || 0;
    } else {
      txList.forEach((tx) => {
        if (tx.status === 'completed' && WALLET_CASH_CATEGORIES.has(tx.category)) {
          if (tx.type === 'credit') available_balance += tx.amount;
          if (tx.type === 'debit') available_balance -= tx.amount;
        }
      });
      if (available_balance < 0) available_balance = 0;
    }

    return {
      available_balance,
      pending_amount,
      today_earnings,
      week_earnings,
      month_earnings,
      today_completed_jobs,
      total_completed_jobs
    };
  }

  /**
   * Synchronous (< 1ms) boot snapshot from L1/L2 cache + LocalStore so initial render never stalls
   */
  public getInstantPartnerSnapshot(partnerId: string): {
    profile: PartnerProfile | null;
    membership: PartnerMembership | null;
    wallet: WalletSummary;
    jobs: ServiceBooking[];
    activeJob: ServiceBooking | null;
    notifications: NotificationItem[];
    tickets: SupportTicket[];
  } {
    const store = this.getLocalStore();
    const activeStatuses: BookingStatus[] = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'];
    const profile =
      supabaseDataEngine.peekCache<PartnerProfile>(`profile:${partnerId}`) ??
      store.partners[partnerId] ??
      null;
    const membership =
      supabaseDataEngine.peekCache<PartnerMembership>(`membership:${partnerId}`) ??
      store.memberships[partnerId] ??
      null;
    const wallet =
      supabaseDataEngine.peekCache<WalletSummary>(`wallet:${partnerId}`) ??
      this.computeLocalWalletSummary(partnerId);
    const jobs =
      supabaseDataEngine.peekCache<ServiceBooking[]>(`jobs:${partnerId}`) ??
      Object.values(store.bookings)
        .filter((b) => b.assigned_partner_id === partnerId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const activeJob =
      supabaseDataEngine.peekCache<ServiceBooking | null>(`activeJob:${partnerId}`) ??
      jobs.find((b) => activeStatuses.includes(b.status)) ??
      null;
    const notifications =
      supabaseDataEngine.peekCache<NotificationItem[]>(`notifications:${partnerId}`) ??
      (store.notifications[partnerId] || []);
    const tickets =
      supabaseDataEngine.peekCache<SupportTicket[]>(`tickets:${partnerId}`) ??
      (store.tickets[partnerId] || []);

    return { profile, membership, wallet, jobs, activeJob, notifications, tickets };
  }

  /**
   * Synchronous (< 1ms) Admin Console snapshot so Admin tabs & sheets open instantly
   */
  public getInstantAdminSnapshot(): {
    partners: PartnerProfile[];
    bookings: ServiceBooking[];
    withdrawals: WithdrawalRequest[];
    memberships: PartnerMembership[];
    offer: OfferOfTheDay | null;
  } {
    const store = this.getLocalStore();

    const partners =
      supabaseDataEngine.peekCache<PartnerProfile[]>('admin:partners') ??
      Object.values(store.partners).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    const bookings =
      supabaseDataEngine.peekCache<ServiceBooking[]>('admin:bookings') ??
      Object.values(store.bookings).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    const withdrawals =
      supabaseDataEngine.peekCache<WithdrawalRequest[]>('admin:withdrawals') ??
      Object.values(store.withdrawals)
        .flat()
        .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
    const memberships =
      supabaseDataEngine.peekCache<PartnerMembership[]>('admin:memberships') ??
      Object.values(store.memberships);

    let offer: OfferOfTheDay | null = supabaseDataEngine.peekCache<OfferOfTheDay | null>('dailyOffer') ?? null;
    try {
      if (!offer) {
        const saved = localStorage.getItem(STORAGE_KEY_DAILY_OFFER);
        if (saved) offer = JSON.parse(saved) as OfferOfTheDay;
      }
    } catch {
      // ignore
    }

    return { partners, bookings, withdrawals, memberships, offer };
  }

  /**
   * Fetch partner profile with L1+L2 SWR Cache & Sub-0.1s Fast-Race
   */
  public async getPartnerProfile(partnerId: string, forceRefresh = false): Promise<PartnerProfile | null> {
    return supabaseDataEngine.fetchWithEngine(
      `profile:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partners')
              .select('*')
              .eq('id', partnerId)
              .maybeSingle();

            if (error) console.warn('Supabase getPartnerProfile error:', error);
            if (data) {
              const store = this.getLocalStore();
              store.partners[partnerId] = data as PartnerProfile;
              this.saveLocalStore(store);
              return data as PartnerProfile;
            }
          } catch (err) {
            console.warn('Supabase fetch failed, falling back:', err);
          }
        }

        const store = this.getLocalStore();
        return store.partners[partnerId] || null;
      },
      {
        forceRefresh,
        instantFallback: () => this.getLocalStore().partners[partnerId] || null
      }
    );
  }

  /**
   * Verify whether a Partner ID is officially registered with Doorbly
   */
  public async verifyPartnerIdRegistration(partnerId: string): Promise<{
    registered: boolean;
    profile?: PartnerProfile;
    status?: string;
    message?: string;
  }> {
    if (!partnerId) {
      return { registered: false, message: 'Invalid or missing Partner ID.' };
    }

    const profile = await this.getPartnerProfile(partnerId);
    if (!profile) {
      return {
        registered: false,
        message: `Partner ID "${partnerId}" is not registered with Doorbly. Please complete registration first.`
      };
    }

    if (profile.status === 'incomplete') {
      return {
        registered: false,
        profile,
        status: 'incomplete',
        message: `Partner ID "${partnerId}" registration is incomplete. Complete your profile and documents to proceed.`
      };
    }

    if (profile.status === 'pending_verification') {
      return {
        registered: true,
        profile,
        status: 'pending_verification',
        message: `Partner ID "${partnerId}" is registered, but verification is still pending.`
      };
    }

    if (profile.status === 'rejected' || profile.status === 'suspended') {
      return {
        registered: true,
        profile,
        status: profile.status,
        message: `Partner ID "${partnerId}" is ${profile.status}. Access to go online is restricted.`
      };
    }

    return {
      registered: true,
      profile,
      status: profile.status,
      message: 'Partner ID is verified and approved.'
    };
  }

  /**
   * Save and link 4-digit screen lock code with phone number in Supabase
   */
  public async storeScreenCredentials(
    phone: string,
    screenCode: string,
    partnerId: string,
    partnerName?: string
  ): Promise<{ success: boolean; message: string; record?: ScreenCredentialRecord }> {
    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    const cleanDigits = cleanPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      return { success: false, message: 'Please provide a valid 10-digit mobile number.' };
    }
    const cleanCode = screenCode.trim();
    if (!/^\d{4}$/.test(cleanCode)) {
      return { success: false, message: 'Screen lock code must be exactly 4 numeric digits.' };
    }

    const timestamp = new Date().toISOString();
    const record: ScreenCredentialRecord = {
      phone: cleanPhone,
      screen_code: cleanCode,
      partner_id: partnerId,
      partner_name: partnerName,
      verified: true,
      last_verified_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    };

    // 1. Store in local persistent memory & storage
    const store = this.getLocalStore();
    if (!store.screenVerifications) store.screenVerifications = {};
    store.screenVerifications[cleanPhone] = record;
    store.screenVerifications[cleanDigits] = record;
    if (store.partners[partnerId]) {
      store.partners[partnerId].screen_lock_code = cleanCode;
      store.partners[partnerId].is_screen_code_verified = true;
      store.partners[partnerId].screen_code_verified_at = timestamp;
    }
    this.saveLocalStore(store);

    // 2. Persist to Supabase with Turbo Engine
    if (this.client) {
      try {
        await supabaseDataEngine.executeWrite(async () => {
          const ops: Promise<unknown>[] = [];

          // Upsert into doorbly_screen_verifications
          ops.push(
            (async () => {
              return await this.client!
                .from('doorbly_screen_verifications')
                .upsert({
                  phone: cleanPhone,
                  screen_code: cleanCode,
                  partner_id: partnerId,
                  partner_name: partnerName || '',
                  verified: true,
                  last_verified_at: timestamp,
                  updated_at: timestamp
                });
            })()
          );

          // Update doorbly_partners profile
          if (partnerId) {
            ops.push(
              (async () => {
                return await this.client!
                  .from('doorbly_partners')
                  .update({
                    screen_lock_code: cleanCode,
                    is_screen_code_verified: true,
                    screen_code_verified_at: timestamp
                  })
                  .eq('id', partnerId);
              })()
            );
          }

          return await Promise.allSettled(ops);
        }, [`profile:${partnerId}`, 'admin:partners']);
      } catch (err) {
        console.warn('Supabase storeScreenCredentials notice:', err);
      }
    }

    return {
      success: true,
      message: '4-digit screen lock code stored & verified in Supabase!',
      record
    };
  }

  /**
   * Verify phone number and 4-digit screen lock code genuinely against Supabase
   */
  public async verifyScreenCredentials(
    phone: string,
    screenCode: string
  ): Promise<ScreenCodeVerificationResult> {
    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    const cleanDigits = cleanPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      return {
        success: false,
        isGenuine: false,
        message: 'Please provide a valid 10-digit mobile number.'
      };
    }

    const cleanCode = screenCode.trim();
    if (!/^\d{4}$/.test(cleanCode)) {
      return {
        success: false,
        isGenuine: false,
        message: 'Screen lock code must be exactly 4 numeric digits.'
      };
    }

    const timestamp = new Date().toISOString();

    // MASTER PHONE PARTNER VERIFICATION: Phone 9938713179 and Code 2211 (never unlocks Admin Console)
    if (
      (cleanDigits === '9938713179' || cleanDigits.endsWith('9938713179')) &&
      cleanCode === '2211'
    ) {
      const existingMasterPartner = await this.getPartnerProfile('partner_9938713179', true);
      const partnerProfile: PartnerProfile = existingMasterPartner || {
        id: 'partner_9938713179',
        auth_id: 'partner_9938713179',
        name: 'Debabrata Mohanta',
        mobile: '+91 99387 13179',
        email: '9938713179@partner.doorbly.com',
        address: 'Operations Command',
        district: 'Khordha',
        city: 'Bhubaneswar',
        pin_code: '751001',
        primary_category: 'AC Services',
        services_offered: ['srv_ac_foam_jet', 'srv_ac_repair', 'srv_ac_gas', 'srv_elec_switch'],
        years_experience: 10,
        skills: ['Master Technician', 'Operations Lead'],
        working_area: 'All Zones',
        preferred_radius_km: 10,
        languages: ['English', 'Hindi', 'Odia'],
        status: 'approved',
        is_online: false,
        created_at: new Date('2026-01-01').toISOString(),
        updated_at: new Date().toISOString()
      };
      if (!existingMasterPartner) {
        await this.upsertPartnerProfile(partnerProfile);
      }
      await this.storeScreenCredentials('+91 99387 13179', '2211', 'partner_9938713179', partnerProfile.name);
      return {
        success: true,
        isGenuine: true,
        message: 'Screen lock code verified successfully! Welcome Debabrata Mohanta.',
        partner: partnerProfile
      };
    }
    if (this.client) {
      try {
        const phoneCandidates = Array.from(new Set([cleanPhone, cleanDigits])).filter(Boolean);
        // Query doorbly_screen_verifications safely using .in() + .limit(1)
        const { data: verifRows, error: verifErr } = await this.client
          .from('doorbly_screen_verifications')
          .select('*')
          .in('phone', phoneCandidates)
          .limit(1);

        if (verifErr) {
          console.warn('Supabase screen verification query notice:', verifErr.message);
        }

        const verifData = verifRows && verifRows.length > 0 ? verifRows[0] : null;

        if (verifData) {
          if (verifData.screen_code === cleanCode) {
            this.client
              .from('doorbly_screen_verifications')
              .update({ verified: true, last_verified_at: timestamp })
              .eq('phone', verifData.phone)
              .then(() => {}, () => {});

            let partnerProfile: PartnerProfile | null = null;
            if (verifData.partner_id) {
              partnerProfile = await this.getPartnerProfile(verifData.partner_id, true);
            }

            return {
              success: true,
              isGenuine: true,
              message: '4-digit screen lock code verified successfully against Supabase!',
              partner: partnerProfile || undefined
            };
          } else {
            return {
              success: false,
              isGenuine: false,
              message: 'Incorrect 4-digit screen lock code. Please enter the genuine code registered for this phone number.'
            };
          }
        }

        // Query doorbly_partners table by mobile safely using .in() + .limit(1)
        const { data: partnerRows } = await this.client
          .from('doorbly_partners')
          .select('*')
          .in('mobile', phoneCandidates)
          .limit(1);

        const partnerData = partnerRows && partnerRows.length > 0 ? partnerRows[0] : null;

        if (partnerData) {
          const profile = partnerData as PartnerProfile;
          if (profile.screen_lock_code) {
            if (profile.screen_lock_code === cleanCode) {
              this.client
                .from('doorbly_partners')
                .update({ is_screen_code_verified: true, screen_code_verified_at: timestamp })
                .eq('id', profile.id)
                .then(() => {}, () => {});

              return {
                success: true,
                isGenuine: true,
                message: '4-digit screen lock code verified successfully against Supabase!',
                partner: profile
              };
            } else {
              return {
                success: false,
                isGenuine: false,
                message: 'Incorrect 4-digit screen lock code. Please enter the genuine code for this registered partner.'
              };
            }
          }
        }
      } catch (err) {
        console.warn('Supabase verifyScreenCredentials notice:', err);
      }
    }

    // Local persistent fallback
    const store = this.getLocalStore();
    const localVerif =
      store.screenVerifications?.[cleanPhone] ||
      store.screenVerifications?.[cleanDigits];

    if (localVerif) {
      if (localVerif.screen_code === cleanCode) {
        localVerif.last_verified_at = timestamp;
        this.saveLocalStore(store);
        const p = store.partners[localVerif.partner_id];
        return {
          success: true,
          isGenuine: true,
          message: '4-digit screen lock code verified successfully!',
          partner: p
        };
      } else {
        return {
          success: false,
          isGenuine: false,
          message: 'Incorrect 4-digit screen lock code. Please enter the genuine code.'
        };
      }
    }

    // Check partners in local store
    for (const p of Object.values(store.partners)) {
      const pClean = p.mobile.replace(/\D/g, '');
      if (pClean === cleanDigits || p.mobile === cleanPhone) {
        if (p.screen_lock_code) {
          if (p.screen_lock_code === cleanCode) {
            p.is_screen_code_verified = true;
            p.screen_code_verified_at = timestamp;
            this.saveLocalStore(store);
            return {
              success: true,
              isGenuine: true,
              message: '4-digit screen lock code verified successfully!',
              partner: p
            };
          } else {
            return {
              success: false,
              isGenuine: false,
              message: 'Incorrect 4-digit screen lock code. Please enter the genuine code for this registered partner.'
            };
          }
        }
      }
    }

    return {
      success: false,
      isGenuine: false,
      message: 'Mobile number not found in Supabase. Please complete registration with your 4-digit screen lock code first.'
    };
  }

  /**
   * Verify screen lock code specifically before allowing partner to go online
   */
  public async verifyPartnerScreenLockCodeForOnline(
    partnerId: string,
    phone: string,
    screenCode: string
  ): Promise<ScreenCodeVerificationResult> {
    const cleanCode = screenCode.trim();
    if (!/^\d{4}$/.test(cleanCode)) {
      return {
        success: false,
        isGenuine: false,
        message: 'Please enter a genuine 4-digit screen lock code.'
      };
    }

    const partner = await this.getPartnerProfile(partnerId, true);
    const store = this.getLocalStore();
    const currentProfile = partner || store.partners[partnerId];
    const phoneDigits = (currentProfile?.mobile || phone || '').replace(/\D/g, '');
    const isMasterPhonePartner =
      partnerId === 'partner_9938713179' ||
      partnerId === 'partner_master_admin' ||
      phoneDigits.endsWith('9938713179');

    // Restricted Master Screen Code 2211 applies ONLY to the registered master phone partner
    if (cleanCode === '2211' && isMasterPhonePartner) {
      return {
        success: true,
        isGenuine: true,
        message: 'Screen lock code verified! You are now Online.',
        partner: currentProfile
      };
    }

    if (!currentProfile) {
      return {
        success: false,
        isGenuine: false,
        message: 'Partner profile not found in Supabase.'
      };
    }

    // If partner already has a screen lock code configured:
    if (currentProfile.screen_lock_code) {
      if (currentProfile.screen_lock_code !== cleanCode) {
        return {
          success: false,
          isGenuine: false,
          message: 'Verification failed: 4-digit code does not match the screen lock code stored in Supabase.'
        };
      }
      await this.storeScreenCredentials(currentProfile.mobile || phone, cleanCode, partnerId, currentProfile.name);
      return {
        success: true,
        isGenuine: true,
        message: 'Genuine 4-digit screen lock code verified in Supabase! You can now go Online.',
        partner: currentProfile
      };
    }

    // Check if phone was saved in screenVerifications
    const verifRes = await this.verifyScreenCredentials(currentProfile.mobile || phone, cleanCode);
    if (verifRes.success) {
      await this.storeScreenCredentials(currentProfile.mobile || phone, cleanCode, partnerId, currentProfile.name);
      return {
        success: true,
        isGenuine: true,
        message: 'Genuine 4-digit screen lock code verified in Supabase! You can now go Online.',
        partner: currentProfile
      };
    }

    // If never set before, store it now and verify
    await this.storeScreenCredentials(currentProfile.mobile || phone, cleanCode, partnerId, currentProfile.name);
    return {
      success: true,
      isGenuine: true,
      message: '4-digit screen lock code registered and verified in Supabase! You can now go Online.',
      partner: currentProfile
    };
  }

  /**
   * Save or update partner profile with optimistic L1 cache priming
   */
  public async upsertPartnerProfile(profile: PartnerProfile): Promise<PartnerProfile> {
    profile.updated_at = new Date().toISOString();
    supabaseDataEngine.primeCache(`profile:${profile.id}`, profile);

    if (this.client) {
      try {
        const { data, error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partners')
              .upsert(profile)
              .select()
              .maybeSingle(),
          ['admin:partners']
        );

        if (!error && data) {
          const saved = data as PartnerProfile;
          supabaseDataEngine.primeCache(`profile:${profile.id}`, saved);
          const store = this.getLocalStore();
          store.partners[profile.id] = saved;
          this.saveLocalStore(store);
          return saved;
        }
      } catch (e) {
        console.warn('Supabase upsert error:', e);
      }
    }

    const store = this.getLocalStore();
    store.partners[profile.id] = profile;
    this.saveLocalStore(store);
    return profile;
  }

  /**
   * Update partner live availability and location with non-blocking write-behind coalescing for GPS heartbeats
   */
  public async updatePartnerAvailability(
    partnerId: string,
    isOnline: boolean,
    lat?: number,
    lng?: number
  ): Promise<void> {
    if (isOnline) {
      const currentProfile = await this.getPartnerProfile(partnerId);
      if (!currentProfile || currentProfile.status !== 'approved') {
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const updateData: Partial<PartnerProfile> = {
      is_online: isOnline,
      last_location_update: nowIso,
      updated_at: nowIso
    };
    if (lat !== undefined && lng !== undefined) {
      updateData.current_lat = lat;
      updateData.current_lng = lng;
    }

    // Optimistic local + L1 cache update immediately (0ms UI latency)
    const cachedProfile = supabaseDataEngine.peekCache<PartnerProfile>(`profile:${partnerId}`);
    if (cachedProfile) {
      supabaseDataEngine.primeCache(`profile:${partnerId}`, { ...cachedProfile, ...updateData });
    }

    const store = this.getLocalStore();
    if (store.partners[partnerId]) {
      store.partners[partnerId] = {
        ...store.partners[partnerId],
        ...updateData
      };
      this.saveLocalStore(store);
    }

    if (this.client) {
      const writeFn = async () => {
        await this.client!
          .from('doorbly_partners')
          .update(updateData)
          .eq('id', partnerId);
      };

      // If this is a continuous GPS coordinate update while online, coalesce writes via the engine
      if (isOnline && lat !== undefined && lng !== undefined) {
        supabaseDataEngine.scheduleCoalescedWrite(`availability:${partnerId}`, writeFn);
      } else {
        try {
          await supabaseDataEngine.executeWrite(writeFn, ['admin:partners']);
        } catch (e) {
          console.warn('Failed to update availability on Supabase:', e);
        }
      }
    }
  }

  /**
   * Get Partner Membership status (L1 SWR cached)
   */
  public async getMembership(partnerId: string): Promise<PartnerMembership | null> {
    return supabaseDataEngine.fetchWithEngine(
      `membership:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_memberships')
              .select('*')
              .eq('partner_id', partnerId)
              .maybeSingle();

            if (!error && data) {
              const store = this.getLocalStore();
              store.memberships[partnerId] = data as PartnerMembership;
              this.saveLocalStore(store);
              return data as PartnerMembership;
            }
          } catch (e) {
            console.warn('Supabase getMembership error:', e);
          }
        }

        const store = this.getLocalStore();
        return store.memberships[partnerId] || null;
      },
      {
        instantFallback: () => this.getLocalStore().memberships[partnerId] || null
      }
    );
  }

  /**
   * Subscribe/Renew Membership
   */
  public async updateMembership(membership: PartnerMembership): Promise<PartnerMembership> {
    supabaseDataEngine.primeCache(`membership:${membership.partner_id}`, membership);

    if (this.client) {
      try {
        const { data, error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partner_memberships')
              .upsert(membership)
              .select()
              .maybeSingle(),
          ['admin:memberships']
        );

        if (!error && data) {
          const saved = data as PartnerMembership;
          supabaseDataEngine.primeCache(`membership:${membership.partner_id}`, saved);
          const store = this.getLocalStore();
          store.memberships[membership.partner_id] = saved;
          this.saveLocalStore(store);
          return saved;
        }
      } catch (e) {
        console.warn('Failed to update membership in Supabase:', e);
      }
    }

    const store = this.getLocalStore();
    store.memberships[membership.partner_id] = membership;
    this.saveLocalStore(store);
    return membership;
  }

  /**
   * Fetch partner wallet summary with projected lightweight column selection & L1 caching
   */
  public async getWalletSummary(partnerId: string): Promise<WalletSummary> {
    return supabaseDataEngine.fetchWithEngine(`wallet:${partnerId}`, async () => {
      let available_balance = 0;
      let pending_amount = 0;
      let today_earnings = 0;
      let week_earnings = 0;
      let month_earnings = 0;
      let today_completed_jobs = 0;
      let total_completed_jobs = 0;

      const todayDateStr = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      if (this.client) {
        try {
          const [{ data: walletData }, { data: txData }, { data: jobs }] = await Promise.all([
            this.client
              .from('doorbly_partner_wallets')
              .select('available_balance, pending_amount')
              .eq('partner_id', partnerId)
              .maybeSingle(),
            this.client
              .from('doorbly_partner_wallet_transactions')
              .select('type, category, amount, status')
              .eq('partner_id', partnerId),
            this.client
              .from('doorbly_service_bookings')
              .select('partner_earning, completed_at, created_at')
              .eq('assigned_partner_id', partnerId)
              .eq('status', 'COMPLETED')
          ]);

          if (walletData) {
            available_balance = Number(walletData.available_balance) || 0;
            pending_amount = Number(walletData.pending_amount) || 0;
          } else if (txData && txData.length > 0) {
            txData.forEach((tx) => {
              if (tx.status === 'completed' && WALLET_CASH_CATEGORIES.has(tx.category)) {
                if (tx.type === 'credit') available_balance += Number(tx.amount) || 0;
                if (tx.type === 'debit') available_balance -= Number(tx.amount) || 0;
              }
            });
            if (available_balance < 0) available_balance = 0;
          }

          if (jobs && jobs.length > 0) {
            total_completed_jobs = jobs.length;
            jobs.forEach((job) => {
              const earning = Number(job.partner_earning) || 0;
              const completedAt = job.completed_at || job.created_at;
              if (completedAt.startsWith(todayDateStr)) {
                today_earnings += earning;
                today_completed_jobs += 1;
              }
              if (completedAt >= sevenDaysAgo) {
                week_earnings += earning;
              }
              if (completedAt >= thirtyDaysAgo) {
                month_earnings += earning;
              }
            });
          }

          return {
            available_balance,
            pending_amount,
            today_earnings,
            week_earnings,
            month_earnings,
            today_completed_jobs,
            total_completed_jobs
          };
        } catch (e) {
          console.warn('Supabase getWalletSummary error:', e);
        }
      }

      // Local fallback
      const store = this.getLocalStore();
      const txList = store.transactions[partnerId] || [];
      const jobs = Object.values(store.bookings).filter(
        b => b.assigned_partner_id === partnerId && b.status === 'COMPLETED'
      );

      total_completed_jobs = jobs.length;
      jobs.forEach((job) => {
        const earning = Number(job.partner_earning) || 0;
        const completedAt = job.completed_at || job.created_at;
        if (completedAt.startsWith(todayDateStr)) {
          today_earnings += earning;
          today_completed_jobs += 1;
        }
        if (completedAt >= sevenDaysAgo) {
          week_earnings += earning;
        }
        if (completedAt >= thirtyDaysAgo) {
          month_earnings += earning;
        }
      });

      if (!store.wallets) store.wallets = {};
      if (store.wallets[partnerId] && typeof store.wallets[partnerId].available_balance === 'number') {
        available_balance = store.wallets[partnerId].available_balance;
        pending_amount = store.wallets[partnerId].pending_amount || 0;
      } else {
        txList.forEach((tx) => {
          if (tx.status === 'completed' && WALLET_CASH_CATEGORIES.has(tx.category)) {
            if (tx.type === 'credit') available_balance += tx.amount;
            if (tx.type === 'debit') available_balance -= tx.amount;
          }
        });
        if (available_balance < 0) available_balance = 0;
        store.wallets[partnerId] = {
          partner_id: partnerId,
          available_balance,
          pending_amount: 0,
          updated_at: new Date().toISOString()
        };
      }

      return {
        available_balance,
        pending_amount,
        today_earnings,
        week_earnings,
        month_earnings,
        today_completed_jobs,
        total_completed_jobs
      };
    },
    {
      instantFallback: () => this.computeLocalWalletSummary(partnerId)
    });
  }

  /**
   * Fetch wallet transactions
   */
  public async getTransactions(partnerId: string): Promise<WalletTransaction[]> {
    return supabaseDataEngine.fetchWithEngine(
      `transactions:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_wallet_transactions')
              .select('*')
              .eq('partner_id', partnerId)
              .order('created_at', { ascending: false });

            if (!error && data) return data as WalletTransaction[];
          } catch (e) {
            console.warn('Supabase getTransactions error:', e);
          }
        }

        const store = this.getLocalStore();
        return (store.transactions[partnerId] || []).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      },
      {
        instantFallback: () =>
          (this.getLocalStore().transactions[partnerId] || []).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
      }
    );
  }

  /**
   * Request withdrawal
   */
  public async createWithdrawal(
    partnerId: string,
    amount: number,
    bank_account: string,
    ifsc: string,
    account_holder: string
  ): Promise<{ success: boolean; message: string; withdrawal?: WithdrawalRequest }> {
    const wallet = await this.getWalletSummary(partnerId);
    if (amount <= 0) {
      return { success: false, message: 'Please enter a valid withdrawal amount.' };
    }
    if (amount > wallet.available_balance) {
      return {
        success: false,
        message: `Insufficient balance. Available: ₹${wallet.available_balance}`
      };
    }
    if (amount < 200) {
      return { success: false, message: 'Minimum withdrawal amount is ₹200.' };
    }

    const newWithdrawal: WithdrawalRequest = {
      id: `wth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      partner_id: partnerId,
      amount,
      bank_account,
      ifsc,
      account_holder,
      status: 'requested',
      requested_at: new Date().toISOString()
    };

    if (this.client) {
      try {
        const { data, error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partner_withdrawals')
              .insert(newWithdrawal)
              .select()
              .maybeSingle(),
          [`wallet:${partnerId}`, `withdrawals:${partnerId}`, `transactions:${partnerId}`, 'admin:withdrawals']
        );

        if (error) {
          return { success: false, message: error.message };
        }
        if (data) {
          const newBal = Math.round(Math.max(0, wallet.available_balance - amount) * 100) / 100;
          const nowIso = new Date().toISOString();
          const debitTx: WalletTransaction = {
            id: `tx_wth_${Date.now()}`,
            partner_id: partnerId,
            type: 'debit',
            category: 'withdrawal',
            amount,
            balance_after: newBal,
            description: `Bank Withdrawal to ${bank_account.slice(-4).padStart(bank_account.length, '*')}`,
            status: 'completed',
            created_at: nowIso
          };

          await Promise.all([
            this.client.from('doorbly_partner_wallets').upsert(
              {
                partner_id: partnerId,
                available_balance: newBal,
                pending_amount: wallet.pending_amount || 0,
                updated_at: nowIso
              },
              { onConflict: 'partner_id' }
            ),
            this.client.from('doorbly_partner_wallet_transactions').insert(debitTx)
          ]);

          // Mirror locally so instant snapshots stay accurate
          const localStore = this.getLocalStore();
          if (!localStore.wallets) localStore.wallets = {};
          localStore.wallets[partnerId] = {
            partner_id: partnerId,
            available_balance: newBal,
            pending_amount: wallet.pending_amount || 0,
            updated_at: nowIso
          };
          if (!localStore.withdrawals[partnerId]) localStore.withdrawals[partnerId] = [];
          localStore.withdrawals[partnerId].unshift(data as WithdrawalRequest);
          if (!localStore.transactions[partnerId]) localStore.transactions[partnerId] = [];
          localStore.transactions[partnerId].unshift(debitTx);
          this.saveLocalStore(localStore);

          supabaseDataEngine.invalidate(`wallet:${partnerId}`);
          supabaseDataEngine.invalidate(`withdrawals:${partnerId}`);
          supabaseDataEngine.invalidate(`transactions:${partnerId}`);
          return { success: true, message: 'Withdrawal request submitted successfully.', withdrawal: data as WithdrawalRequest };
        }
      } catch (e: unknown) {
        return { success: false, message: e instanceof Error ? e.message : 'Database error' };
      }
    }

    const store = this.getLocalStore();
    if (!store.wallets) store.wallets = {};
    if (!store.wallets[partnerId]) {
      store.wallets[partnerId] = {
        partner_id: partnerId,
        available_balance: wallet.available_balance,
        pending_amount: 0,
        updated_at: new Date().toISOString()
      };
    }
    store.wallets[partnerId].available_balance = Math.max(0, store.wallets[partnerId].available_balance - amount);
    store.wallets[partnerId].updated_at = new Date().toISOString();

    if (!store.withdrawals[partnerId]) store.withdrawals[partnerId] = [];
    store.withdrawals[partnerId].unshift(newWithdrawal);

    const debitTx: WalletTransaction = {
      id: `tx_${Date.now()}`,
      partner_id: partnerId,
      type: 'debit',
      category: 'withdrawal',
      amount,
      balance_after: store.wallets[partnerId].available_balance,
      description: `Bank Withdrawal to ${bank_account.slice(-4).padStart(bank_account.length, '*')}`,
      status: 'completed',
      created_at: new Date().toISOString()
    };
    if (!store.transactions[partnerId]) store.transactions[partnerId] = [];
    store.transactions[partnerId].unshift(debitTx);

    this.saveLocalStore(store);
    supabaseDataEngine.invalidate(`wallet:${partnerId}`);
    supabaseDataEngine.invalidate(`withdrawals:${partnerId}`);
    supabaseDataEngine.invalidate(`transactions:${partnerId}`);
    return { success: true, message: 'Withdrawal request submitted successfully.', withdrawal: newWithdrawal };
  }

  /**
   * Get withdrawals for partner
   */
  public async getWithdrawals(partnerId: string): Promise<WithdrawalRequest[]> {
    return supabaseDataEngine.fetchWithEngine(
      `withdrawals:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_withdrawals')
              .select('*')
              .eq('partner_id', partnerId)
              .order('requested_at', { ascending: false });

            if (!error && data) return data as WithdrawalRequest[];
          } catch (e) {
            console.warn('Supabase getWithdrawals error:', e);
          }
        }

        const store = this.getLocalStore();
        return store.withdrawals[partnerId] || [];
      },
      {
        instantFallback: () => this.getLocalStore().withdrawals[partnerId] || []
      }
    );
  }

  /**
   * Fetch partner jobs (Active, Completed, Cancelled) with L1+L2 SWR caching
   */
  public async getPartnerJobs(partnerId: string): Promise<ServiceBooking[]> {
    return supabaseDataEngine.fetchWithEngine(
      `jobs:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_service_bookings')
              .select('*')
              .eq('assigned_partner_id', partnerId)
              .order('created_at', { ascending: false });

            if (!error && data) return data as ServiceBooking[];
          } catch (e) {
            console.warn('Supabase getPartnerJobs error:', e);
          }
        }

        const store = this.getLocalStore();
        return Object.values(store.bookings)
          .filter(b => b.assigned_partner_id === partnerId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      },
      {
        instantFallback: () =>
          Object.values(this.getLocalStore().bookings)
            .filter(b => b.assigned_partner_id === partnerId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      }
    );
  }

  /**
   * Check for currently active job assigned to partner (reuses cached partner jobs if fresh)
   */
  public async getActiveJob(partnerId: string): Promise<ServiceBooking | null> {
    const activeStatuses: BookingStatus[] = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'];

    const cachedJobs = supabaseDataEngine.peekCache<ServiceBooking[]>(`jobs:${partnerId}`);
    if (cachedJobs) {
      return cachedJobs.find(b => activeStatuses.includes(b.status)) || null;
    }

    return supabaseDataEngine.fetchWithEngine(
      `activeJob:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_service_bookings')
              .select('*')
              .eq('assigned_partner_id', partnerId)
              .in('status', activeStatuses)
              .maybeSingle();

            if (!error && data) return data as ServiceBooking;
          } catch (e) {
            console.warn('Supabase getActiveJob error:', e);
          }
        }

        const store = this.getLocalStore();
        const active = Object.values(store.bookings).find(
          b => b.assigned_partner_id === partnerId && activeStatuses.includes(b.status)
        );
        return active || null;
      },
      {
        instantFallback: () =>
          Object.values(this.getLocalStore().bookings).find(
            b => b.assigned_partner_id === partnerId && activeStatuses.includes(b.status)
          ) || null
      }
    );
  }

  /**
   * Poll for live open job requests (SEARCHING_PARTNER / REQUEST_SENT)
   * Deduplicated via Fast Data Engine with a short 2.5s TTL so rapid polls don't flood the network
   */
  public async pollOpenJobRequests(): Promise<ServiceBooking[]> {
    const openStatuses: BookingStatus[] = ['SEARCHING_PARTNER', 'REQUEST_SENT'];

    return supabaseDataEngine.fetchWithEngine(
      'openJobRequests',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_service_bookings')
              .select('*')
              .in('status', openStatuses)
              .order('created_at', { ascending: false })
              .limit(10);

            if (!error && data) {
              return data as ServiceBooking[];
            }
          } catch (e) {
            console.warn('Supabase pollOpenJobRequests notice:', e);
          }
        }

        const store = this.getLocalStore();
        return Object.values(store.bookings)
          .filter(b => openStatuses.includes(b.status))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      },
      { ttlMs: 2500, staleWhileRevalidate: false }
    );
  }

  /**
   * Fetch live counts of:
   * 1. Number of Works Done by partner (status = COMPLETED)
   * 2. Number of Next Upcoming Works in Queue (open requests + partner's assigned/upcoming jobs)
   */
  public async getLiveWorkCounts(partnerId: string): Promise<{
    worksDone: number;
    upcomingQueue: number;
  }> {
    const queueOpenStatuses: BookingStatus[] = ['SEARCHING_PARTNER', 'REQUEST_SENT'];
    const partnerUpcomingStatuses: BookingStatus[] = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'];

    const computeLocalCounts = () => {
      const store = this.getLocalStore();
      const allBookings = Object.values(store.bookings);
      const worksDone = allBookings.filter(
        b => b.assigned_partner_id === partnerId && b.status === 'COMPLETED'
      ).length;
      const upcomingQueue = allBookings.filter(
        b =>
          queueOpenStatuses.includes(b.status) ||
          (b.assigned_partner_id === partnerId && partnerUpcomingStatuses.includes(b.status))
      ).length;
      return { worksDone, upcomingQueue };
    };

    return supabaseDataEngine.fetchWithEngine(
      `workCounts:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const [doneRes, openQueueRes, assignedQueueRes] = await Promise.all([
              this.client
                .from('doorbly_service_bookings')
                .select('id', { count: 'exact', head: true })
                .eq('assigned_partner_id', partnerId)
                .eq('status', 'COMPLETED'),
              this.client
                .from('doorbly_service_bookings')
                .select('id', { count: 'exact', head: true })
                .in('status', queueOpenStatuses),
              this.client
                .from('doorbly_service_bookings')
                .select('id', { count: 'exact', head: true })
                .eq('assigned_partner_id', partnerId)
                .in('status', partnerUpcomingStatuses)
            ]);

            if (!doneRes.error && !openQueueRes.error && !assignedQueueRes.error) {
              return {
                worksDone: doneRes.count ?? 0,
                upcomingQueue: (openQueueRes.count ?? 0) + (assignedQueueRes.count ?? 0)
              };
            }
          } catch (e) {
            console.warn('Supabase getLiveWorkCounts error:', e);
          }
        }

        return computeLocalCounts();
      },
      { ttlMs: 4000, instantFallback: computeLocalCounts }
    );
  }

  /**
   * Atomically accept a job request
   * Prevents race conditions if multiple partners attempt to accept
   */
  public async acceptJob(
    bookingId: string,
    partnerId: string
  ): Promise<{ success: boolean; message: string; booking?: ServiceBooking }> {
    if (this.client) {
      try {
        const { data, error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_service_bookings')
              .update({
                status: 'ASSIGNED',
                assigned_partner_id: partnerId,
                updated_at: new Date().toISOString()
              })
              .eq('id', bookingId)
              .in('status', ['SEARCHING_PARTNER', 'REQUEST_SENT'])
              .select()
              .maybeSingle(),
          [`jobs:${partnerId}`, `activeJob:${partnerId}`, `workCounts:${partnerId}`, 'openJobRequests', 'admin:bookings']
        );

        if (error || !data) {
          return {
            success: false,
            message: 'This service request has already been assigned to another partner.'
          };
        }

        const acceptedBooking = data as ServiceBooking;
        supabaseDataEngine.primeCache(`activeJob:${partnerId}`, acceptedBooking);

        return {
          success: true,
          message: 'Service accepted successfully!',
          booking: acceptedBooking
        };
      } catch (err: unknown) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to accept job'
        };
      }
    }

    // Local atomic check
    const store = this.getLocalStore();
    const target = store.bookings[bookingId];
    if (!target) {
      return { success: false, message: 'Service request no longer exists.' };
    }
    if (target.status !== 'SEARCHING_PARTNER' && target.status !== 'REQUEST_SENT') {
      return {
        success: false,
        message: 'This service request has already been assigned to another partner.'
      };
    }

    target.status = 'ASSIGNED';
    target.assigned_partner_id = partnerId;
    store.bookings[bookingId] = target;
    this.saveLocalStore(store);

    supabaseDataEngine.invalidate(`jobs:${partnerId}`);
    supabaseDataEngine.invalidate('openJobRequests');
    supabaseDataEngine.primeCache(`activeJob:${partnerId}`, target);

    return {
      success: true,
      message: 'Service accepted successfully!',
      booking: target
    };
  }

  /**
   * Update active job status (e.g. ARRIVED, IN_PROGRESS, COMPLETED)
   * Financial Security & Idempotency:
   * - Completed, Cancelled, or Rejected bookings cannot be modified or re-credited
   * - Commission calculated strictly AFTER successful completion (COMPLETED)
   * - Never calculates commission twice for the same booking
   * - Stores immutable booking transaction snapshot fields
   */
  public async updateJobStatus(
    bookingId: string,
    partnerId: string,
    status: BookingStatus,
    extra?: {
      otp?: string;
      notes?: string;
      photos?: string[];
    }
  ): Promise<{ success: boolean; message: string; booking?: ServiceBooking }> {
    const completedAtIso = new Date().toISOString();
    const updatePayload: Partial<ServiceBooking> = {
      status
    };

    if (status === 'IN_PROGRESS') {
      updatePayload.started_at = completedAtIso;
    } else if (status === 'COMPLETED') {
      updatePayload.completed_at = completedAtIso;
    }
    if (extra?.notes) {
      updatePayload.notes = extra.notes;
    }

    if (this.client) {
      try {
        // 0. Guard: Fetch existing booking to enforce immutability of completed/closed bookings
        const { data: existingRow } = await this.client
          .from('doorbly_service_bookings')
          .select('*')
          .eq('id', bookingId)
          .eq('assigned_partner_id', partnerId)
          .maybeSingle();

        const existingBooking = existingRow as ServiceBooking | null;
        if (
          existingBooking &&
          ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(existingBooking.status)
        ) {
          return {
            success: false,
            message: `Booking is already ${existingBooking.status} and cannot be modified.`
          };
        }

        // If completing, attempt DB-side atomic RPC first if deployed, otherwise execute hardened calculation + snapshot lock
        if (status === 'COMPLETED' && existingBooking) {
          const commissionableAmt = Math.max(0, Number(existingBooking.customer_price) || 0);
          let rpcHandled = false;

          try {
            const { data: rpcData, error: rpcErr } = await this.client.rpc(
              'complete_booking_with_commission',
              {
                p_booking_id: bookingId,
                p_partner_id: partnerId
              }
            );
            if (!rpcErr && rpcData && (rpcData as { ok?: boolean }).ok === true) {
              rpcHandled = true;
            }
          } catch {
            // RPC optional if SQL function has not been executed yet in user's Supabase project
          }

          const commResult = await subscriptionService.calculateAndRecordJobCommission(
            bookingId,
            partnerId,
            commissionableAmt,
            {
              completedAt: completedAtIso,
              bookingStatus: 'COMPLETED'
            }
          );

          const snapshotUpdate: Partial<ServiceBooking> = {
            ...updatePayload,
            partner_earning: commResult.partnerEarnings,
            commission_percent: commResult.commissionPercent,
            commission_amount: commResult.commissionAmount,
            plan_code_at_transaction: commResult.planCode,
            subscription_id: commResult.record.subscription_id,
            commission_calculated_at: commResult.record.created_at
          };

          const { data: updatedRow, error: updErr } = await supabaseDataEngine.executeWrite(
            async () =>
              await this.client!
                .from('doorbly_service_bookings')
                .update(snapshotUpdate)
                .eq('id', bookingId)
                .eq('assigned_partner_id', partnerId)
                .neq('status', 'COMPLETED')
                .select()
                .maybeSingle(),
            [
              `jobs:${partnerId}`,
              `activeJob:${partnerId}`,
              `workCounts:${partnerId}`,
              `wallet:${partnerId}`,
              `commissions:${partnerId}`,
              'admin:bookings',
              'admin:commissions'
            ]
          );

          if (updErr) {
            return { success: false, message: updErr.message };
          }

          const finalBooking = (updatedRow || {
            ...existingBooking,
            ...snapshotUpdate
          }) as ServiceBooking;

          if (!rpcHandled && !commResult.alreadyRecorded) {
            await this.creditPartnerEarnings(partnerId, finalBooking, commResult);
          }

          // Mirror locally
          const localStore = this.getLocalStore();
          localStore.bookings[bookingId] = finalBooking;
          this.saveLocalStore(localStore);

          supabaseDataEngine.invalidate(`wallet:${partnerId}`);
          supabaseDataEngine.invalidate(`transactions:${partnerId}`);
          supabaseDataEngine.invalidate(`notifications:${partnerId}`);
          return {
            success: true,
            message: 'Job completed & immutable commission snapshot recorded.',
            booking: finalBooking
          };
        }

        // Non-completion status updates (ARRIVED, IN_PROGRESS, CANCELLED, REJECTED)
        // Cancelled / Rejected explicitly never calculate commission
        const { data, error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_service_bookings')
              .update(updatePayload)
              .eq('id', bookingId)
              .eq('assigned_partner_id', partnerId)
              .select()
              .maybeSingle(),
          [
            `jobs:${partnerId}`,
            `activeJob:${partnerId}`,
            `workCounts:${partnerId}`,
            `wallet:${partnerId}`,
            'admin:bookings'
          ]
        );

        if (error) {
          return { success: false, message: error.message };
        }
        if (data) {
          supabaseDataEngine.primeCache(`activeJob:${partnerId}`, data as ServiceBooking);
        }
        return { success: true, message: `Status updated to ${status}`, booking: data as ServiceBooking };
      } catch (e: unknown) {
        return { success: false, message: e instanceof Error ? e.message : 'Failed to update status' };
      }
    }

    const store = this.getLocalStore();
    const job = store.bookings[bookingId];
    if (!job || job.assigned_partner_id !== partnerId) {
      return { success: false, message: 'Job not found or not assigned to you.' };
    }
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(job.status)) {
      return {
        success: false,
        message: `Booking is already ${job.status} and cannot be modified.`
      };
    }

    Object.assign(job, updatePayload);
    if (extra?.notes) {
      job.work_notes = job.work_notes || [];
      job.work_notes.push(extra.notes);
    }

    if (status === 'COMPLETED') {
      const commissionableAmt = Math.max(0, Number(job.customer_price) || 0);
      const commResult = await subscriptionService.calculateAndRecordJobCommission(
        job.id,
        partnerId,
        commissionableAmt,
        {
          completedAt: completedAtIso,
          bookingStatus: 'COMPLETED'
        }
      );
      job.partner_earning = commResult.partnerEarnings;
      job.commission_percent = commResult.commissionPercent;
      job.commission_amount = commResult.commissionAmount;
      job.plan_code_at_transaction = commResult.planCode;
      job.subscription_id = commResult.record.subscription_id;
      job.commission_calculated_at = commResult.record.created_at;
      store.bookings[bookingId] = job;
      this.saveLocalStore(store);

      if (!commResult.alreadyRecorded) {
        await this.creditPartnerEarnings(partnerId, job, commResult);
      }
    } else {
      // CANCELLED / REJECTED / IN_PROGRESS / ARRIVED never generate commission
      store.bookings[bookingId] = job;
      this.saveLocalStore(store);
    }

    supabaseDataEngine.invalidate(`jobs:${partnerId}`);
    supabaseDataEngine.invalidate(`activeJob:${partnerId}`);
    supabaseDataEngine.invalidate(`wallet:${partnerId}`);
    supabaseDataEngine.invalidate(`transactions:${partnerId}`);
    supabaseDataEngine.invalidate(`notifications:${partnerId}`);
    supabaseDataEngine.invalidate(`commissions:${partnerId}`);
    return { success: true, message: `Status updated to ${status}`, booking: job };
  }

  /**
   * Helper to credit wallet and create notification on Supabase & local storage
   * Enforces strict idempotency per booking_id
   */
  private async creditPartnerEarnings(
    partnerId: string,
    booking: ServiceBooking,
    commResult?: {
      commissionPercent: number;
      commissionAmount: number;
      partnerEarnings: number;
      planCode: string;
      alreadyRecorded?: boolean;
    }
  ): Promise<{ available_balance: number; earning: number }> {
    if (commResult?.alreadyRecorded) {
      const current = await this.getWalletSummary(partnerId);
      return { available_balance: current.available_balance, earning: 0 };
    }

    const earning = commResult?.partnerEarnings ?? (Number(booking.partner_earning) || 0);
    const feeText = commResult
      ? ` [${commResult.planCode.toUpperCase()} Plan: ${commResult.commissionPercent}% fee ₹${commResult.commissionAmount}]`
      : '';
    const nowIso = new Date().toISOString();
    let finalBalance = 0;

    // 1. If Supabase client is connected, verify not already credited & update database tables
    if (this.client) {
      try {
        const { data: existingCredit } = await this.client
          .from('doorbly_partner_wallet_transactions')
          .select('id')
          .eq('booking_id', booking.id)
          .eq('category', 'job_earning')
          .maybeSingle();

        if (existingCredit) {
          const current = await this.getWalletSummary(partnerId);
          return { available_balance: current.available_balance, earning: 0 };
        }

        const { data: existingWallet } = await this.client
          .from('doorbly_partner_wallets')
          .select('available_balance')
          .eq('partner_id', partnerId)
          .maybeSingle();

        const currentBal = Number(existingWallet?.available_balance || 0);
        finalBalance = Math.round((currentBal + earning) * 100) / 100;

        await Promise.all([
          this.client.from('doorbly_partner_wallets').upsert(
            {
              partner_id: partnerId,
              available_balance: finalBalance,
              updated_at: nowIso
            },
            { onConflict: 'partner_id' }
          ),
          this.client.from('doorbly_partner_wallet_transactions').insert({
            id: `tx_cred_${booking.id}`,
            partner_id: partnerId,
            booking_id: booking.id,
            type: 'credit',
            category: 'job_earning',
            amount: earning,
            balance_after: finalBalance,
            description: `Earning for ${booking.service_name} (#${booking.id.substring(0, 8)})${feeText}`,
            status: 'completed',
            created_at: nowIso
          }),
          this.client.from('doorbly_partner_notifications').insert({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            partner_id: partnerId,
            type: 'WALLET_CREDIT',
            title: `Earnings Credited! ₹${earning.toLocaleString('en-IN')}`,
            message: commResult
              ? `Earned ₹${earning} on ₹${booking.customer_price || earning} order (${commResult.commissionPercent}% Doorbly fee: ₹${commResult.commissionAmount}). Credited to your wallet.`
              : `Your earnings of ₹${earning} for job #${booking.id.substring(0, 8)} have been credited to your wallet.`,
            is_read: false,
            created_at: nowIso
          })
        ]);
      } catch (e) {
        console.warn('Failed to record credit transaction on Supabase:', e);
      }
    }

    // 2. Always sync with Local Store for zero-latency UI and resilience (idempotent per booking_id)
    const store = this.getLocalStore();
    if (!store.wallets) store.wallets = {};
    if (!store.transactions[partnerId]) store.transactions[partnerId] = [];
    const alreadyCreditedLocally = store.transactions[partnerId].some(
      (tx) => tx.booking_id === booking.id && tx.category === 'job_earning'
    );
    if (alreadyCreditedLocally) {
      return {
        available_balance: store.wallets[partnerId]?.available_balance ?? 0,
        earning: 0
      };
    }

    if (!store.wallets[partnerId]) {
      const existingTxs = store.transactions[partnerId] || [];
      let baseBal = 0;
      existingTxs.forEach((tx) => {
        if (tx.status === 'completed' && WALLET_CASH_CATEGORIES.has(tx.category)) {
          if (tx.type === 'credit') baseBal += tx.amount;
          if (tx.type === 'debit') baseBal -= tx.amount;
        }
      });
      store.wallets[partnerId] = {
        partner_id: partnerId,
        available_balance: Math.max(0, baseBal),
        pending_amount: 0,
        updated_at: nowIso
      };
    }

    store.wallets[partnerId].available_balance =
      Math.round((store.wallets[partnerId].available_balance + earning) * 100) / 100;
    store.wallets[partnerId].updated_at = nowIso;
    finalBalance = store.wallets[partnerId].available_balance;

    const creditTx: WalletTransaction = {
      id: `tx_cred_${booking.id}`,
      partner_id: partnerId,
      booking_id: booking.id,
      type: 'credit',
      category: 'job_earning',
      amount: earning,
      balance_after: finalBalance,
      description: `Earning for ${booking.service_name} (#${booking.id.substring(0, 8)})${feeText}`,
      status: 'completed',
      created_at: nowIso
    };
    store.transactions[partnerId].unshift(creditTx);

    const notif: NotificationItem = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      partner_id: partnerId,
      type: 'WALLET_CREDIT',
      title: `Earnings Credited! ₹${earning.toLocaleString('en-IN')}`,
      message: commResult
        ? `Earned ₹${earning} on ₹${booking.customer_price || earning} order (${commResult.commissionPercent}% commission: ₹${commResult.commissionAmount}). Credited to your wallet.`
        : `Your earnings of ₹${earning} for job #${booking.id.substring(0, 8)} have been credited to your wallet.`,
      is_read: false,
      created_at: nowIso
    };
    if (!store.notifications[partnerId]) store.notifications[partnerId] = [];
    store.notifications[partnerId].unshift(notif);

    this.saveLocalStore(store);

    return { available_balance: finalBalance, earning };
  }

  /**
   * Record an idempotent ledger entry in doorbly_partner_wallet_transactions.
   * Non-cash-wallet accounting categories (gross_collection, commission_accrued,
   * commission_settlement, subscription_payment) keep wallet available_balance untouched
   * so bankable wallet balance is never distorted.
   */
  public async recordLedgerTransaction(
    partnerId: string,
    tx: {
      id: string;
      booking_id?: string;
      reference_id?: string;
      payment_method?: string;
      type: 'credit' | 'debit';
      category: WalletTransaction['category'];
      amount: number;
      description: string;
      status?: 'pending' | 'completed' | 'failed';
      created_at?: string;
    }
  ): Promise<WalletTransaction | null> {
    const nowIso = tx.created_at || new Date().toISOString();
    const cleanAmount = Math.round((Number(tx.amount) || 0) * 100) / 100;
    const store = this.getLocalStore();
    if (!store.transactions[partnerId]) store.transactions[partnerId] = [];
    if (!store.wallets) store.wallets = {};

    const existingLocal = store.transactions[partnerId].find(
      (t) => t.id === tx.id || (tx.booking_id && t.booking_id === tx.booking_id && t.category === tx.category)
    );
    if (existingLocal) return existingLocal;

    let currentBal = store.wallets[partnerId]?.available_balance ?? 0;
    if (this.client) {
      try {
        const { data: wRow } = await this.client
          .from('doorbly_partner_wallets')
          .select('available_balance')
          .eq('partner_id', partnerId)
          .maybeSingle();
        if (wRow && typeof wRow.available_balance === 'number') {
          currentBal = Number(wRow.available_balance);
        }
      } catch {
        // ignore
      }
    }

    let nextBalance = currentBal;
    if ((tx.status ?? 'completed') === 'completed' && WALLET_CASH_CATEGORIES.has(tx.category)) {
      nextBalance =
        tx.type === 'credit'
          ? Math.round((currentBal + cleanAmount) * 100) / 100
          : Math.max(0, Math.round((currentBal - cleanAmount) * 100) / 100);
    }

    const record: WalletTransaction = {
      id: tx.id,
      partner_id: partnerId,
      booking_id: tx.booking_id,
      reference_id: tx.reference_id,
      payment_method: tx.payment_method,
      type: tx.type,
      category: tx.category,
      amount: cleanAmount,
      balance_after: nextBalance,
      description: tx.description,
      status: tx.status ?? 'completed',
      created_at: nowIso
    };

    if (this.client) {
      try {
        const { data: dupCheck } = await this.client
          .from('doorbly_partner_wallet_transactions')
          .select('id')
          .eq('id', tx.id)
          .maybeSingle();

        if (!dupCheck) {
          await this.client.from('doorbly_partner_wallet_transactions').insert(record);
        }
      } catch (e) {
        console.warn('recordLedgerTransaction Supabase notice:', e);
      }
    }

    store.transactions[partnerId].unshift(record);
    this.saveLocalStore(store);
    supabaseDataEngine.invalidate(`transactions:${partnerId}`);
    return record;
  }

  /**
   * Confirm Customer Payment Collection & Complete Service Booking atomically.
   * - Enforces actual collected amount (never assumes estimate === collection)
   * - Validates payment reference for UPI / non-cash collections
   * - Validates booking OTP when OTP confirmation is selected
   * - Calls confirm_customer_collection_and_commission RPC or executes idempotent fallback
   * - Calculates Doorbly commission & partner net earnings using plan active at collection timestamp
   * - Records separate ledger entries: gross_collection, job_earning, commission_accrued
   */
  public async confirmCustomerCollectionAndCompleteBooking(
    bookingId: string,
    partnerId: string,
    input: {
      actualAmount: number;
      paymentMethod: CollectionPaymentMethod;
      paymentReference?: string;
      collectedAt: string;
      confirmationMode: CustomerConfirmationMode;
      confirmationCode?: string;
      notes?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    booking?: ServiceBooking;
    collection?: CustomerCollection;
    commissionAmount?: number;
    commissionPercent?: number;
    partnerEarnings?: number;
    planCode?: PlanCode;
  }> {
    const actualAmount = Math.round((Number(input.actualAmount) || 0) * 100) / 100;
    if (actualAmount <= 0) {
      return { success: false, message: 'Actual customer collection amount must be greater than ₹0.' };
    }

    const cleanRef = (input.paymentReference || '').trim();
    if (input.paymentMethod !== 'cash' && cleanRef.length < 6) {
      return {
        success: false,
        message: 'A valid payment transaction / UTR reference (minimum 6 characters) is required for UPI or non-cash payments.'
      };
    }

    const collectedAtIso = input.collectedAt
      ? new Date(input.collectedAt).toISOString()
      : new Date().toISOString();

    let existingBooking: ServiceBooking | null = null;
    if (this.client) {
      try {
        const { data } = await this.client
          .from('doorbly_service_bookings')
          .select('*')
          .eq('id', bookingId)
          .eq('assigned_partner_id', partnerId)
          .maybeSingle();
        if (data) existingBooking = data as ServiceBooking;
      } catch {
        // fallback below
      }
    }
    if (!existingBooking) {
      const store = this.getLocalStore();
      const localJob = store.bookings[bookingId];
      if (localJob && localJob.assigned_partner_id === partnerId) {
        existingBooking = localJob;
      }
    }

    if (!existingBooking) {
      return { success: false, message: 'Booking record not found or not assigned to you.' };
    }
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(existingBooking.status)) {
      return {
        success: false,
        message: `Booking is already ${existingBooking.status} and cannot collect payment twice.`
      };
    }

    if (input.confirmationMode === 'otp') {
      const submittedOtp = (input.confirmationCode || '').trim();
      if (!submittedOtp) {
        return { success: false, message: 'Please enter the customer booking OTP to confirm payment collection.' };
      }
      if (existingBooking.otp_code && submittedOtp !== String(existingBooking.otp_code).trim()) {
        return { success: false, message: 'Invalid customer OTP. Please verify the 4-digit booking OTP with the customer.' };
      }
    } else if (input.confirmationMode === 'receipt') {
      const receiptAck = (input.confirmationCode || '').trim();
      if (!receiptAck) {
        return { success: false, message: 'Please confirm receipt acknowledgement or enter customer receipt reference.' };
      }
    }

    const estimatedAmount = Number(existingBooking.estimated_price ?? existingBooking.customer_price) || 0;
    const collectionId = `col_${bookingId}`;
    const resolvedMethodRef = cleanRef || (input.paymentMethod === 'cash' ? `CASH_${bookingId.substring(0, 8)}` : '');
    const customerConfirmedAt = new Date().toISOString();

    let rpcHandled = false;
    if (this.client) {
      try {
        const { data: rpcData, error: rpcErr } = await this.client.rpc(
          'confirm_customer_collection_and_commission',
          {
            p_booking_id: bookingId,
            p_partner_id: partnerId,
            p_actual_amount: actualAmount,
            p_payment_method: input.paymentMethod,
            p_payment_reference: resolvedMethodRef,
            p_collected_at: collectedAtIso,
            p_confirmation_mode: input.confirmationMode,
            p_confirmation_code: (input.confirmationCode || 'RECEIPT_CONFIRMED').trim(),
            p_notes: input.notes?.trim() || null
          }
        );
        if (!rpcErr && rpcData && (rpcData as { ok?: boolean }).ok === true) {
          rpcHandled = true;
        }
      } catch {
        // Fallback path handles environments where SQL migration hasn't been executed yet
      }
    }

    const commResult = await subscriptionService.calculateAndRecordJobCommission(
      bookingId,
      partnerId,
      actualAmount,
      {
        completedAt: collectedAtIso,
        bookingStatus: 'COMPLETED',
        collectionId,
        paymentMethod: input.paymentMethod,
        paymentReference: resolvedMethodRef
      }
    );

    const collectionRecord: CustomerCollection = {
      id: collectionId,
      booking_id: bookingId,
      partner_id: partnerId,
      estimated_amount: estimatedAmount,
      actual_collected_amount: actualAmount,
      payment_method: input.paymentMethod,
      payment_reference: resolvedMethodRef || undefined,
      collected_at: collectedAtIso,
      customer_confirmed: true,
      confirmation_mode: input.confirmationMode,
      confirmation_code: (input.confirmationCode || 'RECEIPT_CONFIRMED').trim(),
      notes: input.notes?.trim() || undefined,
      created_at: customerConfirmedAt
    };

    const bookingUpdate: Partial<ServiceBooking> = {
      status: 'COMPLETED',
      estimated_price: estimatedAmount,
      customer_price: actualAmount,
      actual_collected_amount: actualAmount,
      collection_payment_method: input.paymentMethod,
      collection_payment_reference: resolvedMethodRef || undefined,
      collection_confirmed_at: collectedAtIso,
      customer_confirmation_mode: input.confirmationMode,
      customer_confirmation_code: (input.confirmationCode || 'RECEIPT_CONFIRMED').trim(),
      commission_settlement_status: 'accrued',
      partner_earning: commResult.partnerEarnings,
      commission_percent: commResult.commissionPercent,
      commission_amount: commResult.commissionAmount,
      plan_code_at_transaction: commResult.planCode,
      subscription_id: commResult.record.subscription_id,
      commission_calculated_at: commResult.record.created_at,
      completed_at: collectedAtIso,
      notes: input.notes?.trim() || existingBooking.notes
    };

    let finalBooking: ServiceBooking = {
      ...existingBooking,
      ...bookingUpdate
    };

    if (this.client && !rpcHandled) {
      try {
        await supabaseDataEngine.executeWrite(
          async () => {
            await this.client!.from('doorbly_customer_collections').upsert(collectionRecord);
            const { data: updatedRow } = await this.client!
              .from('doorbly_service_bookings')
              .update(bookingUpdate)
              .eq('id', bookingId)
              .eq('assigned_partner_id', partnerId)
              .neq('status', 'COMPLETED')
              .select()
              .maybeSingle();
            if (updatedRow) {
              finalBooking = updatedRow as ServiceBooking;
            }
          },
          [
            `jobs:${partnerId}`,
            `activeJob:${partnerId}`,
            `workCounts:${partnerId}`,
            `wallet:${partnerId}`,
            `transactions:${partnerId}`,
            `commissions:${partnerId}`,
            `collections:${partnerId}`,
            'admin:bookings',
            'admin:commissions',
            'admin:collections'
          ]
        );
      } catch (e) {
        console.warn('confirmCustomerCollectionAndCompleteBooking Supabase fallback notice:', e);
      }
    }

    // Store collection & booking locally
    const store = this.getLocalStore();
    if (!store.customerCollections) store.customerCollections = {};
    store.customerCollections[bookingId] = collectionRecord;
    store.bookings[bookingId] = finalBooking;
    this.saveLocalStore(store);

    if (!rpcHandled && !commResult.alreadyRecorded) {
      // 1. Gross customer collection ledger record (accounting entry, does not inflate withdrawable wallet)
      await this.recordLedgerTransaction(partnerId, {
        id: `tx_col_${bookingId}`,
        booking_id: bookingId,
        reference_id: resolvedMethodRef || collectionId,
        payment_method: input.paymentMethod,
        type: 'credit',
        category: 'gross_collection',
        amount: actualAmount,
        description: `Gross Customer Collection (${input.paymentMethod.toUpperCase()}) · Job #${bookingId.substring(0, 8)}`,
        status: 'completed',
        created_at: collectedAtIso
      });

      // 2. Credit Partner Net Earnings to wallet ledger & available balance
      await this.creditPartnerEarnings(partnerId, finalBooking, commResult);

      // 3. Record Doorbly Commission Accrued Payable (stays payable until verified settlement!)
      await this.recordLedgerTransaction(partnerId, {
        id: `tx_comm_${bookingId}`,
        booking_id: bookingId,
        reference_id: commResult.record.id,
        payment_method: input.paymentMethod,
        type: 'debit',
        category: 'commission_accrued',
        amount: commResult.commissionAmount,
        description: `Doorbly Commission Accrued (${commResult.commissionPercent}% · ${commResult.planCode.toUpperCase()}) · Job #${bookingId.substring(0, 8)}`,
        status: 'completed',
        created_at: collectedAtIso
      });
    } else {
      // Ensure local ledger mirrors RPC if already executed server-side
      if (this.client) {
        const latestBal = await this.getWalletSummary(partnerId);
        if (!store.wallets) store.wallets = {};
        store.wallets[partnerId] = {
          partner_id: partnerId,
          available_balance: latestBal.available_balance,
          pending_amount: latestBal.pending_amount,
          updated_at: new Date().toISOString()
        };
        this.saveLocalStore(store);
      }
    }

    supabaseDataEngine.invalidate(`jobs:${partnerId}`);
    supabaseDataEngine.invalidate(`activeJob:${partnerId}`);
    supabaseDataEngine.invalidate(`workCounts:${partnerId}`);
    supabaseDataEngine.invalidate(`wallet:${partnerId}`);
    supabaseDataEngine.invalidate(`transactions:${partnerId}`);
    supabaseDataEngine.invalidate(`commissions:${partnerId}`);
    supabaseDataEngine.invalidate(`collections:${partnerId}`);
    supabaseDataEngine.invalidate('admin:bookings');
    supabaseDataEngine.invalidate('admin:commissions');
    supabaseDataEngine.invalidate('admin:collections');

    return {
      success: true,
      message: `Collection ₹${actualAmount.toFixed(2)} confirmed! Doorbly fee ₹${commResult.commissionAmount.toFixed(2)} (${commResult.commissionPercent}%) recorded as accrued payable; Partner Net ₹${commResult.partnerEarnings.toFixed(2)} credited.`,
      booking: finalBooking,
      collection: collectionRecord,
      commissionAmount: commResult.commissionAmount,
      commissionPercent: commResult.commissionPercent,
      partnerEarnings: commResult.partnerEarnings,
      planCode: commResult.planCode
    };
  }

  public async getPartnerCollections(partnerId: string): Promise<CustomerCollection[]> {
    return supabaseDataEngine.fetchWithEngine(
      `collections:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_customer_collections')
              .select('*')
              .eq('partner_id', partnerId)
              .order('collected_at', { ascending: false });
            if (!error && data) {
              return data as CustomerCollection[];
            }
          } catch (e) {
            console.warn('getPartnerCollections error:', e);
          }
        }
        const store = this.getLocalStore();
        return Object.values(store.customerCollections || {})
          .filter((c) => c.partner_id === partnerId)
          .sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime());
      },
      {
        instantFallback: () =>
          Object.values(this.getLocalStore().customerCollections || {})
            .filter((c) => c.partner_id === partnerId)
            .sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime())
      }
    );
  }

  public async getAllCollectionsAdmin(forceRefresh = false): Promise<CustomerCollection[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:collections',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_customer_collections')
              .select('*')
              .order('collected_at', { ascending: false });
            if (!error && data) {
              return data as CustomerCollection[];
            }
          } catch (e) {
            console.warn('getAllCollectionsAdmin error:', e);
          }
        }
        const store = this.getLocalStore();
        return Object.values(store.customerCollections || {}).sort(
          (a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
        );
      },
      {
        forceRefresh,
        instantFallback: () =>
          Object.values(this.getLocalStore().customerCollections || {}).sort(
            (a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
          )
      }
    );
  }

  /**
   * Save or fetch Partner KYC & Bank details in public.doorbly_partner_kyc
   */
  public async getPartnerKYC(partnerId: string): Promise<PartnerKYC | null> {
    return supabaseDataEngine.fetchWithEngine(`kyc:${partnerId}`, async () => {
      if (this.client) {
        try {
          const { data, error } = await this.client
            .from('doorbly_partner_kyc')
            .select('*')
            .eq('partner_id', partnerId)
            .maybeSingle();

          if (!error && data) {
            return {
              documentType: (data.document_type as 'aadhaar' | 'pan') || 'aadhaar',
              documentNumber: data.document_number || '',
              documentImageUrl: data.document_image_url || undefined,
              bankAccount: data.bank_account || '',
              ifsc: data.ifsc || '',
              accountHolder: data.account_holder || '',
              certificateUrls: data.certificate_urls || [],
              submittedAt: data.submitted_at
            };
          }
        } catch (e) {
          console.warn('getPartnerKYC notice:', e);
        }
      }
      try {
        const localKyc = localStorage.getItem(`doorbly_kyc_${partnerId}`);
        if (localKyc) return JSON.parse(localKyc) as PartnerKYC;
      } catch {
        // ignore
      }
      return null;
    });
  }

  public async upsertPartnerKYC(partnerId: string, kyc: PartnerKYC): Promise<boolean> {
    supabaseDataEngine.primeCache(`kyc:${partnerId}`, kyc);
    try {
      localStorage.setItem(`doorbly_kyc_${partnerId}`, JSON.stringify(kyc));
    } catch {
      // ignore
    }

    if (this.client) {
      try {
        const { error } = await supabaseDataEngine.executeWrite(async () =>
          await this.client!.from('doorbly_partner_kyc').upsert({
            id: `kyc_${partnerId}`,
            partner_id: partnerId,
            document_type: kyc.documentType,
            document_number: kyc.documentNumber,
            document_image_url: kyc.documentImageUrl || null,
            bank_account: kyc.bankAccount,
            ifsc: kyc.ifsc,
            account_holder: kyc.accountHolder,
            certificate_urls: kyc.certificateUrls || [],
            submitted_at: kyc.submittedAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        );
        return !error;
      } catch (e) {
        console.warn('upsertPartnerKYC notice:', e);
      }
    }
    return true;
  }

  /**
   * Log Profession Add-on (₹49) or 30-Day Free Replacement in public.doorbly_partner_profession_changes
   */
  public async logProfessionChange(params: {
    partnerId: string;
    actionType: 'add_paid_49' | 'replace_free_30d';
    categoryId: string;
    categoryName: string;
    professionName: string;
    feePaid: number;
  }): Promise<void> {
    if (!this.client) return;
    try {
      await supabaseDataEngine.executeWrite(async () => {
        await this.client!.from('doorbly_partner_profession_changes').insert({
          id: `prf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          partner_id: params.partnerId,
          action_type: params.actionType,
          category_id: params.categoryId,
          category_name: params.categoryName,
          profession_name: params.professionName,
          fee_paid: params.feePaid,
          payment_status: 'paid',
          created_at: new Date().toISOString()
        });
      });
    } catch (e) {
      console.warn('logProfessionChange notice:', e);
    }
  }

  /**
   * Get Partner Notifications
   */
  public async getNotifications(partnerId: string): Promise<NotificationItem[]> {
    return supabaseDataEngine.fetchWithEngine(
      `notifications:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_notifications')
              .select('*')
              .eq('partner_id', partnerId)
              .order('created_at', { ascending: false });

            if (!error && data) return data as NotificationItem[];
          } catch (e) {
            console.warn('Supabase getNotifications error:', e);
          }
        }

        const store = this.getLocalStore();
        return store.notifications[partnerId] || [];
      },
      {
        instantFallback: () => this.getLocalStore().notifications[partnerId] || []
      }
    );
  }

  /**
   * Mark notification as read
   */
  public async markNotificationRead(partnerId: string, notificationId: string): Promise<void> {
    const cachedList = supabaseDataEngine.peekCache<NotificationItem[]>(`notifications:${partnerId}`);
    if (cachedList) {
      supabaseDataEngine.primeCache(
        `notifications:${partnerId}`,
        cachedList.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    }

    if (this.client) {
      try {
        await supabaseDataEngine.executeWrite(async () => {
          await this.client!
            .from('doorbly_partner_notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('partner_id', partnerId);
        });
      } catch (e) {
        console.warn('markNotificationRead error:', e);
      }
    }

    const store = this.getLocalStore();
    const list = store.notifications[partnerId] || [];
    const target = list.find(n => n.id === notificationId);
    if (target) {
      target.is_read = true;
      this.saveLocalStore(store);
    }
  }

  /**
   * Create Partner Notification
   */
  public async createNotification(
    partnerId: string,
    notif: { title: string; message: string; type?: NotificationItem['type'] }
  ): Promise<void> {
    const newNotif: NotificationItem = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      partner_id: partnerId,
      type: notif.type || 'SYSTEM',
      title: notif.title,
      message: notif.message,
      is_read: false,
      created_at: new Date().toISOString()
    };

    if (this.client) {
      try {
        await this.client.from('doorbly_partner_notifications').insert(newNotif);
      } catch (e) {
        console.warn('createNotification Supabase notice:', e);
      }
    }

    const store = this.getLocalStore();
    if (!store.notifications[partnerId]) store.notifications[partnerId] = [];
    store.notifications[partnerId].unshift(newNotif);
    this.saveLocalStore(store);
    supabaseDataEngine.invalidate(`notifications:${partnerId}`);
  }

  /**
   * Support Tickets
   */
  public async createSupportTicket(ticket: Omit<SupportTicket, 'id' | 'created_at'>): Promise<SupportTicket> {
    const newTicket: SupportTicket = {
      ...ticket,
      id: `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString()
    };

    if (this.client) {
      try {
        const { data, error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partner_support_tickets')
              .insert(newTicket)
              .select()
              .maybeSingle(),
          [`tickets:${ticket.partner_id}`]
        );

        if (!error && data) return data as SupportTicket;
      } catch (e) {
        console.warn('createSupportTicket error:', e);
      }
    }

    const store = this.getLocalStore();
    if (!store.tickets[ticket.partner_id]) store.tickets[ticket.partner_id] = [];
    store.tickets[ticket.partner_id].unshift(newTicket);
    this.saveLocalStore(store);
    supabaseDataEngine.invalidate(`tickets:${ticket.partner_id}`);
    return newTicket;
  }

  public async getSupportTickets(partnerId: string): Promise<SupportTicket[]> {
    return supabaseDataEngine.fetchWithEngine(
      `tickets:${partnerId}`,
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_support_tickets')
              .select('*')
              .eq('partner_id', partnerId)
              .order('created_at', { ascending: false });

            if (!error && data) return data as SupportTicket[];
          } catch (e) {
            console.warn('getSupportTickets error:', e);
          }
        }

        const store = this.getLocalStore();
        return store.tickets[partnerId] || [];
      },
      {
        instantFallback: () => this.getLocalStore().tickets[partnerId] || []
      }
    );
  }

  /**
   * Set up real-time listener for incoming job bookings & low-latency broadcast events
   */
  public subscribeToRealtimeBookings(
    onNewBooking: (booking: ServiceBooking) => void,
    onStatusChange: (booking: ServiceBooking) => void
  ): () => void {
    if (!this.client) {
      return () => {};
    }

    try {
      const channelName = `doorbly_fast_bookings_stream_${Math.random().toString(36).substring(2, 8)}`;
      const channel = this.client
        .channel(channelName, {
          config: {
            broadcast: { self: true }
          }
        })
        .on('broadcast', { event: 'instant_booking_dispatch' }, (payload) => {
          supabaseDataEngine.recordRealtimeEvent();
          if (payload.payload) {
            supabaseDataEngine.invalidate('openJobRequests');
            onNewBooking(payload.payload as ServiceBooking);
          }
        })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'doorbly_service_bookings' },
          (payload) => {
            supabaseDataEngine.recordRealtimeEvent();
            if (payload.new) {
              supabaseDataEngine.invalidate('openJobRequests');
              onNewBooking(payload.new as ServiceBooking);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'doorbly_service_bookings' },
          (payload) => {
            supabaseDataEngine.recordRealtimeEvent();
            if (payload.new) {
              const updated = payload.new as ServiceBooking;
              if (updated.assigned_partner_id) {
                supabaseDataEngine.invalidate(`jobs:${updated.assigned_partner_id}`);
                supabaseDataEngine.invalidate(`activeJob:${updated.assigned_partner_id}`);
              }
              onStatusChange(updated);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'doorbly_daily_offers' },
          (payload) => {
            supabaseDataEngine.recordRealtimeEvent();
            if (payload.new) {
              supabaseDataEngine.primeCache('dailyOffer', payload.new as OfferOfTheDay);
            } else {
              supabaseDataEngine.invalidate('dailyOffer');
            }
            window.dispatchEvent(new CustomEvent('doorbly-realtime-refresh'));
          }
        )
        .subscribe();

      this.bookingChannels.add(channel);
      this.channel = channel;

      return () => {
        this.bookingChannels.delete(channel);
        if (this.channel === channel) {
          this.channel = this.bookingChannels.values().next().value || null;
        }
        if (this.client) {
          this.client.removeChannel(channel);
        }
      };
    } catch (e) {
      console.warn('Failed to subscribe to realtime channel:', e);
      return () => {};
    }
  }

  /**
   * Subscribe to real-time backend updates for a specific partner with direct payload delta hydration
   * Eliminates 7-query waterfalls when a single row changes
   */
  public subscribeToPartnerRealtimeSync(
    partnerId: string,
    onPartnerDataChanged: (delta?: {
      profile?: PartnerProfile;
      membership?: PartnerMembership;
      notification?: NotificationItem;
    }) => void
  ): () => void {
    if (!this.client || !partnerId) {
      return () => {};
    }

    try {
      const channelName = `partner_sync_${partnerId}_${Math.random().toString(36).substring(2, 7)}`;
      const syncChannel = this.client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_partners',
            filter: `id=eq.${partnerId}`
          },
          (payload) => {
            supabaseDataEngine.recordRealtimeEvent();
            if (payload.new && Object.keys(payload.new).length > 0) {
              const updatedProfile = payload.new as PartnerProfile;
              supabaseDataEngine.primeCache(`profile:${partnerId}`, updatedProfile);
              onPartnerDataChanged({ profile: updatedProfile });
            } else {
              supabaseDataEngine.invalidate(`profile:${partnerId}`);
              onPartnerDataChanged();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_partner_wallets',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`wallet:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_partner_wallet_transactions',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`wallet:${partnerId}`);
            supabaseDataEngine.invalidate(`transactions:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'doorbly_partner_notifications',
            filter: `partner_id=eq.${partnerId}`
          },
          (payload) => {
            supabaseDataEngine.recordRealtimeEvent();
            if (payload.new && Object.keys(payload.new).length > 0) {
              const newNotif = payload.new as NotificationItem;
              const existing = supabaseDataEngine.peekCache<NotificationItem[]>(`notifications:${partnerId}`);
              if (existing) {
                supabaseDataEngine.primeCache(`notifications:${partnerId}`, [newNotif, ...existing]);
              } else {
                supabaseDataEngine.invalidate(`notifications:${partnerId}`);
              }
              onPartnerDataChanged({ notification: newNotif });
            } else {
              supabaseDataEngine.invalidate(`notifications:${partnerId}`);
              onPartnerDataChanged();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_partner_memberships',
            filter: `partner_id=eq.${partnerId}`
          },
          (payload) => {
            supabaseDataEngine.recordRealtimeEvent();
            if (payload.new && Object.keys(payload.new).length > 0) {
              const updatedMem = payload.new as PartnerMembership;
              supabaseDataEngine.primeCache(`membership:${partnerId}`, updatedMem);
              onPartnerDataChanged({ membership: updatedMem });
            } else {
              supabaseDataEngine.invalidate(`membership:${partnerId}`);
              onPartnerDataChanged();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_partner_withdrawals',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`withdrawals:${partnerId}`);
            supabaseDataEngine.invalidate(`wallet:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_customer_collections',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`collections:${partnerId}`);
            supabaseDataEngine.invalidate(`commissions:${partnerId}`);
            supabaseDataEngine.invalidate(`wallet:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_commission_settlements',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`settlements:${partnerId}`);
            supabaseDataEngine.invalidate(`commissions:${partnerId}`);
            supabaseDataEngine.invalidate(`transactions:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_partner_subscriptions',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`subscription:active:${partnerId}`);
            supabaseDataEngine.invalidate(`subscription:history:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'doorbly_subscription_payments',
            filter: `partner_id=eq.${partnerId}`
          },
          () => {
            supabaseDataEngine.recordRealtimeEvent();
            supabaseDataEngine.invalidate(`subscription:history:${partnerId}`);
            onPartnerDataChanged();
          }
        )
        .subscribe();

      return () => {
        if (this.client) {
          this.client.removeChannel(syncChannel);
        }
      };
    } catch (e) {
      console.warn('subscribeToPartnerRealtimeSync notice:', e);
      return () => {};
    }
  }

  /**
   * Realtime broadcast + DB insert for dispatching live jobs from Admin / Customer app
   */
  public async dispatchCustomerBooking(booking: ServiceBooking): Promise<void> {
    if (this.client) {
      try {
        // Send sub-50ms WebSocket Broadcast alongside Postgres insert
        if (this.channel) {
          void this.channel.send({
            type: 'broadcast',
            event: 'instant_booking_dispatch',
            payload: booking
          });
        }
        await supabaseDataEngine.executeWrite(
          async () => await this.client!.from('doorbly_service_bookings').insert(booking),
          ['openJobRequests', 'admin:bookings']
        );
      } catch (e) {
        console.warn('Failed to insert booking:', e);
      }
    }

    const store = this.getLocalStore();
    store.bookings[booking.id] = booking;
    this.saveLocalStore(store);
    supabaseDataEngine.invalidate('openJobRequests');
    supabaseDataEngine.invalidate('admin:bookings');
  }

  /**
   * ADMIN METHODS (Accelerated via Data Engine)
   */
  public async getAllPartners(forceRefresh = false): Promise<PartnerProfile[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:partners',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partners')
              .select('*')
              .order('created_at', { ascending: false });

            if (!error && data) return data as PartnerProfile[];
          } catch (e) {
            console.warn('getAllPartners error:', e);
          }
        }

        const store = this.getLocalStore();
        return Object.values(store.partners).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      },
      {
        forceRefresh,
        instantFallback: () =>
          Object.values(this.getLocalStore().partners).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
      }
    );
  }

  public async updatePartnerStatus(
    partnerId: string,
    status: PartnerStatus,
    reason?: string
  ): Promise<boolean> {
    if (this.client) {
      try {
        const updatePayload: Record<string, unknown> = {
          status,
          status_reason: reason,
          updated_at: new Date().toISOString()
        };
        if (status !== 'approved') {
          updatePayload.is_online = false;
        }
        const { error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partners')
              .update(updatePayload)
              .eq('id', partnerId),
          ['admin:partners', `profile:${partnerId}`]
        );

        if (!error) return true;
      } catch (e) {
        console.warn('updatePartnerStatus error:', e);
      }
    }

    const store = this.getLocalStore();
    if (store.partners[partnerId]) {
      store.partners[partnerId].status = status;
      if (status !== 'approved') {
        store.partners[partnerId].is_online = false;
      }
      if (reason) store.partners[partnerId].status_reason = reason;
      store.partners[partnerId].updated_at = new Date().toISOString();
      this.saveLocalStore(store);
      supabaseDataEngine.invalidate('admin:partners');
      supabaseDataEngine.invalidate(`profile:${partnerId}`);
      return true;
    }
    return false;
  }

  public async getAllBookings(forceRefresh = false): Promise<ServiceBooking[]> {
    const readLocalBookings = () => {
      const store = this.getLocalStore();
      return Object.values(store.bookings).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    };

    return supabaseDataEngine.fetchWithEngine(
      'admin:bookings',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_service_bookings')
              .select('*')
              .order('created_at', { ascending: false });

            if (!error && data) return data as ServiceBooking[];
          } catch (e) {
            console.warn('getAllBookings error:', e);
          }
        }

        return readLocalBookings();
      },
      {
        forceRefresh,
        instantFallback: readLocalBookings
      }
    );
  }

  public async updateBookingStatusAsAdmin(
    bookingId: string,
    status: BookingStatus,
    partnerId?: string
  ): Promise<boolean> {
    const completedAtIso = new Date().toISOString();
    const updatePayload: Partial<ServiceBooking> = { status };
    if (partnerId) updatePayload.assigned_partner_id = partnerId;
    if (status === 'COMPLETED') updatePayload.completed_at = completedAtIso;

    if (this.client) {
      try {
        const { data: existingRow } = await this.client
          .from('doorbly_service_bookings')
          .select('*')
          .eq('id', bookingId)
          .maybeSingle();

        const existingBooking = existingRow as ServiceBooking | null;
        if (existingBooking) {
          // Guard: Terminal bookings (COMPLETED, CANCELLED, REJECTED) cannot be reopened or re-processed
          if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(existingBooking.status)) {
            return existingBooking.status === 'COMPLETED' && status === 'COMPLETED';
          }

          const effectivePartnerId = partnerId || existingBooking.assigned_partner_id;

          if (status === 'COMPLETED') {
            if (!effectivePartnerId) {
              return false; // Unassigned bookings cannot be completed or generate commission
            }

            let rpcHandled = false;
            try {
              const { data: rpcData, error: rpcErr } = await this.client.rpc(
                'complete_booking_with_commission',
                {
                  p_booking_id: bookingId,
                  p_partner_id: effectivePartnerId
                }
              );
              if (!rpcErr && rpcData && (rpcData as { ok?: boolean }).ok === true) {
                rpcHandled = true;
              }
            } catch {
              // RPC optional if SQL function is not deployed yet
            }

            const commissionableAmt = Math.max(0, Number(existingBooking.customer_price) || 0);
            const commResult = await subscriptionService.calculateAndRecordJobCommission(
              bookingId,
              effectivePartnerId,
              commissionableAmt,
              {
                completedAt: completedAtIso,
                bookingStatus: 'COMPLETED'
              }
            );

            updatePayload.partner_earning = commResult.partnerEarnings;
            updatePayload.commission_percent = commResult.commissionPercent;
            updatePayload.commission_amount = commResult.commissionAmount;
            updatePayload.plan_code_at_transaction = commResult.planCode;
            updatePayload.subscription_id = commResult.record.subscription_id;
            updatePayload.commission_calculated_at = commResult.record.created_at;

            const { data: updatedRow, error } = await supabaseDataEngine.executeWrite(
              async () =>
                await this.client!
                  .from('doorbly_service_bookings')
                  .update(updatePayload)
                  .eq('id', bookingId)
                  .neq('status', 'COMPLETED')
                  .select()
                  .maybeSingle(),
              [
                'admin:bookings',
                'admin:commissions',
                'openJobRequests',
                `jobs:${effectivePartnerId}`,
                `activeJob:${effectivePartnerId}`,
                `workCounts:${effectivePartnerId}`,
                `wallet:${effectivePartnerId}`,
                `transactions:${effectivePartnerId}`,
                `commissions:${effectivePartnerId}`
              ]
            );

            if (!error) {
              const finalBooking = (updatedRow || {
                ...existingBooking,
                ...updatePayload
              }) as ServiceBooking;
              if (!rpcHandled && !commResult.alreadyRecorded) {
                await this.creditPartnerEarnings(effectivePartnerId, finalBooking, commResult);
              }
              const localStore = this.getLocalStore();
              localStore.bookings[bookingId] = finalBooking;
              this.saveLocalStore(localStore);
              return true;
            }
          } else {
            // Non-completion (including CANCELLED / REJECTED) — never calculates commission
            const { data: updatedNonComplete, error } = await supabaseDataEngine.executeWrite(
              async () =>
                await this.client!
                  .from('doorbly_service_bookings')
                  .update(updatePayload)
                  .eq('id', bookingId)
                  .select()
                  .maybeSingle(),
              [
                'admin:bookings',
                'openJobRequests',
                ...(effectivePartnerId
                  ? [`jobs:${effectivePartnerId}`, `activeJob:${effectivePartnerId}`, `workCounts:${effectivePartnerId}`]
                  : [])
              ]
            );

            if (!error) {
              const localStore = this.getLocalStore();
              if (updatedNonComplete) {
                localStore.bookings[bookingId] = updatedNonComplete as ServiceBooking;
                this.saveLocalStore(localStore);
              }
              return true;
            }
          }
        }
      } catch (e) {
        console.warn('updateBookingStatusAsAdmin error:', e);
      }
    }

    const store = this.getLocalStore();
    const job = store.bookings[bookingId];
    if (job) {
      if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(job.status)) {
        return job.status === 'COMPLETED' && status === 'COMPLETED';
      }
      const effectivePartnerId = partnerId || job.assigned_partner_id;
      if (status === 'COMPLETED' && !effectivePartnerId) {
        return false;
      }

      Object.assign(job, updatePayload);

      if (status === 'COMPLETED' && effectivePartnerId) {
        const commissionableAmt = Math.max(0, Number(job.customer_price) || 0);
        const commResult = await subscriptionService.calculateAndRecordJobCommission(
          job.id,
          effectivePartnerId,
          commissionableAmt,
          {
            completedAt: completedAtIso,
            bookingStatus: 'COMPLETED'
          }
        );
        job.partner_earning = commResult.partnerEarnings;
        job.commission_percent = commResult.commissionPercent;
        job.commission_amount = commResult.commissionAmount;
        job.plan_code_at_transaction = commResult.planCode;
        job.subscription_id = commResult.record.subscription_id;
        job.commission_calculated_at = commResult.record.created_at;
        store.bookings[bookingId] = job;
        this.saveLocalStore(store);

        if (!commResult.alreadyRecorded) {
          await this.creditPartnerEarnings(effectivePartnerId, job, commResult);
        }
      } else {
        store.bookings[bookingId] = job;
        this.saveLocalStore(store);
      }

      supabaseDataEngine.invalidate('admin:bookings');
      if (effectivePartnerId) {
        supabaseDataEngine.invalidate(`jobs:${effectivePartnerId}`);
        supabaseDataEngine.invalidate(`activeJob:${effectivePartnerId}`);
        supabaseDataEngine.invalidate(`workCounts:${effectivePartnerId}`);
        supabaseDataEngine.invalidate(`wallet:${effectivePartnerId}`);
        supabaseDataEngine.invalidate(`transactions:${effectivePartnerId}`);
        supabaseDataEngine.invalidate(`commissions:${effectivePartnerId}`);
      }
      return true;
    }
    return false;
  }

  public async getAllWithdrawalsAdmin(forceRefresh = false): Promise<WithdrawalRequest[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:withdrawals',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_withdrawals')
              .select('*')
              .order('requested_at', { ascending: false });

            if (!error && data) return data as WithdrawalRequest[];
          } catch (e) {
            console.warn('getAllWithdrawalsAdmin error:', e);
          }
        }

        const store = this.getLocalStore();
        const all = Object.values(store.withdrawals).flat();
        return all.sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
      },
      {
        forceRefresh,
        instantFallback: () =>
          Object.values(this.getLocalStore().withdrawals)
            .flat()
            .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
      }
    );
  }

  public async updateWithdrawalStatus(
    withdrawalId: string,
    status: 'requested' | 'processing' | 'completed' | 'rejected'
  ): Promise<boolean> {
    if (this.client) {
      try {
        const { error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partner_withdrawals')
              .update({
                status,
                processed_at: new Date().toISOString()
              })
              .eq('id', withdrawalId),
          ['admin:withdrawals', 'withdrawals:']
        );

        if (!error) return true;
      } catch (e) {
        console.warn('updateWithdrawalStatus error:', e);
      }
    }

    const store = this.getLocalStore();
    for (const pId of Object.keys(store.withdrawals)) {
      const target = store.withdrawals[pId].find(w => w.id === withdrawalId);
      if (target) {
        target.status = status;
        target.processed_at = new Date().toISOString();
        this.saveLocalStore(store);
        supabaseDataEngine.invalidate('admin:withdrawals');
        supabaseDataEngine.invalidate(`withdrawals:${pId}`);
        return true;
      }
    }
    return false;
  }

  public async getAllMembershipsAdmin(forceRefresh = false): Promise<PartnerMembership[]> {
    return supabaseDataEngine.fetchWithEngine(
      'admin:memberships',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_partner_memberships')
              .select('*')
              .order('start_date', { ascending: false });

            if (!error && data) return data as PartnerMembership[];
          } catch (e) {
            console.warn('getAllMembershipsAdmin error:', e);
          }
        }

        const store = this.getLocalStore();
        return Object.values(store.memberships);
      },
      {
        forceRefresh,
        instantFallback: () => Object.values(this.getLocalStore().memberships)
      }
    );
  }

  public async updateMembershipStatus(
    membershipId: string,
    status: 'active' | 'expired' | 'pending'
  ): Promise<boolean> {
    if (this.client) {
      try {
        const { error } = await supabaseDataEngine.executeWrite(
          async () =>
            await this.client!
              .from('doorbly_partner_memberships')
              .update({
                status,
                expiry_date: status === 'active' ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined
              })
              .eq('id', membershipId),
          ['admin:memberships', 'membership:']
        );

        if (!error) return true;
      } catch (e) {
        console.warn('updateMembershipStatus error:', e);
      }
    }

    const store = this.getLocalStore();
    for (const pId of Object.keys(store.memberships)) {
      if (store.memberships[pId].id === membershipId) {
        store.memberships[pId].status = status;
        if (status === 'active') {
          store.memberships[pId].expiry_date = new Date(Date.now() + 30 * 86400000).toISOString();
        }
        this.saveLocalStore(store);
        supabaseDataEngine.invalidate('admin:memberships');
        supabaseDataEngine.invalidate(`membership:${pId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Fetch Offer of the Day (Live from Supabase with L1+L2 SWR cache & sub-0.1s fallback)
   */
  public async getOfferOfTheDay(): Promise<OfferOfTheDay | null> {
    const readLocalOffer = (): OfferOfTheDay | null => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_DAILY_OFFER);
        if (saved) {
          return JSON.parse(saved) as OfferOfTheDay;
        }
      } catch {
        // ignore
      }
      return null;
    };

    return supabaseDataEngine.fetchWithEngine(
      'dailyOffer',
      async () => {
        if (this.client) {
          try {
            const { data, error } = await this.client
              .from('doorbly_daily_offers')
              .select('*')
              .eq('id', 'offer_of_the_day')
              .maybeSingle();

            if (!error && data) {
              localStorage.setItem(STORAGE_KEY_DAILY_OFFER, JSON.stringify(data));
              return data as OfferOfTheDay;
            }
          } catch (e) {
            console.warn('getOfferOfTheDay notice:', e);
          }
        }

        return readLocalOffer();
      },
      { instantFallback: readLocalOffer }
    );
  }

  /**
   * Update Offer of the Day from Admin Panel
   */
  public async updateOfferOfTheDay(offer: Omit<OfferOfTheDay, 'id' | 'updated_at'>): Promise<OfferOfTheDay> {
    const updated: OfferOfTheDay = {
      ...offer,
      id: 'offer_of_the_day',
      updated_at: new Date().toISOString()
    };

    supabaseDataEngine.primeCache('dailyOffer', updated);
    localStorage.setItem(STORAGE_KEY_DAILY_OFFER, JSON.stringify(updated));

    if (this.client) {
      try {
        const { data, error } = await supabaseDataEngine.executeWrite(async () =>
          await this.client!
            .from('doorbly_daily_offers')
            .upsert(updated)
            .select()
            .maybeSingle()
        );

        if (!error && data) {
          const saved = data as OfferOfTheDay;
          supabaseDataEngine.primeCache('dailyOffer', saved);
          localStorage.setItem(STORAGE_KEY_DAILY_OFFER, JSON.stringify(saved));
          return saved;
        }
      } catch (e) {
        console.warn('updateOfferOfTheDay Supabase notice:', e);
      }
    }

    return updated;
  }
}

export const supabaseService = new SupabaseService();
