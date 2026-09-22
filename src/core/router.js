/* ---------------------------------------------------------------------------
 * Routeur à fragment (#/chemin). Pas de configuration serveur nécessaire :
 * le site se dépose tel quel sur n'importe quel hébergement statique.
 * ------------------------------------------------------------------------- */
import { definir, etat } from "./store.js";
import { config } from "./config.js";
import { emettre } from "./bus.js";

const routes = [];
let rendu = null;
let conteneur = null;
let nettoyageVue = null;

/** definirRoute("/classe/:id/tableau", { nom, vue, prive }) */
export function definirRoute(motif, options) {
  const cles = [];
  const regex = new RegExp(
    "^" + motif
      .replace(/\/:([\w]+)\?/g, (_, cle) => { cles.push(cle); return "(?:/([^/]+))?"; })
      .replace(/\/:([\w]+)/g,   (_, cle) => { cles.push(cle); return "/([^/]+)"; })
      .replace(/\*/g, ".*")
    + "/?$"
  );
  routes.push({ motif, regex, cles, ...options });
}

export function demarrerRouteur(cible, options = {}) {
  conteneur = cible;
  rendu = options.rendu || null;
  window.addEventListener("hashchange", resoudre);
  resoudre();
}

export function chemin() {
  const brut = location.hash.replace(/^#/, "") || "/";
  return brut.split("?")[0] || "/";
}

export function requete() {
  const brut = location.hash.replace(/^#/, "");
  const idx = brut.indexOf("?");
  return idx < 0 ? {} : Object.fromEntries(new URLSearchParams(brut.slice(idx + 1)));
}

export function aller(destination, remplacer = false) {
  const cible = destination.startsWith("#") ? destination : `#${destination}`;
  if (location.hash === cible) { resoudre(); return; }
  if (remplacer) {
    // replaceState ne déclenche pas hashchange : il faut résoudre soi-même.
    history.replaceState(null, "", cible);
    resoudre();
  } else {
    location.hash = cible;
  }
}

export function retour() {
  if (history.length > 1) history.back();
  else aller("/");
}

export async function resoudre() {
  const url = chemin();
  const route = routes.find((r) => r.regex.test(url)) || routes.find((r) => r.motif === "*");
  if (!route) return;

  if (route.prive && !etat.utilisateur) {
    sessionStorage.setItem("ojm.retour", location.hash);
    aller("/connexion", true);
    return;
  }
  if (route.publique && etat.utilisateur && route.nom === "connexion") {
    aller("/", true);
    return;
  }

  const correspondance = route.regex.exec(url) || [];
  const params = {};
  route.cles.forEach((cle, i) => {
    const valeur = correspondance[i + 1];
    if (valeur !== undefined) params[cle] = decodeURIComponent(valeur);
  });

  definir({ route: { nom: route.nom, params, requete: requete() } });

  if (typeof nettoyageVue === "function") {
    try { nettoyageVue(); } catch (err) { console.error("[routeur] nettoyage", err); }
  }
  nettoyageVue = null;

  emettre("route:avant", { nom: route.nom, params });

  try {
    const module = await route.vue();
    const vue = module.default || module.vue;
    const sortie = await vue({ params, requete: requete() });
    const noeud = sortie instanceof Node ? sortie : sortie?.noeud;
    nettoyageVue = sortie?.nettoyer || null;

    if (rendu) rendu(noeud, route);
    else if (conteneur) conteneur.replaceChildren(noeud);

    conteneur?.scrollTo?.({ top: 0 });
    const enseigne = config.academyName || "Classe Parallèle";
    document.title = sortie?.titre ? `${sortie.titre} — ${enseigne}` : enseigne;
    emettre("route:apres", { nom: route.nom, params });
  } catch (err) {
    console.error("[routeur] vue", err);
    emettre("route:erreur", { erreur: err, route: route.nom });
  }
}

export function routeActuelle() { return etat.route; }
