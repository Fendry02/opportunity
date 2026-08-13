import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/cache";
import { PLACES_DAILY_CAP, placesCallsToday } from "@/lib/places/client";

export const dynamic = "force-dynamic";

/**
 * Consommation Places du jour.
 *
 * Sans cet indicateur, on découvre le plafond en pleine recherche, avec un
 * message d'erreur : autant l'afficher avant de cliquer.
 */
export async function GET() {
  const mock = isMockMode();
  const used = mock ? 0 : placesCallsToday();
  return NextResponse.json({
    mock,
    used,
    cap: PLACES_DAILY_CAP,
    remaining: Math.max(0, PLACES_DAILY_CAP - used),
    // Sert à prévenir, avant le premier clic, qu'un balayage réel échouera faute de clé.
    configured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
  });
}
