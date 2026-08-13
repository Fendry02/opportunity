import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-gate";

/**
 * Barrière mot de passe de l'instance.
 *
 * Active uniquement quand `APP_PASSWORD` est défini : en dev local, ou sur une
 * instance qu'on assume ouverte, aucune gêne. Sinon, toute requête hors page de
 * connexion et assets internes exige un cookie de session valide.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, password, Date.now())) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Tout est protégé, sauf la connexion et les ressources internes de Next.
  matcher: [
    "/((?!login|api/login|api/logout|_next/static|_next/image|favicon.ico).*)",
  ],
};
