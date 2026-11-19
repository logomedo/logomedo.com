// Praćenje novih poruka u /admin/poruke bez WebSocketa (odluka 313): GET /admin/poruke/stanje svakih ~12 s,
// samo dok je tab vidljiv (i odmah kad postane vidljiv). Kad se potpis promijeni, poziva `promjena()`.

export function pratiPoruke(url: string, pocetni: string, promjena: () => void, razmak = 12_000): void {
  let potpis = pocetni;
  let tajmer: ReturnType<typeof setTimeout> | undefined;
  const provjeri = async () => {
    tajmer = undefined;
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin", redirect: "error" });
      if (r.ok) {
        const { potpis: novi } = (await r.json()) as { potpis?: string };
        if (novi && novi !== potpis) { potpis = novi; promjena(); }
      }
    } catch { /* mreža ili istekla sesija: pokuša opet */ }
    zakazi();
  };
  const zakazi = () => { if (!tajmer && document.visibilityState === "visible") tajmer = setTimeout(provjeri, razmak); };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { clearTimeout(tajmer); tajmer = undefined; void provjeri(); }
  });
  zakazi();
}

/** Nacrt odgovora preživi osvježavanje niti (sessionStorage, samo ova kartica). */
export const nacrtKljuc = (razgovorId: string) => `poruke:nacrt:${razgovorId}`;
