import { NextResponse } from "next/server";
import { enrichProspect } from "@/lib/enrich";
import { getProspect } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Enrichissement synchrone : quelques requêtes gratuites, l'utilisateur attend
 * le résultat. Inutile d'introduire un second mécanisme de polling pour ça.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const businessId = decodeURIComponent(id);

  try {
    await enrichProspect(businessId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichissement impossible" },
      { status: 400 },
    );
  }

  // On renvoie la fiche complète : le composant n'a qu'à remplacer son état.
  return NextResponse.json({ prospect: getProspect(businessId) });
}
