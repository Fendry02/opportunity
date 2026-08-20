import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getWebsiteJob,
  retryWebsiteDeployment,
  startWebsiteQueue,
} from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IdSchema = z.coerce.number().int().positive();

/** Relance uniquement Vercel après correction du jeton ou d'un réglage projet. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const parsed = IdSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de job invalide." }, { status: 400 });
  }

  const current = getWebsiteJob(parsed.data);
  if (!current) {
    return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
  }
  if (current.status !== "ready" || current.deploymentStatus !== "failed") {
    return NextResponse.json(
      { error: "Seule une publication en erreur peut être relancée." },
      { status: 409 },
    );
  }

  const job = retryWebsiteDeployment(parsed.data);
  if (!job) {
    return NextResponse.json({ error: "La relance de Vercel a échoué." }, { status: 409 });
  }
  startWebsiteQueue();
  return NextResponse.json({ job });
}
