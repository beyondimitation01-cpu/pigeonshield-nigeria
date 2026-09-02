import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "my_orders",
  title: "List my escrow orders",
  description:
    "List escrow transactions where the signed-in user is the buyer or the seller, with status and amounts in Naira.",
  inputSchema: {
    role: z.enum(["buyer", "seller", "any"]).optional().describe("Filter by the user's side of the deal."),
    status: z.string().optional().describe("Filter by escrow status, e.g. pending, dispatched, delivered."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ role, status }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    let query = supabase
      .from("transactions")
      .select("id, listing_id, listing_name, buyer_id, breeder_id, amount_naira, status, dispute_status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (role === "buyer") query = query.eq("buyer_id", userId);
    else if (role === "seller") query = query.eq("breeder_id", userId);
    else query = query.or(`buyer_id.eq.${userId},breeder_id.eq.${userId}`);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
