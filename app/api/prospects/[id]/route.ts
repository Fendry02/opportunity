import { NextResponse } from "next/server";
import { z } from "zod";
import { setContactStatus } from "@/lib/contact";
import { setIgnored } from "@/lib/ignore";
import { getOutreachPlan, setOutreachPlan } from "@/lib/outreach";
import { getProspect } from "@/lib/queries";
import { getLatestWebsiteJobForBusiness, syncOutreachEmailDraft } from "@/lib/website-jobs";

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

const PatchSchema = z
  .object({
    contactStatus: z
      .enum(["to_contact", "contacted", "not_interested", "client"])
      .optional(),
    ignored: z.boolean().optional(),
    outreachMethod: z.enum(["visit", "email"]).optional(),
    outreachEmail: z.string().trim().email().max(254).nullable().optional(),
  })
  .refine(
    (data) =>
      data.contactStatus !== undefined ||
      data.ignored !== undefined ||
      data.outreachMethod !== undefined ||
      data.outreachEmail !== undefined,
    { message: "Rien à mettre à jour" },
  );

/** Met à jour le suivi de contact et/ou l'état « ignoré » du prospect. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const businessId = decodeURIComponent(id);

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
      { status: 400 },
    );
  }

  if (parsed.data.contactStatus !== undefined) {
    setContactStatus(businessId, parsed.data.contactStatus);
  }
  if (parsed.data.ignored !== undefined) {
    setIgnored(businessId, parsed.data.ignored);
  }
  if (
    parsed.data.outreachMethod !== undefined ||
    parsed.data.outreachEmail !== undefined
  ) {
    const current = getOutreachPlan(businessId);
    if (!current) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }
    setOutreachPlan(businessId, {
      method: parsed.data.outreachMethod ?? current.method,
      recipientEmail:
        parsed.data.outreachEmail === undefined
          ? current.recipientEmail
          : parsed.data.outreachEmail,
    });
    const project = getLatestWebsiteJobForBusiness(businessId);
    if (project) syncOutreachEmailDraft(project.id);
  }

  const prospect = getProspect(businessId);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }
  return NextResponse.json({ prospect });
}
