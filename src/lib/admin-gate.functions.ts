import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUPER_ADMIN_EMAIL, timingSafeMatch } from "@/lib/admin-hash";

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

    if (!(await timingSafeMatch(data.password, expected))) return { ok: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) return { ok: false as const };
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

/**
 * Master-password-only Super Admin entry.
 *
 * No regular account required: the master password is verified on the server,
 * and only then does the server mint a one-time magic-link token for the
 * dedicated Super Admin account. The browser exchanges that token for a real
 * Supabase session, so every admin power is still authorised by RLS.
 */
export const superAdminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    const password = typeof data?.password === "string" ? data.password : "";
    if (password.length === 0 || password.length > 200) throw new Error("Invalid password input");
    return { password };
  })
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_MASTER_PASSWORD"];
    if (!expected) return { ok: false as const };
    if (!(await timingSafeMatch(data.password, expected))) return { ok: false as const };

    const email = SUPER_ADMIN_EMAIL;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { public_handle: "SuperAdmin", real_name: "Super Admin" },
    });
    let userId = created.data.user?.id ?? null;
    if (!userId) {
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      userId = list.data.users.find((u) => u.email === email)?.id ?? null;
    }
    if (!userId) return { ok: false as const };

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, public_handle: "SuperAdmin", real_name: "Super Admin" }, { onConflict: "id" });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data.properties?.hashed_token;
    if (!tokenHash) return { ok: false as const };
    return { ok: true as const, tokenHash, email };
  });
