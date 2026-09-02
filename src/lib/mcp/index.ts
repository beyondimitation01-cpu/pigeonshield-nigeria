import { auth, defineMcp } from "@lovable.dev/mcp-js";
import type { AnyToolDefinition } from "@lovable.dev/mcp-js";
import searchListings from "./tools/search-listings";
import getListing from "./tools/get-listing";
import myListings from "./tools/my-listings";
import myOrders from "./tools/my-orders";
import createListing from "./tools/create-listing";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "pigeonshield-marketplace",
  title: "PigeonShield Marketplace",
  version: "0.1.0",
  instructions:
    "Tools for PigeonShield Nigeria, an escrow-protected livestock marketplace. Search the marketplace, read listing details, post new listings, and review the signed-in user's listings and escrow orders. Prices are in Nigerian Naira.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchListings, getListing, myListings, myOrders, createListing] as unknown as AnyToolDefinition[],
});
