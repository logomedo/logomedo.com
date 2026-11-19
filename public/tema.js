// Isto kao inline skripta u src/components/Tema.astro, za prerenderirane stranice (CSP bez noncea, landing odluka 13).
try { const t = localStorage.getItem("logomedo-tema"); if (t === "svijetla" || t === "tamna") document.documentElement.dataset.tema = t; } catch {}
