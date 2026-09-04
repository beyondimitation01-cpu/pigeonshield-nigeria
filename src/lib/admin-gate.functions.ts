import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Server-side truth for whether the current auth identity has an active admin session. */
export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) return { unlocked: false };

    const client = context.supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: { expires_at: string; last_activity_at: string } | null }>;
          };
        };
      };
    };
    const { data: session } = await client
      .from("admin_sessions")
      .select("expires_at, last_activity_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const now = Date.now();
    const active = !!session
      && new Date(session.expires_at).getTime() > now
      && new Date(session.last_activity_at).getTime() > now - 10 * 60 * 1000;
    return { unlocked: active };
  });

/** Refreshes the server-enforced 10-minute inactivity window. */
export const touchAdminSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase.rpc as unknown as
      (name: string) => Promise<{ data: boolean | null; error: unknown }>)
      ("touch_admin_session");
    return !error && data === true;
  });

/** Revokes the temporary admin session and admin role for the current auth identity. */
export const lockAdminConsole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminClient = supabaseAdmin as unknown as {
      from: (table: string) => {
        delete: () => {
          eq: (column: string, value: string) => Promise<unknown>;
        };
      };
    };
    await adminClient.from("admin_sessions").delete().eq("user_id", context.userId);
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", context.userId)
      .eq("role", "admin");
    return { ok: true as const };
  });
