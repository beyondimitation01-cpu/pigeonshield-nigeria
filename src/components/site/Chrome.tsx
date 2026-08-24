import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, LogOut, ShieldCheck, LayoutDashboard, Package } from "lucide-react";
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
import { ADMIN_OPAY } from "@/lib/pigeon-data";

const NAV_LINKS = [
  { to: "/", label: "Browse Marketplace" },
  { to: "/how-escrow-works", label: "How Escrow Works" },
  { to: "/breeder-dashboard", label: "Breeder Dashboard" },
  { to: "/my-orders", label: "My Orders" },
  { to: "/messages", label: "Messages" },
  { to: "/feedback", label: "Feedback" },
] as const;

export function Navbar() {
  const { isLoading, isAuthenticated } = useAuth();
  const { user, openAuth, logout } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    await navigate({ to: "/" });
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
          {isLoading ? (
            // Never guess: no session-dependent button until getSession() resolves.
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
              DOA refund protection and 2FA pickup verification.
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
