/* ---------------------------------------------------------------------------
 * Ce qu'on a sous la main.
 *
 * La règle fondatrice : LES OBJETS PERMETTENT LES ACTIONS. On n'écrit pas
 * parce qu'on possède un stylo, on écrit parce qu'on a un stylo DEVANT SOI.
 * Posséder ne suffit pas : un stylo oublié sur le bureau de la salle 3 est à
 * moi, et il ne me sert à rien ici.
 *
 * Deux situations, et seulement deux :
 *
 *   · en activité (une séance, une réunion, une mission) — seul ce qui est
 *     SORTI sur le bureau sert. Ce qui est au fond du sac est à portée de
 *     main, mais il faut le sortir ; ce qui est resté chez soi n'est pas là ;
 *   · chez soi — on a ses affaires, sauf celles qu'on a laissées ailleurs,
 *     prêtées, perdues ou qu'on s'est fait confisquer.
 *
 * Ce module ne fait que répondre à des questions. Il ne triche jamais : s'il
 * dit non, rien ne s'écrit. Pas de stylo virtuel qui apparaîtrait au clic.
 * ------------------------------------------------------------------------- */
import { fiche, nomObjet, nomType, indexer } from "./affaires.js";

/** Le contexte : où se tient le joueur en ce moment. */
export function contexte({ session = null, classe = null } = {}) {
  const enCours = session && (session.status === "live" || !session.status);
  return {
    seance: enCours ? session.id : null,
    classe: enCours ? (classe?.id || session.class_id || null) : null,
    libelle: enCours ? (classe?.name || session.title || "la séance") : null
  };
}

/** Le contenant de premier rang est-il porté ? — autrement dit, est-ce dans le sac. */
export function dansLeSac(objet, index) {
  let courant = objet?.container_id ? index.get(String(objet.container_id)) : null;
  for (let i = 0; i < 8 && courant; i++) {
    if (courant.carried && (courant.place || "range") === "range") return true;
    courant = courant.container_id ? index.get(String(courant.container_id)) : null;
  }
  return false;
}

/**
 * Où est cet objet, pour moi, maintenant ?
 *
 * @returns {{ ok: boolean, lieu: string, ou?: string }}
 *   lieu : "bureau" | "sac" | "maison" | "salle" | "prete" | "perdu" | "confisque"
 */
export function situer(objet, { moiId, ctx, index }) {
  if (!objet) return { ok: false, lieu: "perdu" };
  if (objet.state === "lost") return { ok: false, lieu: "perdu" };
  if (objet.state === "confiscated") return { ok: false, lieu: "confisque" };
  if (objet.state === "lent" && String(objet.holder_id || "") !== String(moiId)) {
    return { ok: false, lieu: "prete" };
  }

  const place = objet.place || "range";
  if (place === "salle") return { ok: false, lieu: "salle", ou: objet.place_label || "une salle" };
  if (place === "bureau") {
    // Sur le bureau d'une AUTRE activité : on est parti sans le ranger.
    if (ctx.seance && String(objet.place_session) === String(ctx.seance)) return { ok: true, lieu: "bureau" };
    return { ok: false, lieu: "salle", ou: objet.place_label || "une salle" };
  }
  if (ctx.seance) {
    return dansLeSac(objet, index)
      ? { ok: false, lieu: "sac" }
      : { ok: false, lieu: "maison" };
  }
  return { ok: true, lieu: dansLeSac(objet, index) ? "sac" : "maison" };
}

/** Le lieu en mots, pour l'afficher sans tableau administratif. */
export function lieuEnMots(situation) {
  switch (situation.lieu) {
    case "bureau": return "Sur le bureau";
    case "sac": return "Dans le sac";
    case "maison": return "Chez vous";
    case "salle": return `Resté : ${situation.ou}`;
    case "prete": return "Prêté";
    case "perdu": return "Perdu";
    case "confisque": return "Confisqué";
    default: return "";
  }
}

/* ===========================================================================
   Les actions et ce qu'elles demandent
   ========================================================================= */

/** Ce qui permet chaque action. Un seul de la liste suffit. */
export const OUTILS_REQUIS = {
  ecrire:  ["crayon", "stylo-plume", "plume"],
  effacer: ["gomme"],
  craie:   ["craie"],
  ligne:   ["regle"],
  angle:   ["equerre", "regle"],
  cercle:  ["compas"],
  calculer: ["regle-a-calcul", "boulier"]
};

const LIBELLE_ACTION = {
  ecrire: "écrire", effacer: "effacer", craie: "écrire au tableau",
  ligne: "tracer une droite", angle: "tracer un angle droit",
  cercle: "tracer un cercle", calculer: "calculer"
};

const PHRASE_MANQUE = {
  ecrire: "Vous n'avez aucun outil d'écriture.",
  effacer: "Vous n'avez pas de gomme.",
  craie: "Vous n'avez pas de craie.",
  ligne: "Il vous faut une règle pour tracer droit.",
  angle: "Il vous faut une équerre.",
  cercle: "Il vous faut un compas.",
  calculer: "Vous n'avez rien pour calculer."
};

/**
 * Puis-je faire ceci, avec ce que j'ai sous la main ?
 *
 * @returns {{ ok: boolean, avec?: object, message?: string, conseil?: string }}
 */
export function peutFaire(action, objets, { moiId, ctx }) {
  const types = OUTILS_REQUIS[action] || [];
  const index = indexer(objets);
  const candidats = objets.filter((o) => types.includes(o.kind));
  const situes = candidats.map((o) => ({ o, s: situer(o, { moiId, ctx, index }) }));
  const prets = situes.filter((x) => x.s.ok);

  // L'encre : une plume sans encrier plein ne trace pas.
  if (action === "ecrire" && prets.length) {
    const autonome = prets.find((x) => !fiche(x.o.kind)?.encre);
    if (autonome) return { ok: true, avec: autonome.o };
    const encrier = objets.find((o) => o.kind === "encrier" && Number(o.level ?? 100) > 0
      && situer(o, { moiId, ctx, index }).ok);
    if (encrier) return { ok: true, avec: prets[0].o, encrier };
    const encrierVide = objets.find((o) => o.kind === "encrier" && situer(o, { moiId, ctx, index }).ok);
    return {
      ok: false,
      message: encrierVide ? "Votre encrier est vide." : "Votre plume n'a pas d'encre.",
      conseil: encrierVide
        ? "Remplissez-le au flacon, ou demandez de l'encre."
        : (ctx.seance ? "Sortez votre encrier de votre sac, ou prenez un crayon." : "Il vous faut un encrier.")
    };
  }
  if (prets.length) return { ok: true, avec: prets[0].o };

  // Pourquoi pas : on dit ce qui se passe réellement, pour que le joueur
  // sache quoi jouer — sortir, aller chercher, emprunter.
  const auSac = situes.find((x) => x.s.lieu === "sac");
  const oublie = situes.find((x) => x.s.lieu === "salle");
  const prete = situes.find((x) => x.s.lieu === "prete");
  const exemples = types.slice(0, 2).map((k) => nomType(k).toLowerCase()).join(" ou ");

  let conseil;
  if (auSac) conseil = `Sortez ${article(auSac.o)} de votre sac.`;
  else if (oublie) conseil = `${nomObjet(oublie.o)} est resté${fem(oublie.o)} : ${oublie.s.ou}. Allez le chercher, ou empruntez-en un${fem(oublie.o) ? "e" : ""}.`;
  else if (prete) conseil = `Vous avez prêté ${article(prete.o)}. Récupérez-le, ou empruntez-en un autre.`;
  else if (ctx.seance) conseil = `Vous n'avez pas emporté de ${exemples}. Empruntez-en à quelqu'un.`;
  else conseil = `Procurez-vous un ${exemples}.`;

  return { ok: false, message: PHRASE_MANQUE[action] || `Impossible de ${LIBELLE_ACTION[action]}.`, conseil };
}

const FEMININS = new Set(["plume", "gomme", "regle", "equerre", "craie", "regle-a-calcul", "boussole",
  "lorgnette", "lanterne", "montre", "gourde", "carte", "trousse", "sacoche", "musette", "mallette",
  "boite", "chemise", "pochette"]);
const fem = (o) => (FEMININS.has(o.kind) ? "e" : "");
const article = (o) => `${FEMININS.has(o.kind) ? "votre" : "votre"} ${nomObjet(o).toLowerCase()}`;

/** Le support lui-même : l'a-t-on devant soi ? */
export function supportAPortee(cahier, { moiId, ctx, objets = [], pretesParMoi = new Set() }) {
  if (!cahier) return { ok: false, lieu: "perdu" };
  if (pretesParMoi.has(String(cahier.id))) return { ok: false, lieu: "prete" };
  const index = indexer(objets);
  return situer({ ...cahier, state: "owned" }, { moiId, ctx, index });
}
