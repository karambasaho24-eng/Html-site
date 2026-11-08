/* ---------------------------------------------------------------------------
 * Le type d'appareil : téléphone, ou écran tactile en général.
 *
 * Sur téléphone c'est le MÊME site, simplement rangé autrement : une barre en
 * bas pour naviguer, une barre du haut réduite à l'essentiel, des boutons à
 * la taille d'un doigt. Le mode flottant n'y existe pas (un navigateur de
 * téléphone ne sait pas poser une fenêtre par-dessus un jeu).
 *
 * `html.telephone` est posé sur la page d'origine seulement — jamais sur la
 * petite fenêtre flottante du poste de travail, qui a ses propres règles.
 * ------------------------------------------------------------------------- */

const REQUETE_TELEPHONE = "(max-width: 760px), (max-height: 500px) and (pointer: coarse)";

/** L'appareil se manipule au doigt (téléphone, tablette) plutôt qu'à la souris. */
export function estTactile() {
  try {
    if (globalThis.matchMedia?.("(pointer: coarse)").matches) return true;
  } catch { /* matchMedia absent */ }
  const ua = globalThis.navigator?.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** Pose (et tient à jour) la classe `telephone` sur <html>. À appeler une fois au démarrage. */
export function suivreTelephone() {
  const racine = document.documentElement;
  let requete = null;
  try { requete = globalThis.matchMedia(REQUETE_TELEPHONE); } catch { /* ancien navigateur */ }
  const appliquer = () => racine.classList.toggle("telephone", Boolean(requete?.matches));
  appliquer();
  requete?.addEventListener?.("change", appliquer);
}
