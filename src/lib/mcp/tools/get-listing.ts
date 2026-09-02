import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_listing",
  title: "Get listing details",
  description: "Fetch the full details of one PigeonShield listing by its id.",
  inputSchema: { listing_id: z.string().describe("UUID of the listing.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ listing_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listing_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Listing not found." }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { listing: data } };
  },
});
