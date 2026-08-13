/**
 * Petites icônes en SVG inline, monochromes, alignées sur la taille du texte.
 *
 * Volontairement pas d'emoji (interdits par le design system) et pas de
 * caractères Unicode exotiques : `⃠` par exemple est une marque *combinante*,
 * qui se rend de façon imprévisible quand on l'utilise seule.
 */

type IconProps = { size?: number; className?: string };

function svg(size: number, className: string | undefined, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/** Prospect écarté : cercle barré. */
export function BlockedIcon({ size = 16, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M3.8 3.8l8.4 8.4" />
    </>,
  );
}

/** Affichage mobile. */
export function MobileIcon({ size = 12, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
      <path d="M7 12.5h2" />
    </>,
  );
}

/** Connexion sécurisée. */
export function LockIcon({ size = 12, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V4.8a2.5 2.5 0 0 1 5 0V7" />
    </>,
  );
}

/** Référencement. */
export function SearchIcon({ size = 12, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4L14 14" />
    </>,
  );
}

/** Formulaire de contact. */
export function MailIcon({ size = 12, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M2 4.5l6 4.5 6-4.5" />
    </>,
  );
}

/** Thème clair. */
export function SunIcon({ size = 16, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" />
    </>,
  );
}

/** Thème sombre. */
export function MoonIcon({ size = 16, className }: IconProps) {
  return svg(
    size,
    className,
    <path d="M13 9.3A5.4 5.4 0 0 1 6.7 3a5.4 5.4 0 1 0 6.3 6.3Z" />,
  );
}

/** Balayage / radar : illustration discrète de l'état vide. */
export function RadarIcon({ size = 16, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 8l4.6-4.6" />
    </>,
  );
}

/** Technologie à jour. */
export function GearIcon({ size = 12, className }: IconProps) {
  return svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </>,
  );
}
