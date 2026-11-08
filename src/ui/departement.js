/* ---------------------------------------------------------------------------
 * Les briques des pages d'accueil de département.
 *
 * Une page de département ne montre pas tout : elle répond à « que voulez-vous
 * faire ? ». Quelques grandes actions, chacune avec une phrase qui dit ce
 * qu'elle fait, puis ce qui vous attend. Le reste est un clic plus loin.
 * ------------------------------------------------------------------------- */
import { el } from "./dom.js";
import { icone } from "./icons.js";
import { etat } from "../core/store.js";
import { local } from "../core/util.js";
import { imageDetouree } from "../features/affaires.js";
import { flottantDisponible, flottantAuPremierPlan, estFlottant, basculerFenetreFlottante }
  from "../features/fenetre-flottante.js";

/** Le haut de page : l'objet du département, son nom, une phrase. */
export function enteteDepartement(dep, phrase) {
  return el("header.dep__entete",
    el("img.dep__embleme", { src: imageDetouree(dep.image), alt: "", draggable: false,
      onerror: (e) => e.currentTarget.replaceWith(el("span.dep__embleme", icone(dep.icone, 34))) }),
    el("div.dep__titres",
      el("h1.dep__titre", dep.mot),
      el("p.dep__phrase", phrase)));
}

/**
 * Une grande action : une image ou une icône, un verbe, une phrase.
 * `etape` numérote un parcours (1, 2, 3) quand l'ordre compte.
 */
export function grandeAction({ image = null, icone: ic = null, titre, aide, action, href = null,
  primaire = false, pastille = null, etape = null, desactive = false }) {
  const contenu = [
    etape ? el("span.dep-action__etape", String(etape)) : null,
    el("span.dep-action__figure",
      image ? el("img", { src: imageDetouree(image), alt: "", draggable: false,
        onerror: (e) => e.currentTarget.replaceWith(icone(ic || "plus", 22)) }) : icone(ic || "plus", 22)),
    el("span.dep-action__textes",
      el("span.dep-action__titre", titre),
      aide ? el("span.dep-action__aide", aide) : null),
    pastille ? el("span.dep-action__pastille", String(pastille)) : null,
    el("span.dep-action__fleche", icone("chevronD", 14))
  ];
  const classes = `dep-action${primaire ? " dep-action--primaire" : ""}`;
  return href
    ? el("a", { class: classes, href }, contenu)
    : el("button", { class: classes, type: "button", disabled: desactive, onclick: action }, contenu);
}

/** Une section titrée, avec un compteur facultatif. */
export function sectionDep(titre, contenu, { compte = null, action = null } = {}) {
  return el("section.dep__section",
    el("div.dep__section-entete",
      el("h2.dep__section-titre", titre, compte ? el("span.dep__compte", String(compte)) : null),
      action),
    contenu);
}

const CLE_ASTUCE = "ojm.astuce-flottant";

/**
 * Le site est fait pour flotter à côté de Roblox. Tant qu'on ne l'a pas fait
 * une fois, on le rappelle — en une ligne, et on peut le faire taire.
 */
export function astuceFlottant() {
  if (!etat.utilisateur || !flottantDisponible() || estFlottant() || local.lire(CLE_ASTUCE, false)) return null;
  const noeud = el("div.astuce-flottant",
    el("span.astuce-flottant__icone", icone("incruste", 18)),
    el("span.astuce-flottant__texte",
      el("b", "Jouez avec le site à côté de Roblox. "),
      flottantAuPremierPlan()
        ? "Le site se pose dans une petite fenêtre qui reste au-dessus du jeu."
        : "Le site s'ouvre dans une petite fenêtre à placer à côté du jeu."),
    el("button.btn.btn--primaire.btn--petit", { type: "button", onclick: () => basculerFenetreFlottante() },
      "Mettre au-dessus du jeu"),
    el("button.astuce-flottant__fermer", {
      type: "button", "aria-label": "Ne plus afficher",
      onclick: () => { local.ecrire(CLE_ASTUCE, true); noeud.remove(); }
    }, icone("croix", 13)));
  return noeud;
}
