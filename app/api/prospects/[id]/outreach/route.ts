import { NextResponse } from "next/server";
import { getProspect } from "@/lib/queries";
import { syncOutreachEmailDraft } from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Prépare un brouillon interne : l'application ne contacte aucun service mail
 * et ne transmet rien au prospect. Le client choisit ensuite de le copier.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prospect = getProspect(decodeURIComponent(id));
  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }
  if (prospect.outreach.method !== "email") {
    return NextResponse.json(
      { error: "Choisissez l'approche par e-mail pour préparer un brouillon." },
      { status: 409 },
    );
  }
  if (!prospect.outreach.recipientEmail) {
    return NextResponse.json(
      { error: "Renseignez l'adresse e-mail du destinataire." },
      { status: 409 },
    );
  }
  if (prospect.websiteProject?.deploymentStatus !== "ready" || !prospect.websiteProject.deploymentUrl) {
    return NextResponse.json(
      { error: "Le lien Vercel sera disponible une fois la publication terminée." },
      { status: 409 },
    );
  }

  const project = syncOutreachEmailDraft(prospect.websiteProject.id);
  if (!project?.emailDraft) {
    return NextResponse.json(
      { error: "Le brouillon est en préparation. Réessayez dans un instant." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    recipientEmail: prospect.outreach.recipientEmail,
    draft: project.emailDraft,
  });
}
