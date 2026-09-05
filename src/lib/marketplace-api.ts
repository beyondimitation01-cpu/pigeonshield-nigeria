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
  const { data, error } = await rpc("search_marketplace", {
    search_text: input.query,
    result_kind: input.kind,
    result_limit: input.limit,
    result_offset: input.offset,
  });
  if (error) throw new Error(error.message);
  return (data as MarketplaceSearchRow[] | null) ?? [];
}
