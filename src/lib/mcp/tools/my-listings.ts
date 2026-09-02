import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "my_listings",
  title: "List my listings",
  description: "List the birds and animals the signed-in breeder has posted on PigeonShield.",
  inputSchema: {
    include_inactive: z.boolean().optional().describe("Include expired or deactivated listings."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_inactive }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("listings")
      .select("id, category_type, breed_type, gender, price_ngn, state, is_active, is_featured, batch_quantity, creation_timestamp, expiry_date")
      .eq("breeder_id", ctx.getUserId()!)
      .order("creation_timestamp", { ascending: false });
    if (!include_inactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { listings: data ?? [] },
    };
  },
});
