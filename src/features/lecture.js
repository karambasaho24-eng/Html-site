/* ---------------------------------------------------------------------------
 * Ce qu'on est en train de lire.
 *
 * Quand on ouvre un papier qu'on vient de recevoir, ou son cahier sans plume
 * en main, le personnage le prend à deux mains et le lève devant ses yeux —
 * et les autres le voient faire. Ce module ne retient qu'une chose : quoi
 * (un papier, un cahier, un livre), ou rien. La salle le diffuse avec la
 * présence, la 3D le montre.
 * ------------------------------------------------------------------------- */
import { emettre } from "../core/bus.js";

let courante = null;

export const lectureCourante = () => courante;

/** On prend la chose en main pour la lire (« papier », « cahier », « livre »), ou on la repose (null). */
export function lire(kind = null) {
  const k = ["papier", "cahier", "livre"].includes(kind) ? kind : null;
  if (k === courante) return;
  courante = k;
  emettre("lecture:change", k);
}

/** Le temps d'une promesse (une fenêtre ouverte) : on lit, puis on repose. */
export async function enLisant(kind, promesse) {
  lire(kind);
  try { return await promesse; }
  finally { lire(null); }
}
