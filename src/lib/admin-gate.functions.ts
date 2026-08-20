import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSession = { unlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "ps-admin-gate",
    maxAge: 60 * 60 * 2,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Verifies the master password server-side. The password never reaches the browser bundle. */
export const unlockAdminConsole = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    const password = typeof data?.password === "string" ? data.password : "";
    if (password.length === 0 || password.length > 200) {
      throw new Error("Invalid password input");
    }
    return { password };
  })
  .handler(async ({ data }) => {
    const expected = process.env["ADMIN_MASTER_PASSWORD"];
    if (!expected) return { ok: false as const };
    if (!passwordMatches(data.password, expected)) return { ok: false as const };

    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

/** Server-side truth for "is this browser an unlocked admin". Cannot be faked from devtools. */
export const getAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  return { unlocked: session.data.unlocked === true };
});

export const lockAdminConsole = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});
