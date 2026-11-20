// N-4 naslovne (landing odluka 805), vanjska datoteka jer CSP landinga nema nonce (odluka 13), kao /tema.js.
// Pločica slova je gumb: klik pokaže ili sakrije sliku za to slovo (CSS po aria-pressed).
(function () {
  var plocice = document.querySelectorAll("[data-glas-plocica]");
  for (var i = 0; i < plocice.length; i++) {
    plocice[i].addEventListener("click", function () {
      this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  }
})();
