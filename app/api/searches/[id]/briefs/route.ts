import { buildSweepBrief, sweepBriefFilename } from "@/lib/brief";
import { getProspect, getSearch, listSearchResults } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Télécharge en un seul Markdown les briefs de tout un balayage. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchId = Number(id);
  if (!Number.isInteger(searchId)) {
    return new Response("Identifiant invalide", { status: 400 });
  }

  const search = getSearch(searchId);
  if (!search) {
    return new Response("Recherche introuvable", { status: 404 });
  }

  // On repart de la liste déjà triée par score, on ne garde que les prospects
  // notés et non écartés, puis on récupère leur fiche complète pour le brief.
  const prospects = listSearchResults(searchId)
    .filter((p) => !p.optOut && p.score !== null)
    .map((p) => getProspect(p.id))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return new Response(buildSweepBrief(search.label, prospects), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sweepBriefFilename(search.label)}"`,
    },
  });
}
