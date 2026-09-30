# Opportunity

**Repérez les entreprises locales dont le site web est absent ou à refaire.** Opportunity les classe par intérêt commercial et prépare un diagnostic et un brief Markdown pour chacune.

[![CI](https://github.com/Fendry02/opportunity/actions/workflows/ci.yml/badge.svg)](https://github.com/Fendry02/opportunity/actions/workflows/ci.yml)
[![Licence : AGPL v3](https://img.shields.io/badge/Licence-AGPL_v3-blue.svg)](LICENSE)

![Démo : recherche, classement et diagnostic d'un prospect](public/screenshots/demo.gif)

- Recherchez des commerces autour d'une ville, consultez les résultats sur une carte et filtrez-les par score.
- Vérifiez les défauts visibles de leur site et exportez un brief Markdown, seul ou pour tout le balayage.
- Suivez vos prises de contact. Les entreprises qui refusent le démarchage sont exclues du score et des briefs.
- En option, créez des prototypes de vitrines, finalisez-les avec Claude Code et publiez-les sur Vercel.

Le diagnostic utilise des règles déterministes et un cache SQLite local. L'outil est centré sur la France : le géocodage et l'enrichissement utilisent des API publiques françaises. L'interface est en français.

## Démarrage rapide

Prérequis : **Node.js 22 ou plus récent**.

```bash
git clone https://github.com/Fendry02/opportunity.git
cd opportunity
npm ci
cp .env.local.example .env.local
npm run dev
```

Ouvrez <http://localhost:3000>, gardez **Tours** dans le champ de recherche et cliquez sur **Lancer le balayage**. Le fichier d'exemple active `MOCK_EXTERNAL=1` : les entreprises sont fictives, aucune clé Google n'est nécessaire et aucun appel Places n'est facturé. Les fixtures ne couvrent que Tours. Le fond de carte est chargé depuis CARTO par le navigateur.

## Recherches réelles

Créez un projet Google Cloud avec facturation, activez **Places API (New)** et créez une clé limitée à cette API. Dans `.env.local` :

```dotenv
GOOGLE_PLACES_API_KEY=votre_cle
MOCK_EXTERNAL=0
```

Redémarrez l'application. Les recherches Google Places sont facturables : vérifiez les [tarifs et quotas](https://developers.google.com/maps/billing-and-pricing/pricing). `PLACES_DAILY_CAP` limite les appels quotidiens côté application à 300 par défaut ; le cache SQLite évite de répéter les mêmes appels pendant sa durée de validité. Pour vérifier une nouvelle clé avec un test ponctuel :

```bash
npm run places:smoke -- "plombier à Tours"
```

## Vitrines et publication (facultatif)

Depuis les résultats, sélectionnez des prospects puis cliquez sur **Créer N sites**. Une confirmation précède le lancement. Les projets sont écrits dans `../websites` par défaut ; `OPPORTUNITY_WEBSITES_DIR` permet de choisir un autre dossier. Chaque projet contient une vitrine HTML, un prompt, un brouillon de devis et les données source.

Pour la finalisation assistée, installez et connectez Claude Code. Il peut engendrer des frais ; le plafond par vitrine est de **3 USD** par défaut (`OPPORTUNITY_WEBSITE_AGENT_MAX_BUDGET_USD`). Sans commande `claude`, le prototype HTML est créé, mais la finalisation passe en erreur et peut être relancée. Le mode démo ne simule ni Claude Code ni Vercel.

Pour publier les vitrines finalisées, renseignez `VERCEL_TOKEN` dans `.env.local` ; `VERCEL_SCOPE` est facultatif pour une équipe. L'application prépare des brouillons de contact mais **n'envoie aucun e-mail**.

## Auto-hébergement

L'instance est mono-utilisateur. Définissez `APP_PASSWORD` avant de l'exposer sur Internet et conservez `/data` sur un volume persistant :

```bash
docker build -t opportunity .
docker run -p 3000:3000 \
  -e APP_PASSWORD=un_mot_de_passe_solide \
  -e MOCK_EXTERNAL=1 \
  -v opportunity_data:/data \
  opportunity
```

Un exemple [`fly.toml`](fly.toml) est aussi fourni pour Fly.io. Il démarre en mode démo ; pour les recherches réelles, ajoutez la clé Google comme secret et passez `MOCK_EXTERNAL` à `0`. L'image Docker ne contient pas Claude Code : la finalisation assistée nécessite de l'installer et de le connecter dans le conteneur.

## Développement et contribution

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
npm run build
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour ajouter un secteur ou un signal de score. Les signalements et pull requests sont bienvenus.

### Feuille de route

Le principal chantier est un géocodeur interchangeable pour utiliser Opportunity hors de France. De nouveaux signaux de diagnostic sont également bienvenus.

### Hors périmètre

Pas de SaaS multi-comptes, de CRM, de prospection automatisée de masse ni de LLM pour établir le score. Les données analysées sont publiques ; les refus de démarchage sont respectés.

## Licence

[GNU AGPL-3.0](LICENSE).
