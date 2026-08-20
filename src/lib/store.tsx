import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAdminSession, lockAdminConsole, unlockAdminConsole } from "@/lib/admin-gate.functions";
import {
  seedState,
  uid,
  makeHandle,
  makePasscode,
  AUTO_RELEASE_HOURS,
  LISTING_LIFESPAN_DAYS,
  DAY_MS,
  ADMIN_OPAY,
  ADMIN_WHATSAPP,
  type DBState,
  type Listing,
  type NigerianUser,
  type EscrowTransaction,
  type DisputeStatus,
} from "./pigeon-data";

const STORAGE_KEY = "pigeonshield_ng_state_v1";

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
  login: (email: string, password: string) => string | null;
  register: (input: {
    real_name: string;
    email: string;
    password: string;
    phone_number: string;
    home_state: string;
    bank_name: string;
    account_number: string;
  }) => string | null;
  logout: () => void;
  adminUnlocked: boolean;
  unlockAdmin: (pwd: string) => Promise<boolean>;
  lockAdmin: () => void;
  addListing: (input: NewListingInput) => void;
  deleteListing: (id: string) => void;
  setCommission: (pct: number) => void;
  setListingOverride: (id: string, pct: number | null) => void;
  commissionFor: (l: Listing) => number;
  buyListing: (l: Listing) => EscrowTransaction | null;
  confirmDelivery: (txId: string) => void;
  reportDOA: (txId: string, fileName: string) => void;
  submitBreederProof: (txId: string, driverPhone: string, waybill: string) => void;
  adminRefund: (txId: string) => void;
  adminRelease: (txId: string) => void;
  bypassPasscode: (txId: string, code: string) => boolean;
  banUser: (userId: string) => void;
  sendMessage: (listingId: string, toId: string, body: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function load(): DBState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...seedState(), ...(JSON.parse(raw) as DBState) };
  } catch {
    /* ignore corrupt storage */
  }
  return seedState();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DBState>(() => seedState());
  const [hydrated, setHydrated] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [authGate, setAuthGate] = useState<AuthGate>({
    open: false,
    mode: "login",
    warning: null,
  });

  // Persistent session: restore on mount so hard refreshes never log the user out.
  useEffect(() => {
    setDb(load());
    void getAdminSession().then((r) => setAdminUnlocked(r.unlocked));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [db, hydrated]);

  // Static (non-polling) safety-net sweep: runs on mount and on every state action.
  const sweep = useCallback((state: DBState): DBState => {
    const now = Date.now();
    let changed = false;
    const transactions = state.transactions.map((t) => {
      if (t.status === "Escrow Funded" && t.dispute_status === "None" && t.auto_release_at <= now) {
        changed = true;
        console.log(
          `[AUTO-RELEASE] 48h window elapsed for ${t.id}. Releasing ${t.amount_naira - t.calculated_commission} to breeder. Commission ${t.calculated_commission} routed to Admin OPay ${ADMIN_OPAY}.`,
        );
        return { ...t, status: "Completed" as const };
      }
      return t;
    });
    const listings = state.listings.map((l) => {
      if (l.is_active && (l.expiry_date <= now || l.batch_quantity <= 0)) {
        changed = true;
        return { ...l, is_active: false };
      }
      return l;
    });
    return changed ? { ...state, transactions, listings } : state;
  }, []);

  useEffect(() => {
    if (hydrated) setDb((s) => sweep(s));
  }, [hydrated, sweep]);

  const update = useCallback(
    (fn: (s: DBState) => DBState) => setDb((s) => sweep(fn(s))),
    [sweep],
  );

  const user = useMemo(
    () => db.users.find((u) => u.id === db.current_user_id) ?? null,
    [db.users, db.current_user_id],
  );

  const commissionFor = useCallback(
    (l: Listing) => (l.commission_override ?? db.commission_pct),
    [db.commission_pct],
  );

  const value: StoreValue = {
    db,
    user,
    isAuthed: !!user,
    authGate,
    openAuth: (mode = "login", warning = null) => setAuthGate({ open: true, mode, warning }),
    closeAuth: () => setAuthGate((g) => ({ ...g, open: false, warning: null })),
    login: (email, password) => {
      const found = db.users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
      );
      if (!found) return "No account matches that email and password.";
      if (found.is_banned) return "This account has been suspended by the administrator.";
      update((s) => ({
        ...s,
        current_user_id: found.id,
        jwt: `mock.jwt.${btoa(found.id)}.${Date.now()}`,
        users: s.users.map((u) => (u.id === found.id ? { ...u, is_online: true } : u)),
      }));
      setAuthGate({ open: false, mode: "login", warning: null });
      return null;
    },
    register: (input) => {
      if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase()))
        return "An account already exists with that email.";
      const newUser: NigerianUser = {
        id: uid("usr"),
        real_name: input.real_name,
        email: input.email.trim(),
        password: input.password,
        phone_number: input.phone_number,
        public_handle: makeHandle(),
        home_state: input.home_state,
        bank_name: input.bank_name,
        account_number: input.account_number,
        is_online: true,
        is_banned: false,
        created_at: Date.now(),
      };
      update((s) => ({
        ...s,
        users: [...s.users, newUser],
        current_user_id: newUser.id,
        jwt: `mock.jwt.${btoa(newUser.id)}.${Date.now()}`,
      }));
      setAuthGate({ open: false, mode: "login", warning: null });
      return null;
    },
    logout: () => {
      update((s) => ({
        ...s,
        users: s.users.map((u) =>
          u.id === s.current_user_id ? { ...u, is_online: false } : u,
        ),
        current_user_id: null,
        jwt: null,
      }));
    },
    adminUnlocked,
    unlockAdmin: async (pwd) => {
      // Verified server-side against a secret env var; the password is never in the bundle.
      try {
        const { ok } = await unlockAdminConsole({ data: { password: pwd } });
        setAdminUnlocked(ok);
        return ok;
      } catch {
        setAdminUnlocked(false);
        return false;
      }
    },
    lockAdmin: () => {
      setAdminUnlocked(false);
      void lockAdminConsole();
    },
    addListing: (input) => {
      if (!user) return;
      const created = Date.now();
      const listing: Listing = {
        ...input,
        id: uid("lst"),
        breeder_id: user.id,
        breeder_handle: user.public_handle,
        commission_override: null,
        is_active: true,
        creation_timestamp: created,
        expiry_date: created + LISTING_LIFESPAN_DAYS * DAY_MS,
      };
      update((s) => ({ ...s, listings: [listing, ...s.listings] }));
    },
    deleteListing: (id) =>
      update((s) => ({ ...s, listings: s.listings.filter((l) => l.id !== id) })),
    setCommission: (pct) => {
      console.log(`[ADMIN] Global commission set to ${pct}% — payouts route to OPay ${ADMIN_OPAY}`);
      update((s) => ({ ...s, commission_pct: pct }));
    },
    setListingOverride: (id, pct) =>
      update((s) => ({
        ...s,
        listings: s.listings.map((l) => (l.id === id ? { ...l, commission_override: pct } : l)),
      })),
    commissionFor,
    buyListing: (l) => {
      if (!user) return null;
      const pct = l.commission_override ?? db.commission_pct;
      const now = Date.now();
      const tx: EscrowTransaction = {
        id: uid("txn"),
        listing_id: l.id,
        listing_name: l.custom_bird_name,
        buyer_id: user.id,
        breeder_id: l.breeder_id,
        amount_naira: l.price_ngn,
        calculated_commission: Math.round((l.price_ngn * pct) / 100),
        pickup_passcode: makePasscode(),
        delivery_marked_at: now,
        auto_release_at: now + AUTO_RELEASE_HOURS * 3600_000,
        driver_phone: null,
        waybill_image_url: null,
        proof_file_name: null,
        dispute_status: "None",
        status: "Escrow Funded",
        created_at: now,
      };
      console.log(
        `[ESCROW] Funded ${tx.id}. Commission ${tx.calculated_commission} earmarked for Admin OPay ${ADMIN_OPAY}. Pickup passcode issued to buyer only.`,
      );
      update((s) => ({
        ...s,
        transactions: [tx, ...s.transactions],
        listings: s.listings.map((x) =>
          x.id === l.id
            ? {
                ...x,
                batch_quantity: x.batch_quantity - 1,
                is_active: x.batch_quantity - 1 > 0,
              }
            : x,
        ),
      }));
      return tx;
    },
    confirmDelivery: (txId) =>
      update((s) => ({
        ...s,
        transactions: s.transactions.map((t) =>
          t.id === txId ? { ...t, status: "Completed", dispute_status: "None" } : t,
        ),
      })),
    reportDOA: (txId, fileName) => {
      console.log(`[DISPUTE] DOA reported on ${txId}. Auto-release clock halted. Proof: ${fileName}`);
      update((s) => ({
        ...s,
        transactions: s.transactions.map((t) =>
          t.id === txId
            ? {
                ...t,
                status: "Disputed",
                dispute_status: "Disputed: Dead on Arrival" as DisputeStatus,
                proof_file_name: fileName,
              }
            : t,
        ),
      }));
    },
    submitBreederProof: (txId, driverPhone, waybill) => {
      console.log(`[DISPUTE] Breeder proof submitted for ${txId}. Driver: ${driverPhone}`);
      update((s) => ({
        ...s,
        transactions: s.transactions.map((t) =>
          t.id === txId
            ? {
                ...t,
                status: "Disputed",
                dispute_status: "Under Review: Proof Submitted" as DisputeStatus,
                driver_phone: driverPhone,
                waybill_image_url: waybill,
              }
            : t,
        ),
      }));
    },
    adminRefund: (txId) => {
      console.log(`[ADMIN OVERRIDE] 100% buyer refund approved for ${txId}.`);
      update((s) => ({
        ...s,
        transactions: s.transactions.map((t) =>
          t.id === txId ? { ...t, status: "Refunded to Buyer", dispute_status: "None" } : t,
        ),
      }));
    },
    adminRelease: (txId) => {
      console.log(`[ADMIN OVERRIDE] Forced payout release for ${txId} → commission to OPay ${ADMIN_OPAY}.`);
      update((s) => ({
        ...s,
        transactions: s.transactions.map((t) =>
          t.id === txId ? { ...t, status: "Completed", dispute_status: "None" } : t,
        ),
      }));
    },
    bypassPasscode: (txId, code) => {
      const tx = db.transactions.find((t) => t.id === txId);
      const ok = !!tx && tx.pickup_passcode.toUpperCase() === code.trim().toUpperCase();
      console.log(`[ADMIN 2FA BYPASS] ${txId} passcode check → ${ok ? "MATCH" : "MISMATCH"}`);
      return ok;
    },
    banUser: (userId) =>
      update((s) => ({
        ...s,
        users: s.users.map((u) => (u.id === userId ? { ...u, is_banned: !u.is_banned } : u)),
        current_user_id: s.current_user_id === userId ? null : s.current_user_id,
      })),
    sendMessage: (listingId, toId, body) => {
      if (!user) return;
      const recipient = db.users.find((u) => u.id === toId);
      if (recipient && !recipient.is_online) {
        console.log(
          `[WEBHOOK → Termii/Arkesel SMS] POST /sms/send { to: "${recipient.phone_number}", text: "PigeonShield: you have a new escrow-protected inquiry. Log in to reply." }`,
        );
      }
      update((s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: uid("msg"), listing_id: listingId, from_id: user.id, to_id: toId, body, created_at: Date.now() },
        ],
      }));
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
