/* ---------------------------------------------------------------------------
 * Le document qui héberge l'interface.
 *
 * En temps normal c'est la page elle-même. En fenêtre flottante, l'application
 * est déplacée dans un second document — et tout ce qui se pose « au-dessus »
 * (modales, menus, notifications) doit suivre, sinon cela s'ouvre dans la
 * fenêtre restée derrière, invisible.
 *
 * Les appels à `document` faits à la volée pointeraient toujours vers la page
 * d'origine. On passe donc par ici : une seule variable à changer quand
 * l'interface déménage.
 * ------------------------------------------------------------------------- */

let courant = globalThis.document;

export function docHote() { return courant; }

export function definirHote(document_) {
  courant = document_ || globalThis.document;
}

/** La fenêtre du document hôte — pour innerWidth, matchMedia, etc. */
export function fenetreHote() {
  return courant?.defaultView || globalThis;
}
