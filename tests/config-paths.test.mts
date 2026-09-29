import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("les chemins optionnels vides reprennent leurs valeurs par défaut", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "opportunity-paths-"));
  const originalDirectory = process.cwd();
  const originalDbPath = process.env.OPPORTUNITY_DB_PATH;
  const originalWebsitesDir = process.env.OPPORTUNITY_WEBSITES_DIR;

  try {
    process.chdir(temporaryDirectory);
    const workingDirectory = process.cwd();
    process.env.OPPORTUNITY_DB_PATH = "";
    process.env.OPPORTUNITY_WEBSITES_DIR = "";

    const [{ getDb }, { DEFAULT_WEBSITES_DIR }] = await Promise.all([
      import("../lib/db"),
      import("../lib/site-generation"),
    ]);
    assert.equal(
      DEFAULT_WEBSITES_DIR,
      path.resolve(workingDirectory, "..", "websites"),
    );

    const db = getDb();
    const databaseFile = db.pragma("database_list") as { file: string }[];
    assert.equal(databaseFile[0]?.file, path.join(workingDirectory, "data", "opportunity.db"));
    db.close();
  } finally {
    process.chdir(originalDirectory);
    if (originalDbPath === undefined) delete process.env.OPPORTUNITY_DB_PATH;
    else process.env.OPPORTUNITY_DB_PATH = originalDbPath;
    if (originalWebsitesDir === undefined) delete process.env.OPPORTUNITY_WEBSITES_DIR;
    else process.env.OPPORTUNITY_WEBSITES_DIR = originalWebsitesDir;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
