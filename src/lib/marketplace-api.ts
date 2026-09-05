import { supabase } from "@/integrations/supabase/client";

export interface PublicStoreListing {
  id: string;
  slug: string | null;
  category_type: string;
  custom_bird_name: string;
  breed_type: string;
  gender: string;
  price_ngn: number;
  images: string[];
  vaccinated: boolean;
  state: string;
  description: string;
  batch_quantity: number;
  is_active: boolean;
  creation_timestamp: string;
  expiry_date: string;
  is_featured: boolean;
  is_verified_seller: boolean;
  breeder_id: string;
}

export interface PublicStoreData {
  user_id: string;
  username: string;
  full_name: string;
  loft_name: string;
  home_state: string;
  avatar_url: string;
  is_verified_seller: boolean;
  is_online: boolean;
  listings: PublicStoreListing[];
}

export interface MarketplaceSearchRow {
  kind: "product" | "store";
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  url_key: string;
  username: string | null;
}

type UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase.rpc as unknown as UntypedRpc);

export async function getPublicStore(username: string): Promise<PublicStoreData | null> {
  const { data, error } = await rpc("get_public_store", { input_username: username });
  if (error) throw new Error(error.message);
  return ((data as PublicStoreData[] | null) ?? [])[0] ?? null;
}

export async function searchMarketplace(input: {
  query: string;
  kind: "all" | "products" | "stores";
  limit: number;
  offset: number;
}): Promise<MarketplaceSearchRow[]> {
  // This is a public, read-only RPC. Call the PostgREST endpoint directly so
  // marketplace search does not depend on the browser auth/session state or
  // Supabase client's RPC request construction. The publishable key is safe to
  // expose in the browser; database security remains enforced by the RPC.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Marketplace search is not configured.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/search_marketplace`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      search_text: input.query,
      result_kind: input.kind,
      result_limit: input.limit,
      result_offset: input.offset,
    }),
  });

  if (!response.ok) {
    let message = `Marketplace search request failed (${response.status}).`;
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
        message = payload.message;
      } else if (typeof payload === "string" && payload.trim()) {
        message = payload;
      }
    } catch {
      // Keep the stable fallback message when the API response is not JSON.
    }
    throw new Error(message);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Marketplace search returned an invalid response.");
  }

  return data as MarketplaceSearchRow[];
}
