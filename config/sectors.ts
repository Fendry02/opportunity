/**
 * Secteurs cibles balayés par une recherche.
 *
 * `query` sert à construire la requête Text Search (« <query> à <ville> »).
 * `primaryTypes` sert à recouper le `primaryType` renvoyé par Google, pour
 * étiqueter le prospect et alimenter la déduction de services.
 *
 * Liste volontairement éditable : ajouter/retirer un secteur ici suffit,
 * rien d'autre dans le code ne connaît les métiers.
 */
export type Sector = {
  id: string;
  label: string;
  query: string;
  primaryTypes: string[];
  /** Coché par défaut dans le formulaire de recherche. */
  default?: boolean;
};

export const SECTORS: Sector[] = [
  {
    id: "plombier",
    label: "Plombier",
    query: "plombier",
    primaryTypes: ["plumber"],
    default: true,
  },
  {
    id: "electricien",
    label: "Électricien",
    query: "électricien",
    primaryTypes: ["electrician"],
    default: true,
  },
  {
    id: "menuisier",
    label: "Menuisier",
    query: "menuisier",
    primaryTypes: ["carpenter", "general_contractor"],
    default: true,
  },
  {
    id: "macon",
    label: "Maçon",
    query: "maçon",
    primaryTypes: ["general_contractor"],
  },
  {
    id: "peintre",
    label: "Peintre en bâtiment",
    query: "peintre en bâtiment",
    primaryTypes: ["painter"],
  },
  {
    id: "couvreur",
    label: "Couvreur",
    query: "couvreur",
    primaryTypes: ["roofing_contractor"],
  },
  {
    id: "paysagiste",
    label: "Paysagiste",
    query: "paysagiste",
    primaryTypes: ["landscaper", "gardener"],
  },
  {
    id: "restaurant",
    label: "Restaurant",
    query: "restaurant",
    primaryTypes: ["restaurant", "french_restaurant"],
    default: true,
  },
  {
    id: "boulangerie",
    label: "Boulangerie",
    query: "boulangerie",
    primaryTypes: ["bakery"],
  },
  {
    id: "boucherie",
    label: "Boucherie",
    query: "boucherie",
    primaryTypes: ["butcher_shop"],
  },
  {
    id: "coiffeur",
    label: "Coiffeur",
    query: "salon de coiffure",
    primaryTypes: ["hair_salon", "hair_care"],
    default: true,
  },
  {
    id: "esthetique",
    label: "Institut de beauté",
    query: "institut de beauté",
    primaryTypes: ["beauty_salon", "spa"],
  },
  {
    id: "garage",
    label: "Garage automobile",
    query: "garage automobile",
    primaryTypes: ["car_repair"],
    default: true,
  },
  {
    id: "auto_ecole",
    label: "Auto-école",
    query: "auto-école",
    primaryTypes: ["driving_school", "school"],
  },
  {
    id: "fleuriste",
    label: "Fleuriste",
    query: "fleuriste",
    primaryTypes: ["florist"],
  },
  {
    id: "opticien",
    label: "Opticien",
    query: "opticien",
    primaryTypes: ["optician", "store"],
  },
  {
    id: "veterinaire",
    label: "Vétérinaire",
    query: "vétérinaire",
    primaryTypes: ["veterinary_care"],
  },
  {
    id: "kine",
    label: "Kinésithérapeute",
    query: "kinésithérapeute",
    primaryTypes: ["physiotherapist"],
  },
  {
    id: "dentiste",
    label: "Dentiste",
    query: "cabinet dentaire",
    primaryTypes: ["dentist"],
  },
  {
    id: "avocat",
    label: "Avocat",
    query: "avocat",
    primaryTypes: ["lawyer"],
  },
  {
    id: "comptable",
    label: "Expert-comptable",
    query: "expert-comptable",
    primaryTypes: ["accounting"],
  },
  {
    id: "agence_immo",
    label: "Agence immobilière",
    query: "agence immobilière",
    primaryTypes: ["real_estate_agency"],
  },
];

export const SECTORS_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

export function sectorLabel(id: string): string {
  return SECTORS_BY_ID.get(id)?.label ?? id;
}
