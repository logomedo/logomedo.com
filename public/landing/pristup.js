// /pristup nakon kupona: odbrojavanje do „Pošalji ponovno” (poslužitelj ionako odbija slanje prije 60 s).
(function () {
  var gumb = document.getElementById("posalji-ponovno");
  if (!gumb) return;
  var ostalo = Number(gumb.getAttribute("data-cekaj") || 0);
  if (ostalo > 0) {
    var t = setInterval(function () {
      ostalo -= 1;
      if (ostalo > 0) gumb.textContent = "Pošalji ponovno (za " + ostalo + " s)";
      else { clearInterval(t); gumb.textContent = "Pošalji ponovno"; gumb.disabled = false; }
    }, 1000);
  }
  if (gumb.form) gumb.form.addEventListener("submit", function () {
    setTimeout(function () { gumb.disabled = true; gumb.textContent = "Šaljem…"; }, 0);
  });
})();
