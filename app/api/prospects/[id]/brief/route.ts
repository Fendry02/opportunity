import { briefFilename, buildBrief } from "@/lib/brief";
import { getProspect } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Télécharge le brief commercial du prospect en Markdown. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prospect = getProspect(decodeURIComponent(id));
  if (!prospect) {
    return new Response("Prospect introuvable", { status: 404 });
  }

  // Refus de démarchage affiché sur la fiche : pas de brief commercial.
  if (prospect.optOut) {
    return new Response(
      `Aucun brief pour ce prospect.\n\n${prospect.optOut}.\n` +
        `L'entreprise a signalé qu'elle ne souhaite pas être démarchée.\n`,
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  return new Response(buildBrief(prospect), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${briefFilename(prospect)}"`,
    },
  });
}
