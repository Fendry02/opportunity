import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_RADIUS_M, MIN_RADIUS_M } from "@/config/search-defaults";
import { SECTORS_BY_ID } from "@/config/sectors";
import { createSearch, startSearch } from "@/lib/pipeline";
import { listSearches } from "@/lib/queries";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  city: z.string().min(2, "Indiquez une ville"),
  radiusM: z.number().int().min(MIN_RADIUS_M).max(MAX_RADIUS_M),
  sectors: z
    .array(z.string())
    .min(1, "Sélectionnez au moins un secteur")
    .refine(
      (ids) => ids.every((id) => SECTORS_BY_ID.has(id)),
      "Secteur inconnu",
    ),
});

export async function GET() {
  return NextResponse.json({ searches: listSearches() });
}

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
      { status: 400 },
    );
  }

  try {
    const search = await createSearch(parsed.data);
    // Volontairement non attendu : le balayage continue en tâche de fond,
    // l'UI suit son avancement via GET /api/searches/:id.
    startSearch(search.id);
    return NextResponse.json({ id: search.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la recherche" },
      { status: 400 },
    );
  }
}
