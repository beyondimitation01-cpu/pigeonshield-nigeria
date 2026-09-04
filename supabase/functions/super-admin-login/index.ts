import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPER_ADMIN_EMAIL = "superadmin@pigeonshield.app";
const ADMIN_SESSION_MS = 10 * 60 * 1000;

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AdminClient = ReturnType<typeof createClient>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 200) {
      return jsonResponse({ ok: false }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as AdminClient;

    // The database verifier owns the global, atomic brute-force state. It
    // rejects all new attempts while locked, including the correct passphrase.
    const { data: verified, error: verifyError } = await admin.rpc(
      "verify_admin_passphrase",
      { passphrase: password },
    );
    if (verifyError || verified !== true) {
      return jsonResponse({ ok: false }, 401);
    }

    let userId: string | null = null;
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) {
      return jsonResponse({ ok: false }, 500);
    }
    userId = listed.data.users.find((user) => user.email?.toLowerCase() === SUPER_ADMIN_EMAIL)?.id ?? null;

    if (!userId) {
      const created = await admin.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        email_confirm: true,
        user_metadata: { public_handle: "SuperAdmin", real_name: "Super Admin" },
      });
      if (created.error || !created.data.user) {
        return jsonResponse({ ok: false }, 500);
      }
      userId = created.data.user.id;
    }

    const role = await admin.from("user_roles").upsert(
      { user_id: userId, role: "admin" },
      { onConflict: "user_id,role" },
    );
    if (role.error) {
      return jsonResponse({ ok: false }, 500);
    }

    const sessionExpiresAt = new Date(Date.now() + ADMIN_SESSION_MS).toISOString();
    const session = await admin.from("admin_sessions").upsert(
      {
        user_id: userId,
        last_activity_at: new Date().toISOString(),
        expires_at: sessionExpiresAt,
      },
      { onConflict: "user_id" },
    );
    if (session.error) {
      return jsonResponse({ ok: false }, 500);
    }

    // Security notification is deliberately best-effort. A notification
    // failure must never roll back or invalidate the newly-created Admin
    // session. The recipient is resolved from the existing Admin role model;
    // no Admin user ID is hardcoded and no secret/session data is included.
    try {
      const notificationEventKey = `admin:god-mode-login:${crypto.randomUUID()}`;
      const notification = await admin.from("notifications").insert(
        (await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin"))
          .data
          ?.map(({ user_id }) => ({
            recipient_id: user_id,
            message_id: null,
            listing_id: null,
            transaction_id: null,
            kind: "admin_login",
            title: "New Admin Login",
            body: "A new login to your Admin account was detected.",
            event_key: `${notificationEventKey}:${user_id}`,
          })) ?? [],
      );

      if (notification.error) {
        console.warn("Admin login notification failed:", notification.error.message);
      }
    } catch (notificationError) {
      console.warn(
        "Admin login notification failed:",
        notificationError instanceof Error ? notificationError.message : "unknown error",
      );
    }

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: SUPER_ADMIN_EMAIL,
    });
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      return jsonResponse({ ok: false }, 500);
    }

    return jsonResponse({ ok: true, tokenHash }, 200);
  } catch {
    return jsonResponse({ ok: false }, 500);
  }
});
