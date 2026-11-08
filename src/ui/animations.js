/* ---------------------------------------------------------------------------
 * Animations de papier : un élément qu'on supprime part en boule (« jeté ») ou
 * se déchire en deux (« dechire ») ; un cahier qu'on ouvre pivote sur sa
 * reliure. Les styles sont dans styles/animations.css.
 *
 * Principe : on ne touche jamais à l'élément d'origine, sauf pour le cacher.
 * Des copies fixes (« fantômes ») jouent l'animation par-dessus, puis
 * disparaissent. L'appelant garde donc la main : si la suppression échoue, il
 * appelle annuler() et l'élément réapparaît tel quel.
 * ------------------------------------------------------------------------- */

import { local } from "../core/util.js";

/* Les animations sont une option : coupées tant qu'on ne les a pas allumées
   (menu « Tout le reste »), et toujours coupées si l'appareil demande moins de mouvement. */
const CLE = "ojm.animations";
export const animationsVoulues = () => local.lire(CLE, false) === true;
export const animationsActives = () => animationsVoulues()
  && globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== true;
export function basculerAnimations() { local.ecrire(CLE, !animationsVoulues()); }

const reduit = () => !animationsActives();

const SANS_EFFET = { fini: Promise.resolve(), annuler() {} };

function fantome(noeud, rect, classe) {
  const copie = noeud.cloneNode(true);
  copie.removeAttribute("id");
  copie.setAttribute("aria-hidden", "true");
  copie.setAttribute("inert", "");
  copie.className = `${noeud.className} papier-fantome ${classe}`;
  Object.assign(copie.style, {
    left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`
  });
  document.body.appendChild(copie);
  return copie;
}

/**
 * Joue la sortie d'un élément qu'on supprime.
 * @param {Element} noeud  l'élément visible (carte, ligne, onglet…)
 * @param {"jete"|"dechire"} type
 * @returns {{ fini: Promise<void>, annuler: () => void }}
 */
export function sortiePapier(noeud, type = "jete") {
  if (!noeud || !noeud.isConnected || reduit()) return SANS_EFFET;
  const rect = noeud.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return SANS_EFFET;

  const copies = type === "dechire"
    ? [fantome(noeud, rect, "papier-fantome--gauche"), fantome(noeud, rect, "papier-fantome--droite")]
    : [fantome(noeud, rect, "papier-fantome--jete")];

  const visibiliteAvant = noeud.style.visibility;
  noeud.style.visibility = "hidden";

  let termine = false;
  const nettoyer = () => { if (!termine) { termine = true; copies.forEach((c) => c.remove()); } };

  const fini = new Promise((resoudre) => {
    // L'animation dure moins d'une demi-seconde ; le délai de sécurité évite de laisser
    // un fantôme à l'écran si l'événement n'arrive jamais (onglet en arrière-plan).
    const garde = setTimeout(() => { nettoyer(); resoudre(); }, 900);
    copies[0].addEventListener("animationend", () => {
      clearTimeout(garde); nettoyer(); resoudre();
    }, { once: true });
  });

  return {
    fini,
    annuler() {
      nettoyer();
      noeud.style.visibility = visibiliteAvant;
    }
  };
}

/** Fait pivoter un cahier à l'ouverture (une seule fois). */
export function ouvrirLivre(noeud) {
  if (!noeud || reduit()) return;
  noeud.classList.add("relieur--ouvre");
  const retirer = () => noeud.classList.remove("relieur--ouvre");
  noeud.addEventListener("animationend", retirer, { once: true });
  setTimeout(retirer, 800);
}
