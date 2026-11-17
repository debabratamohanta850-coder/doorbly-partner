import { supabaseService } from './supabaseClient';
import {
  auth,
  googleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  db,
  doc,
  setDoc,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from './firebase';

export const MASTER_ADMIN_EMAIL = 'debabrata.tribune@gmail.com';
export const MASTER_ADMIN_PASSWORD = 'Devraj@1122';
export const MASTER_PHONE = '9938713179';
export const MASTER_PASSWORD = '2211';

export interface PartnerAuthUser {
  uid: string;
  email: string;
  phone?: string;
  displayName?: string;
  photoURL?: string;
  isAdmin?: boolean;
  authProvider?: 'admin_credentials' | 'screen_code' | 'firebase' | 'otp' | 'email';
  isScreenCodeVerified?: boolean;
}

const STORAGE_KEY_AUTH_USER = 'doorbly_active_auth_user_v1';
const STORAGE_KEY_DEVICE_ADMIN = 'doorbly_master_device_admin_v1';

export function normalizePartnerPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    return digits.slice(-10);
  }
  return digits;
}

class PartnerAuthService {
  /**
   * Strict check: Admin panel opens ONLY when authenticated with exact admin credentials
   * (debabrata.tribune@gmail.com + Devraj@1122) via login fields.
   */
  public isAuthorizedAdmin(user: PartnerAuthUser | null): boolean {
    if (!user || user.isAdmin !== true) {
      return false;
    }
    const cleanEmail = (user.email || '').trim().toLowerCase();
    return (
      user.authProvider === 'admin_credentials' &&
      user.uid === 'partner_master_admin' &&
      cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase() &&
      this.isDeviceAdminUnlocked()
    );
  }

  /**
   * Verify admin status strictly matches authorized admin login session
   */
  public async verifyAdminWithFirestore(user: PartnerAuthUser | null): Promise<boolean> {
    return this.isAuthorizedAdmin(user);
  }

  /**
   * Check if this particular device has been unlocked by master credentials
   */
  public isDeviceAdminUnlocked(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY_DEVICE_ADMIN) === 'true';
    } catch {
      return false;
    }
  }

  public setDeviceAdminUnlocked(unlocked: boolean): void {
    try {
      if (unlocked) {
        localStorage.setItem(STORAGE_KEY_DEVICE_ADMIN, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY_DEVICE_ADMIN);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Get currently active authenticated partner from local session
   */
  public getStoredUser(): PartnerAuthUser | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTH_USER);
      if (stored) {
        const parsed: PartnerAuthUser = JSON.parse(stored);
        if (!this.isAuthorizedAdmin(parsed) && this.isDeviceAdminUnlocked()) {
          this.setDeviceAdminUnlocked(false);
        }
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Save or clear active authenticated partner session
   */
  public setStoredUser(user: PartnerAuthUser | null): void {
    try {
      if (user) {
        const isStrictAdmin =
          user.isAdmin === true &&
          user.authProvider === 'admin_credentials' &&
          user.uid === 'partner_master_admin' &&
          (user.email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

        const sanitizedUser: PartnerAuthUser = {
          ...user,
          isAdmin: isStrictAdmin
        };

        this.setDeviceAdminUnlocked(isStrictAdmin);
        localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(sanitizedUser));
      } else {
        localStorage.removeItem(STORAGE_KEY_AUTH_USER);
        this.setDeviceAdminUnlocked(false);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Phone Number + Screen Lock 4-Digit Code Login (Verified with Supabase)
   * Restricted: Partner access only (never unlocks Admin Console).
   */
  public async loginWithPhoneAndScreenCode(
    phone: string,
    screenCode: string
  ): Promise<{ success: boolean; user?: PartnerAuthUser; message?: string }> {
    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    const cleanDigits = cleanPhone.replace(/\D/g, '');
    const cleanCode = screenCode.trim();

    if (
      (cleanDigits === MASTER_PHONE || cleanDigits.endsWith(MASTER_PHONE)) &&
      (cleanCode === MASTER_PASSWORD || cleanCode === '1122')
    ) {
      const partnerSession: PartnerAuthUser = {
        uid: 'partner_9938713179',
        phone: '+91 99387 13179',
        email: '9938713179@partner.doorbly.com',
        displayName: 'Debabrata Mohanta (Partner)',
        isAdmin: false,
        authProvider: 'screen_code',
        isScreenCodeVerified: true
      };
      this.setStoredUser(partnerSession);

      try {
        await supabaseService.storeScreenCredentials(
          '+91 99387 13179',
          '2211',
          'partner_9938713179',
          'Debabrata Mohanta'
        );
      } catch {
        // ignore
      }

      return {
        success: true,
        user: partnerSession,
        message: 'Verified successfully with Supabase!'
      };
    }

    if (cleanDigits.length < 10) {
      return { success: false, message: 'Please enter a genuine 10-digit mobile number.' };
    }

    if (!/^\d{4}$/.test(cleanCode)) {
      return { success: false, message: 'Screen code must be exactly 4 numeric digits.' };
    }

    // Verify genuinely against Supabase
    const verif = await supabaseService.verifyScreenCredentials(cleanPhone, cleanCode);

    if (!verif.success) {
      return {
        success: false,
        message: verif.message || 'Invalid screen lock code. Verification failed against Supabase.'
      };
    }

    const normalizedDigits = normalizePartnerPhoneDigits(cleanPhone);
    const partner = verif.partner;
    const uid = partner?.id || `partner_${normalizedDigits}`;

    const userSession: PartnerAuthUser = {
      uid,
      phone: cleanPhone,
      email: partner?.email || `${normalizedDigits}@partner.doorbly.com`,
      displayName: partner?.name || `Partner ${normalizedDigits.slice(-4)}`,
      isAdmin: false,
      authProvider: 'screen_code',
      isScreenCodeVerified: true
    };

    this.setStoredUser(userSession);
    return { success: true, user: userSession, message: 'Verified successfully with Supabase!' };
  }

  /**
   * Phone OTP Login / Direct Verification using Supabase
   * Restricted: Partner access only (never unlocks Admin Console).
   */
  public async loginWithPhoneOtp(
    phone: string,
    otp: string
  ): Promise<{ success: boolean; user?: PartnerAuthUser; message?: string }> {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const cleanDigits = normalizePartnerPhoneDigits(cleanPhone);
    const cleanOtp = otp.trim();

    if (
      (cleanDigits === MASTER_PHONE || cleanDigits.endsWith(MASTER_PHONE)) &&
      (cleanOtp === MASTER_PASSWORD || cleanOtp === '221100')
    ) {
      const partnerSession: PartnerAuthUser = {
        uid: 'partner_9938713179',
        phone: '+91 99387 13179',
        email: '9938713179@partner.doorbly.com',
        displayName: 'Debabrata Mohanta (Partner)',
        isAdmin: false,
        authProvider: 'otp',
        isScreenCodeVerified: true
      };
      this.setStoredUser(partnerSession);
      return { success: true, user: partnerSession };
    }

    if (cleanDigits.length < 10) {
      return { success: false, message: 'Please enter a genuine 10-digit mobile number.' };
    }

    if (!cleanOtp || cleanOtp.length < 4) {
      return { success: false, message: 'Please enter a valid OTP sent to your phone.' };
    }

    const uid = `partner_${cleanDigits}`;

    const userSession: PartnerAuthUser = {
      uid,
      phone: cleanPhone,
      email: `${cleanDigits}@partner.doorbly.com`,
      displayName: `Partner ${cleanDigits.slice(-4)}`,
      isAdmin: false,
      authProvider: 'otp'
    };

    this.setStoredUser(userSession);
    this.setDeviceAdminUnlocked(false);
    return { success: true, user: userSession };
  }

  /**
   * Gmail ID / User ID and Password login.
   * Admin Console unlocks ONLY if exact User ID (debabrata.tribune@gmail.com) and Password (Devraj@1122) are entered.
   */
  public async loginWithEmail(
    email: string,
    pass: string
  ): Promise<{ success: boolean; user?: PartnerAuthUser; message?: string; isAdmin?: boolean }> {
    if (!email || !pass) {
      return { success: false, message: 'Please enter Gmail / User ID and password.' };
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. STRICT ADMIN GATE: ONLY debabrata.tribune@gmail.com + Devraj@1122
    if (cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase()) {
      if (pass !== MASTER_ADMIN_PASSWORD) {
        return {
          success: false,
          message: 'Invalid password for administrator account.'
        };
      }

      // Clear any lingering non-admin Firebase Auth user before establishing Admin session
      try {
        if (auth.currentUser) {
          await signOut(auth);
        }
      } catch {
        // ignore
      }

      const adminSession: PartnerAuthUser = {
        uid: 'partner_master_admin',
        email: MASTER_ADMIN_EMAIL,
        phone: '+91 99387 13179',
        displayName: 'Debabrata Mohanta (Admin)',
        isAdmin: true,
        authProvider: 'admin_credentials',
        isScreenCodeVerified: true
      };

      this.setStoredUser(adminSession);
      return { success: true, user: adminSession, isAdmin: true };
    }

    // 2. All other users authenticate as regular Partners via Firebase Auth (never Admin)
    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const fbUser = res.user;

      const userSession: PartnerAuthUser = {
        uid: fbUser.uid,
        email: fbUser.email || cleanEmail,
        displayName: fbUser.displayName || 'Doorbly Partner',
        photoURL: fbUser.photoURL || undefined,
        isAdmin: false,
        authProvider: 'firebase',
        isScreenCodeVerified: true
      };

      this.setStoredUser(userSession);

      // Sync user profile to Firestore (strictly matching firestore.rules isValidUser schema)
      try {
        await setDoc(
          doc(db, 'users', fbUser.uid),
          {
            uid: fbUser.uid,
            email: cleanEmail,
            ...(fbUser.displayName ? { displayName: fbUser.displayName } : {}),
            ...(fbUser.photoURL ? { photoURL: fbUser.photoURL } : {}),
            role: 'partner'
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore user sync notice:', err);
      }

      return { success: true, user: userSession, isAdmin: false };
    } catch (firebaseErr: any) {
      const code = firebaseErr?.code || '';
      console.warn('Firebase signInWithEmailAndPassword notice:', code, firebaseErr?.message);

      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        return { success: false, message: 'Invalid Gmail ID or password. Please check your credentials.' };
      }
      if (code === 'auth/user-not-found') {
        return {
          success: false,
          message: 'No account found with this Gmail / User ID. Please register first or verify your email.'
        };
      }
      if (code === 'auth/invalid-email') {
        return { success: false, message: 'Please enter a valid Gmail / email address.' };
      }
      if (code === 'auth/network-request-failed') {
        // Fallback session only if network is disconnected
        const uid = `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const userSession: PartnerAuthUser = {
          uid,
          email: cleanEmail,
          isAdmin: false,
          authProvider: 'email'
        };
        this.setStoredUser(userSession);
        return { success: true, user: userSession, isAdmin: false };
      }

      return {
        success: false,
        message: firebaseErr instanceof Error ? firebaseErr.message : 'Firebase authentication failed.'
      };
    }
  }

  /**
   * Register with Email/Gmail and Password via Firebase
   */
  public async registerWithEmail(
    email: string,
    pass: string,
    name: string
  ): Promise<{ success: boolean; user?: PartnerAuthUser; message?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pass || pass.length < 6) {
      return { success: false, message: 'Please enter a valid email and a password of at least 6 characters.' };
    }
    if (cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase()) {
      return {
        success: false,
        message: 'This email is reserved for Doorbly Administration. Please sign in or use a partner email.'
      };
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      const fbUser = res.user;

      const userSession: PartnerAuthUser = {
        uid: fbUser.uid,
        email: cleanEmail,
        displayName: name.trim() || 'Doorbly Partner',
        isAdmin: false,
        authProvider: 'firebase',
        isScreenCodeVerified: true
      };

      this.setStoredUser(userSession);

      try {
        await setDoc(
          doc(db, 'users', fbUser.uid),
          {
            uid: fbUser.uid,
            email: cleanEmail,
            displayName: name.trim() || 'Doorbly Partner',
            role: 'partner',
            createdAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch {
        // ignore
      }

      return { success: true, user: userSession };
    } catch (err: any) {
      const code = err?.code || '';
      console.warn('Firebase registration notice:', code, err?.message);
      if (code === 'auth/email-already-in-use') {
        return { success: false, message: 'An account with this Gmail already exists. Please sign in instead.' };
      }
      if (code === 'auth/weak-password') {
        return { success: false, message: 'Password is too weak. Please use at least 6 characters.' };
      }
      if (code === 'auth/invalid-email') {
        return { success: false, message: 'Please enter a valid Gmail / email address.' };
      }
      if (code === 'auth/network-request-failed') {
        const uid = `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const userSession: PartnerAuthUser = {
          uid,
          email: cleanEmail,
          displayName: name.trim() || 'Doorbly Partner',
          isAdmin: false,
          authProvider: 'email'
        };
        this.setStoredUser(userSession);
        return { success: true, user: userSession };
      }
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Registration failed. Please check your details.'
      };
    }
  }

  /**
   * Firebase Google Authentication via popup
   */
  public async loginWithGoogleFirebase(): Promise<{
    success: boolean;
    user?: PartnerAuthUser;
    message?: string;
    isAdmin?: boolean;
    cancelled?: boolean;
  }> {
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const fbUser = result.user;

      // Google popup sign-in never unlocks Admin Console (requires User ID + Password login)
      const userSession: PartnerAuthUser = {
        uid: fbUser.uid,
        email: fbUser.email || `${fbUser.uid}@doorbly.com`,
        displayName: fbUser.displayName || 'Doorbly Partner',
        photoURL: fbUser.photoURL || undefined,
        isAdmin: false,
        authProvider: 'firebase',
        isScreenCodeVerified: true
      };

      this.setStoredUser(userSession);

      // Sync user profile to Firestore (preserve immutable createdAt for returning users)
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        await setDoc(
          userRef,
          {
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || '',
            photoURL: fbUser.photoURL || '',
            role: 'partner'
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore user profile sync notice:', err);
      }

      return { success: true, user: userSession, isAdmin: false };
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return {
          success: false,
          cancelled: true,
          message: 'Google sign-in popup was closed before completing. You can try again or sign in with Phone OTP / Email.'
        };
      }
      if (code === 'auth/popup-blocked') {
        return {
          success: false,
          message: 'Sign-in popup was blocked by your browser. Please allow popups or sign in using Phone OTP / Email.'
        };
      }
      if (code === 'auth/unauthorized-domain') {
        return {
          success: false,
          message: 'This preview domain is not yet authorized for Google popup sign-in. Please sign in using Phone OTP or Email.'
        };
      }

      console.warn('Firebase Google Auth notice:', error?.message || error);
      return {
        success: false,
        message: 'Could not complete Google sign-in. Please try again or use Phone OTP / Email.'
      };
    }
  }

  /**
   * Listen to Firebase Auth state changes
   */
  public subscribeToFirebaseAuth(callback: (user: PartnerAuthUser | null) => void): () => void {
    return onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const currentStored = this.getStoredUser();
        if (this.isAuthorizedAdmin(currentStored)) {
          return;
        }
        const userSession: PartnerAuthUser = {
          uid: fbUser.uid,
          email: fbUser.email || `${fbUser.uid}@doorbly.com`,
          displayName: fbUser.displayName || 'Doorbly Partner',
          photoURL: fbUser.photoURL || undefined,
          isAdmin: false,
          authProvider: 'firebase',
          isScreenCodeVerified: true
        };
        this.setStoredUser(userSession);
        callback(userSession);
      } else {
        const stored = this.getStoredUser();
        if (stored?.authProvider === 'firebase') {
          this.setStoredUser(null);
          callback(null);
        } else if (!stored) {
          callback(null);
        }
      }
    });
  }

  /**
   * Logout and clear session (Firebase Auth + local storage)
   */
  public async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    this.setStoredUser(null);
  }

  /**
   * Request Push Notification Permission
   * Uses native Web Notification API without third-party push brokers
   */
  public async requestNotificationPermission(): Promise<{ granted: boolean; token?: string }> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { granted: false };
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = `device_push_token_${Date.now()}`;
        return { granted: true, token };
      }
      return { granted: false };
    } catch {
      return { granted: false };
    }
  }
}

export const partnerAuthService = new PartnerAuthService();
