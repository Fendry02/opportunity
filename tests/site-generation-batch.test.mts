import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runWebsiteGeneration,
  type WebsiteProjectResult,
} from "../lib/site-generation";
import type { ProspectDetail } from "../lib/types";

function prospect(over: Partial<ProspectDetail>): ProspectDetail {
  return {
    id: over.id ?? "x",
    name: over.name ?? "Entreprise test",
    sector: "plombier",
    sectorLabel: "Plombier",
    googleTypes: [],
    primaryType: null,
    lat: 0,
    lng: 0,
    address: null,
    phone: null,
    websiteUrl: null,
    rating: null,
    reviewCount: null,
    openingHours: [],
    businessStatus: null,
    detailsFetchedAt: null,
    score: 80,
    tier: "high",
    optOut: null,
    contactStatus: "to_contact",
    ignored: false,
    breakdown: [],
    analysis: null,
    enrichment: null,
    searches: [],
    ...over,
  };
}

describe("lot de création de sites", () => {
  it("enrichit chaque prospect autorisé puis crée son projet sans interrompre le lot", async () => {
    const entries = new Map([
      ["ready", prospect({ id: "ready", name: "Prêt" })],
      ["blocked", prospect({ id: "blocked", name: "Refus", optOut: "Refus de démarchage" })],
      ["broken", prospect({ id: "broken", name: "En erreur" })],
    ]);
    const enriched: string[] = [];
    const created: string[] = [];

    const result = await runWebsiteGeneration(["ready", "blocked", "broken"], {
      loadProspect: (id) => entries.get(id) ?? null,
      enrichProspect: async (id) => {
        enriched.push(id);
        if (id === "broken") throw new Error("Source indisponible");
        const current = entries.get(id)!;
        entries.set(id, { ...current, enrichment: { ...current.enrichment!, services: ["Dépannage"] } });
      },
      createProject: (entry) => {
        created.push(entry.id);
        return { status: "created", directory: `/tmp/${entry.id}` } satisfies WebsiteProjectResult;
      },
    });

    assert.deepEqual(enriched, ["ready", "broken"]);
    assert.deepEqual(created, ["ready"]);
    assert.deepEqual(result.map((entry) => entry.status), ["created", "skipped", "failed"]);
    assert.match(result[1]!.message, /refus de démarchage/i);
    assert.match(result[2]!.message, /Source indisponible/);
  });

  it("déduplique une sélection répétée avant d'appeler les services", async () => {
    const item = prospect({ id: "same" });
    let enrichCalls = 0;
    let projectCalls = 0;

    const result = await runWebsiteGeneration(["same", "same"], {
      loadProspect: () => item,
      enrichProspect: async () => { enrichCalls += 1; },
      createProject: () => {
        projectCalls += 1;
        return { status: "created", directory: "/tmp/same" };
      },
    });

    assert.equal(enrichCalls, 1);
    assert.equal(projectCalls, 1);
    assert.equal(result.length, 1);
  });
});
