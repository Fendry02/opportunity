import fs from "node:fs";
import path from "node:path";
import type { ProspectDetail } from "./types";

/**
 * Les vitrines sont volontairement placées à côté de l'application, dans le
 * dossier demandé par l'utilisateur. La variable permet toutefois de choisir
 * un volume monté en production, sans changer le code.
 */
export const DEFAULT_WEBSITES_DIR =
  process.env.OPPORTUNITY_WEBSITES_DIR ??
  path.resolve(process.cwd(), "..", "websites");

export type WebsiteProjectResult = {
  status: "created" | "skipped";
  directory: string;
  reason?: string;
};

export type WebsiteGenerationResult = {
  prospectId: string;
  name: string;
  status: "created" | "skipped" | "failed";
  directory?: string;
  message: string;
};

type WebsiteGenerationDependencies = {
  loadProspect: (id: string) => ProspectDetail | null;
  enrichProspect: (id: string) => Promise<unknown>;
  createProject: (prospect: ProspectDetail) => WebsiteProjectResult;
};

type WebsiteProjectOptions = {
  rootDir?: string;
};

/**
 * Orchestration testable du lot : l'enrichissement précède toujours la
 * génération afin que le prompt et la vitrine utilisent les données les plus
 * fraîches. Une erreur reste isolée au prospect concerné.
 */
export async function runWebsiteGeneration(
  prospectIds: string[],
  dependencies: WebsiteGenerationDependencies,
): Promise<WebsiteGenerationResult[]> {
  const uniqueIds = [...new Set(prospectIds)];
  const results: WebsiteGenerationResult[] = [];

  for (const id of uniqueIds) {
    const initial = dependencies.loadProspect(id);
    if (!initial) {
      results.push({
        prospectId: id,
        name: id,
        status: "failed",
        message: "Prospect introuvable.",
      });
      continue;
    }

    if (initial.optOut) {
      results.push({
        prospectId: id,
        name: initial.name,
        status: "skipped",
        message: "Prospect écarté : refus de démarchage.",
      });
      continue;
    }

    try {
      await dependencies.enrichProspect(id);
      const enriched = dependencies.loadProspect(id);
      if (!enriched) throw new Error("Prospect introuvable après enrichissement.");
      if (enriched.optOut) {
        results.push({
          prospectId: id,
          name: enriched.name,
          status: "skipped",
          message: "Prospect écarté : refus de démarchage.",
        });
        continue;
      }

      const project = dependencies.createProject(enriched);
      results.push({
        prospectId: id,
        name: enriched.name,
        status: project.status,
        directory: project.directory,
        message:
          project.reason ??
          (project.status === "created"
            ? "Vitrine et prompt créés."
            : "Création ignorée."),
      });
    } catch (error) {
      results.push({
        prospectId: id,
        name: initial.name,
        status: "failed",
        message: error instanceof Error ? error.message : "Création du site impossible.",
      });
    }
  }

  return results;
}

/**
 * Crée une première vitrine réellement ouvrable et un prompt de reprise par un
 * agent. Une destination préexistante n'est jamais modifiée : un site déjà
 * travaillé par un humain doit rester intact.
 */
export function createWebsiteProject(
  prospect: ProspectDetail,
  options: WebsiteProjectOptions = {},
): WebsiteProjectResult {
  const rootDir = path.resolve(
    /* turbopackIgnore: true */ options.rootDir ?? DEFAULT_WEBSITES_DIR,
  );
  const directory = path.resolve(rootDir, slugify(prospect.name));
  ensureInsideRoot(rootDir, directory);

  fs.mkdirSync(rootDir, { recursive: true });
  if (fs.existsSync(/* turbopackIgnore: true */ directory)) {
    return {
      status: "skipped",
      directory,
      reason: "Un dossier existe déjà pour ce prospect ; aucun fichier n'a été écrasé.",
    };
  }

  fs.mkdirSync(directory);
  try {
    fs.writeFileSync(path.join(directory, "index.html"), buildWebsiteHtml(prospect), "utf8");
    fs.writeFileSync(
      path.join(directory, "PROMPT.md"),
      buildWebsitePrompt(prospect, directory),
      "utf8",
    );
    fs.writeFileSync(
      path.join(directory, "site.json"),
      JSON.stringify(
        {
          generatedBy: "Opportunity",
          generatedAt: new Date().toISOString(),
          prospectId: prospect.id,
          businessName: prospect.name,
          sourceWebsite: prospect.websiteUrl,
          prompt: "PROMPT.md",
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  } catch (error) {
    // Le dossier vient d'être créé par cet appel : il est sûr de nettoyer ce
    // début de génération, sans toucher aux dossiers qui existaient avant.
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  return { status: "created", directory };
}

/** Prompt autonome, prévu pour un agent qui doit enrichir le prototype. */
export function buildWebsitePrompt(
  prospect: ProspectDetail,
  outputDirectory: string,
): string {
  const services = servicesFor(prospect);
  const reviewSummary = googleReviewSummary(prospect);

  return `# Création du site — ${prospect.name}

Tu es un développeur web senior. Travaille uniquement dans \`${outputDirectory}\`.

## Objectif

Créer puis lancer une vitrine professionnelle, crédible et orientée conversion pour **${prospect.name}**. Le dossier contient déjà un prototype \`index.html\` ouvrable : améliore-le ou remplace-le quand c'est nécessaire, sans modifier les autres dossiers de \`websites\`.

## Informations vérifiées

- Activité : ${prospect.sectorLabel}
- Adresse : ${prospect.address ?? "non disponible"}
- Téléphone : ${prospect.phone ?? "non disponible"}
- Réputation Google : ${reviewSummary}
- Prestations repérées : ${services.join(", ")}
- Couleur existante éventuelle : ${brandColor(prospect) ?? "non disponible"}
- Site existant : ${prospect.websiteUrl ?? "aucun"}

## Critères impératifs

1. Un rendu premium et spécifique au métier, pas une landing page générique.
2. Mobile-first et responsive de 320 px à grand écran ; navigation et CTA utilisables au tactile.
3. Des animations légères et utiles (apparition des sections, hover, feedback de clic), avec \`prefers-reduced-motion\` respecté.
4. Une section « Avis Google » qui ne reprend que la note et le nombre d'avis ci-dessus. Ne pas inventer de témoignages ni de prénoms.
5. Une carte Google Maps localisant l'adresse avec un lien « Itinéraire ».
6. Des CTA explicites vers l'appel ou la demande de devis, des balises SEO cohérentes, une hiérarchie sémantique, des contrastes accessibles et des images optimisées.
7. Prévoir une commande ou une méthode simple pour prévisualiser le site, puis vérifier le rendu mobile et desktop.

Ne publie rien et n'invente aucune information commerciale qui ne figure pas dans ces données. Termine en indiquant les fichiers modifiés et les vérifications effectuées.
`;
}

/** Vitrine statique sans dépendance, prête à être ouverte localement. */
export function buildWebsiteHtml(prospect: ProspectDetail): string {
  const name = escapeHtml(prospect.name);
  const sector = escapeHtml(prospect.sectorLabel.toLowerCase());
  const address = escapeHtml(prospect.address ?? "Adresse à confirmer");
  const phone = prospect.phone ? escapeHtml(prospect.phone) : null;
  const phoneHref = prospect.phone ? `tel:${prospect.phone.replace(/[^+\d]/g, "")}` : null;
  const services = servicesFor(prospect).map(escapeHtml);
  const reviewSummary = escapeHtml(googleReviewSummary(prospect));
  const mapQuery = encodeURIComponent([prospect.name, prospect.address].filter(Boolean).join(", "));
  const mapEmbedUrl = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
  const reviewsUrl = `https://www.google.com/search?tbm=lcl&q=${mapQuery}`;
  const primaryColor = brandColor(prospect) ?? "#0c6b5d";
  const serviceCards = services
    .map(
      (service, index) => `
        <article class="service-card reveal" style="--delay: ${index * 70}ms">
          <span class="service-index">0${index + 1}</span>
          <h3>${service}</h3>
          <p>Un accompagnement soigné, pensé pour votre projet et votre quotidien.</p>
        </article>`,
    )
    .join("\n");
  const phoneCta = phone && phoneHref
    ? `<a class="button button-primary" href="${phoneHref}">Appeler ${phone}</a>`
    : `<a class="button button-primary" href="#contact">Nous contacter</a>`;

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${name} — ${sector} à ${address}. Découvrez les prestations et contactez-nous." />
    <meta name="theme-color" content="${primaryColor}" />
    <title>${name} — ${sector}</title>
    <style>
      :root { --brand: ${primaryColor}; --ink: #17231f; --muted: #5e6b65; --canvas: #f7f7f2; --paper: #fffefb; --line: #dfe4dc; --shadow: 0 22px 60px rgb(22 39 32 / .12); --radius: 1.5rem; }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body { margin: 0; color: var(--ink); background: var(--canvas); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .page { overflow: hidden; }
      .shell { width: min(1120px, calc(100% - 2.5rem)); margin: 0 auto; }
      .eyebrow { display: inline-flex; gap: .55rem; align-items: center; color: var(--brand); font-size: .75rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
      .eyebrow::before { width: .6rem; height: .6rem; border-radius: 50%; background: currentColor; content: ""; }
      .nav { display: flex; align-items: center; justify-content: space-between; min-height: 5.5rem; gap: 1.5rem; }
      .brand { display: flex; align-items: center; gap: .7rem; font-weight: 800; letter-spacing: -.04em; }
      .brand-mark { display: grid; width: 2.2rem; height: 2.2rem; place-items: center; border-radius: .85rem; color: white; background: var(--brand); box-shadow: 0 8px 18px color-mix(in srgb, var(--brand) 32%, transparent); }
      .nav-links { display: flex; align-items: center; gap: 1.35rem; color: var(--muted); font-size: .92rem; }
      .nav-links a { transition: color 180ms ease; }
      .nav-links a:hover { color: var(--brand); }
      .hero { position: relative; padding: 4.5rem 0 6.5rem; }
      .hero::after { position: absolute; z-index: -1; top: -12rem; right: -20rem; width: 42rem; height: 42rem; border-radius: 50%; background: color-mix(in srgb, var(--brand) 13%, transparent); filter: blur(5px); content: ""; }
      .hero-grid { display: grid; grid-template-columns: 1.2fr .8fr; align-items: end; gap: 3.5rem; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { max-width: 13ch; margin: .9rem 0 1.4rem; font-size: clamp(3rem, 7vw, 5.8rem); line-height: .93; letter-spacing: -.075em; text-wrap: balance; }
      .hero-copy { max-width: 52ch; color: var(--muted); font-size: 1.1rem; line-height: 1.7; text-wrap: pretty; }
      .actions { display: flex; flex-wrap: wrap; gap: .8rem; margin-top: 2rem; }
      .button { display: inline-flex; min-height: 2.9rem; align-items: center; justify-content: center; padding: .75rem 1.1rem; border: 1px solid var(--line); border-radius: .9rem; font-size: .92rem; font-weight: 750; transition: transform 180ms ease, background-color 180ms ease, color 180ms ease, border-color 180ms ease; }
      .button:hover { transform: translateY(-2px); }
      .button:active { transform: scale(.96); }
      .button-primary { border-color: var(--brand); color: white; background: var(--brand); box-shadow: 0 10px 22px color-mix(in srgb, var(--brand) 25%, transparent); }
      .button-primary:hover { background: color-mix(in srgb, var(--brand) 88%, #000); }
      .button-plain { background: var(--paper); }
      .hero-card { padding: 1.5rem; border: 1px solid rgb(255 255 255 / .8); border-radius: var(--radius); background: rgb(255 254 251 / .85); box-shadow: var(--shadow); backdrop-filter: blur(16px); }
      .hero-card strong { display: block; margin: .7rem 0 .4rem; font-size: 1.6rem; letter-spacing: -.055em; }
      .hero-card p { margin-bottom: 0; color: var(--muted); line-height: 1.55; }
      .hero-card .address { display: flex; gap: .7rem; align-items: flex-start; padding-top: 1.3rem; margin-top: 1.3rem; border-top: 1px solid var(--line); }
      .pin { width: 1.1rem; height: 1.1rem; flex: 0 0 auto; margin-top: .2rem; border-radius: 50% 50% 50% 0; background: var(--brand); transform: rotate(-45deg); }
      section { padding: 5.5rem 0; }
      .intro { display: grid; grid-template-columns: .72fr 1.28fr; gap: 3rem; align-items: start; }
      h2 { max-width: 16ch; margin-bottom: 0; font-size: clamp(2rem, 4vw, 3.3rem); line-height: 1; letter-spacing: -.06em; text-wrap: balance; }
      .section-copy { max-width: 62ch; color: var(--muted); font-size: 1.05rem; line-height: 1.75; text-wrap: pretty; }
      .services { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 3rem; }
      .service-card { min-height: 14rem; padding: 1.4rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper); transition: transform 200ms ease, box-shadow 200ms ease; }
      .service-card:hover { transform: translateY(-5px); box-shadow: 0 16px 35px rgb(26 50 38 / .1); }
      .service-index { display: inline-block; color: var(--brand); font-size: .76rem; font-weight: 800; letter-spacing: .1em; }
      .service-card h3 { margin: 2.4rem 0 .65rem; font-size: 1.25rem; letter-spacing: -.04em; }
      .service-card p { max-width: 30ch; margin-bottom: 0; color: var(--muted); line-height: 1.55; }
      .review-band { background: var(--ink); color: white; }
      .review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
      .review-band h2 { color: #f4f4eb; }
      .review-band .section-copy { color: #bac4bc; }
      .review-card { padding: 1.8rem; border: 1px solid rgb(255 255 255 / .14); border-radius: var(--radius); background: rgb(255 255 255 / .06); }
      .stars { margin-bottom: .6rem; color: #f6ca5f; letter-spacing: .14em; }
      .rating { font-size: clamp(2.4rem, 4vw, 3.8rem); font-weight: 800; letter-spacing: -.07em; }
      .review-card p { margin: .4rem 0 1.25rem; color: #cad3cb; }
      .review-card a { color: white; font-weight: 750; text-decoration: underline; text-underline-offset: .25em; }
      .location { display: grid; grid-template-columns: .83fr 1.17fr; overflow: hidden; border: 1px solid var(--line); border-radius: calc(var(--radius) + .35rem); background: var(--paper); }
      .location-copy { padding: clamp(1.6rem, 5vw, 4rem); }
      .location-copy h2 { margin-bottom: 1.2rem; }
      .location-copy p { color: var(--muted); line-height: 1.7; }
      .map { min-height: 25rem; border: 0; width: 100%; filter: saturate(.8) contrast(.96); }
      .contact { display: flex; align-items: center; justify-content: space-between; gap: 2rem; padding: 2rem; border-radius: calc(var(--radius) + .35rem); color: white; background: var(--brand); }
      .contact h2 { max-width: 15ch; font-size: clamp(1.8rem, 3vw, 2.7rem); }
      .contact p { max-width: 38ch; margin-bottom: 0; color: color-mix(in srgb, white 78%, transparent); line-height: 1.65; }
      .contact .button { flex: 0 0 auto; border-color: white; color: var(--brand); background: white; }
      footer { padding: 2.5rem 0; color: var(--muted); font-size: .84rem; }
      .footer-row { display: flex; justify-content: space-between; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
      .reveal { opacity: 0; transform: translateY(18px); transition: opacity 550ms ease-out var(--delay, 0ms), transform 550ms ease-out var(--delay, 0ms); }
      .reveal.is-visible { opacity: 1; transform: translateY(0); }
      @media (max-width: 760px) {
        .shell { width: min(100% - 2rem, 1120px); }
        .nav { min-height: 4.7rem; }
        .nav-links { display: none; }
        .hero { padding: 3.4rem 0 4rem; }
        .hero-grid, .intro, .review-grid, .location { grid-template-columns: 1fr; gap: 2rem; }
        h1 { max-width: 11ch; }
        section { padding: 4rem 0; }
        .services { grid-template-columns: 1fr; margin-top: 2rem; }
        .service-card { min-height: auto; }
        .service-card h3 { margin-top: 1.6rem; }
        .map { min-height: 18rem; }
        .contact { align-items: flex-start; flex-direction: column; }
        .footer-row { flex-direction: column; }
      }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="shell nav">
        <a class="brand" href="#top" aria-label="Accueil ${name}"><span class="brand-mark" aria-hidden="true">✦</span><span>${name}</span></a>
        <nav class="nav-links" aria-label="Navigation principale"><a href="#prestations">Prestations</a><a href="#avis">Avis Google</a><a href="#contact">Contact</a></nav>
      </header>
      <main id="top">
        <section class="hero"><div class="shell hero-grid"><div class="reveal"><span class="eyebrow">${sector}</span><h1>Un savoir-faire qui mérite d’être bien visible.</h1><p class="hero-copy">${name} vous accompagne avec attention et exigence. Découvrez nos prestations et échangeons sur votre projet.</p><div class="actions">${phoneCta}<a class="button button-plain" href="#prestations">Découvrir nos prestations</a></div></div><aside class="hero-card reveal" style="--delay: 100ms"><span class="eyebrow">À votre écoute</span><strong>Un projet, une solution adaptée.</strong><p>Une approche claire, des échanges simples et le goût du travail bien fait.</p><div class="address"><span class="pin" aria-hidden="true"></span><span>${address}</span></div></aside></div></section>
        <section id="prestations"><div class="shell"><div class="intro reveal"><span class="eyebrow">Nos prestations</span><div><h2>Des services pensés pour vos besoins.</h2><p class="section-copy">Chaque projet mérite une réponse précise. Découvrez les savoir-faire mis en avant par ${name}.</p></div></div><div class="services">${serviceCards}</div></div></section>
        <section id="avis" class="review-band"><div class="shell review-grid"><div class="reveal"><span class="eyebrow">Réputation locale</span><h2>La confiance se construit aussi en ligne.</h2><p class="section-copy">Consultez la réputation Google de ${name} et préparez votre visite en toute sérénité.</p></div><aside class="review-card reveal" style="--delay: 100ms"><div class="stars" aria-label="Évaluation Google">★★★★★</div><div class="rating">${reviewSummary}</div><p>Données de réputation affichées depuis la fiche Google de l’établissement.</p><a href="${reviewsUrl}" target="_blank" rel="noreferrer">Voir les avis sur Google ↗</a></aside></div></section>
        <section class="shell"><div class="location reveal"><div class="location-copy"><span class="eyebrow">Nous trouver</span><h2>Venez nous rencontrer.</h2><p>${address}</p><a class="button button-plain" href="${directionsUrl}" target="_blank" rel="noreferrer">Obtenir l’itinéraire</a></div><iframe class="map" title="Carte de ${name}" src="${mapEmbedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></section>
        <section id="contact" class="shell"><div class="contact reveal"><div><h2>Parlons de votre projet.</h2><p>Un besoin, une question ou une demande de devis ? Prenez contact avec ${name}.</p></div>${phoneCta}</div></section>
      </main>
      <footer class="shell"><div class="footer-row"><span>© ${new Date().getFullYear()} ${name}</span><span>${sector} · ${address}</span></div></footer>
    </div>
    <script>
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      }, { threshold: 0.14 });
      document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
    </script>
  </body>
</html>
`;
}

function servicesFor(prospect: ProspectDetail): string[] {
  return prospect.enrichment?.services.length
    ? prospect.enrichment.services.slice(0, 4)
    : [`Services de ${prospect.sectorLabel.toLowerCase()}`, "Accompagnement personnalisé", "Conseils adaptés"];
}

function googleReviewSummary(prospect: ProspectDetail): string {
  if (prospect.rating === null) return "Réputation Google à consulter";
  const rating = prospect.rating.toFixed(1).replace(".", ",");
  const count = prospect.reviewCount ?? 0;
  return `${rating}/5 · ${count} avis Google`;
}

function brandColor(prospect: ProspectDetail): string | null {
  const color = prospect.enrichment?.colors.find((item) => /^#[\da-f]{6}$/i.test(item.hex));
  return color?.hex ?? null;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "prospect";
}

function ensureInsideRoot(rootDir: string, directory: string): void {
  const relative = path.relative(rootDir, directory);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Le dossier de site doit rester dans le répertoire websites configuré.");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
