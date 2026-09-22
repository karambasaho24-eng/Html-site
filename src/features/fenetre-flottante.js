/* ---------------------------------------------------------------------------
 * La fenêtre d'à-côté.
 *
 * Le site est conçu pour cohabiter avec le jeu, pas pour le remplacer. Mais un
 * onglet de navigateur passe derrière dès qu'on clique sur Roblox, et il faut
 * alt-tabber pour relire une consigne — ce qui casse la scène à chaque fois.
 *
 * Chrome sait ouvrir un second document qui reste **au-dessus de toutes les
 * fenêtres**, y compris d'un jeu en plein écran fenêtré : l'API Document
 * Picture-in-Picture. On y déplace l'interface entière — on ne la duplique
 * pas, il n'y aurait qu'une seule session mais deux états à tenir d'accord.
 *
 * Quand le navigateur ne sait pas faire, on retombe sur une fenêtre détachée
 * classique : elle n'est pas au premier plan, mais elle n'a ni onglets ni
 * barre d'adresse, et elle se pose à côté du jeu.
 * ------------------------------------------------------------------------- */
import { definirHote, docHote } from "../core/hote.js";
import { aller } from "../core/router.js";
import { etat, definir } from "../core/store.js";
import { local } from "../core/util.js";
import { toast } from "../ui/toast.js";

const CLE_TAILLE = "ojm.flottant.taille";
const IDS = ["application", "calque-modales", "calque-toasts"];

let fenetre = null;
let densiteAvant = null;

export function flottantDisponible() {
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
  cible.documentElement.dataset.theme = document.documentElement.dataset.theme || "nuit";
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
  if (estFlottant()) { fenetre.focus?.(); return true; }

  const taille = local.lire(CLE_TAILLE, { width: 460, height: 680 });
  densiteAvant = etat.densite;

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

  // On resserre d'office, et on rendra sa densité à la grande fenêtre en
  // revenant.
  appliquerDensiteFlottante(taille.width);

  fenetre.addEventListener("resize", () => {
    local.ecrire(CLE_TAILLE, { width: fenetre.innerWidth, height: fenetre.innerHeight });
    appliquerDensiteFlottante(fenetre.innerWidth);
  });

  fenetre.addEventListener("pagehide", refermer, { once: true });
  definir({ flottant: true });
  return true;
}

/**
 * Jamais « minimal » ici : cette densité masque le rail, ce qui est un gain de
 * place dans la grande fenêtre mais supprimerait toute navigation dans une
 * fenêtre qui n'a que ça.
 */
function appliquerDensiteFlottante(largeur) {
  fenetre.document.documentElement.dataset.density = largeur < 820 ? "compact" : "moyen";
}

/** Ramène l'interface dans la page d'origine. */
/**
 * Les liens de l'application sont des fragments (#/cahiers). Le document
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
  document.documentElement.dataset.density = densiteAvant || "grand";
  definir({ flottant: false, densite: densiteAvant || etat.densite });

  try { if (!veuve.closed) veuve.close(); } catch { /* déjà fermée */ }
}

export function basculerFenetreFlottante() {
  return estFlottant() ? (refermer(), false) : ouvrirFenetreFlottante();
}
