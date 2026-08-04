import { NextResponse } from "next/server";
import { getSearch, listSearchResults } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Statut + résultats partiels : c'est la cible du polling de l'UI. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchId = Number(id);
  if (!Number.isInteger(searchId)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }

  const search = getSearch(searchId);
  if (!search) {
    return NextResponse.json({ error: "Recherche introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    search,
    results: listSearchResults(searchId),
  });
}
