import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_listing",
  title: "Create a listing",
  description:
    "Post a new listing on PigeonShield for the signed-in breeder. Prices are in Nigerian Naira; listings expire after 7 days.",
  inputSchema: {
    category_type: z.string().describe("Category, e.g. Pigeons, Chickens, Dogs, Horses."),
    breed_type: z.string().describe("Breed name."),
    price_ngn: z.number().describe("Asking price in Naira."),
    state: z.string().describe("Nigerian state where the animal is located."),
    gender: z.string().optional().describe("Male, Female, or Pair."),
    description: z.string().optional().describe("Free-text description of the animal."),
    batch_quantity: z.number().optional().describe("Number of birds in the batch (default 1)."),
    vaccinated: z.boolean().optional().describe("Whether the animal is vaccinated."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    // Only seller-product fields belong in this INSERT. Ownership, verification,
    // lifecycle, timestamps and expiry are established by the database trigger.
    const { data, error } = await supabase
      .from("listings")
      .insert({
        category_type: input.category_type,
        breed_type: input.breed_type,
        price_ngn: Math.round(input.price_ngn),
        state: input.state,
        gender: input.gender ?? "Unknown",
        description: input.description ?? "",
        batch_quantity: input.batch_quantity ?? 1,
        vaccinated: input.vaccinated ?? false,
      })
      .select()
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { listing: data } };
  },
});
