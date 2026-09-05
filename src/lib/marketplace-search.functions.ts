import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const searchInputSchema = z.object({
  query: z.string().max(100).default(""),
  kind: z.enum(["all", "products", "stores"]).default("all"),
  limit: z.number().int().min(1).max(50).default(21),
  offset: z.number().int().min(0).default(0),
});

export const searchMarketplaceServer = createServerFn({ method: "GET" })
  .handler(async ({ data }) => {
    const input = searchInputSchema.parse(data ?? {});
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)("search_marketplace", {
      search_text: input.query.trim(),
      result_kind: input.kind,
      result_limit: input.limit,
      result_offset: input.offset,
    });

    if (error) {
      console.error("[MarketplaceSearch] RPC failed:", error.message);
      throw new Error("Marketplace search is temporarily unavailable.");
    }

    return (rows as unknown[]) ?? [];
  });
