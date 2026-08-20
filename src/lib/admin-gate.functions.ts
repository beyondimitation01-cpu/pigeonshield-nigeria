import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * God-Mode is a real, server-enforced role.
 *
 * The master password is only the *enrolment* factor: it is verified on the
 * server against a secret env var, and on success the signed-in user is granted
 * the `admin` role row in the database. Every privileged read/write is then
 * authorised by row-level security using that role — never by browser state.
 *
 * Flipping booleans in devtools grants nothing: the console re-verifies the role
 * against the database on every mount, and the database rejects admin writes
 * from accounts without the role.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

type UnlockResult = {
  ok: boolean;
  locked: boolean;
  attemptsLeft: number;
  retryAfterMs: number;
};

export const unlockAdminConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { password: string }) => {
    const password = typeof data?.password === "string" ? data.password : "";
    if (password.length === 0 || password.length > 200) throw new Error("Invalid password input");
    return { password };
  })
  .handler(async ({ data, context }): Promise<UnlockResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();

    // --- Brute-force lockout, tracked server-side (cannot be cleared from the browser)
    const { data: gate } = await supabaseAdmin
      .from("admin_login_attempts")
      .select("failed_count, locked_until")
      .eq("user_id", context.userId)
      .maybeSingle();

    const lockedUntil = gate?.locked_until ? new Date(gate.locked_until).getTime() : 0;
    if (lockedUntil > now) {
      return { ok: false, locked: true, attemptsLeft: 0, retryAfterMs: lockedUntil - now };
    }
    const priorFails = lockedUntil > 0 && lockedUntil <= now ? 0 : (gate?.failed_count ?? 0);

    // --- Isolated constant-time comparison against the server-only secret
    const expected = process.env["ADMIN_MASTER_PASSWORD"];
    let matched = false;
    if (expected) {
      const ha = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.password)),
      );
      const hb = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
      );
      let diff = ha.length ^ hb.length;
      for (let i = 0; i < ha.length; i += 1) diff |= (ha[i] ?? 0) ^ (hb[i] ?? 0);
      matched = diff === 0;
    }

    if (!matched) {
      const failed = priorFails + 1;
      const lock = failed >= MAX_ATTEMPTS;
      await supabaseAdmin.from("admin_login_attempts").upsert(
        {
          user_id: context.userId,
          failed_count: lock ? 0 : failed,
          locked_until: lock ? new Date(now + LOCKOUT_MS).toISOString() : null,
          updated_at: new Date(now).toISOString(),
        },
        { onConflict: "user_id" },
      );
      return {
        ok: false,
        locked: lock,
        attemptsLeft: lock ? 0 : MAX_ATTEMPTS - failed,
        retryAfterMs: lock ? LOCKOUT_MS : 0,
      };
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) return { ok: false, locked: false, attemptsLeft: MAX_ATTEMPTS, retryAfterMs: 0 };

    await supabaseAdmin.from("admin_login_attempts").upsert(
      {
        user_id: context.userId,
        failed_count: 0,
        locked_until: null,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "user_id" },
    );

    return { ok: true, locked: false, attemptsLeft: MAX_ATTEMPTS, retryAfterMs: 0 };
  });

/** Server-side truth for "is this account an admin". Cannot be faked from devtools. */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { unlocked: data === true };
  });

/** Remaining lockout, so the UI can show a countdown without trusting the client. */
export const getAdminLockout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_login_attempts")
      .select("locked_until")
      .eq("user_id", context.userId)
      .maybeSingle();
    const until = data?.locked_until ? new Date(data.locked_until).getTime() : 0;
    const retryAfterMs = Math.max(0, until - Date.now());
    return { locked: retryAfterMs > 0, retryAfterMs };
  });

/** Revokes the admin role for the current account. */
export const lockAdminConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", context.userId)
      .eq("role", "admin");
    return { ok: true as const };
  });
