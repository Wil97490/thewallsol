/* Le thème, en deux temps, dans un fichier externe.

   La CSP du site est `script-src 'self'` : aucun script en ligne ne
   s'exécute, jamais. Ce fichier a d'abord vécu dans une balise <script>
   au milieu du HTML — il n'a donc jamais tourné une seule fois, et les
   pages rendues côté serveur s'affichaient toujours dans le thème par
   défaut sans que rien ne le signale. Un en-tête de sécurité ne prévient
   pas le serveur qu'il vient de casser une page.

   Chargé sans `defer` dans le <head> : il doit poser l'attribut avant le
   premier rendu, sinon la page s'allume en clair puis bascule. */

(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("wall-theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) { /* navigation privée : le thème système fera l'affaire */ }

  function wire() {
    var b = document.getElementById("theme");
    if (!b) return;
    b.addEventListener("click", function () {
      var cur = root.getAttribute("data-theme")
        || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = cur === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("wall-theme", next); } catch (e) {}
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
