import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_listings",
  title: "Search marketplace listings",
  description:
    "Search active PigeonShield listings by category, breed, Nigerian state, and price range. Returns newest first.",
  inputSchema: {
    category: z.string().optional().describe("Category type, e.g. Pigeons, Chickens, Dogs, Horses."),
    breed: z.string().optional().describe("Partial breed name to match."),
    state: z.string().optional().describe("Nigerian state of the seller."),
    max_price_ngn: z.number().optional().describe("Maximum price in Naira."),
    limit: z.number().optional().describe("Max rows to return (default 20, capped at 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, breed, state, max_price_ngn, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("listings")
      .select("id, category_type, breed_type, custom_bird_name, gender, price_ngn, state, description, is_featured, is_verified_seller, creation_timestamp")
      .eq("is_active", true)
      .order("creation_timestamp", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 50));

    if (category) query = query.eq("category_type", category);
    if (breed) query = query.ilike("breed_type", `%${breed}%`);
    if (state) query = query.eq("state", state);
    if (typeof max_price_ngn === "number") query = query.lte("price_ngn", max_price_ngn);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { listings: data ?? [] },
    };
  },
});
