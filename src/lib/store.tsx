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
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { getAdminSession, lockAdminConsole } from "@/lib/admin-gate.functions";
import {
  makeHandle,
  makeOrderReference,
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
  type MessageNotification,
  type ChatConversation,
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
  /** False until the initial Supabase getSession() check has resolved. */
  authReady: boolean;
  authGate: AuthGate;
  openAuth: (mode?: "login" | "register", warning?: string | null) => void;
  closeAuth: () => void;
  login: (email: string, password: string) => Promise<string | null>;
  register: (input: {
    real_name: string;
    loft_name?: string;
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
    public_handle?: string;
    loft_name?: string;
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
  masterUnlock: (pwd: string) => Promise<boolean>;
  lockAdmin: () => void;
  addListing: (input: NewListingInput) => Promise<void>;
  deleteListing: (id: string) => Promise<void>;
  setCommission: (pct: number) => Promise<void>;
  setWhatsappAlertNumber: (value: string) => Promise<void>;
  setListingFlags: (
    id: string,
    patch: {
      is_featured?: boolean;
      is_verified_seller?: boolean;
      is_active?: boolean;
      custom_bird_name?: string;
      breed_type?: string;
      price_ngn?: number;
      batch_quantity?: number;
      state?: string;
      category_type?: Category;
      description?: string;
      images?: string[];
    },
  ) => Promise<void>;
  /** Persists a new photo set for a listing (owner in their dashboard, or an admin). */
  setListingImages: (id: string, images: string[]) => Promise<string | null>;
  submitFeedback: (input: {
    name: string;
    contact: string;
    category: string;
    rating: number;
    message: string;
  }) => Promise<string | null>;
  setFeedbackStatus: (id: string, status: "Pending" | "Resolved") => Promise<void>;
  deleteFeedback: (id: string) => Promise<void>;
  verifyPayment: (txId: string) => Promise<void>;

  applyReferral: (code: string) => Promise<string | null>;
  setListingOverride: (id: string, pct: number | null) => Promise<void>;
  commissionFor: (l: Listing) => number;
  buyListing: (
    l: Listing,
    payment: { reference: string; receiptUrl: string },
  ) => Promise<EscrowTransaction | null>;
  dispatchOrder: (txId: string) => Promise<string>;
  confirmReceiptAndRevealPin: (txId: string) => Promise<string>;
  reportDOA: (txId: string, fileName: string) => Promise<void>;
  submitBreederProof: (txId: string, driverPhone: string, waybill: string) => Promise<void>;
  adminRefund: (txId: string) => Promise<void>;
  adminRelease: (txId: string) => Promise<void>;
  forceMarkDelivered: (txId: string) => Promise<void>;
  banUser: (userId: string) => Promise<void>;
  sendMessage: (listingId: string | null, toId: string, body: string) => Promise<string>;
  markMessagesRead: (listingId: string, otherId: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  getOrCreateConversation: (otherId: string) => Promise<string>;
  sendConversationMessage: (conversationId: string, listingId: string | null, toId: string, body: string) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
}

/**
 * Kept on globalThis so a hot-reloaded duplicate of this module still shares
 * one context instance — otherwise the Navbar reads a different context than
 * the provider writes and SSR throws "useStore must be used inside StoreProvider".
 */
const globalStore = globalThis as typeof globalThis & {
  __pigeonshieldStoreContext?: React.Context<StoreValue | null>;
};
const StoreContext =
  globalStore.__pigeonshieldStoreContext ??
  (globalStore.__pigeonshieldStoreContext = createContext<StoreValue | null>(null));

const EMPTY: DBState = {
  users: [],
  listings: [],
  transactions: [],
  messages: [],
  notifications: [],
  conversations: [],
  sellers: {},
  referrals: [],
  feedback: [],
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
  const { session: authSession, isLoading: authLoading } = useAuth();
  const [db, setDb] = useState<DBState>(EMPTY);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [authGate, setAuthGate] = useState<AuthGate>({
    open: false,
    mode: "login",
    warning: null,
  });
  const sessionRef = useRef<Session | null>(null);
  const refreshRevision = useRef(0);
  const notifiedMessageIds = useRef(new Set<string>());
  sessionRef.current = authSession;

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
      public_handle: meta["real_name"] || meta["public_handle"] || makeHandle(),
      loft_name: meta["loft_name"] ?? "",
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
    const requestRevision = ++refreshRevision.current;
    const uid = sessionRef.current?.user.id ?? null;

    const [settings, listings, profiles, txs, msgs, notifications, conversations, credits, sellers, announcements, referrals, feedback] = await Promise.all([
      supabase.from("app_settings").select("commission_pct, whatsapp_alert_number").eq("id", 1).maybeSingle(),
      supabase
        .from("listings")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("is_verified_seller", { ascending: false })
        .order("creation_timestamp", { ascending: false }),
      uid ? supabase.from("profiles").select("*") : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("transactions").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("messages").select("*").order("created_at", { ascending: true }) : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("notifications").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
      uid ? supabase.from("conversations").select("*").order("updated_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
      uid
        ? supabase.from("referral_credit_totals").select("*").eq("referrer_id", uid).maybeSingle()
        : Promise.resolve({ data: null as { total_credits: number | null; referred_count: number | null } | null }),
      // phone_number is intentionally excluded: it is not publicly readable and
      // is fetched on demand by signed-in users via the get_seller_phone RPC.
      supabase
        .from("public_profiles")
        .select("id, public_handle, full_name, loft_name, avatar_url, is_verified_seller, is_online"),
      supabase
        .from("broadcasts")
        .select("id, body, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1),
      uid ? supabase.from("referrals").select("*") : Promise.resolve({ data: [] as never[] }),
      uid
        ? supabase.from("app_feedback").select("*").order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const sellerMap: Record<string, PublicSeller> = {};
    for (const row of (sellers.data ?? []) as Record<string, unknown>[]) {
      sellerMap[String(row["id"])] = {
        id: String(row["id"]),
        public_handle: String(row["public_handle"] ?? ""),
        full_name: String(row["full_name"] ?? ""),
        loft_name: String(row["loft_name"] ?? ""),
        phone_number: String(row["phone_number"] ?? ""),
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

    const myProfile = ((profiles.data ?? []) as Record<string, unknown>[]).find(
      (p) => String(p["id"]) === uid,
    );

    // Route changes and auth events can overlap public and authenticated
    // refreshes. Only the newest request may commit, otherwise a slower guest
    // response can erase the signed-in profile after login.
    if (requestRevision !== refreshRevision.current) return;

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
        loft_name: String(p["loft_name"] ?? ""),
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
        is_mock: l["is_mock"] === true,
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
        verification_pin: (t["verification_pin"] as string | null) ?? null,
        delivery_marked_at: ms(String(t["delivery_marked_at"])),
        auto_release_at: ms(String(t["auto_release_at"])),
        driver_phone: (t["driver_phone"] as string | null) ?? null,
        waybill_image_url: (t["waybill_image_url"] as string | null) ?? null,
        proof_file_name: (t["proof_file_name"] as string | null) ?? null,
        dispute_status: String(t["dispute_status"]) as DisputeStatus,
        status: String(t["status"]) as TxStatus,
        payment_reference: (t["payment_reference"] as string | null) ?? null,
        receipt_url: (t["receipt_url"] as string | null) ?? null,
        receipt_uploaded_at: t["receipt_uploaded_at"] ? ms(String(t["receipt_uploaded_at"])) : null,
        created_at: ms(String(t["created_at"])),
      })),
      feedback: ((feedback.data ?? []) as Record<string, unknown>[]).map((f) => ({
        id: String(f["id"]),
        user_id: f["user_id"] ? String(f["user_id"]) : null,
        name: String(f["name"] ?? ""),
        contact: String(f["contact"] ?? ""),
        category: String(f["category"] ?? ""),
        rating: Number(f["rating"] ?? 0),
        message: String(f["message"] ?? ""),
        status: String(f["status"] ?? "Pending"),
        created_at: ms(String(f["created_at"])),
      })),
      messages: ((msgs.data ?? []) as Record<string, unknown>[]).map((m) => ({
        id: String(m["id"]),
        listing_id: m["listing_id"] ? String(m["listing_id"]) : null,
        from_id: String(m["from_id"]),
        to_id: String(m["to_id"]),
        conversation_id: String(m["conversation_id"]),
        body: String(m["body"] ?? ""),
        created_at: ms(String(m["created_at"])),
        read_at: m["read_at"] ? ms(String(m["read_at"])) : null,
      })),
      notifications: ((notifications.data ?? []) as Record<string, unknown>[]).map((n) => ({
        id: String(n["id"]),
        recipient_id: String(n["recipient_id"]),
        message_id: String(n["message_id"]),
        listing_id: n["listing_id"] ? String(n["listing_id"]) : null,
        conversation_id: String(n["conversation_id"]),
        kind: String(n["kind"] ?? "message"),
        created_at: ms(String(n["created_at"])),
        read_at: n["read_at"] ? ms(String(n["read_at"])) : null,
      })) as MessageNotification[],
      conversations: ((conversations.data ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c["id"]),
        participant_a: String(c["participant_a"]),
        participant_b: String(c["participant_b"]),
        created_at: ms(String(c["created_at"])),
        updated_at: ms(String(c["updated_at"])),
      })) as ChatConversation[],
    });
  }, []);

  // Sync store data whenever the canonical AuthContext session changes.
  useEffect(() => {
    if (authSession) {
      void ensureProfile().then(refresh);
      void getAdminSession()
        .then((r) => setAdminUnlocked(r.unlocked))
        .catch(() => setAdminUnlocked(false));
    } else {
      setAdminUnlocked(false);
      void refresh();
    }

    // Live sync: any listing inserted/updated/deleted by any user shows up
    // instantly (home feed and the admin console read the same state).
    const channel = supabase
      .channel(`account-live-${authSession?.user.id ?? "guest"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        void refresh();
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${authSession?.user.id ?? "00000000-0000-0000-0000-000000000000"}`,
        },
        (payload) => {
          const notification = payload.new as {
            message_id?: string;
            listing_id?: string | null;
            conversation_id?: string | null;
          };
          if (notification.message_id && !notifiedMessageIds.current.has(notification.message_id)) {
            notifiedMessageIds.current.add(notification.message_id);
            toast("New message", {
              description: "You received a new marketplace message.",
              action: notification.conversation_id
                ? { label: "Open", onClick: () => window.location.assign(`/messages?conversation=${notification.conversation_id}`) }
                : undefined,
            });
          }
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authSession, refresh, ensureProfile]);


  const user = useMemo(() => {
    const persistedProfile = db.users.find((candidate) => candidate.id === db.current_user_id);
    if (persistedProfile) return persistedProfile;

    // Auth is the source of truth for whether someone is signed in. Profile
    // hydration is a separate request and must not make protected routes treat
    // an authenticated user as a guest while that request is pending or fails.
    const authUser = authSession?.user;
    if (!authUser) return null;
    const meta = (authUser.user_metadata ?? {}) as Record<string, string>;
    return {
      id: authUser.id,
      real_name: meta["real_name"] ?? "",
      email: authUser.email ?? "",
      password: "",
      phone_number: meta["phone_number"] ?? "",
      public_handle: meta["real_name"] || (meta["public_handle"] ?? authUser.email?.split("@")[0] ?? "Member"),
      loft_name: meta["loft_name"] ?? "",
      home_state: meta["home_state"] ?? "",
      bank_name: meta["bank_name"] ?? "",
      account_number: meta["account_number"] ?? "",
      is_online: true,
      is_banned: false,
      avatar_url: meta["avatar_url"] ?? "",
      is_verified_seller: false,
      is_frozen: false,
      escrow_paused: false,
      created_at: authUser.created_at ? new Date(authUser.created_at).getTime() : Date.now(),
    };
  }, [authSession, db.users, db.current_user_id]);

  const commissionFor = useCallback(
    (l: Listing) => l.commission_override ?? db.commission_pct,
    [db.commission_pct],
  );

  const updateTx = useCallback(
    async (txId: string, patch: Record<string, string | null>) => {
      const { error } = await supabase.from("transactions").update(patch as never).eq("id", txId);
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh],
  );

  const value: StoreValue = {
    db,
    user,
    isAuthed: !!authSession && !!user,
    authReady: !authLoading,
    authGate,
    openAuth: (mode = "login", warning = null) => setAuthGate({ open: true, mode, warning }),
    closeAuth: () => setAuthGate((g) => ({ ...g, open: false, warning: null })),

    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          return "Please confirm your email address first, then log in again.";
        }
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          return "No account matches that email and password.";
        }
        return error.message;
      }
      if (data.session) {
        sessionRef.current = data.session;
      }
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
            public_handle: input.real_name.trim() || makeHandle(),
            loft_name: input.loft_name ?? "",
            home_state: input.home_state,
            bank_name: input.bank_name,
            account_number: input.account_number,
            avatar_url: input.avatar_url ?? "",
          },
        },
      });
      if (error) return error.message;
      // Supabase may require email confirmation before issuing a session.
      // Do not tell the user to log in until confirmation has completed.
      if (!data.session) {
        return "Account created. Please check your email and confirm your address before logging in.";
      }
      sessionRef.current = data.session;
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
        (t) => t.breeder_id === userId && t.status !== "Delivered" && t.status !== "Completed" && t.status !== "Refunded to Buyer",
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
      if (user) {
        await supabase.from("profiles").update({ is_online: false }).eq("id", user.id);
      }
      try {
        await supabase.auth.signOut();
      } catch {
        // Already signed out / network hiccup: still clear local state below.
      }
      // Reset the UI to guest mode immediately, without waiting for a refetch.
      sessionRef.current = null;
      setAdminUnlocked(false);
      setAuthGate({ open: false, mode: "login", warning: null });
      setDb((prev) => ({ ...prev, current_user_id: null }));
      void refresh();
    },

    adminUnlocked,
    masterUnlock: async (pwd) => {
      // The server-side edge function repeats the same RPC verification before
      // minting a real Supabase session for the dedicated Super Admin account.
      try {
        const { data, error } = await supabase.functions.invoke("super-admin-login", {
          body: { password: pwd },
        });
        if (error || !data?.ok || !data.tokenHash) {
          setAdminUnlocked(false);
          return false;
        }
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: data.tokenHash,
        });
        if (otpError) {
          setAdminUnlocked(false);
          return false;
        }
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
      if (!user) throw new Error("You must be signed in to publish a listing.");
      const created = Date.now();
      const { error } = await supabase.from("listings").insert({
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
      // Surfacing the failure keeps a rejected listing from looking published.
      if (error) throw new Error(error.message);
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

    setListingImages: async (id, images) => {
      const { error } = await supabase.from("listings").update({ images }).eq("id", id);
      if (error) return error.message;
      await refresh();
      return null;
    },

    submitFeedback: async (input) => {
      const message = input.message.trim();
      if (!message) return "Write your message first.";
      const { error } = await supabase.from("app_feedback").insert({
        user_id: sessionRef.current?.user.id ?? null,
        name: input.name.trim(),
        contact: input.contact.trim(),
        category: input.category,
        rating: Math.min(5, Math.max(1, Math.round(input.rating))),
        message,
      });
      if (error) return error.message;
      await refresh();
      return null;
    },

    setFeedbackStatus: async (id, status) => {
      await supabase.from("app_feedback").update({ status }).eq("id", id);
      await refresh();
    },

    deleteFeedback: async (id) => {
      await supabase.from("app_feedback").delete().eq("id", id);
      await refresh();
    },

    verifyPayment: async (txId) => {
      const { error } = await supabase
        .from("transactions")
        .update({ status: "Escrow Funded" })
        .eq("id", txId);
      if (error) throw new Error(error.message);
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

    buyListing: async (l, payment) => {
      if (!user) return null;
      if (user.id === l.breeder_id) throw new Error("You cannot message or buy your own product");
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
          status: "Pending Verification",
          payment_reference: payment.reference || makeOrderReference(),
          receipt_url: payment.receiptUrl,
          receipt_uploaded_at: new Date(now).toISOString(),
        })
        .select()
        .single();
      if (error || !data) return null;

      console.log(
        `[ESCROW] Funded ${data.id}. Commission earmarked for Admin OPay ${ADMIN_OPAY}.`,
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
        verification_pin: null,
        delivery_marked_at: now,
        auto_release_at: now + AUTO_RELEASE_HOURS * 3600_000,
        driver_phone: null,
        waybill_image_url: null,
        proof_file_name: null,
        dispute_status: "None",
        status: "Pending Verification",
        payment_reference: payment.reference,
        receipt_url: payment.receiptUrl,
        receipt_uploaded_at: now,
        created_at: now,
      };
    },

    dispatchOrder: async (txId) => {
      const { data, error } = await supabase.rpc("dispatch_transaction", { _transaction_id: txId });
      if (error || typeof data !== "string") throw new Error(error?.message ?? "Could not dispatch order.");
      await refresh();
      return data;
    },

    confirmReceiptAndRevealPin: async (txId) => {
      const { data, error } = await supabase.rpc("confirm_receipt_and_reveal_pin", { _transaction_id: txId });
      if (error || typeof data !== "string") throw new Error(error?.message ?? "Could not confirm receipt.");
      await refresh();
      return data;
    },

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
    forceMarkDelivered: async (txId) => {
      const { error } = await supabase.rpc("force_mark_delivered", { _transaction_id: txId });
      if (error) throw new Error(error.message);
      await refresh();
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
      if (!user) throw new Error("You must be signed in to send a message.");
      if (user.id === db.listings.find((l) => l.id === listingId)?.breeder_id) throw new Error("You cannot message or buy your own product");
      const { data: conversationId, error: conversationError } = await supabase.rpc("get_or_create_conversation", { _other_id: toId });
      if (conversationError || !conversationId) throw new Error(conversationError?.message ?? "Could not open conversation.");
      const { error } = await supabase.rpc("send_message", {
        _conversation_id: conversationId,
        // The DB function parameter is typed uuid (nullable), so null is accepted at runtime.
        _listing_id: listingId as string,
        _to_id: toId,
        _body: body,
      });
      if (error) throw new Error(error.message);
      await refresh();
      return conversationId;
    },
    getOrCreateConversation: async (otherId) => {
      const { data, error } = await supabase.rpc("get_or_create_conversation", { _other_id: otherId });
      if (error || !data) throw new Error(error?.message ?? "Could not open conversation.");
      return data;
    },
    sendConversationMessage: async (conversationId, listingId, toId, body) => {
      const { error } = await supabase.rpc("send_message", {
        _conversation_id: conversationId,
        // The DB function parameter is typed uuid (nullable), so null is accepted at runtime.
        _listing_id: listingId as string,
        _to_id: toId,
        _body: body,
      });
      if (error) throw new Error(error.message);
      await refresh();
    },
    markMessagesRead: async (listingId, otherId) => {
      const { error } = await supabase.rpc("mark_messages_read", { _listing_id: listingId, _other_id: otherId });
      if (error) throw new Error(error.message);
      await refresh();
    },
    markConversationRead: async (conversationId) => {
      const { error } = await supabase.rpc("mark_conversation_read", { _conversation_id: conversationId });
      if (error) throw new Error(error.message);
      await refresh();
    },
    markNotificationRead: async (id) => {
      const { error } = await supabase.rpc("mark_notification_read", { _notification_id: id });
      if (error) throw new Error(error.message);
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
