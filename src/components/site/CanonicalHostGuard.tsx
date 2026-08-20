import { useEffect, useState, type ReactNode } from "react";

import { enforceCanonicalHost, shouldRedirectToCanonical } from "@/lib/canonical-host";
import { SITE_URL } from "@/lib/site";

/**
 * Blocks rendering of stale cached content on old/staging *.lovable.app
 * subdomains and hard-redirects to the canonical address.
 */
export function CanonicalHostGuard({ children }: { children: ReactNode }) {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!shouldRedirectToCanonical()) return;
    setRedirecting(true);
    void enforceCanonicalHost();
  }, []);

  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-semibold text-foreground">
            Moving you to PigeonShield Nigeria…
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            This address is out of date. Redirecting to{" "}
            <a className="underline" href={SITE_URL}>
              {SITE_URL.replace("https://", "")}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
