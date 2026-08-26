/* Le film de la page d'accueil.

   Externe, pas en ligne : `script-src 'self'` bloque tout script inline,
   silencieusement côté serveur. La première version vivait dans une
   balise <script> et n'a jamais démarré une seule fois sur ordinateur. */

(function () {
  var v = document.getElementById("filmv");
  if (!v) return;

  // Ce n'est pas une préférence esthétique : une boucle de dix-sept
  // secondes rend certaines personnes malades. L'affiche et les
  // commandes restent, rien ne bouge.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  /* Le deuxième piège : appeler play() dans la foulée de preload="none"
     rejette la promesse — il n'y a pas une image en mémoire. On charge,
     on attend d'avoir de quoi jouer, puis on lance. Un seul réessai :
     au-delà, c'est que le navigateur a dit non pour de bon, et la page
     ne perd rien. */
  var tries = 0;
  function go() {
    var p = v.play();
    if (p && p.catch) p.catch(function () {
      if (tries++ < 1) setTimeout(go, 400);
    });
  }

  new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      v.preload = "auto";
      v.load();
      if (v.readyState >= 3) go();
      else v.addEventListener("canplay", go, { once: true });
    });
  }, { threshold: 0.25 }).observe(v);
})();
