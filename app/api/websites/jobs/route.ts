import { NextResponse } from "next/server";
import { listWebsiteJobs, startWebsiteQueue } from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Le rafraîchissement du panneau réveille aussi une file laissée en attente
 * après un redémarrage, sans bloquer la réponse HTTP. */
export async function GET() {
  startWebsiteQueue();
  return NextResponse.json({ jobs: listWebsiteJobs() });
}
