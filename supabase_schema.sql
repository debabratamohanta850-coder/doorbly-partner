-- ============================================================================
-- DOORBLY PARTNER PLATFORM — COMPLETE & IDEMPOTENT SUPABASE SQL SCHEMA
-- Covers: Partners, KYC, Bookings, Customer Collections, Subscriptions,
-- GST Payments, Immutable Commission Snapshots, Commission Settlements,
-- Separate Wallet Ledgers, Atomic Server-Side RPCs, Triggers & Realtime.
-- Paste this entire script into Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================================

-- 1. CORE PARTNER PROFILE & AUTHENTICATION TABLES
CREATE TABLE IF NOT EXISTS public.doorbly_partners (
  id TEXT PRIMARY KEY,
  auth_id TEXT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT,
  dob TEXT,
  gender TEXT,
  photo_url TEXT,
  address TEXT DEFAULT '',
  district TEXT DEFAULT '',
  city TEXT DEFAULT '',
  pin_code TEXT DEFAULT '',
  primary_category TEXT DEFAULT '',
  services_offered JSONB NOT NULL DEFAULT '[]'::jsonb,
  years_experience NUMERIC NOT NULL DEFAULT 0,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  working_area TEXT DEFAULT '',
  preferred_radius_km NUMERIC NOT NULL DEFAULT 10,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  screen_lock_code TEXT,
  is_screen_code_verified BOOLEAN NOT NULL DEFAULT false,
  screen_code_verified_at TIMESTAMPTZ,
  auth_provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('incomplete', 'pending_verification', 'approved', 'rejected', 'suspended')),
  status_reason TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  last_location_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_screen_verifications (
  phone TEXT PRIMARY KEY,
  screen_code TEXT NOT NULL,
  partner_id TEXT,
  partner_name TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_kyc (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL DEFAULT 'aadhaar' CHECK (document_type IN ('aadhaar', 'pan')),
  document_number TEXT NOT NULL DEFAULT '',
  document_image_url TEXT,
  bank_account TEXT DEFAULT '',
  ifsc TEXT DEFAULT '',
  account_holder TEXT DEFAULT '',
  certificate_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_profession_changes (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  category_id TEXT,
  category_name TEXT,
  profession_name TEXT NOT NULL,
  fee_paid NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_memberships (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL UNIQUE,
  plan_name TEXT NOT NULL,
  monthly_fee NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending', 'inactive')),
  start_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  payment_reference TEXT,
  plan_code TEXT DEFAULT 'starter'
);

-- 2. SERVICE BOOKINGS, CUSTOMER COLLECTIONS, WALLETS, WITHDRAWALS & SETTLEMENTS
CREATE TABLE IF NOT EXISTS public.doorbly_service_bookings (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  service_category TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_description TEXT DEFAULT '',
  customer_location_address TEXT DEFAULT '',
  customer_address TEXT,
  latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  customer_latitude DOUBLE PRECISION,
  customer_longitude DOUBLE PRECISION,
  distance_km NUMERIC,
  booking_date TEXT,
  booking_time TEXT,
  estimated_duration TEXT,
  estimated_price NUMERIC(12,2),
  customer_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (customer_price >= 0),
  actual_collected_amount NUMERIC(12,2),
  partner_earning NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (partner_earning >= 0),
  commission_percent NUMERIC(6,2),
  commission_amount NUMERIC(12,2),
  plan_code_at_transaction TEXT,
  subscription_id TEXT,
  commission_calculated_at TIMESTAMPTZ,
  collection_payment_method TEXT,
  collection_payment_reference TEXT,
  collection_confirmed_at TIMESTAMPTZ,
  customer_confirmation_mode TEXT,
  customer_confirmation_code TEXT,
  commission_settlement_status TEXT DEFAULT 'accrued',
  status TEXT NOT NULL DEFAULT 'SEARCHING_PARTNER'
    CHECK (status IN ('SEARCHING_PARTNER', 'REQUEST_SENT', 'ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED')),
  assigned_partner_id TEXT,
  otp_code TEXT,
  notes TEXT,
  additional_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.doorbly_service_bookings
  ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS actual_collected_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS plan_code_at_transaction TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS commission_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collection_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS collection_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS collection_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_confirmation_mode TEXT,
  ADD COLUMN IF NOT EXISTS customer_confirmation_code TEXT,
  ADD COLUMN IF NOT EXISTS commission_settlement_status TEXT DEFAULT 'accrued';

CREATE TABLE IF NOT EXISTS public.doorbly_customer_collections (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  partner_id TEXT NOT NULL,
  estimated_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estimated_amount >= 0),
  actual_collected_amount NUMERIC(12,2) NOT NULL CHECK (actual_collected_amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'other_approved')),
  payment_reference TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_confirmed BOOLEAN NOT NULL DEFAULT true,
  confirmation_mode TEXT NOT NULL DEFAULT 'otp' CHECK (confirmation_mode IN ('otp', 'receipt')),
  confirmation_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_wallets (
  partner_id TEXT PRIMARY KEY,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pending_amount >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_wallet_transactions (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  booking_id TEXT,
  reference_id TEXT,
  payment_method TEXT,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.doorbly_partner_wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_unique_booking_category
  ON public.doorbly_partner_wallet_transactions (booking_id, category)
  WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.doorbly_partner_withdrawals (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  bank_account TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processing', 'completed', 'failed', 'rejected')),
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_notifications (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SYSTEM',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_support_tickets (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  booking_id TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_daily_offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward_badge TEXT DEFAULT '',
  valid_until TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SUBSCRIPTION PLANS, PARTNER SUBSCRIPTIONS, PAYMENTS, TAX, COMMISSIONS & SETTLEMENTS
CREATE TABLE IF NOT EXISTS public.doorbly_subscription_plans (
  id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL UNIQUE,
  plan_name TEXT NOT NULL,
  monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  commission_percent NUMERIC(6,2) NOT NULL DEFAULT 20 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  tax_configuration JSONB NOT NULL DEFAULT '{"is_tax_applicable": true, "default_tax_percent": 18}'::jsonb,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_partner_subscriptions (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  commission_percent NUMERIC(6,2) NOT NULL DEFAULT 20 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'suspended', 'cancelled', 'pending', 'pending_payment')),
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'pending', 'failed', 'free')),
  latest_payment_id TEXT,
  status_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade existing status check constraint on doorbly_partner_subscriptions to include pending_payment
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.doorbly_partner_subscriptions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
    AND pg_get_constraintdef(oid) NOT LIKE '%pending_payment%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.doorbly_partner_subscriptions DROP CONSTRAINT %I', con_name);
    ALTER TABLE public.doorbly_partner_subscriptions
      ADD CONSTRAINT chk_partner_sub_status
      CHECK (status IN ('active', 'expired', 'suspended', 'cancelled', 'pending', 'pending_payment'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.doorbly_subscription_payments (
  id TEXT PRIMARY KEY,
  partner_subscription_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  payment_request_id TEXT,
  amount_before_tax NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_before_tax >= 0),
  tax_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 18 CHECK (tax_rate_percent >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_gateway TEXT NOT NULL,
  gateway_payment_reference TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('completed', 'pending', 'failed', 'refunded')),
  invoice_number TEXT NOT NULL,
  duration_days INTEGER DEFAULT 30,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.doorbly_subscription_payments
  ADD COLUMN IF NOT EXISTS payment_request_id TEXT,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS public.doorbly_job_commission_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  collection_id TEXT,
  partner_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  plan_code_at_transaction TEXT NOT NULL,
  plan_name_at_transaction TEXT,
  commissionable_amount NUMERIC(12,2) NOT NULL CHECK (commissionable_amount >= 0),
  commission_percent NUMERIC(6,2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
  commission_amount NUMERIC(12,2) NOT NULL CHECK (commission_amount >= 0),
  tax_amount_if_applicable NUMERIC(12,2) NOT NULL DEFAULT 0,
  partner_earnings NUMERIC(12,2) NOT NULL CHECK (partner_earnings >= 0),
  payment_method TEXT,
  payment_reference TEXT,
  transaction_status TEXT NOT NULL DEFAULT 'credited'
    CHECK (transaction_status IN ('calculated', 'credited', 'reversed')),
  settlement_status TEXT NOT NULL DEFAULT 'accrued'
    CHECK (settlement_status IN ('accrued', 'settled')),
  settlement_id TEXT,
  settled_at TIMESTAMPTZ,
  snapshot_locked BOOLEAN NOT NULL DEFAULT true,
  booking_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.doorbly_job_commission_records
  ADD COLUMN IF NOT EXISTS collection_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'accrued',
  ADD COLUMN IF NOT EXISTS settlement_id TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.doorbly_commission_settlements (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'bank_transfer', 'card_netbanking', 'other_approved')),
  payment_reference TEXT NOT NULL UNIQUE,
  receipt_number TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (verification_status IN ('pending_verification', 'verified', 'rejected')),
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doorbly_tax_configurations (
  id TEXT PRIMARY KEY,
  tax_name TEXT NOT NULL,
  tax_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 18 CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  hsn_sac_code TEXT NOT NULL DEFAULT '998314',
  gstin_number TEXT,
  place_of_supply TEXT,
  verification_required_notice TEXT,
  expiry_policy TEXT NOT NULL DEFAULT 'fallback_starter'
    CHECK (expiry_policy IN ('fallback_starter', 'require_renewal')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.doorbly_tax_configurations
  ADD COLUMN IF NOT EXISTS expiry_policy TEXT NOT NULL DEFAULT 'fallback_starter';

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_bookings_partner_status ON public.doorbly_service_bookings (assigned_partner_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON public.doorbly_service_bookings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_partner_collected ON public.doorbly_customer_collections (partner_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_subs_partner_status ON public.doorbly_partner_subscriptions (partner_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_payments_partner_status ON public.doorbly_subscription_payments (partner_id, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_partner_created ON public.doorbly_job_commission_records (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_settlements_partner_status ON public.doorbly_commission_settlements (partner_id, verification_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_partner ON public.doorbly_partner_wallet_transactions (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_partner ON public.doorbly_partner_withdrawals (partner_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_partner ON public.doorbly_partner_notifications (partner_id, created_at DESC);

-- 5. FINANCIAL SECURITY TRIGGERS (IMMUTABLE SNAPSHOTS + SERVER-SIDE VALIDATION)
CREATE OR REPLACE FUNCTION public.prevent_commission_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Commission transaction snapshots cannot be deleted.';
  END IF;
  -- Financial math & historical plan snapshots are immutable forever; only settlement linkage can advance
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
     OR NEW.plan_code_at_transaction IS DISTINCT FROM OLD.plan_code_at_transaction
     OR NEW.commissionable_amount IS DISTINCT FROM OLD.commissionable_amount
     OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.partner_earnings IS DISTINCT FROM OLD.partner_earnings
     OR NEW.booking_completed_at IS DISTINCT FROM OLD.booking_completed_at THEN
    RAISE EXCEPTION 'Financial commission transaction snapshots are strictly immutable.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_job_commissions ON public.doorbly_job_commission_records;
CREATE TRIGGER trg_immutable_job_commissions
  BEFORE UPDATE OR DELETE ON public.doorbly_job_commission_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_commission_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.prevent_completed_sub_payment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Subscription payment records cannot be deleted.';
  END IF;
  -- Once completed, invoices and payment snapshots cannot be altered; pending payments can only transition once
  IF OLD.payment_status = 'completed' THEN
    RAISE EXCEPTION 'Completed subscription payment invoice records are strictly immutable.';
  END IF;
  IF NEW.amount_before_tax IS DISTINCT FROM OLD.amount_before_tax
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION 'Payment financial amounts cannot be altered after payment request creation.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_sub_payments ON public.doorbly_subscription_payments;
CREATE TRIGGER trg_immutable_sub_payments
  BEFORE UPDATE OR DELETE ON public.doorbly_subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_sub_payment_mutation();

CREATE OR REPLACE FUNCTION public.enforce_commission_snapshot_math()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_safe_amount NUMERIC;
BEGIN
  v_safe_amount := GREATEST(COALESCE(NEW.commissionable_amount, 0), 0);
  NEW.commissionable_amount := ROUND(v_safe_amount, 2);
  NEW.commission_amount := ROUND((NEW.commissionable_amount * NEW.commission_percent) / 100.0, 2);
  NEW.partner_earnings := ROUND(NEW.commissionable_amount - NEW.commission_amount, 2);
  NEW.snapshot_locked := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_commission_math ON public.doorbly_job_commission_records;
CREATE TRIGGER trg_enforce_commission_math
  BEFORE INSERT ON public.doorbly_job_commission_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_commission_snapshot_math();

-- 6. ATOMIC DATABASE-SIDE RPCs
-- 6A. Customer Collection Confirmation & Automatic Commission Deduction RPC
CREATE OR REPLACE FUNCTION public.confirm_customer_collection_and_commission(
  p_booking_id TEXT,
  p_partner_id TEXT,
  p_actual_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_ref TEXT DEFAULT NULL,
  p_collected_at TIMESTAMPTZ DEFAULT NOW(),
  p_confirmation_mode TEXT DEFAULT 'otp',
  p_confirmation_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_sub RECORD;
  v_plan_pct NUMERIC := 20;
  v_plan_code TEXT := 'starter';
  v_plan_name TEXT := 'Starter';
  v_sub_id TEXT := 'starter_fallback';
  v_safe_actual NUMERIC;
  v_comm_amt NUMERIC;
  v_net_amt NUMERIC;
  v_bal NUMERIC := 0;
  v_effective_ts TIMESTAMPTZ := COALESCE(p_collected_at, NOW());
  v_collection_id TEXT := 'col_' || p_booking_id;
  v_inserted_comm_id TEXT;
BEGIN
  IF p_payment_method NOT IN ('cash', 'upi', 'other_approved') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_payment_method');
  END IF;

  IF p_payment_method <> 'cash' AND COALESCE(BTRIM(p_payment_ref), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_reference_required');
  END IF;

  v_safe_actual := ROUND(GREATEST(COALESCE(p_actual_amount, 0), 0), 2);
  IF v_safe_actual <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_collected_amount');
  END IF;

  SELECT * INTO v_booking
  FROM public.doorbly_service_bookings
  WHERE id = p_booking_id AND assigned_partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND OR v_booking.status IN ('COMPLETED', 'CANCELLED', 'REJECTED') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'immutable_or_not_found');
  END IF;

  -- Determine subscription active strictly at collection confirmation timestamp
  SELECT s.*, p.commission_percent AS live_pct, p.plan_name AS live_name
  INTO v_sub
  FROM public.doorbly_partner_subscriptions s
  LEFT JOIN public.doorbly_subscription_plans p ON p.plan_code = s.plan_code
  WHERE s.partner_id = p_partner_id
    AND s.status = 'active'
    AND s.start_at <= v_effective_ts
    AND (s.plan_code = 'starter' OR s.expires_at >= v_effective_ts)
  ORDER BY s.start_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_sub_id := v_sub.id;
    v_plan_code := v_sub.plan_code;
    v_plan_name := COALESCE(v_sub.live_name, v_sub.plan_name);
    v_plan_pct := COALESCE(v_sub.live_pct, v_sub.commission_percent, 20);
  ELSE
    SELECT commission_percent, plan_name
    INTO v_plan_pct, v_plan_name
    FROM public.doorbly_subscription_plans
    WHERE plan_code = 'starter'
    LIMIT 1;
    v_plan_pct := COALESCE(v_plan_pct, 20);
    v_plan_name := COALESCE(v_plan_name, 'Starter');
  END IF;

  v_comm_amt := ROUND((v_safe_actual * v_plan_pct) / 100.0, 2);
  v_net_amt := ROUND(v_safe_actual - v_comm_amt, 2);

  INSERT INTO public.doorbly_customer_collections (
    id, booking_id, partner_id, estimated_amount, actual_collected_amount,
    payment_method, payment_reference, collected_at, customer_confirmed,
    confirmation_mode, confirmation_code, notes
  ) VALUES (
    v_collection_id, p_booking_id, p_partner_id, COALESCE(v_booking.customer_price, v_safe_actual), v_safe_actual,
    p_payment_method, NULLIF(BTRIM(p_payment_ref), ''), v_effective_ts, true,
    COALESCE(NULLIF(p_confirmation_mode, ''), 'otp'), NULLIF(BTRIM(p_confirmation_code), ''), p_notes
  )
  ON CONFLICT (booking_id) DO NOTHING;

  -- Idempotent immutable commission snapshot (never double-calculates for same job)
  INSERT INTO public.doorbly_job_commission_records (
    id, job_id, collection_id, partner_id, subscription_id, plan_code_at_transaction, plan_name_at_transaction,
    commissionable_amount, commission_percent, commission_amount, partner_earnings,
    payment_method, payment_reference, transaction_status, settlement_status, snapshot_locked, booking_completed_at
  ) VALUES (
    'comm_' || p_booking_id, p_booking_id, v_collection_id, p_partner_id, v_sub_id, v_plan_code, v_plan_name,
    v_safe_actual, v_plan_pct, v_comm_amt, v_net_amt,
    p_payment_method, NULLIF(BTRIM(p_payment_ref), ''), 'credited', 'accrued', true, v_effective_ts
  )
  ON CONFLICT (job_id) DO NOTHING
  RETURNING id INTO v_inserted_comm_id;

  IF v_inserted_comm_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'commission_already_recorded');
  END IF;

  UPDATE public.doorbly_service_bookings
  SET status = 'COMPLETED',
      estimated_price = COALESCE(estimated_price, customer_price),
      customer_price = v_safe_actual,
      actual_collected_amount = v_safe_actual,
      completed_at = v_effective_ts,
      collection_confirmed_at = v_effective_ts,
      collection_payment_method = p_payment_method,
      collection_payment_reference = NULLIF(BTRIM(p_payment_ref), ''),
      customer_confirmation_mode = COALESCE(NULLIF(p_confirmation_mode, ''), 'otp'),
      customer_confirmation_code = NULLIF(BTRIM(p_confirmation_code), ''),
      commission_settlement_status = 'accrued',
      partner_earning = v_net_amt,
      commission_percent = v_plan_pct,
      commission_amount = v_comm_amt,
      plan_code_at_transaction = v_plan_code,
      subscription_id = v_sub_id,
      commission_calculated_at = NOW(),
      notes = COALESCE(p_notes, notes)
  WHERE id = p_booking_id;

  SELECT COALESCE(available_balance, 0) INTO v_bal
  FROM public.doorbly_partner_wallets
  WHERE partner_id = p_partner_id
  FOR UPDATE;

  v_bal := ROUND(COALESCE(v_bal, 0) + v_net_amt, 2);

  INSERT INTO public.doorbly_partner_wallets (partner_id, available_balance, updated_at)
  VALUES (p_partner_id, v_bal, NOW())
  ON CONFLICT (partner_id) DO UPDATE
  SET available_balance = v_bal, updated_at = NOW();

  -- Record separate ledger entries: Gross Collection + Partner Net Earnings Credit + Accrued Doorbly Commission Payable
  INSERT INTO public.doorbly_partner_wallet_transactions (
    id, partner_id, booking_id, reference_id, payment_method, type, category, amount, balance_after, description, status
  ) VALUES
    (
      'tx_col_' || p_booking_id, p_partner_id, p_booking_id, NULLIF(BTRIM(p_payment_ref), ''), p_payment_method,
      'credit', 'gross_collection', v_safe_actual, v_bal,
      'Customer collection (' || UPPER(p_payment_method) || ') for #' || LEFT(p_booking_id, 8), 'completed'
    ),
    (
      'tx_cred_' || p_booking_id, p_partner_id, p_booking_id, v_collection_id, p_payment_method,
      'credit', 'job_earning', v_net_amt, v_bal,
      'Net earnings on #' || LEFT(p_booking_id, 8) || ' [' || UPPER(v_plan_code) || ' ' || v_plan_pct || '% fee]', 'completed'
    ),
    (
      'tx_comm_' || p_booking_id, p_partner_id, p_booking_id, v_inserted_comm_id, p_payment_method,
      'debit', 'commission_accrued', v_comm_amt, v_bal,
      'Doorbly commission payable (' || v_plan_pct || '%) on #' || LEFT(p_booking_id, 8), 'completed'
    )
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'collection_id', v_collection_id,
    'commission_id', v_inserted_comm_id,
    'actual_collected_amount', v_safe_actual,
    'commission_percent', v_plan_pct,
    'commission_amount', v_comm_amt,
    'partner_earnings', v_net_amt,
    'available_balance', v_bal,
    'plan_code', v_plan_code
  );
END;
$$;

-- 6B. Backward-compatible booking completion RPC delegating to collection confirmation
CREATE OR REPLACE FUNCTION public.complete_booking_with_commission(p_booking_id TEXT, p_partner_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price NUMERIC := 0;
BEGIN
  SELECT COALESCE(actual_collected_amount, customer_price, 0)
  INTO v_price
  FROM public.doorbly_service_bookings
  WHERE id = p_booking_id AND assigned_partner_id = p_partner_id;

  RETURN public.confirm_customer_collection_and_commission(
    p_booking_id, p_partner_id, GREATEST(COALESCE(v_price, 0), 0), 'cash', NULL, NOW(), 'receipt', 'ADMIN_COMPLETE', NULL
  );
END;
$$;

-- 6C. Gateway / Admin Subscription Payment Verification & Plan Activation RPC
CREATE OR REPLACE FUNCTION public.verify_subscription_payment_and_activate(
  p_payment_id TEXT,
  p_gateway_ref TEXT,
  p_actor_email TEXT DEFAULT 'gateway_webhook'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay RECORD;
  v_sub RECORD;
  v_plan RECORD;
  v_days INTEGER := 30;
  v_start TIMESTAMPTZ := NOW();
  v_expiry TIMESTAMPTZ;
  v_duplicate_id TEXT;
BEGIN
  IF COALESCE(BTRIM(p_gateway_ref), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'gateway_reference_required');
  END IF;

  SELECT * INTO v_pay
  FROM public.doorbly_subscription_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  IF v_pay.payment_status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_completed', 'invoice_number', v_pay.invoice_number);
  END IF;

  SELECT id INTO v_duplicate_id
  FROM public.doorbly_subscription_payments
  WHERE gateway_payment_reference = BTRIM(p_gateway_ref)
    AND payment_status = 'completed'
    AND id <> p_payment_id
  LIMIT 1;

  IF v_duplicate_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_gateway_reference');
  END IF;

  SELECT * INTO v_sub
  FROM public.doorbly_partner_subscriptions
  WHERE id = v_pay.partner_subscription_id
  FOR UPDATE;

  SELECT * INTO v_plan
  FROM public.doorbly_subscription_plans
  WHERE id = v_pay.plan_id OR plan_code = v_pay.plan_code
  LIMIT 1;

  v_days := GREATEST(1, COALESCE(v_pay.duration_days, 30));
  v_expiry := v_start + (v_days || ' days')::interval;

  -- Cancel previous active subscriptions (preserving complete history)
  UPDATE public.doorbly_partner_subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE partner_id = v_pay.partner_id
    AND status = 'active'
    AND id <> v_pay.partner_subscription_id;

  UPDATE public.doorbly_subscription_payments
  SET payment_status = 'completed',
      gateway_payment_reference = BTRIM(p_gateway_ref),
      verified_by = p_actor_email,
      verified_at = NOW()
  WHERE id = p_payment_id;

  IF FOUND AND v_sub.id IS NOT NULL THEN
    UPDATE public.doorbly_partner_subscriptions
    SET status = 'active',
        commission_percent = COALESCE(v_plan.commission_percent, v_sub.commission_percent),
        start_at = v_start,
        expires_at = v_expiry,
        payment_status = CASE WHEN v_pay.total_amount = 0 THEN 'free' ELSE 'paid' END,
        latest_payment_id = p_payment_id,
        status_reason = 'Verified by ' || p_actor_email || ' (TXN ' || BTRIM(p_gateway_ref) || ')',
        updated_at = NOW()
    WHERE id = v_sub.id;
  END IF;

  INSERT INTO public.doorbly_partner_wallet_transactions (
    id, partner_id, reference_id, payment_method, type, category, amount, balance_after, description, status
  ) VALUES (
    'tx_sub_' || p_payment_id, v_pay.partner_id, p_gateway_ref, v_pay.payment_gateway,
    'debit', 'subscription_payment', v_pay.total_amount, 0,
    'Subscription verified (' || UPPER(v_pay.plan_code) || ') Invoice #' || v_pay.invoice_number, 'completed'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id,
    'subscription_id', v_pay.partner_subscription_id,
    'invoice_number', v_pay.invoice_number,
    'start_at', v_start,
    'expires_at', v_expiry
  );
END;
$$;

-- 6D. Commission Settlement Verification & Reconciliation RPC
CREATE OR REPLACE FUNCTION public.verify_commission_settlement(
  p_settlement_id TEXT,
  p_status TEXT,
  p_admin_email TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set RECORD;
  v_bal NUMERIC := 0;
BEGIN
  IF p_status NOT IN ('verified', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_settlement_status');
  END IF;

  SELECT * INTO v_set
  FROM public.doorbly_commission_settlements
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'settlement_not_found');
  END IF;

  IF v_set.verification_status <> 'pending_verification' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_processed');
  END IF;

  UPDATE public.doorbly_commission_settlements
  SET verification_status = p_status,
      verified_by = p_admin_email,
      verified_at = NOW(),
      notes = COALESCE(NULLIF(BTRIM(p_notes), ''), notes)
  WHERE id = p_settlement_id;

  IF p_status = 'verified' THEN
    SELECT COALESCE(available_balance, 0) INTO v_bal
    FROM public.doorbly_partner_wallets
    WHERE partner_id = v_set.partner_id;

    INSERT INTO public.doorbly_partner_wallet_transactions (
      id, partner_id, reference_id, payment_method, type, category, amount, balance_after, description, status
    ) VALUES (
      'tx_settle_' || p_settlement_id, v_set.partner_id, v_set.payment_reference, v_set.payment_method,
      'debit', 'commission_settlement', v_set.amount, COALESCE(v_bal, 0),
      'Doorbly Commission Settled · Receipt #' || v_set.receipt_number || ' (Ref ' || v_set.payment_reference || ')', 'completed'
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.doorbly_job_commission_records
    SET settlement_status = 'settled',
        settlement_id = p_settlement_id,
        settled_at = NOW()
    WHERE partner_id = v_set.partner_id
      AND settlement_status = 'accrued';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'settlement_id', p_settlement_id,
    'verification_status', p_status,
    'verified_at', NOW()
  );
END;
$$;

-- 7. PERMISSIONS & CLIENT SAFETY GUARDS
REVOKE UPDATE, DELETE ON public.doorbly_job_commission_records FROM anon, authenticated;
REVOKE DELETE ON public.doorbly_subscription_payments FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_customer_collection_and_commission(TEXT, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_booking_with_commission(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_subscription_payment_and_activate(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_commission_settlement(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

ALTER TABLE public.doorbly_job_commission_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.doorbly_partner_wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.doorbly_customer_collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.doorbly_commission_settlements DISABLE ROW LEVEL SECURITY;

-- 8. ENABLE SUPABASE REALTIME FOR LIVE FLEET, BOOKINGS, WALLET, COLLECTIONS, SUBSCRIPTIONS & SETTLEMENTS
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'doorbly_partners',
    'doorbly_service_bookings',
    'doorbly_customer_collections',
    'doorbly_partner_wallets',
    'doorbly_partner_wallet_transactions',
    'doorbly_partner_notifications',
    'doorbly_partner_memberships',
    'doorbly_partner_withdrawals',
    'doorbly_daily_offers',
    'doorbly_subscription_plans',
    'doorbly_partner_subscriptions',
    'doorbly_subscription_payments',
    'doorbly_job_commission_records',
    'doorbly_commission_settlements'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 9. CANONICAL COMPATIBILITY VIEWS FOR ACCOUNTING & AUDIT REPORTING
CREATE OR REPLACE VIEW public.subscription_plans AS SELECT * FROM public.doorbly_subscription_plans;
CREATE OR REPLACE VIEW public.partner_subscriptions AS SELECT * FROM public.doorbly_partner_subscriptions;
CREATE OR REPLACE VIEW public.subscription_payments AS SELECT * FROM public.doorbly_subscription_payments;
CREATE OR REPLACE VIEW public.customer_collections AS SELECT * FROM public.doorbly_customer_collections;
CREATE OR REPLACE VIEW public.commission_transactions AS SELECT * FROM public.doorbly_job_commission_records;
CREATE OR REPLACE VIEW public.commission_settlements AS SELECT * FROM public.doorbly_commission_settlements;
CREATE OR REPLACE VIEW public.partner_wallet_transactions AS SELECT * FROM public.doorbly_partner_wallet_transactions;

-- 10. SEED DEFAULT SUBSCRIPTION PLANS & GST TAX CONFIGURATION
INSERT INTO public.doorbly_subscription_plans (
  id, plan_code, plan_name, monthly_price, commission_percent, benefits, is_recommended, is_active
) VALUES
  (
    'plan_starter', 'starter', 'Starter', 0, 20,
    '["₹0 monthly subscription — free to start", "Doorbly commission: 20% per completed job", "Partner retains 80% (₹800 per ₹1,000 collected)", "Standard doorstep service notifications", "Real-time wallet credits & withdrawal history"]'::jsonb,
    false, true
  ),
  (
    'plan_growth', 'growth', 'Growth', 370, 12,
    '["₹370/month + applicable tax", "Reduced Doorbly commission: 12% per completed job", "Partner retains 88% (₹880 per ₹1,000 collected)", "Priority doorstep job alerts in your zone", "Recommended high-value plan for active partners", "Automated subscription expiry reminders"]'::jsonb,
    true, true
  ),
  (
    'plan_professional', 'professional', 'Professional', 799, 7,
    '["₹799/month + applicable tax", "Lowest Doorbly commission: only 7% per completed job", "Partner retains 93% (₹930 per ₹1,000 collected)", "Top-priority access to high-value eligible jobs", "Priority partner support & automated GST tax invoices", "Subscription expiry & renewal protection"]'::jsonb,
    false, true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.doorbly_tax_configurations (
  id, tax_name, tax_rate_percent, is_active, hsn_sac_code, gstin_number, place_of_supply, verification_required_notice, expiry_policy
) VALUES (
  'tax_config_in',
  'Goods & Services Tax (GST)',
  18,
  true,
  '998314',
  '21AAACD1234F1Z5',
  'Odisha (21) / Inter-State',
  'Configurable tax rate: Rates and applicability must be verified against legal service classification and GST registration status before live deployment.',
  'fallback_starter'
)
ON CONFLICT (id) DO NOTHING;
