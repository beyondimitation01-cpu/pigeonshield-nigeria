import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const thetaSchema = z.object({
  theta: z.number(),
});

export const Route = createFileRoute("/api/public/theta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = thetaSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Expected a numeric 'theta' field" },
            { status: 400 },
          );
        }

        const theta = parsed.data.theta;
        const alpha = Math.atan(Math.sinh(theta));

        return Response.json({ theta, alpha });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("theta");
        const theta = raw === null ? NaN : Number(raw);
        if (!Number.isFinite(theta)) {
          return Response.json(
            { error: "Pass a numeric ?theta= query parameter" },
            { status: 400 },
          );
        }

        const alpha = Math.atan(Math.sinh(theta));
        return Response.json({ theta, alpha });
      },
    },
  },
});
