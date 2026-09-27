/* ---------------------------------------------------------------------------
 * Le matériel demandé.
 *
 * « Pour demain : cahier, plume, encre, règle et de quoi calculer. » C'est une
 * phrase d'école, et elle vaut pour bien d'autres scènes : une réunion demande
 * un carnet, une mission une carte, une inspection un registre. La consigne
 * n'est donc pas « scolaire », elle est attachée à une ACTIVITÉ.
 *
 * Trois degrés, parce que tout ne se vaut pas :
 *   · obligatoire — le manque se joue (privation, remarque, renvoi chercher) ;
 *   · recommandé  — on le signale à l'intéressé, et on n'en parle plus ;
 *   · facultatif  — aucune alerte. Cela reste dans la liste pour mémoire.
 *
 * Deux portées : la séance d'abord, la classe ensuite. Une consigne posée pour
 * aujourd'hui ne doit pas réécrire ce qu'on avait demandé le mois dernier.
 * ------------------------------------------------------------------------- */
import { CATALOGUE, nomType, categorieDe } from "./affaires.js";

export const NIVEAUX = [
  { cle: "obligatoire", libelle: "Obligatoire", aide: "Le manque a une conséquence." },
  { cle: "recommande",  libelle: "Recommandé",  aide: "Signalé, sans conséquence." },
  { cle: "facultatif",  libelle: "Facultatif",  aide: "Pour mémoire. Aucune alerte." }
];

const NIVEAUX_VALIDES = NIVEAUX.map((n) => n.cle);

/** Retrouve un type d'objet depuis ce qui a été tapé à la main. */
export function typeDepuisTexte(texte) {
  const brut = String(texte || "").trim();
  if (!brut) return null;
  const plat = brut.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (CATALOGUE[plat]) return plat;

  // « règle à calcul », « instrument de calcul », « de l'encre »… On accepte la
  // phrase parlée : c'est ainsi que la consigne est donnée à voix haute.
  const candidats = Object.keys(CATALOGUE);
  const exact = candidats.find((k) =>
    nomType(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === plat);
  if (exact) return exact;

  const contenu = candidats
    .filter((k) => {
      const nom = nomType(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return plat.includes(nom) || nom.includes(plat);
    })
    .sort((a, b) => nomType(b).length - nomType(a).length)[0];
  return contenu || null;
}

/** Une entrée de consigne, normalisée. */
function entree(brut, niveauDefaut = "obligatoire") {
  if (typeof brut === "string") {
    const kind = typeDepuisTexte(brut);
    return { kind, label: kind ? nomType(kind) : brut.trim(), niveau: niveauDefaut,
             categorie: kind ? categorieDe(kind) : "autre" };
  }
  const kind = brut?.kind || typeDepuisTexte(brut?.label);
  return {
    kind,
    label: String(brut?.label || (kind ? nomType(kind) : "")).trim() || "Objet",
    niveau: NIVEAUX_VALIDES.includes(brut?.niveau) ? brut.niveau : niveauDefaut,
    categorie: kind ? categorieDe(kind) : "autre"
  };
}

/**
 * La consigne qui s'applique, séance d'abord.
 *
 * `fournitures` est l'ancienne forme : une liste de mots. On la lit encore,
 * sans quoi les classes déjà configurées perdraient leur consigne au premier
 * chargement — et le site aurait l'air d'avoir oublié.
 */
export function materielAttendu(classe, session = null) {
  const brut = session?.materiel || classe?.settings?.materiel || {};
  const requis = Array.isArray(brut.requis) && brut.requis.length
    ? brut.requis.map((r) => entree(r))
    : (Array.isArray(brut.fournitures) ? brut.fournitures : []).map((f) => entree(f));

  return {
    supports: Array.isArray(brut.supports) ? brut.supports : [],
    requis,
    professeur: (Array.isArray(brut.professeur) ? brut.professeur : []).map((r) => entree(r, "recommande")),
    bloquant: Boolean(brut.bloquant),
    minutes: Number(brut.minutes) || 15,
    // La liste telle qu'on la lit à voix haute.
    enUneLigne() {
      return [...this.supports.map((s) => s.title), ...this.requis.map((r) => r.label)]
        .filter(Boolean).join(" · ");
    },
    vide() { return !this.supports.length && !this.requis.length; }
  };
}

/** La forme à enregistrer, depuis ce que l'encadrement a saisi. */
export function consigneAEnregistrer({ supports, requis, professeur, bloquant, minutes }) {
  return {
    supports: supports || [],
    requis: (requis || []).map((r) => ({ kind: r.kind || null, label: r.label, niveau: r.niveau })),
    professeur: (professeur || []).map((r) => ({ kind: r.kind || null, label: r.label })),
    // On conserve l'ancienne clé : une version du site restée ouverte dans un
    // autre onglet continue de lire la consigne au lieu de la voir disparaître.
    fournitures: (requis || []).map((r) => r.label),
    bloquant: Boolean(bloquant),
    minutes: Number(minutes) || 15
  };
}

/* ===========================================================================
   L'écart entre ce qui a été demandé et ce qui a été déclaré

   Le site ne sait pas ce qu'on a réellement dans les mains en jeu : il sait ce
   qu'on a déclaré emporter. C'est cela qu'il compare, et il ne prétend rien de
   plus.
   ========================================================================= */

/** Les types d'objets présents dans un cartable déclaré. */
export function typesDuSac(sac) {
  const contenu = sac?.supplies;
  if (!contenu) return new Set();
  if (Array.isArray(contenu)) {
    // Ancienne forme : des mots. On les retraduit en types.
    return new Set(contenu.map((f) => typeDepuisTexte(f) || String(f).toLowerCase()));
  }
  return new Set(Object.values(contenu)
    .map((v) => (typeof v === "string" ? typeDepuisTexte(v) : v?.kind))
    .filter(Boolean));
}

/** Les identifiants d'objets déclarés — ce sur quoi porte la confiscation. */
export function idsDuSac(sac) {
  const contenu = sac?.supplies;
  if (!contenu || Array.isArray(contenu)) return new Set();
  return new Set(Object.keys(contenu));
}

/**
 * Ce qui manque. Les supports d'un côté (chacun apporte le sien, on accepte
 * l'intitulé), les objets de l'autre (on compare des types).
 */
export function ecart(sac, attendu) {
  const types = typesDuSac(sac);
  const contenu = sac?.notebooks;
  const carte = !contenu ? {}
    : Array.isArray(contenu) ? Object.fromEntries(contenu.map((id) => [String(id), ""])) : contenu;
  const parId = new Set(Object.keys(carte));
  const parTitre = new Set(Object.values(carte).map((t) => String(t).trim().toLowerCase()));

  const supports = (attendu.supports || []).filter((s) =>
    !parId.has(String(s.id)) && !parTitre.has(String(s.title || "").trim().toLowerCase()));

  const objets = (attendu.requis || [])
    .filter((r) => r.niveau !== "facultatif")
    .filter((r) => !types.has(r.kind || String(r.label).toLowerCase()));

  return {
    supports,
    objets,
    /** Ce qui compte vraiment : les oublis qui se jouent. */
    bloquants: objets.filter((o) => o.niveau === "obligatoire"),
    total: supports.length + objets.length,
    noms: [...supports.map((s) => s.title), ...objets.map((o) => o.label)]
  };
}
