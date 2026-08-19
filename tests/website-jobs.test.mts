import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-website-jobs-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "queue.db");

const { getDb } = await import("../lib/db");
const {
  enqueueWebsiteJob,
  getWebsiteJob,
  listWebsiteJobs,
  processPendingWebsiteJobs,
  retryWebsiteJob,
} = await import("../lib/website-jobs");

let businessNumber = 0;

function createBusiness() {
  businessNumber += 1;
  const id = `place-website-job-${businessNumber}`;
  const name = `Atelier test ${businessNumber}`;
  getDb()
    .prepare(
      `INSERT INTO businesses (id, name, google_types_json, lat, lng)
       VALUES (?, ?, '[]', 47.394, 0.684)`,
    )
    .run(id, name);
  return { id, name, directory: path.join(tmp, `site-${businessNumber}`) };
}

beforeEach(() => {
  getDb().prepare("DELETE FROM website_jobs").run();
});

after(() => {
  getDb().close();
  delete (globalThis as { __opportunityDb?: unknown }).__opportunityDb;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("file durable de génération de sites", () => {
  it("persiste un job en attente et le relie au prospect", () => {
    const business = createBusiness();

    const job = enqueueWebsiteJob({
      businessId: business.id,
      directory: business.directory,
    });

    assert.equal(job.status, "pending");
    assert.equal(job.businessId, business.id);
    assert.equal(job.businessName, business.name);
    assert.equal(job.directory, business.directory);
    assert.equal(listWebsiteJobs().length, 1);
  });

  it("exécute chaque prompt et conserve le résultat prêt à prévisualiser", async () => {
    const business = createBusiness();
    const queued = enqueueWebsiteJob({
      businessId: business.id,
      directory: business.directory,
    });
    const launchedDirectories: string[] = [];

    const report = await processPendingWebsiteJobs({
      runAgent: async (job) => {
        launchedDirectories.push(job.directory);
        return "index.html amélioré";
      },
    });
    const completed = getWebsiteJob(queued.id);

    assert.deepEqual(launchedDirectories, [business.directory]);
    assert.deepEqual(report, { completed: 1, failed: 0 });
    assert.equal(completed?.status, "ready");
    assert.equal(completed?.output, "index.html amélioré");
    assert.equal(completed?.attempts, 1);
  });

  it("marque l'échec et permet une reprise explicite", async () => {
    const business = createBusiness();
    const queued = enqueueWebsiteJob({
      businessId: business.id,
      directory: business.directory,
    });

    await processPendingWebsiteJobs({
      runAgent: async () => {
        throw new Error("Claude Code est indisponible");
      },
    });
    const failed = getWebsiteJob(queued.id);
    const retried = retryWebsiteJob(queued.id);

    assert.equal(failed?.status, "failed");
    assert.match(failed?.error ?? "", /indisponible/);
    assert.equal(retried?.status, "pending");
    assert.equal(retried?.error, null);
    assert.equal(retried?.attempts, 1);
  });
});
