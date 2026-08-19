import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-website-jobs-api-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "queue.db");

const { getDb } = await import("../lib/db");
const { enqueueWebsiteJob } = await import("../lib/website-jobs");
const { GET } = await import("../app/api/websites/jobs/route");

after(() => {
  getDb().close();
  delete (globalThis as { __opportunityDb?: unknown }).__opportunityDb;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("GET /api/websites/jobs", () => {
  it("renvoie les jobs avec leur statut et le prospect associé", async () => {
    getDb()
      .prepare(
        `INSERT INTO businesses (id, name, google_types_json, lat, lng)
         VALUES ('place-api-job', 'Entreprise API', '[]', 47.394, 0.684)`,
      )
      .run();
    const job = enqueueWebsiteJob({
      businessId: "place-api-job",
      directory: path.join(tmp, "entreprise-api"),
    });
    getDb()
      .prepare("UPDATE website_jobs SET status = 'ready' WHERE id = ?")
      .run(job.id);

    const response = await GET();
    const body = (await response.json()) as { jobs: Array<{ id: number; status: string; businessName: string }> };

    assert.equal(response.status, 200);
    assert.equal(body.jobs.length, 1);
    assert.equal(body.jobs[0]?.id, job.id);
    assert.equal(body.jobs[0]?.status, "ready");
    assert.equal(body.jobs[0]?.businessName, "Entreprise API");
  });
});
