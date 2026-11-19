// Isto kao inline skripta u src/components/Tema.astro, za prerenderirane stranice (CSP bez noncea, landing odluka 13).
// Učitava se u <head> prije crtanja, pa nema bljeska. Prekidač u zaglavlju (landing odluke 609, 616): natpis i aria-label
// kažu u koju temu gumb prebacuje („Tamna tema” u svijetloj, „Svijetla tema” u tamnoj), kao ikona.
try { const t = localStorage.getItem("logomedo-tema"); if (t === "svijetla" || t === "tamna") document.documentElement.dataset.tema = t; } catch {}
document.addEventListener("DOMContentLoaded", function () {
  var h = document.documentElement;
  var tamno = function () { return h.dataset.tema ? h.dataset.tema === "tamna" : matchMedia("(prefers-color-scheme: dark)").matches; };
  var gumbi = document.querySelectorAll(".prekidac-teme");
  var oznaci = function () {
    var natpis = tamno() ? "Svijetla tema" : "Tamna tema";
    for (var i = 0; i < gumbi.length; i++) if (gumbi[i].hasAttribute("aria-label")) { gumbi[i].setAttribute("aria-label", natpis); gumbi[i].title = natpis; }
  };
  for (var i = 0; i < gumbi.length; i++) {
    gumbi[i].addEventListener("click", function () {
      h.dataset.tema = tamno() ? "svijetla" : "tamna";
      try { localStorage.setItem("logomedo-tema", h.dataset.tema); } catch (e) {}
      oznaci();
    });
  }
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", oznaci); } catch (e) {}
  oznaci();
});
