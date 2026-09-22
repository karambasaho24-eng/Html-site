/* ---------------------------------------------------------------------------
 * Stockage navigateur tolérant aux pannes.
 *
 * localStorage et sessionStorage ne sont pas toujours disponibles : navigation
 * privée, cookies bloqués, page servie dans un bac à sable d'origine opaque.
 * Dans ces contextes, la simple lecture de `window.localStorage` lève une
 * SecurityError — avant même le premier getItem.
 *
 * Plutôt que de laisser l'application mourir au démarrage, on retombe sur une
 * mémoire volatile : tout continue de fonctionner pendant la visite, seule la
 * persistance d'une session à l'autre est perdue. L'interface peut interroger
 * `persistant()` pour le dire à l'utilisateur au lieu de mentir.
 * ------------------------------------------------------------------------- */

function memoire() {
  const carte = new Map();
  return {
    volatile: true,
    getItem: (c) => (carte.has(c) ? carte.get(c) : null),
    setItem: (c, v) => carte.set(c, String(v)),
    removeItem: (c) => carte.delete(c),
    key: (i) => [...carte.keys()][i] ?? null,
    clear: () => carte.clear(),
    get length() { return carte.size; }
  };
}

/** Vérifie qu'un entrepôt est réellement utilisable, pas seulement présent. */
function utilisable(fabrique) {
  try {
    const entrepot = fabrique();
    if (!entrepot) return null;
    const sonde = "__ojm_sonde__";
    entrepot.setItem(sonde, "1");
    entrepot.removeItem(sonde);
    return entrepot;
  } catch {
    return null;
  }
}

const reelLocal = utilisable(() => globalThis.localStorage);
const reelSession = utilisable(() => globalThis.sessionStorage);

export const stockageLocal = reelLocal || memoire();
export const stockageSession = reelSession || memoire();

/** Les données survivront-elles à la fermeture de l'onglet ? */
export function persistant() {
  return Boolean(reelLocal);
}

/** Liste les clés d'un entrepôt — Object.keys ne marche pas sur un Storage. */
export function cles(entrepot = stockageLocal) {
  const sortie = [];
  try {
    for (let i = 0; i < entrepot.length; i++) {
      const c = entrepot.key(i);
      if (c != null) sortie.push(c);
    }
  } catch { /* entrepôt devenu indisponible en cours de route */ }
  return sortie;
}
