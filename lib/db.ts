import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Singleton better-sqlite3.
 *
 * Stocké sur `globalThis` : en dev, le hot-reload de Next ré-évalue les modules
 * et ouvrirait sinon une nouvelle connexion (et un nouveau lock) à chaque
 * sauvegarde de fichier.
 */
type DbGlobal = typeof globalThis & {
  __opportunityDb?: Database.Database;
};

const g = globalThis as DbGlobal;

const DB_PATH =
  process.env.OPPORTUNITY_DB_PATH ??
  path.join(process.cwd(), "data", "opportunity.db");

function open(): Database.Database {
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  recoverInterruptedSearches(db);
  return db;
}

export function getDb(): Database.Database {
  if (!g.__opportunityDb) {
    g.__opportunityDb = open();
  }
  return g.__opportunityDb;
}

/**
 * Migrations idempotentes : chaque instruction est un `CREATE ... IF NOT EXISTS`.
 * Pas de numéro de version — le schéma est reconstruit à l'identique au boot.
 */
function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS searches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      label         TEXT    NOT NULL,
      city          TEXT,
      lat           REAL    NOT NULL,
      lng           REAL    NOT NULL,
      radius_m      INTEGER NOT NULL,
      sectors_json  TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'running',
      progress_json TEXT    NOT NULL DEFAULT '{}',
      error         TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id                 TEXT PRIMARY KEY,          -- place_id Google
      name               TEXT NOT NULL,
      sector             TEXT,                      -- id de secteur (config/sectors.ts)
      google_types_json  TEXT NOT NULL DEFAULT '[]',
      primary_type       TEXT,
      lat                REAL NOT NULL,
      lng                REAL NOT NULL,
      address            TEXT,
      phone              TEXT,
      website_url        TEXT,
      rating             REAL,
      review_count       INTEGER,
      opening_hours_json TEXT,
      business_status    TEXT,
      details_fetched_at TEXT,
      -- Renseigné quand la fiche affiche un refus explicite de démarchage.
      opt_out_marker     TEXT,
      opt_out_source     TEXT
    );

    CREATE TABLE IF NOT EXISTS search_results (
      search_id   INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
      business_id TEXT    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      distance_m  INTEGER NOT NULL,
      PRIMARY KEY (search_id, business_id)
    );
    CREATE INDEX IF NOT EXISTS idx_search_results_business
      ON search_results(business_id);

    CREATE TABLE IF NOT EXISTS site_analyses (
      business_id      TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
      url              TEXT,
      reachable        INTEGER NOT NULL DEFAULT 0,
      https            INTEGER NOT NULL DEFAULT 0,
      has_viewport     INTEGER NOT NULL DEFAULT 0,
      has_title        INTEGER NOT NULL DEFAULT 0,
      has_meta_desc    INTEGER NOT NULL DEFAULT 0,
      has_h1           INTEGER NOT NULL DEFAULT 0,
      has_sitemap      INTEGER NOT NULL DEFAULT 0,
      has_robots       INTEGER NOT NULL DEFAULT 0,
      has_contact_form INTEGER NOT NULL DEFAULT 0,
      has_og_tags      INTEGER NOT NULL DEFAULT 0,
      has_favicon      INTEGER NOT NULL DEFAULT 0,
      has_analytics    INTEGER NOT NULL DEFAULT 0,
      has_socials      INTEGER NOT NULL DEFAULT 0,
      cms              TEXT,
      cms_version      TEXT,
      outdated_tech    TEXT,   -- JSON: libellés des technos obsolètes détectées
      free_builder     TEXT,   -- wix | e-monsite | jimdo | facebook | ...
      copyright_year   INTEGER,
      page_weight_kb   INTEGER,
      fetch_ms         INTEGER,
      failure_reason   TEXT,
      raw_signals_json TEXT NOT NULL DEFAULT '{}',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS enrichments (
      business_id      TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
      siren            TEXT,
      siret            TEXT,
      legal_form       TEXT,
      naf              TEXT,
      naf_label        TEXT,
      creation_date    TEXT,
      dirigeant_name   TEXT,
      dirigeant_role   TEXT,
      dirigeant_source TEXT,  -- gouv | mentions_legales
      services_json    TEXT NOT NULL DEFAULT '[]',
      colors_json      TEXT NOT NULL DEFAULT '[]',
      socials_json     TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      business_id    TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
      total          INTEGER NOT NULL,
      breakdown_json TEXT NOT NULL DEFAULT '[]',
      computed_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_total ON scores(total DESC);

    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key  TEXT PRIMARY KEY,   -- sha1(source + method + url + body)
      source     TEXT NOT NULL,
      url        TEXT NOT NULL,
      status     INTEGER NOT NULL,
      body       BLOB NOT NULL,      -- octets bruts : préserve l'encodage d'origine
      headers_json TEXT NOT NULL DEFAULT '{}',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_api_cache_source ON api_cache(source);
  `);

  // Colonnes ajoutées après coup : les CREATE ... IF NOT EXISTS ci-dessus ne
  // touchent pas une base déjà créée, il faut donc les rattraper une à une.
  addColumnIfMissing(db, "businesses", "opt_out_marker", "TEXT");
  addColumnIfMissing(db, "businesses", "opt_out_source", "TEXT");
  // `label` est l'adresse complète saisie ; `city` sert à composer la requête
  // Places (« plombier à Zone demo »), jamais depuis l'adresse brute saisie.
  addColumnIfMissing(db, "searches", "city", "TEXT");
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const columns = db
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Le pipeline tourne en mémoire dans le process Node : si le serveur redémarre
 * pendant une recherche, celle-ci ne reprendra jamais. On la marque en erreur
 * au boot plutôt que de laisser un `running` éternel qui ferait tourner le
 * polling de l'UI à vide.
 */
function recoverInterruptedSearches(db: Database.Database): void {
  db.prepare(
    `UPDATE searches
        SET status = 'error',
            error  = 'Recherche interrompue par un redémarrage du serveur'
      WHERE status = 'running'`,
  ).run();
}

/** Utilitaires de conversion — SQLite stocke les booléens en 0/1. */
export const bool = (v: unknown): boolean => v === 1 || v === true;
export const int = (v: boolean): number => (v ? 1 : 0);
