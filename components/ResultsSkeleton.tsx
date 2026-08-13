/**
 * Squelette de la liste pendant un balayage encore vide.
 *
 * Remplace le « Aucun prospect » qui, en pleine analyse, laissait croire à tort
 * que la recherche n'avait rien trouvé. Pulsation d'opacité seule — pas de
 * dégradé, conformément au design system.
 */

const ROW_WIDTHS = ["w-44", "w-52", "w-36", "w-48", "w-40", "w-44"];

export function ResultsSkeleton() {
  return (
    <ul className="divide-y divide-app-border" aria-hidden>
      {ROW_WIDTHS.map((width, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-app-border" />
          <div className="min-w-0 flex-1">
            <div className={`h-3.5 animate-pulse rounded bg-app-border ${width}`} />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-app-border" />
          </div>
        </li>
      ))}
    </ul>
  );
}
