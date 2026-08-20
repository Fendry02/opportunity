import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-website-deploy-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "deployments.db");

const { getDb } = await import("../lib/db");
const { setOutreachPlan } = await import("../lib/outreach");
const {
  enqueueWebsiteJob,
  getWebsiteJob,
  processPendingWebsiteDeployments,
  processPendingWebsiteJobs,
} = await import("../lib/website-jobs");

beforeEach(() => {
  getDb().prepare("DELETE FROM website_jobs").run();
  getDb().prepare("DELETE FROM businesses").run();
  getDb()
    .prepare(
      `INSERT INTO businesses (id, name, google_types_json, lat, lng)
       VALUES ('place-deployment', 'Menuiserie Atlas', '[]', 47.394, 0.684)`,
    )
    .run();
});

after(() => {
  getDb().close();
  delete (globalThis as { __opportunityDb?: unknown }).__opportunityDb;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("publication Vercel", () => {
  it("publie un site terminé puis conserve son URL de production", async () => {
    const job = enqueueWebsiteJob({
      businessId: "place-deployment",
      directory: path.join(tmp, "menuiserie-atlas"),
    });
    setOutreachPlan("place-deployment", {
      method: "email",
      recipientEmail: "contact@menuiserie-atlas.fr",
    });
    await processPendingWebsiteJobs({ runAgent: async () => "site prêt" });

    const report = await processPendingWebsiteDeployments({
      deploySite: async () => "https://menuiserie-atlas.vercel.app",
    });
    const deployed = getWebsiteJob(job.id);

    assert.deepEqual(report, { completed: 1, failed: 0 });
    assert.equal(deployed?.status, "ready");
    assert.equal(deployed?.deploymentStatus, "ready");
    assert.equal(deployed?.deploymentUrl, "https://menuiserie-atlas.vercel.app");
    assert.match(deployed?.emailDraft?.subject ?? "", /Menuiserie Atlas/);
    assert.match(deployed?.emailDraft?.body ?? "", /menuiserie-atlas\.vercel\.app/);
  });

  it("isole une erreur Vercel sans remettre en cause le site généré", async () => {
    const job = enqueueWebsiteJob({
      businessId: "place-deployment",
      directory: path.join(tmp, "menuiserie-atlas"),
    });
    await processPendingWebsiteJobs({ runAgent: async () => "site prêt" });
    await processPendingWebsiteDeployments({
      deploySite: async () => {
        throw new Error("VERCEL_TOKEN manquant");
      },
    });

    const deployed = getWebsiteJob(job.id);
    assert.equal(deployed?.status, "ready");
    assert.equal(deployed?.deploymentStatus, "failed");
    assert.match(deployed?.deploymentError ?? "", /VERCEL_TOKEN/);
  });
});
