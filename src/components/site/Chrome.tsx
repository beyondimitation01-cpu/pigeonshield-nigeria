import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, LogOut, ShieldCheck, LayoutDashboard, Package, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/site/UserAvatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ADMIN_OPAY } from "@/lib/pigeon-data";

const NAV_LINKS = [
  { to: "/", label: "Browse Marketplace" },
  { to: "/how-escrow-works", label: "How Escrow Works" },
  { to: "/breeder-dashboard", label: "Breeder Dashboard" },
  { to: "/my-orders", label: "My Orders" },
  { to: "/messages", label: "Messages" },
  { to: "/feedback", label: "Feedback" },
] as const;

const NOTIFICATION_RETENTION_MS = 48 * 60 * 60 * 1000;

const notificationCopy: Record<string, { title: string; body: string }> = {
  payment_submitted: {
    title: "Payment submitted",
    body: "Your payment receipt was submitted successfully and is being reviewed.",
  },
  new_order: {
    title: "New order",
    body: "A buyer has purchased your product. Please review the order and continue with dispatch.",
  },
  payment_confirmed: {
    title: "Payment confirmed",
    body: "Payment has been confirmed. Open the order to continue with the next step.",
  },
  receipt_confirmation_required: {
    title: "Order dispatched",
    body: "Your order has been dispatched. Open the order when you are ready to confirm receipt.",
  },
  handover_in_progress: {
    title: "Order dispatched",
    body: "Your order is now in transit and the existing handover process can continue.",
  },
  receipt_confirmed: {
    title: "Receipt confirmed",
    body: "Your receipt confirmation was recorded. The transaction is now awaiting the existing admin payout step.",
  },
  payout_pending: {
    title: "Order ready for payout",
    body: "The buyer has completed receipt confirmation. Your transaction is awaiting the existing admin payout step.",
  },
  seller_paid: {
    title: "Payment sent",
    body: "Your payout for the completed order has been processed. Open the order to view its details.",
  },
  transaction_completed: {
    title: "Transaction completed",
    body: "Your transaction has been completed. Open the order to view its history.",
  },
  refund: {
    title: "Refund update",
    body: "A refund has affected this transaction. Open the order to review its status.",
  },
  payment_attention: {
    title: "Payment requires attention",
    body: "A payment or transaction issue affects this order. Open the order to review its status.",
  },
  seller_verification: {
    title: "Seller verification updated",
    body: "Your seller verification status has changed. Open your account to review the current status.",
  },
  admin_payment_review: {
    title: "Payment review required",
    body: "A new transaction requires payment review. Open the Admin Console to review it.",
  },
  admin_receipt_review: {
    title: "Payment receipt submitted",
    body: "A buyer has submitted a payment receipt. Open the Admin Console to review and confirm it.",
  },
  admin_transaction_advanced: {
    title: "Transaction advanced",
    body: "Payment has been confirmed. Review the transaction for any required administrative action.",
  },
  admin_payout_required: {
    title: "Seller payout required",
    body: "A transaction is ready for manual seller payout. Open the Admin Console to review and process it.",
  },
  admin_transaction_review: {
    title: "Transaction requires attention",
    body: "A payment or transaction issue requires administrative review. Open the Admin Console to review it.",
  },
  admin_dispute_review: {
    title: "Dispute requires review",
    body: "A transaction has entered the existing dispute workflow. Open the Admin Console to review it.",
  },
};

function getNotificationCopy(kind: string) {
  return notificationCopy[kind] ?? {
    title: kind === "message" ? "New message" : kind === "handover_pin_available" ? "Pickup verification PIN available" : "Marketplace update",
    body: kind === "message"
      ? "You received a new marketplace message."
      : kind === "handover_pin_available"
        ? "Your pickup verification PIN is now available. Open the order to view it and complete the existing handover process."
        : "Your order or transaction has an important update.",
  };
}

function isNotificationTaskUnresolved(notification: { kind: string; transaction_id?: string | null }, transaction: { status: string; payout_paid_at?: string | null; payout_paid_by?: string | null } | undefined) {
  if (!transaction) return true;

  switch (notification.kind) {
    case "admin_payment_review":
    case "admin_receipt_review":
      return transaction.status === "Pending Verification";
    case "admin_payout_required":
    case "payout_pending":
      return (
        (transaction.status === "Ready for Admin Payout" || transaction.status === "Delivered") &&
        !transaction.payout_paid_at &&
        !transaction.payout_paid_by
      );
    case "admin_transaction_review":
    case "payment_attention":
      return transaction.status === "Payment Error" || transaction.status === "Transaction Error";
    case "admin_dispute_review":
      return transaction.status === "Disputed";
    case "receipt_confirmation_required":
      return transaction.status === "In Transit";
    default:
      return false;
  }
}

export function Navbar() {
  const { isLoading, isAuthenticated } = useAuth();
  const { user, openAuth, logout, db, markNotificationRead } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const cleanupEligibleNotifications = async () => {
      const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_MS).toISOString();
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient_id", user.id)
        .not("read_at", "is", null)
        .lt("read_at", cutoff);
      if (error) console.warn("Notification retention cleanup failed:", error.message);
    };

    void cleanupEligibleNotifications();
    const interval = window.setInterval(() => void cleanupEligibleNotifications(), 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [user]);

  const activeNotifications = useMemo(() => {
    const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
    return db.notifications.filter((notification) => {
      if (!notification.read_at) return true;
      if (new Date(notification.read_at).getTime() >= cutoff) return true;
      const transaction = notification.transaction_id
        ? db.transactions.find((tx) => tx.id === notification.transaction_id)
        : undefined;
      return isNotificationTaskUnresolved(notification, transaction);
    });
  }, [db.notifications, db.transactions]);

  const notificationGroups = useMemo(() => {
    type NotificationItem = (typeof activeNotifications)[number];
    type NotificationGroup = { key: string; items: NotificationItem[]; isMessageGroup: boolean };

    const groups: NotificationGroup[] = [];
    const messageGroups = new Map<string, NotificationGroup>();

    for (const notification of activeNotifications) {
      const isMessage = notification.kind === "message" || Boolean(notification.message_id && notification.message_id !== "null");
      if (!isMessage) {
        groups.push({ key: `notification:${notification.id}`, items: [notification], isMessageGroup: false });
        continue;
      }

      const groupKey = notification.conversation_id
        ? `conversation:${notification.conversation_id}`
        : notification.listing_id
          ? `listing:${notification.listing_id}`
          : "messages:general";
      const existing = messageGroups.get(groupKey);
      if (existing) {
        existing.items.push(notification);
      } else {
        const group: NotificationGroup = { key: groupKey, items: [notification], isMessageGroup: true };
        messageGroups.set(groupKey, group);
        groups.push(group);
      }
    }

    return groups;
  }, [activeNotifications]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    await navigate({ to: "/" });
  };

  const handleNotificationSelect = async (items: typeof activeNotifications) => {
    const unreadItems = items.filter((item) => !item.read_at);
    if (unreadItems.length > 0) {
      const results = await Promise.allSettled(
        unreadItems.map((item) => markNotificationRead(item.id)),
      );
      if (results.some((result) => result.status === "rejected")) {
        toast.error("Some notification read states could not be saved. Please try again.");
      }
    }

    const notification = items[0];
    const isMessage = notification.kind === "message" || Boolean(notification.message_id && notification.message_id !== "null");
    const isAdminNotification = notification.kind.startsWith("admin_");

    if (isAdminNotification) {
      void navigate({ to: "/pigeon-boss-admin" });
    } else if (isMessage && notification.conversation_id) {
      void navigate({
        to: "/messages",
        search: { listing: undefined, conversation: notification.conversation_id },
      });
    } else if (isMessage && notification.listing_id) {
      void navigate({
        to: "/messages",
        search: { listing: notification.listing_id, conversation: undefined },
      });
    } else {
      void navigate({ to: "/my-orders" });
    }
  };

  const links = NAV_LINKS.map((l) => (
    <Link
      key={l.to}
      to={l.to}
      onClick={() => setOpen(false)}
      activeProps={{ className: "text-primary font-semibold" }}
      className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
    >
      {l.label}
    </Link>
  ));

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-primary">
          <ShieldCheck className="size-5" />
          <span>PigeonShield 🇳🇬</span>
        </Link>

        <div className="hidden items-center gap-6 lg:flex">{links}</div>

        <div className="flex items-center gap-2">
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
                  <Bell className="size-5" />
                  {db.notifications.some((n) => !n.read_at) && (
                    <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(92vw,24rem)] overflow-hidden p-0">
                <DropdownMenuLabel className="px-4 py-3">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notificationGroups.length === 0 ? (
                  <DropdownMenuItem disabled className="px-4 py-5 text-sm text-muted-foreground">
                    No notifications
                  </DropdownMenuItem>
                ) : (
                  <div className="max-h-[min(70vh,34rem)] overflow-y-auto">
                    {notificationGroups.map((group) => {
                      const notification = group.items[0];
                      const copy = getNotificationCopy(notification.kind);
                      const unreadCount = group.items.filter((item) => !item.read_at).length;
                      const totalCount = group.items.length;
                      const title = group.isMessageGroup
                        ? unreadCount > 0
                          ? `New messages · ${totalCount}`
                          : `Messages · ${totalCount}`
                        : copy.title;
                      const body = group.isMessageGroup
                        ? unreadCount > 0
                          ? `${unreadCount} unread marketplace message${unreadCount === 1 ? "" : "s"}.`
                          : `${totalCount} recent marketplace message${totalCount === 1 ? "" : "s"}.`
                        : copy.body;

                      return (
                        <DropdownMenuItem
                          key={group.key}
                          className="items-start gap-2 border-b border-border/60 px-4 py-3 last:border-b-0"
                          onSelect={() => void handleNotificationSelect(group.items)}
                        >
                          <div className="min-w-0">
                            <p className={unreadCount > 0 ? "font-semibold" : "font-medium"}>{title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{body}</p>
                            {unreadCount > 0 && (
                              <span className="mt-1 block text-[11px] text-primary">
                                {unreadCount} unread
                              </span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isLoading ? (
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted" aria-hidden />
          ) : isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  <UserAvatar url={user?.avatar_url ?? null} name={user?.real_name ?? user?.public_handle ?? ""} size={22} />
                  <span className="max-w-28 truncate">{user?.real_name || user?.public_handle || "My Account"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">
                  Signed in as {user?.real_name || user?.public_handle}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/breeder-dashboard" })}>
                  <LayoutDashboard className="size-4" /> My Account Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate({ to: "/my-orders" })}>
                  <Package className="size-4" /> My Orders
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut className="size-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" onClick={() => openAuth("login")}>
              Register / Log In
            </Button>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-6">
              <div className="mt-8 flex flex-col gap-5">{links}</div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  const navigate = useNavigate();
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function secretDot() {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => (clicks.current = 0), 2000);
    if (clicks.current >= 5) {
      clicks.current = 0;
      navigate({ to: "/pigeon-boss-admin" });
    }
  }

  return (
    <footer className="mt-16 border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-muted-foreground">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="font-bold text-primary">PigeonShield 🇳🇬</p>
            <p className="mt-2 max-w-sm">
              Nigeria's anonymous, escrow-protected livestock marketplace. Flagship pigeon trading with
              DOA refund protection and secure 4-digit pickup PIN handover.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-foreground">Platform</p>
            <div className="flex flex-col gap-1">
              <Link to="/" className="hover:text-primary">Browse Marketplace</Link>
              <Link to="/how-escrow-works" className="hover:text-primary">How Escrow Works</Link>
              <Link to="/breeder-dashboard" className="hover:text-primary">Breeder Dashboard</Link>
            <Link to="/feedback" className="hover:text-primary">Feedback &amp; Complaints</Link>
            </div>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-foreground">Support</p>
            <p>Escrow settlement partner: OPay {ADMIN_OPAY}</p>
            <p>Never move a deal off-platform — you lose all escrow rights.</p>
          </div>
        </div>
        <p className="mt-8 border-t border-border pt-6 text-xs">
          © {new Date().getFullYear()} PigeonShield Nigeria. All rights reserved
          <span
            role="button"
            tabIndex={-1}
            aria-hidden
            onClick={secretDot}
            className="cursor-default select-none px-0.5"
          >
            .
          </span>
        </p>
      </div>
    </footer>
  );
}
