// H1 naslovne (landing odluka 808): nasumična varijanta na svako osvježavanje, različita od prošle; /?naslov=N pokaže N-tu.
// Učitava se sinkrono odmah iza h1, pa se zamjena dogodi prije prvog crtanja. Vanjska datoteka jer CSP nema nonce.
(function () {
  var h1 = document.getElementById("naslov");
  var v;
  try { v = JSON.parse(h1.getAttribute("data-varijante")); } catch (e) { return; }
  if (!v || v.length < 2) return;
  var i = parseInt(new URLSearchParams(location.search).get("naslov"), 10) - 1;
  if (!(i >= 0 && i < v.length)) {
    var prosla = -1;
    try { prosla = parseInt(localStorage.getItem("logomedo-naslov"), 10); } catch (e) {}
    do { i = Math.floor(Math.random() * v.length); } while (i === prosla);
  }
  try { localStorage.setItem("logomedo-naslov", String(i)); } catch (e) {}
  var em = document.createElement("em");
  em.textContent = v[i].drugi;
  h1.replaceChildren(document.createTextNode(v[i].prvi + " "), em);
})();
