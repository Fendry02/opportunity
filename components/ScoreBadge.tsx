import { TIER_COLOR, TIER_LABEL, type ScoreTier } from "@/lib/scoring";

/**
 * Pastille pleine + chiffre blanc. Avec les pins de la carte, c'est le seul
 * élément vivement coloré de l'interface.
 */
export function ScoreBadge({
  score,
  tier,
  size = "md",
}: {
  score: number | null;
  tier: ScoreTier | null;
  size?: "sm" | "md" | "lg";
}) {
  if (score === null || tier === null) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-dashed border-app-border text-app-muted tnum"
        style={dimensions[size]}
        title="Analyse en cours"
      >
        …
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white tnum"
      style={{ ...dimensions[size], backgroundColor: TIER_COLOR[tier] }}
      title={`${TIER_LABEL[tier]} — score ${score}/100`}
    >
      {score}
    </span>
  );
}

const dimensions: Record<"sm" | "md" | "lg", React.CSSProperties> = {
  sm: { width: 26, height: 26, fontSize: 11 },
  md: { width: 32, height: 32, fontSize: 13 },
  lg: { width: 44, height: 44, fontSize: 17 },
};
