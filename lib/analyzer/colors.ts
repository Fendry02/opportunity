import { bodyAsText, cachedFetch } from "../cache";
import { USER_AGENT } from "./fetch-site";
import type { SiteSignals } from "./signals";

/**
 * Palette approximative du site actuel : sert à ouvrir la discussion sur la
 * charte lors du rendez-vous (« on repart de vos couleurs »).
 *
 * Méthode : couleurs des styles inline + premier CSS externe, comptées par
 * fréquence, blanc/noir/gris exclus (ils ne caractérisent rien), top 4.
 */

export type ColorSample = { hex: string; count: number };

const HEX_OR_RGB = /#[0-9a-f]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/gi;

const NAMED: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
};

export function toHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();

  if (NAMED[value]) return NAMED[value];

  if (value.startsWith("#")) {
    const digits = value.slice(1);
    if (digits.length === 3) {
      return `#${digits
        .split("")
        .map((c) => c + c)
        .join("")}`;
    }
    if (digits.length === 6 || digits.length === 8) return `#${digits.slice(0, 6)}`;
    return null;
  }

  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (rgb) {
    const [, r, g, b] = rgb;
    return `#${[r, g, b]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return null;
}

/** Blanc, noir et gris ne disent rien d'une identité visuelle. */
export function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return saturation < 0.15 || max < 24 || min > 235;
}

export function rankColors(rawValues: string[], top = 4): ColorSample[] {
  const counts = new Map<string, number>();
  for (const raw of rawValues) {
    const hex = toHex(raw);
    if (!hex || isNeutral(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, top);
}

/**
 * Extrait la palette : styles inline déjà collectés + premier CSS externe.
 * N'exige que les deux champs utiles, pour pouvoir travailler aussi bien sur
 * une analyse fraîche que sur les signaux relus en base.
 */
export async function extractColors(
  signals: Pick<SiteSignals, "inlineColors" | "cssUrls">,
): Promise<ColorSample[]> {
  const values = [...signals.inlineColors];

  const firstCss = signals.cssUrls[0];
  if (firstCss) {
    const res = await cachedFetch("site", firstCss, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.status === 200) {
      const css = bodyAsText(res);
      for (const m of css.matchAll(HEX_OR_RGB)) values.push(m[0]);
    }
  }

  return rankColors(values);
}
