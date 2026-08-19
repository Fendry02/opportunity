import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getWebsiteJob,
  retryWebsiteJob,
  startWebsiteQueue,
} from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IdSchema = z.coerce.number().int().positive();

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
  if (current.status !== "failed") {
    return NextResponse.json(
      { error: "Seul un job en erreur peut être relancé." },
      { status: 409 },
    );
  }

  const job = retryWebsiteJob(parsed.data);
  if (!job) {
    return NextResponse.json({ error: "La relance a échoué." }, { status: 409 });
  }
  startWebsiteQueue();
  return NextResponse.json({ job });
}
