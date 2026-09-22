/* ---------------------------------------------------------------------------
 * Garde-fou de démarrage.
 *
 * Fichier séparé, et non script en ligne : la politique de sécurité du site
 * (netlify.toml, `script-src 'self'`) refuse le code écrit dans la page. Un
 * garde-fou bloqué par la CSP ne garde plus rien — et c'est précisément dans
 * les navigateurs les plus verrouillés qu'on a besoin de lui.
 *
 * Script classique, sans module ni dépendance : il doit s'exécuter même quand
 * tout le reste échoue.
 * ------------------------------------------------------------------------- */
// Garde-fou : si l'application n'a pas pris la main au bout de dix
// secondes, l'écran d'attente doit dire quoi faire plutôt que de laisser
// une page noire et muette. Script classique et autonome : il s'exécute
// même si les modules ne se chargent pas du tout.
(function () {
  var DELAI = 10000;
  setTimeout(function () {
    var ecran = document.getElementById("ecran-chargement");
    if (!ecran || !ecran.isConnected) return;
    var app = document.getElementById("application");
    if (app && !app.hidden) return;

    var causes = [];
    try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); }
    catch (e) { causes.push("le stockage du navigateur est bloqué"); }
    if (!("noModule" in document.createElement("script"))) {
      causes.push("ce navigateur ne gère pas les modules JavaScript");
    }
    if (!navigator.onLine) causes.push("l'appareil est hors ligne");

    ecran.innerHTML = "";
    var boite = document.createElement("div");
    boite.style.cssText = "max-width:34em;padding:24px;text-align:center;"
      + "font-family:system-ui,sans-serif;color:#e6e2d8;line-height:1.6";
    boite.innerHTML =
      '<div style="font-size:1.3rem;font-weight:600;margin-bottom:10px">'
      + "L'application n'a pas pu démarrer</div>"
      + '<p style="color:#a9a396;margin:0 0 14px">'
      + (causes.length
          ? "Cause probable : " + causes.join(", ") + "."
          : "Les fichiers de l'application n'ont pas pu être chargés.")
      + "</p>"
      + '<p style="color:#746e63;font-size:.85rem;margin:0 0 18px">'
      + "Essayez de recharger, ou d'ouvrir la page dans un onglet normal "
      + "plutôt qu'en navigation privée.</p>";
    var bouton = document.createElement("button");
    bouton.textContent = "Recharger";
    bouton.style.cssText = "background:#c9a227;color:#1a1508;border:0;"
      + "border-radius:4px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer";
    bouton.onclick = function () { location.reload(); };
    boite.appendChild(bouton);
    ecran.appendChild(boite);
  }, DELAI);
})();
  
