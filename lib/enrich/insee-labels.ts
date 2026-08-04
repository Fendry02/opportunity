/**
 * L'API recherche-entreprises ne renvoie que des **codes** (NAF, catégorie
 * juridique). Un brief commercial affichant « 5499 » ou « 43.22A » n'aide
 * personne : on traduit ici les codes utiles.
 *
 * Les tables ne sont pas exhaustives — inutile d'embarquer les 730 codes NAF.
 * On couvre les secteurs de `config/sectors.ts` et on retombe sinon sur le
 * libellé de section (une lettre A–U), toujours renvoyé par l'API.
 */

/** Catégories juridiques INSEE rencontrées chez les TPE/PME. */
const NATURE_JURIDIQUE: Record<string, string> = {
  "1000": "Entrepreneur individuel",
  "5202": "Société en nom collectif",
  "5306": "Société en commandite simple",
  "5498": "SARL unipersonnelle (EURL)",
  "5499": "SARL",
  "5505": "SA à participation ouvrière",
  "5510": "SA à conseil d'administration",
  "5599": "SA à conseil d'administration",
  "5699": "SA à directoire",
  "5710": "SAS",
  "5720": "SAS à associé unique (SASU)",
  "5785": "Société d'exercice libéral par actions simplifiée",
  "6220": "Groupement d'intérêt économique",
  "6540": "Société civile immobilière",
  "6599": "Société civile",
  "9220": "Association déclarée",
};

/** Repli grossier quand le code exact n'est pas dans la table. */
const NATURE_FAMILY: [RegExp, string][] = [
  [/^1/, "Entrepreneur individuel"],
  [/^5/, "Société commerciale"],
  [/^6/, "Société civile ou groupement"],
  [/^7/, "Personne morale de droit public"],
  [/^8/, "Organisme privé spécialisé"],
  [/^9/, "Association ou fondation"],
];

/** Sections NAF (lettre renvoyée dans `section_activite_principale`). */
const NAF_SECTIONS: Record<string, string> = {
  A: "Agriculture, sylviculture et pêche",
  B: "Industries extractives",
  C: "Industrie manufacturière",
  D: "Production et distribution d'énergie",
  E: "Eau, assainissement et gestion des déchets",
  F: "Construction",
  G: "Commerce et réparation d'automobiles",
  H: "Transports et entreposage",
  I: "Hébergement et restauration",
  J: "Information et communication",
  K: "Activités financières et d'assurance",
  L: "Activités immobilières",
  M: "Activités spécialisées, scientifiques et techniques",
  N: "Services administratifs et de soutien",
  O: "Administration publique",
  P: "Enseignement",
  Q: "Santé humaine et action sociale",
  R: "Arts, spectacles et activités récréatives",
  S: "Autres activités de services",
  T: "Activités des ménages en tant qu'employeurs",
  U: "Activités extra-territoriales",
};

/** Codes NAF correspondant aux secteurs ciblés par l'application. */
const NAF_LABELS: Record<string, string> = {
  // Construction et second œuvre
  "43.21A": "Travaux d'installation électrique dans tous locaux",
  "43.22A": "Travaux d'installation d'eau et de gaz en tous locaux",
  "43.22B": "Travaux d'installation d'équipements thermiques et de climatisation",
  "43.32A": "Travaux de menuiserie bois et PVC",
  "43.32B": "Travaux de menuiserie métallique et serrurerie",
  "43.33Z": "Travaux de revêtement des sols et des murs",
  "43.34Z": "Travaux de peinture et vitrerie",
  "43.39Z": "Autres travaux de finition",
  "43.91A": "Travaux de charpente",
  "43.91B": "Travaux de couverture par éléments",
  "43.99C": "Travaux de maçonnerie générale et gros œuvre de bâtiment",
  "81.30Z": "Services d'aménagement paysager",
  // Restauration et alimentation
  "10.13B": "Charcuterie",
  "10.71C": "Boulangerie et boulangerie-pâtisserie",
  "10.71D": "Pâtisserie",
  "47.22Z": "Commerce de détail de viandes en magasin spécialisé",
  "47.24Z": "Commerce de détail de pain et pâtisserie en magasin spécialisé",
  "56.10A": "Restauration traditionnelle",
  "56.10C": "Restauration de type rapide",
  "56.21Z": "Services des traiteurs",
  "56.30Z": "Débits de boissons",
  // Soins et beauté
  "96.02A": "Coiffure",
  "96.02B": "Soins de beauté",
  "96.04Z": "Entretien corporel",
  // Automobile
  "45.11Z": "Commerce de voitures et de véhicules automobiles légers",
  "45.20A": "Entretien et réparation de véhicules automobiles légers",
  "45.20B": "Entretien et réparation d'autres véhicules automobiles",
  "85.53Z": "Enseignement de la conduite",
  // Commerce de détail
  "47.76Z": "Commerce de détail de fleurs et plantes en magasin spécialisé",
  "47.78A": "Commerce de détail d'optique",
  // Santé et professions libérales
  "75.00Z": "Activités vétérinaires",
  "86.23Z": "Pratique dentaire",
  "86.90E": "Activités des professionnels de la rééducation",
  "68.31Z": "Agences immobilières",
  "69.10Z": "Activités juridiques",
  "69.20Z": "Activités comptables",
};

export function natureJuridiqueLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const exact = NATURE_JURIDIQUE[code];
  if (exact) return exact;
  const family = NATURE_FAMILY.find(([re]) => re.test(code))?.[1];
  // On garde le code : il reste vérifiable, le libellé n'est qu'une aide.
  return family ? `${family} (${code})` : code;
}

export function nafLabel(
  code: string | null | undefined,
  section?: string | null,
): string | null {
  if (!code) return null;
  return NAF_LABELS[code] ?? (section ? (NAF_SECTIONS[section] ?? null) : null);
}
