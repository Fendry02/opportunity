import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWebsiteJob } from "@/lib/website-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IdSchema = z.coerce.number().int().positive();

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
  const promptPath = path.resolve(projectDirectory, "PROMPT.md");
  if (!promptPath.startsWith(`${projectDirectory}${path.sep}`)) {
    return NextResponse.json({ error: "Prompt invalide." }, { status: 400 });
  }

  try {
    return new NextResponse(fs.readFileSync(promptPath, "utf8"), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Le prompt est introuvable." }, { status: 404 });
  }
}
