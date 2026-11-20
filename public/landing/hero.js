// Hero naslovne (landing odluka 802), vanjska datoteka jer CSP landinga nema nonce (odluka 13), kao /tema.js.
// Svaka kartica ima nekoliko slika istog slova jednu na drugoj; vidi se .aktivna. Prelazak mišem ili dodir
// pokaže sljedeću; inače se kartice redom same izmjenjuju (jedna po jedna), osim uz prefers-reduced-motion,
// dok je kartica pod mišem i dok je kartica preglednika skrivena.
(function () {
  var KORAK_MS = 2200;
  var kartice = Array.prototype.slice.call(document.querySelectorAll("[data-hero-kartica]"));
  if (!kartice.length) return;
  var pod = [];

  function sljedeca(k) {
    var slike = k.querySelectorAll("img");
    if (slike.length < 2) return;
    var i = 0;
    for (var j = 0; j < slike.length; j++) if (slike[j].classList.contains("aktivna")) i = j;
    slike[i].classList.remove("aktivna");
    slike[(i + 1) % slike.length].classList.add("aktivna");
  }

  kartice.forEach(function (k) {
    k.addEventListener("pointerenter", function (e) {
      if (e.pointerType !== "mouse") return;
      pod.push(k);
      sljedeca(k);
    });
    k.addEventListener("pointerleave", function () { pod = pod.filter(function (x) { return x !== k; }); });
    // Dodir i olovka: mijenja samo pointerdown (pointerenter na dodir je preskočen gore).
    k.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") sljedeca(k); });
  });

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var red = 0;
  setInterval(function () {
    if (document.hidden) return;
    var k = kartice[red++ % kartice.length];
    if (pod.indexOf(k) < 0) sljedeca(k);
  }, KORAK_MS);
})();
