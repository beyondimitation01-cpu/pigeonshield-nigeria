import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin-hash";

/**
 * God-Mode is a real, server-enforced role.
 *
 * The master password is only the *enrolment* factor: it is verified by the
 * Supabase RPC, and on success the signed-in user is granted the `admin` role
 * row in the database. Every privileged read/write is then
 * authorised by row-level security using that role — never by browser state.
 */


/** Server-side truth for "is this account an admin". Cannot be faked from devtools. */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Read as the caller: RLS lets a user see only their own role rows.
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { unlocked: !!data };

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
