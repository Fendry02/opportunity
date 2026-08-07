/**
 * Vérification de la Phase 2 : le schéma se crée, le cache écrit/relit, et une
 * entrée expirée est bien ignorée. S'exécute sur une base jetable.
 *
 *   npm run db:check
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-dbcheck-"));
process.env.OPPORTUNITY_DB_PATH = path.join(tmp, "check.db");
process.env.MOCK_EXTERNAL = "0";

const { getDb } = await import("../lib/db");
const { cacheStats, purgeExpired } = await import("../lib/cache");

const db = getDb();

// 1. Toutes les tables du schéma existent.
const tables = new Set(
  db
    .prepare<[], { name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
    )
    .all()
    .map((r) => r.name),
);
for (const t of [
  "searches",
  "businesses",
  "search_results",
  "site_analyses",
  "enrichments",
  "scores",
  "api_cache",
]) {
  assert.ok(tables.has(t), `table manquante : ${t}`);
}
console.log("✓ schéma :", [...tables].filter((t) => !t.startsWith("sqlite_")).sort().join(", "));

assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
console.log("✓ journal_mode = WAL");

// 2. Écriture / relecture d'un BLOB (l'encodage d'origine doit survivre).
const latin1 = Buffer.from("Réno' Bâtiment · devis gratuit", "latin1");
const insert = db.prepare(
  `INSERT INTO api_cache (cache_key, source, url, status, body, headers_json, expires_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
insert.run(
  "k-live",
  "site",
  "http://exemple.fr/",
  200,
  latin1,
  "{}",
  new Date(Date.now() + 60_000).toISOString(),
);
insert.run(
  "k-expired",
  "site",
  "http://vieux.fr/",
  200,
  Buffer.from("obsolète"),
  "{}",
  new Date(Date.now() - 60_000).toISOString(),
);

const readBack = db
  .prepare<[string], { body: Buffer }>(
    `SELECT body FROM api_cache WHERE cache_key = ?`,
  )
  .get("k-live");
assert.ok(readBack);
assert.equal(readBack.body.toString("latin1"), "Réno' Bâtiment · devis gratuit");
console.log("✓ BLOB relu à l'octet près (latin-1 préservé)");

// 3. Le TTL filtre bien l'entrée expirée.
const now = new Date().toISOString();
const live = db
  .prepare<[string], { n: number }>(
    `SELECT COUNT(*) AS n FROM api_cache WHERE expires_at > ?`,
  )
  .get(now);
assert.equal(live?.n, 1, "seule l'entrée non expirée doit être visible");
console.log("✓ TTL : 1 entrée valide, 1 expirée masquée");

assert.equal(purgeExpired(), 1);
assert.deepEqual(cacheStats(), [{ source: "site", n: 1 }]);
console.log("✓ purge des expirées + statistiques");

// 4. Reprise au boot : une recherche `running` devient `error`.
db.prepare(
  `INSERT INTO searches (label, lat, lng, radius_m, sectors_json, status)
   VALUES ('Tours', 47.3879, 0.689, 5000, '["plombier"]', 'running')`,
).run();
db.close();
// Vider le singleton force getDb() à rouvrir la base : c'est exactement ce que
// fait un redémarrage du serveur.
delete (globalThis as { __opportunityDb?: unknown }).__opportunityDb;

const row = getDb()
  .prepare<[], { status: string; error: string | null }>(
    `SELECT status, error FROM searches LIMIT 1`,
  )
  .get();
assert.equal(row?.status, "error");
assert.match(row?.error ?? "", /interrompue/);
console.log("✓ recherche 'running' reprise en 'error' au boot");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nTout est bon.");
