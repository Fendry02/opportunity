import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWebsiteJob } from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IdSchema = z.coerce.number().int().positive();

/**
 * Prévisualisation volontairement cloisonnée : le HTML généré ne peut pas
 * appeler les API de l'application, même si un projet contient un script.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const parsed = IdSchema.safeParse(rawId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de job invalide." }, { status: 400 });
  }

  const job = getWebsiteJob(parsed.data);
  if (!job) {
    return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
  }

  const projectDirectory = path.resolve(job.directory);
  const previewPath = path.resolve(projectDirectory, "index.html");
  if (!previewPath.startsWith(`${projectDirectory}${path.sep}`)) {
    return NextResponse.json({ error: "Aperçu invalide." }, { status: 400 });
  }

  try {
    const html = fs.readFileSync(previewPath, "utf8");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": [
          "default-src 'self'",
          "script-src 'unsafe-inline'",
          "style-src 'unsafe-inline'",
          "img-src https: data:",
          "frame-src https://www.google.com",
          "connect-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join("; "),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Le fichier index.html est introuvable dans ce dossier." },
      { status: 404 },
    );
  }
}
