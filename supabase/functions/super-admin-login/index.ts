import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPER_ADMIN_EMAIL = "superadmin@pigeonshield.app";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 200) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: verified, error: verifyError } = await admin.rpc(
      "verify_admin_passphrase",
      { passphrase: password },
    );
    if (verifyError || verified !== true) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string | null = null;
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = listed.data.users.find((user) => user.email?.toLowerCase() === SUPER_ADMIN_EMAIL)?.id ?? null;

    if (!userId) {
      const created = await admin.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        email_confirm: true,
        user_metadata: { public_handle: "SuperAdmin", real_name: "Super Admin" },
      });
      if (created.error || !created.data.user) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = created.data.user.id;
    }

    const profile = await admin.from("profiles").upsert(
      { id: userId, public_handle: "SuperAdmin", real_name: "Super Admin" },
      { onConflict: "id" },
    );
    if (profile.error) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const role = await admin.from("user_roles").upsert(
      { user_id: userId, role: "admin" },
      { onConflict: "user_id,role" },
    );
    if (role.error) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: SUPER_ADMIN_EMAIL,
    });
    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, tokenHash }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
