// Ukrasi stranica za ispis bilježnice. Isti SVG crta HTML ispis (/b/<slug>/ispis) i PDF.

/** Grančica jele s bobicama za kutove stranice (gornji lijevi kut; ostali su zrcaljeni). */
export const GRANCICA = `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="#2f6b45" stroke-width="2.2" stroke-linecap="round">
  <path d="M4 4 Q50 20 96 66"/>${Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 10, x = 4 + 92 * t, y = 4 + 16 * t * 2 * (1 - t) + 62 * t * t;
    return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l-9 12 M${x.toFixed(1)} ${y.toFixed(1)} l12 -7"/>`;
  }).join("")}
  <path d="M8 6 Q16 50 60 100"/>${Array.from({ length: 7 }, (_, i) => {
    const t = (i + 1) / 8, x = 8 + 52 * t, y = 6 + 94 * t;
    return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l-11 4 M${x.toFixed(1)} ${y.toFixed(1)} l8 -9"/>`;
  }).join("")}</g>
  <circle cx="22" cy="22" r="6" fill="#d9483b"/><circle cx="32" cy="16" r="5" fill="#d9483b"/><circle cx="16" cy="33" r="5" fill="#d9483b"/></svg>`;

/** Stil bora za ispis (bojanje): isti u CSS-u stranice za ispis i u PDF-u. */
export const BOR_ISPIS_STIL: Record<string, Record<string, string>> = {
  krosnja: { fill: "#fff", stroke: "#000", "stroke-width": "2.5" },
  snijeg: { fill: "none", stroke: "#000", "stroke-width": "1.2", "stroke-dasharray": "3 4" },
  deblo: { fill: "#fff", stroke: "#000", "stroke-width": "2.5" },
  zvijezda: { fill: "#fff", stroke: "#000", "stroke-width": "2.5" },
  girlanda: { fill: "none", stroke: "#000", "stroke-width": "1.5", "stroke-dasharray": "2 4" },
};
