import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * God-Mode is a real, server-enforced role.
 *
 * The master password is only the *enrolment* factor: it is verified on the
 * server against a secret env var, and on success the signed-in user is granted
 * the `admin` role row in the database. Every privileged read/write is then
 * authorised by row-level security using that role — never by browser state.
 */
export const unlockAdminConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { password: string }) => {
    const password = typeof data?.password === "string" ? data.password : "";
    if (password.length === 0 || password.length > 200) throw new Error("Invalid password input");
    return { password };
  })
  .handler(async ({ data, context }) => {
    const expected = process.env["ADMIN_MASTER_PASSWORD"];
    if (!expected) return { ok: false as const };

    const a = new TextEncoder().encode(data.password);
    const b = new TextEncoder().encode(expected);
    const ha = new Uint8Array(await crypto.subtle.digest("SHA-256", a));
    const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
    let diff = 0;
    for (let i = 0; i < ha.length; i += 1) diff |= (ha[i] ?? 0) ^ (hb[i] ?? 0);
    if (diff !== 0) return { ok: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) {
      console.error("[admin-gate] role grant failed", error);
      return { ok: false as const };
    }
    return { ok: true as const };
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
