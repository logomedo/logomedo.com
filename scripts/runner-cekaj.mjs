// Čeka zvono s Workera: WebSocket /api/runner/zvono, izlaz čim stigne „posao” ili nakon
// <sekunde> (default 600). Izlaz 0 = provjeri red, 1 = veza ne radi (runner onda spava 30 s).
// Okolina: LOGOMEDO_URL, RUNNER_TOKEN (runner.sh ih izvozi).
const rok = Number(process.argv[2] ?? 600) * 1000;
const url = process.env.LOGOMEDO_URL.replace(/^http/, "ws") + "/api/runner/zvono";
const ws = new WebSocket(url, { headers: { authorization: `Bearer ${process.env.RUNNER_TOKEN}` } });
const kraj = (kod, poruka) => { if (poruka) console.error(poruka); clearInterval(ping); clearTimeout(t); try { ws.close(); } catch {} process.exit(kod); };
const t = setTimeout(() => kraj(0), rok);
const ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 30_000);
ws.addEventListener("message", (e) => { if (e.data === "posao") kraj(0); });
ws.addEventListener("error", (e) => kraj(1, `zvono: ${e.message ?? "greška veze"}`));
ws.addEventListener("close", (e) => kraj(e.code === 1000 ? 0 : 1, e.code === 1000 ? "" : `zvono zatvoreno: ${e.code}`));
