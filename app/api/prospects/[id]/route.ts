import { NextResponse } from "next/server";
import { z } from "zod";
import { setContactStatus } from "@/lib/contact";
import { getProspect } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prospect = getProspect(decodeURIComponent(id));
  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }
  return NextResponse.json({ prospect });
}

const PatchSchema = z.object({
  contactStatus: z.enum([
    "to_contact",
    "contacted",
    "not_interested",
    "client",
  ]),
});

/** Met à jour le suivi de la prise de contact du prospect. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const businessId = decodeURIComponent(id);

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Statut de contact invalide" },
      { status: 400 },
    );
  }

  if (!setContactStatus(businessId, parsed.data.contactStatus)) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }

  return NextResponse.json({ prospect: getProspect(businessId) });
}
