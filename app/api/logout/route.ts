import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-gate";

export const dynamic = "force-dynamic";

/** Efface le cookie de session et renvoie vers la page de connexion. */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
