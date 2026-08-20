import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSession, lockAdminConsole, superAdminLogin, unlockAdminConsole } from "@/lib/admin-gate.functions";
import {
  makeHandle,
  makePasscode,
  AUTO_RELEASE_HOURS,
  LISTING_LIFESPAN_DAYS,
  DAY_MS,
  ADMIN_OPAY,
  ADMIN_WHATSAPP,
  type DBState,
  type Broadcast,
  type PublicSeller,
  type ReferralRow,
  type Category,
  type Listing,
  type NigerianUser,
  type EscrowTransaction,
  type Pedigree,
  type DisputeStatus,
  type TxStatus,
} from "./pigeon-data";

type NewListingInput = Omit<
  Listing,
  | "id"
  | "breeder_id"
  | "breeder_handle"
  | "is_active"
  | "creation_timestamp"
  | "expiry_date"
  | "commission_override"
>;

interface AuthGate {
  open: boolean;
  mode: "login" | "register";
  warning: string | null;
}

interface StoreValue {
  db: DBState;
  user: NigerianUser | null;
  isAuthed: boolean;
  authGate: AuthGate;
  openAuth: (mode?: "login" | "register", warning?: string | null) => void;
  closeAuth: () => void;
  login: (email: string, password: string) => Promise<string | null>;
  register: (input: {
    real_name: string;
    email: string;
    password: string;
    phone_number: string;
    home_state: string;
    bank_name: string;
    account_number: string;
    avatar_url?: string;
    referral_code?: string;
  }) => Promise<string | null>;
  updateProfile: (patch: {
    real_name?: string;
    phone_number?: string;
    avatar_url?: string;
    home_state?: string;
    bank_name?: string;
    account_number?: string;
  }) => Promise<string | null>;
  sendBroadcast: (body: string) => Promise<string | null>;
  retireBroadcast: (id: string) => Promise<void>;
  setUserFlags: (
    userId: string,
    patch: { is_verified_seller?: boolean; is_frozen?: boolean; escrow_paused?: boolean },
  ) => Promise<void>;
  releaseUserFunds: (userId: string) => Promise<number>;
  logout: () => Promise<void>;
  adminUnlocked: boolean;
  unlockAdmin: (pwd: string) => Promise<boolean>;
  masterUnlock: (pwd: string) => Promise<boolean>;
  lockAdmin: () => void;
  addListing: (input: NewListingInput) => Promise<void>;
  deleteListing: (id: string) => Promise<void>;
  setCommission: (pct: number) => Promise<void>;
  setWhatsappAlertNumber: (value: string) => Promise<void>;
  setListingFlags: (id: string, patch: { is_featured?: boolean; is_verified_seller?: boolean }) => Promise<void>;
  applyReferral: (code: string) => Promise<string | null>;
  setListingOverride: (id: string, pct: number | null) => Promise<void>;
  commissionFor: (l: Listing) => number;
  buyListing: (l: Listing) => Promise<EscrowTransaction | null>;
  confirmDelivery: (txId: string) => Promise<void>;
  reportDOA: (txId: string, fileName: string) => Promise<void>;
  submitBreederProof: (txId: string, driverPhone: string, waybill: string) => Promise<void>;
  adminRefund: (txId: string) => Promise<void>;
  adminRelease: (txId: string) => Promise<void>;
  bypassPasscode: (txId: string, code: string) => boolean;
  banUser: (userId: string) => Promise<void>;
  sendMessage: (listingId: string, toId: string, body: string) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY: DBState = {
  users: [],
  listings: [],
  transactions: [],
  messages: [],
  sellers: {},
  referrals: [],
  broadcast: null,
  commission_pct: 12,
  whatsapp_alert_number: ADMIN_WHATSAPP,
  referral_code: "",
  referral_credits: 0,
  referred_count: 0,
  current_user_id: null,
  jwt: null,
};

const ms = (value: string | null) => (value ? new Date(value).getTime() : 0);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DBState>(EMPTY);
  const [session, setSession] = useState<Session | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [authGate, setAuthGate] = useState<AuthGate>({
    open: false,
    mode: "login",
    warning: null,
  });
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  /** Creates the caller's own profile row (RLS: id must equal auth.uid()). */
  const ensureProfile = useCallback(async () => {
    const authUser = sessionRef.current?.user;
    if (!authUser) return;
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();
    if (existing) return;
    const meta = (authUser.user_metadata ?? {}) as Record<string, string>;
    await supabase.from("profiles").insert({
      id: authUser.id,
      real_name: meta["real_name"] ?? "",
      phone_number: meta["phone_number"] ?? "",
      public_handle: meta["public_handle"] ?? makeHandle(),
      home_state: meta["home_state"] ?? "",
      bank_name: meta["bank_name"] ?? "",
      account_number: meta["account_number"] ?? "",
      avatar_url: meta["avatar_url"] ?? "",
      email: authUser.email ?? "",
    });
  }, []);

  /**
   * Every row below is fetched through row-level security: the database decides
   * what this account may see. The browser cannot widen it.
   */
  const refresh = useCallback(async () => {
    const uid = sessionRef.current?.user.id ?? null;

    const [settings, listings, profiles, txs, passcodes, msgs, credits, sellers, announcements, referrals] = await Promise.all([
      supabase.from("app_settings").select("commission_pct, whatsapp_alert_number").eq("id", 1).maybeSingle(),
      supabase
        .from("listings")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("is_verified_seller", { ascending: false })
        .order("creation_timestamp", { ascending: false }),
      uid ? supabase.from("profiles").select("*") : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("transactions").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("transaction_passcodes").select("*") : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("messages").select("*").order("created_at", { ascending: true }) : Promise.resolve({ data: [] as never[] }),
      uid
        ? supabase.from("referral_credit_totals").select("*").eq("referrer_id", uid).maybeSingle()
        : Promise.resolve({ data: null as { total_credits: number | null; referred_count: number | null } | null }),
      supabase.from("public_profiles").select("*"),
      supabase
        .from("broadcasts")
        .select("id, body, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1),
      uid ? supabase.from("referrals").select("*") : Promise.resolve({ data: [] as never[] }),
    ]);

    const sellerMap: Record<string, PublicSeller> = {};
    for (const row of (sellers.data ?? []) as Record<string, unknown>[]) {
      sellerMap[String(row["id"])] = {
        id: String(row["id"]),
        public_handle: String(row["public_handle"] ?? ""),
        avatar_url: String(row["avatar_url"] ?? ""),
        is_verified_seller: row["is_verified_seller"] === true,
        is_online: row["is_online"] === true,
      };
    }

    const latest = ((announcements.data ?? []) as Record<string, unknown>[])[0];
    const broadcast: Broadcast | null = latest
      ? {
          id: String(latest["id"]),
          body: String(latest["body"] ?? ""),
          created_at: ms(String(latest["created_at"])),
        }
      : null;

    const codeFor = new Map(
      ((passcodes.data ?? []) as { transaction_id: string; passcode: string }[]).map((p) => [
        p.transaction_id,
        p.passcode,
      ]),
    );

    const myProfile = ((profiles.data ?? []) as Record<string, unknown>[]).find(
      (p) => String(p["id"]) === uid,
    );

    setDb({
      commission_pct: Number(settings.data?.commission_pct ?? 12),
      whatsapp_alert_number: String(settings.data?.whatsapp_alert_number ?? ADMIN_WHATSAPP),
      referral_code: String(myProfile?.["referral_code"] ?? ""),
      referral_credits: Number(credits.data?.total_credits ?? 0),
      referred_count: Number(credits.data?.referred_count ?? 0),
      current_user_id: uid,
      jwt: null,
      sellers: sellerMap,
      broadcast,
      referrals: ((referrals.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r["id"]),
        referrer_id: String(r["referrer_id"]),
        referred_id: String(r["referred_id"]),
        referral_code: String(r["referral_code"] ?? ""),
        credits: Number(r["credits"] ?? 0),
        created_at: ms(String(r["created_at"])),
      })) as ReferralRow[],
      users: ((profiles.data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: String(p["id"]),
        real_name: String(p["real_name"] ?? ""),
        email: String(p["email"] ?? (uid === String(p["id"]) ? (sessionRef.current?.user.email ?? "") : "")),
        password: "",
        phone_number: String(p["phone_number"] ?? ""),
        public_handle: String(p["public_handle"] ?? ""),
        home_state: String(p["home_state"] ?? ""),
        bank_name: String(p["bank_name"] ?? ""),
        account_number: String(p["account_number"] ?? ""),
        is_online: p["is_online"] === true,
        is_banned: p["is_banned"] === true,
        avatar_url: String(p["avatar_url"] ?? ""),
        is_verified_seller: p["is_verified_seller"] === true,
        is_frozen: p["is_frozen"] === true,
        escrow_paused: p["escrow_paused"] === true,
        created_at: ms(String(p["created_at"])),
      })),
      listings: ((listings.data ?? []) as Record<string, unknown>[]).map((l) => ({
        id: String(l["id"]),
        category_type: String(l["category_type"]) as Category,
        breeder_id: l["breeder_id"] ? String(l["breeder_id"]) : "",
        breeder_handle: String(l["breeder_handle"] ?? ""),
        custom_bird_name: String(l["custom_bird_name"] ?? ""),
        breed_type: String(l["breed_type"] ?? ""),
        gender: String(l["gender"]) as Listing["gender"],
        price_ngn: Number(l["price_ngn"] ?? 0),
        images: (l["images"] as string[] | null) ?? [],
        pedigree_json: (l["pedigree_json"] as Pedigree | null) ?? null,
        vaccinated: l["vaccinated"] === true,
        state: String(l["state"] ?? ""),
        description: String(l["description"] ?? ""),
        batch_quantity: Number(l["batch_quantity"] ?? 0),
        commission_override:
          l["commission_override"] === null || l["commission_override"] === undefined
            ? null
            : Number(l["commission_override"]),
        is_active: l["is_active"] === true,
        is_featured: l["is_featured"] === true,
        is_verified_seller: l["is_verified_seller"] === true,
        creation_timestamp: ms(String(l["creation_timestamp"])),
        expiry_date: ms(String(l["expiry_date"])),
      })),
      transactions: ((txs.data ?? []) as Record<string, unknown>[]).map((t) => ({
        id: String(t["id"]),
        listing_id: t["listing_id"] ? String(t["listing_id"]) : "",
        listing_name: String(t["listing_name"] ?? ""),
        buyer_id: String(t["buyer_id"]),
        breeder_id: t["breeder_id"] ? String(t["breeder_id"]) : "",
        amount_naira: Number(t["amount_naira"] ?? 0),
        calculated_commission: Number(t["calculated_commission"] ?? 0),
        // Only the buyer (and admins) can read this row from the database.
        pickup_passcode: codeFor.get(String(t["id"])) ?? "Hidden — buyer only",
        delivery_marked_at: ms(String(t["delivery_marked_at"])),
        auto_release_at: ms(String(t["auto_release_at"])),
        driver_phone: (t["driver_phone"] as string | null) ?? null,
        waybill_image_url: (t["waybill_image_url"] as string | null) ?? null,
        proof_file_name: (t["proof_file_name"] as string | null) ?? null,
        dispute_status: String(t["dispute_status"]) as DisputeStatus,
        status: String(t["status"]) as TxStatus,
        created_at: ms(String(t["created_at"])),
      })),
      messages: ((msgs.data ?? []) as Record<string, unknown>[]).map((m) => ({
        id: String(m["id"]),
        listing_id: String(m["listing_id"] ?? ""),
        from_id: String(m["from_id"]),
        to_id: String(m["to_id"]),
        body: String(m["body"] ?? ""),
        created_at: ms(String(m["created_at"])),
      })),
    });
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      sessionRef.current = next;
      setSession(next);
      void ensureProfile().then(refresh);
      if (next) {
        void getAdminSession()
          .then((r) => setAdminUnlocked(r.unlocked))
          .catch(() => setAdminUnlocked(false));
      } else {
        setAdminUnlocked(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session;
      setSession(data.session);
      void ensureProfile().then(refresh);
      if (data.session) {
        void getAdminSession()
          .then((r) => setAdminUnlocked(r.unlocked))
          .catch(() => setAdminUnlocked(false));
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [refresh, ensureProfile]);

  const user = useMemo(
    () => db.users.find((u) => u.id === db.current_user_id) ?? null,
    [db.users, db.current_user_id],
  );

  const commissionFor = useCallback(
    (l: Listing) => l.commission_override ?? db.commission_pct,
    [db.commission_pct],
  );

  const updateTx = useCallback(
    async (txId: string, patch: Record<string, string | null>) => {
      await supabase.from("transactions").update(patch as never).eq("id", txId);
      await refresh();
    },
    [refresh],
  );

  const value: StoreValue = {
    db,
    user,
    isAuthed: !!session && !!user,
    authGate,
    openAuth: (mode = "login", warning = null) => setAuthGate({ open: true, mode, warning }),
    closeAuth: () => setAuthGate((g) => ({ ...g, open: false, warning: null })),

    login: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return "No account matches that email and password.";
      const { data: me } = await supabase.from("profiles").select("is_banned").maybeSingle();
      if (me?.is_banned) {
        await supabase.auth.signOut();
        return "This account has been suspended by the administrator.";
      }
      setAuthGate({ open: false, mode: "login", warning: null });
      return null;
    },

    register: async (input) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            real_name: input.real_name,
            phone_number: input.phone_number,
            public_handle: makeHandle(),
            home_state: input.home_state,
            bank_name: input.bank_name,
            account_number: input.account_number,
            avatar_url: input.avatar_url ?? "",
          },
        },
      });
      if (error) return error.message;
      // Email confirmation is disabled, so the session arrives immediately.
      if (!data.session) return "Account created. Log in to continue.";
      sessionRef.current = data.session;
      setSession(data.session);
      await ensureProfile();
      const invite = (input.referral_code ?? "").trim().toUpperCase();
      if (invite) {
        await supabase
          .from("referrals")
          .insert({ referrer_id: data.session.user.id, referred_id: data.session.user.id, referral_code: invite });
      }
      await refresh();
      setAuthGate({ open: false, mode: "login", warning: null });
      return null;
    },

    updateProfile: async (patch) => {
      if (!sessionRef.current?.user) return "Log in first.";
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", sessionRef.current.user.id);
      if (error) return error.message;
      await refresh();
      return null;
    },

    sendBroadcast: async (body) => {
      const text = body.trim();
      if (!text) return "Write an announcement first.";
      if (text.length > 500) return "Keep announcements under 500 characters.";
      // Retire older announcements so exactly one banner shows platform-wide.
      await supabase.from("broadcasts").update({ is_active: false }).eq("is_active", true);
      const { error } = await supabase
        .from("broadcasts")
        .insert({ body: text, created_by: sessionRef.current?.user.id ?? null });
      if (error) return error.message;
      await refresh();
      return null;
    },

    retireBroadcast: async (id) => {
      await supabase.from("broadcasts").update({ is_active: false }).eq("id", id);
      await refresh();
    },

    setUserFlags: async (userId, patch) => {
      await supabase.from("profiles").update(patch).eq("id", userId);
      // Verified badge mirrors onto that breeder's live listings.
      if (patch.is_verified_seller !== undefined) {
        await supabase
          .from("listings")
          .update({ is_verified_seller: patch.is_verified_seller })
          .eq("breeder_id", userId);
      }
      await refresh();
    },

    releaseUserFunds: async (userId) => {
      const held = db.transactions.filter(
        (t) => t.breeder_id === userId && t.status !== "Completed" && t.status !== "Refunded to Buyer",
      );
      for (const t of held) {
        await supabase
          .from("transactions")
          .update({ status: "Completed", dispute_status: "None" })
          .eq("id", t.id);
      }
      await refresh();
      return held.length;
    },

    logout: async () => {
      if (user) await supabase.from("profiles").update({ is_online: false }).eq("id", user.id);
      await supabase.auth.signOut();
      setAdminUnlocked(false);
    },

    adminUnlocked,
    unlockAdmin: async (pwd) => {
      // Verified server-side; on success the account is granted the admin role
      // in the database, and RLS — not the browser — enforces every admin power.
      try {
        const { ok } = await unlockAdminConsole({ data: { password: pwd } });
        setAdminUnlocked(ok);
        if (ok) await refresh();
        return ok;
      } catch {
        setAdminUnlocked(false);
        return false;
      }
    },
    masterUnlock: async (pwd) => {
      // Works from any state. When already signed in, the master password upgrades
      // that account; otherwise the server mints a one-time token for the dedicated
      // Super Admin account and the browser exchanges it for a real session.
      try {
        if (session) {
          const { ok } = await unlockAdminConsole({ data: { password: pwd } });
          setAdminUnlocked(ok);
          if (ok) await refresh();
          return ok;
        }
        const res = await superAdminLogin({ data: { password: pwd } });
        if (!res.ok) return false;
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: res.tokenHash,
        });
        if (error) return false;
        setAdminUnlocked(true);
        await refresh();
        return true;
      } catch {
        setAdminUnlocked(false);
        return false;
      }
    },
    lockAdmin: () => {
      setAdminUnlocked(false);
      void lockAdminConsole()
        .then(() => refresh())
        .catch(() => undefined);
    },

    addListing: async (input) => {
      if (!user) return;
      const created = Date.now();
      await supabase.from("listings").insert({
        category_type: input.category_type,
        breeder_id: user.id,
        breeder_handle: user.public_handle,
        custom_bird_name: input.custom_bird_name,
        breed_type: input.breed_type,
        gender: input.gender,
        price_ngn: input.price_ngn,
        images: input.images,
        pedigree_json: input.pedigree_json as never,
        vaccinated: input.vaccinated,
        state: input.state,
        description: input.description,
        batch_quantity: input.batch_quantity,
        is_active: true,
        creation_timestamp: new Date(created).toISOString(),
        expiry_date: new Date(created + LISTING_LIFESPAN_DAYS * DAY_MS).toISOString(),
      });
      await refresh();
    },

    deleteListing: async (id) => {
      await supabase.from("listings").delete().eq("id", id);
      await refresh();
    },

    setWhatsappAlertNumber: async (value) => {
      // Only accounts holding the admin role pass the database policy here.
      await supabase
        .from("app_settings")
        .update({ whatsapp_alert_number: value.replace(/[^0-9+]/g, "").slice(0, 20) })
        .eq("id", 1);
      await refresh();
    },

    setListingFlags: async (id, patch) => {
      await supabase.from("listings").update(patch).eq("id", id);
      await refresh();
    },

    applyReferral: async (code) => {
      if (!user) return "Log in first.";
      const clean = code.trim().toUpperCase();
      if (!clean) return "Enter a referral code.";
      if (clean === db.referral_code) return "You cannot refer yourself.";
      // The referrer is resolved server-side by a database trigger; the browser
      // never gets to read other people's profiles.
      const { error } = await supabase
        .from("referrals")
        .insert({ referrer_id: user.id, referred_id: user.id, referral_code: clean });
      if (error) {
        return error.message.includes("Unknown referral code")
          ? "That referral code does not exist."
          : "This account has already used a referral code.";
      }
      await refresh();
      return null;
    },

    setCommission: async (pct) => {
      await supabase.from("app_settings").update({ commission_pct: pct }).eq("id", 1);
      await refresh();
    },

    setListingOverride: async (id, pct) => {
      await supabase.from("listings").update({ commission_override: pct }).eq("id", id);
      await refresh();
    },

    commissionFor,

    buyListing: async (l) => {
      if (!user) return null;
      const pct = l.commission_override ?? db.commission_pct;
      const now = Date.now();
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          listing_id: l.id,
          listing_name: l.custom_bird_name,
          buyer_id: user.id,
          breeder_id: l.breeder_id || null,
          amount_naira: l.price_ngn,
          calculated_commission: Math.round((l.price_ngn * pct) / 100),
          delivery_marked_at: new Date(now).toISOString(),
          auto_release_at: new Date(now + AUTO_RELEASE_HOURS * 3600_000).toISOString(),
        })
        .select()
        .single();
      if (error || !data) return null;

      const passcode = makePasscode();
      await supabase
        .from("transaction_passcodes")
        .insert({ transaction_id: data.id, buyer_id: user.id, passcode });

      console.log(
        `[ESCROW] Funded ${data.id}. Commission earmarked for Admin OPay ${ADMIN_OPAY}. Pickup passcode issued to buyer only.`,
      );
      await refresh();
      return {
        id: data.id,
        listing_id: l.id,
        listing_name: l.custom_bird_name,
        buyer_id: user.id,
        breeder_id: l.breeder_id,
        amount_naira: l.price_ngn,
        calculated_commission: Math.round((l.price_ngn * pct) / 100),
        pickup_passcode: passcode,
        delivery_marked_at: now,
        auto_release_at: now + AUTO_RELEASE_HOURS * 3600_000,
        driver_phone: null,
        waybill_image_url: null,
        proof_file_name: null,
        dispute_status: "None",
        status: "Escrow Funded",
        created_at: now,
      };
    },

    confirmDelivery: (txId) => updateTx(txId, { status: "Completed", dispute_status: "None" }),

    reportDOA: (txId, fileName) =>
      updateTx(txId, {
        status: "Disputed",
        dispute_status: "Disputed: Dead on Arrival",
        proof_file_name: fileName,
      }),

    submitBreederProof: (txId, driverPhone, waybill) =>
      updateTx(txId, {
        status: "Disputed",
        dispute_status: "Under Review: Proof Submitted",
        driver_phone: driverPhone,
        waybill_image_url: waybill,
      }),

    adminRefund: (txId) => updateTx(txId, { status: "Refunded to Buyer", dispute_status: "None" }),
    adminRelease: (txId) => updateTx(txId, { status: "Completed", dispute_status: "None" }),

    bypassPasscode: (txId, code) => {
      const tx = db.transactions.find((t) => t.id === txId);
      return !!tx && tx.pickup_passcode.toUpperCase() === code.trim().toUpperCase();
    },

    banUser: async (userId) => {
      const target = db.users.find((u) => u.id === userId);
      // Rejected by the database unless this account really holds the admin role.
      await supabase
        .from("profiles")
        .update({ is_banned: !target?.is_banned })
        .eq("id", userId);
      await refresh();
    },

    sendMessage: async (listingId, toId, body) => {
      if (!user) return;
      const recipient = db.users.find((u) => u.id === toId);
      if (recipient && !recipient.is_online) {
        console.log(
          `[WEBHOOK → Termii/Arkesel SMS] POST /sms/send { to: "${recipient.phone_number}", text: "PigeonShield: you have a new escrow-protected inquiry. Log in to reply." }`,
        );
      }
      await supabase
        .from("messages")
        .insert({ listing_id: listingId, from_id: user.id, to_id: toId, body });
      await refresh();
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function reportToAdmin(reference: string) {
  const text = encodeURIComponent(
    `PigeonShield Nigeria — Scam / Issue Report\nReference: ${reference}\nPlease investigate this transaction or listing.`,
  );
  window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${text}`, "_blank");
}
