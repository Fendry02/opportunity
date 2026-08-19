import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichProspect } from "@/lib/enrich";
import { getProspect } from "@/lib/queries";
import {
  createWebsiteProject,
  runWebsiteGeneration,
} from "@/lib/site-generation";
import { enqueueWebsiteJob, startWebsiteQueue } from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Un lot reste volontairement court : l'enrichissement utilise des sources
 * publiques et un petit nombre évite une attente interminable et les rafales
 * vers ces services. Chaque prospect est isolé : une erreur ne bloque pas les
 * autres dossiers sélectionnés.
 */
const GenerateSchema = z.object({
  prospectIds: z.array(z.string().trim().min(1)).min(1).max(12),
});

export async function POST(request: Request) {
  const parsed = GenerateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Sélection invalide : choisissez entre 1 et 12 prospects." },
      { status: 400 },
    );
  }

  const results = await runWebsiteGeneration(parsed.data.prospectIds, {
    loadProspect: getProspect,
    enrichProspect,
    createProject: createWebsiteProject,
  });
  const queuedJobIds: number[] = [];

  for (const result of results) {
    if (result.status !== "created" || !result.directory) continue;
    try {
      queuedJobIds.push(
        enqueueWebsiteJob({
          businessId: result.prospectId,
          directory: result.directory,
        }).id,
      );
      result.message = "Vitrine créée et mise en file pour finalisation.";
    } catch (error) {
      result.status = "failed";
      result.message =
        error instanceof Error
          ? `Vitrine créée mais non mise en file : ${error.message}`
          : "Vitrine créée mais non mise en file.";
    }
  }
  if (queuedJobIds.length > 0) startWebsiteQueue();

  const created = results.filter((entry) => entry.status === "created").length;

  return NextResponse.json({
    results,
    summary: {
      selected: new Set(parsed.data.prospectIds).size,
      created,
      queued: queuedJobIds.length,
      skipped: results.filter((entry) => entry.status === "skipped").length,
      failed: results.filter((entry) => entry.status === "failed").length,
    },
    queuedJobIds,
  });
}
