/* ---------------------------------------------------------------------------
 * La remise, en petit, dans la fenêtre.
 *
 * Deux personnages sur une place de district : celui qui tend s'approche,
 * s'arrête à portée de main, tend le papier ; l'autre le prend et le lève
 * pour le lire. La scène se joue par étapes (approche, tend, prend, refuse),
 * au rythme des réponses.
 *
 * Sans WebGL, ou animations éteintes : les deux silhouettes qui se
 * rapprochent, comme avant.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { etat } from "../core/store.js";
import { creerClasse3D, webglDisponible } from "./classe-3d.js";
import { monAvatar } from "./apparence.js";

/** L'apparence de quelqu'un, titre compris (la couronne se voit aussi dans la rue). */
export function apparenceDe(profil) {
  if (!profil) return {};
  if (profil.id && profil.id === etat.utilisateur?.id) {
    return { ...(monAvatar() || {}), titre: etat.profil?.titre || null };
  }
  return { ...(profil.preferences?.avatar || profil.avatar || {}), titre: profil.titre || null };
}

/**
 * vignetteRemise({ de: { nom, avatar, moi }, a: { … }, objet, vue, phase })
 *   → { noeud, jouer(phase), detruire() }
 */
export function vignetteRemise({ de, a, objet = "papier", vue = "a", phase = "pose" }) {
  const hote = el("div.remise3d", { "aria-hidden": "true" });
  let scene = null, detruite = false, attente = phase;

  if (webglDisponible() && etat.animations !== false) {
    creerClasse3D({ hote }).then((c) => {
      if (detruite) { c.detruire(); return; }
      scene = c;
      c.maj({ mode: "remise", remise: { de, a, objet, vue } });
      c.jouer(attente);
    }).catch(() => { hote.replaceChildren(silhouettes()); });
  } else {
    hote.classList.add("remise3d--plat");
    hote.append(silhouettes());
  }

  return {
    noeud: hote,
    jouer(p) { attente = p; scene?.jouer(p); },
    detruire() { detruite = true; scene?.detruire(); scene = null; }
  };
}

function silhouettes() {
  return el("div.proximite__scene",
    el("span.proximite__silhouette.proximite__silhouette--soi"),
    el("span.proximite__onde"),
    el("span.proximite__silhouette.proximite__silhouette--autre"));
}
