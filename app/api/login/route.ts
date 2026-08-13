import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth-gate";

export const dynamic = "force-dynamic";

/** Vérifie le mot de passe de l'instance et pose le cookie de session. */
export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  // Barrière désactivée : rien à vérifier, on renvoie à l'accueil.
  if (!password) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }

  const form = await request.formData().catch(() => null);
  const provided = form?.get("password");

  if (typeof provided !== "string" || !(await passwordMatches(provided, password))) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), {
      status: 303,
    });
  }

  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(password, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return response;
}
