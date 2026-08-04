import { NextResponse } from "next/server";
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
