/* ---------------------------------------------------------------------------
 * Le mode flottant : le cahier à côté du jeu.
 *
 * Un onglet de navigateur passe derrière dès qu'on clique sur Roblox, et il
 * faut alt-tabber pour relire une consigne ou noter une phrase.
 *
 * Chrome et Edge (ordinateur) savent ouvrir un second document qui reste
 * **au-dessus des autres fenêtres**, y compris d'un jeu en fenêtré ou en
 * fenêtré sans bordure : l'API Document Picture-in-Picture. On y déplace
 * l'interface — on ne la duplique pas, il n'y a qu'une seule session.
 *
 * CE QUE CE MODE NE FAIT PAS : il ne se branche pas sur Roblox (aucune
 * intégration, aucune injection), et il ne passe pas au-dessus d'un jeu en
 * plein écran exclusif. Ailleurs (Firefox, Safari), on ouvre une fenêtre
 * détachée classique : sans onglets ni barre d'adresse, à placer à côté du
 * jeu, mais pas au premier plan.
 *
 * Dans cette fenêtre, la barre ne propose que les cahiers et les documents ;
 * à l'ouverture, on retrouve le dernier cahier ouvert.
 * ------------------------------------------------------------------------- */
import { definirHote, docHote } from "../core/hote.js";
import { aller } from "../core/router.js";
import { etat, definir } from "../core/store.js";
import { local } from "../core/util.js";
import { toast } from "../ui/toast.js";
import { estTactile } from "../core/appareil.js";

const CLE_TAILLE = "ojm.flottant.taille";
const IDS = ["application", "calque-modales", "calque-toasts"];

/**
 * Deux tailles, selon ce que l'on regarde : le cahier tient dans une colonne
 * étroite, à côté du jeu ; le tableau a besoin de largeur. Chacune retient la
 * taille que l'on a choisie.
 */
const TAILLES_DEFAUT = {
  cahier: { width: 420, height: 600 },
  tableau: { width: 880, height: 600 }
};
const cleTaille = (mode) => `${CLE_TAILLE}.${mode}`;
const tailleDe = (mode) => ({ ...TAILLES_DEFAUT[mode], ...(local.lire(cleTaille(mode), null) || {}) });

let fenetre = null;

export function flottantDisponible() {
  // Sur téléphone ou tablette, une « fenêtre à côté du jeu » n'a pas de sens :
  // le mode flottant n'est tout simplement pas proposé, quoi que sache le navigateur.
  if (estTactile()) return false;
  return Boolean(globalThis.documentPictureInPicture) || Boolean(globalThis.open);
}

/** Au premier plan par-dessus le jeu, ou seulement détachée ? */
export function flottantAuPremierPlan() {
  return Boolean(globalThis.documentPictureInPicture);
}

export function estFlottant() {
  return Boolean(fenetre && !fenetre.closed);
}

/** Recopie styles et polices dans le document d'accueil. */
function transposerStyles(cible) {
  for (const feuille of document.querySelectorAll('link[rel="stylesheet"], style')) {
    cible.head.appendChild(feuille.cloneNode(true));
  }
  for (const lien of document.querySelectorAll('link[rel="preconnect"]')) {
    cible.head.appendChild(lien.cloneNode(true));
  }
  cible.documentElement.dataset.theme = "nuit";
  // Les réglages du verre (couleur, flou…) vivent sur <html> : la petite fenêtre les reprend.
  cible.documentElement.setAttribute("style", document.documentElement.getAttribute("style") || "");
}

/** Déplace l'interface d'un document à l'autre, sans la reconstruire. */
function demenager(vers) {
  for (const id of IDS) {
    const noeud = docHote().getElementById(id);
    if (noeud) vers.body.appendChild(vers.adoptNode(noeud));
  }
  vers.body.className = document.body.className;
  definirHote(vers);
}

export async function ouvrirFenetreFlottante() {
  if (estFlottant()) {
    fenetre.focus?.();
    return true;
  }

  // On s'ouvre toujours sur le cahier : c'est lui que l'on veut à côté du jeu.
  definir({ flottantMode: "cahier" });
  const taille = tailleDe("cahier");

  try {
    if (globalThis.documentPictureInPicture) {
      fenetre = await documentPictureInPicture.requestWindow({
        width: taille.width, height: taille.height,
        disallowReturnToOpener: false
      });
    } else {
      fenetre = globalThis.open("", "classe-parallele",
        `popup=yes,width=${taille.width},height=${taille.height}`);
      if (!fenetre) {
        toast("Fenêtre bloquée", {
          corps: "Autorisez les fenêtres surgissantes pour ce site, puis réessayez.",
          type: "alerte", duree: 8000
        });
        return false;
      }
      fenetre.document.title = document.title;
    }
  } catch (err) {
    console.warn("[flottant]", err);
    toast("Fenêtre flottante indisponible", { corps: err.message, type: "alerte" });
    fenetre = null;
    return false;
  }

  const doc = fenetre.document;
  transposerStyles(doc);
  demenager(doc);
  doc.body.classList.add("est-flottant");
  detournerLiens(doc);

  fenetre.addEventListener("resize", () => {
    if (!fenetre) return;
    local.ecrire(cleTaille(etat.flottantMode), { width: fenetre.innerWidth, height: fenetre.innerHeight });
  });

  fenetre.addEventListener("pagehide", refermer, { once: true });
  definir({ flottant: true });
  allerALEssentiel();
  return true;
}

/**
 * Dans la petite fenêtre, on n'a que deux choses à faire : écrire et relire.
 * Si l'on est ailleurs (réglages, administration…), on retrouve le dernier
 * cahier ouvert, ou à défaut l'étagère.
 */
function allerALEssentiel() {
  // La séance (tableau + cahier) reste : elle s'adapte à la petite fenêtre.
  if (["cahier", "salle"].includes(etat.route?.nom)) return;
  aller("/manette");
}

/** Ramène l'interface dans la page d'origine. */
/**
 * Les liens de l'application sont des fragments (#/cahier/…). Le document
 * flottant n'a pas d'URL : un clic y déclenche une navigation qui *ferme la
 * fenêtre*. On intercepte donc, et on passe par le routeur, qui écrit dans
 * l'adresse de la page d'origine — restée derrière, mais toujours maîtresse
 * de l'état.
 */
function detournerLiens(doc) {
  doc.addEventListener("click", (e) => {
    const lien = e.target?.closest?.('a[href^="#/"]');
    if (!lien || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;   // ouvrir ailleurs reste permis
    e.preventDefault();
    aller(lien.getAttribute("href").slice(1));
  }, true);
}

export function refermer() {
  if (!fenetre) return;
  const veuve = fenetre;
  fenetre = null;

  for (const id of IDS) {
    const noeud = veuve.document?.getElementById(id);
    if (noeud) document.body.appendChild(document.adoptNode(noeud));
  }
  definirHote(document);
  document.body.classList.remove("est-flottant");
  definir({ flottant: false });

  try { if (!veuve.closed) veuve.close(); } catch { /* déjà fermée */ }
}

/**
 * Passe de la vue « cahier » à la vue « tableau » (ou l'inverse) et adapte la
 * taille de la fenêtre : étroite pour écrire, large pour suivre le tableau.
 * À appeler depuis un clic (le navigateur exige un geste pour redimensionner).
 */
export function definirModeFlottant(mode) {
  if (!TAILLES_DEFAUT[mode]) return;
  definir({ flottantMode: mode });
  if (!estFlottant()) return;
  const { width, height } = tailleDe(mode);
  // Une fenêtre détachée a des bordures : on compense, sinon elle rétrécit à chaque bascule.
  const bordsL = Math.max(0, (fenetre.outerWidth || 0) - (fenetre.innerWidth || 0));
  const bordsH = Math.max(0, (fenetre.outerHeight || 0) - (fenetre.innerHeight || 0));
  try { fenetre.resizeTo(width + bordsL, height + bordsH); } catch (err) { console.warn("[flottant] taille", err); }
}

export function basculerFenetreFlottante() {
  if (!estFlottant() && !flottantDisponible()) return false;
  if (estFlottant()) { refermer(); return false; }
  return ouvrirFenetreFlottante();
}
