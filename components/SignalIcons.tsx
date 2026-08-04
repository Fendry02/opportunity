import {
  GearIcon,
  LockIcon,
  MailIcon,
  MobileIcon,
  SearchIcon,
} from "./icons";
import type { ProspectSummary } from "@/lib/types";

/**
 * Cinq pastilles qui résument l'état du site dans la liste.
 * Vert = en place, rouge = manquant. Des pictogrammes plutôt que des
 * initiales : « M S R F T » ne se devine pas.
 */

type FlagKey = keyof NonNullable<ProspectSummary["flags"]>;

const SIGNALS: { key: FlagKey; label: string; Icon: typeof MobileIcon }[] = [
  { key: "mobile", label: "Adapté au mobile", Icon: MobileIcon },
  { key: "https", label: "Connexion sécurisée (HTTPS)", Icon: LockIcon },
  { key: "seo", label: "Balises de référencement complètes", Icon: SearchIcon },
  { key: "contact", label: "Formulaire de contact", Icon: MailIcon },
  { key: "modern", label: "Technologie à jour", Icon: GearIcon },
];

export function SignalIcons({ flags }: { flags: ProspectSummary["flags"] }) {
  if (!flags) return null;

  return (
    <span className="flex items-center gap-1">
      {SIGNALS.map(({ key, label, Icon }) => {
        const ok = flags[key];
        return (
          <span
            key={key}
            title={`${label} : ${ok ? "oui" : "non"}`}
            className="inline-flex h-5 w-5 items-center justify-center rounded-[4px]"
            style={
              ok
                ? { background: "#f0fdf4", color: "#16a34a" }
                : { background: "#fef2f2", color: "#dc2626" }
            }
          >
            <Icon />
            <span className="sr-only">
              {label} : {ok ? "oui" : "non"}
            </span>
          </span>
        );
      })}
    </span>
  );
}
