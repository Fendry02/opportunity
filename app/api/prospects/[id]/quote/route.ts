import { buildQuoteDraft } from "@/lib/outreach";
import { getProspect } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Le devis reste un document de travail, téléchargeable sans service externe. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prospect = getProspect(decodeURIComponent(id));
  if (!prospect) return new Response("Prospect introuvable", { status: 404 });

  const filename = `devis-${slugify(prospect.name)}.md`;
  return new Response(
    buildQuoteDraft({ businessName: prospect.name, address: prospect.address }),
    {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    },
  );
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "prospect";
}
