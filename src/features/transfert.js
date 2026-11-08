/* ---------------------------------------------------------------------------
 * Ce qui passe de main en main.
 *
 * Quatre gestes, et un seul principe : un objet n'est jamais à deux endroits.
 * Donner le fait changer de propriétaire ; prêter le laisse à son propriétaire
 * mais le met dans les mains d'un autre ; rendre le ramène ; refuser ne
 * déplace rien. Le transfert lui-même est fait par la base — c'est le seul
 * endroit où un objet bouge (voir accept_belonging_handoff, 0018) — parce
 * qu'une vérification côté écran n'empêche personne de rien.
 *
 * La proximité est exigée avant le geste et conservée avec lui. Le site ne
 * mesure pas une distance dans le jeu et ne prétend pas le faire : il demande
 * une attestation, il la date, il la garde.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { affaires as depotAffaires, remisesObjet, journal } from "../data/index.js";
import { ouvrirModale, confirmer, demander } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";
import { exigerProximite } from "./proximite.js";
import { nomAffiche } from "../core/rp.js";
import {
  CATALOGUE, TYPES, fiche, nomObjet, nomType, imageObjet,
  indisponible, niveauEnMots, vignetteObjet
} from "./affaires.js";

/** Le cadre sélectionné se voit : sans cela, deux lignes identiques. */
function marquer(entree) {
  const groupe = entree.closest(".modale, form, div");
  for (const autre of groupe?.querySelectorAll(`input[name="${entree.name}"]`) || []) {
    autre.closest(".choix")?.setAttribute("data-selection", autre.checked ? "1" : "0");
  }
}

const MODES = [
  { cle: "lend", libelle: "Prêter", aide: "Il reste à moi, et il me revient." },
  { cle: "give", libelle: "Donner", aide: "Il change de propriétaire. Définitif." }
];

/* ===========================================================================
   Tendre un objet
   ========================================================================= */

/**
 * « Tiens, prends ma règle. »
 *
 * @returns {Promise<boolean>} Le geste a-t-il été porté.
 */
export async function tendreObjet({ objet, classe = null, session = null, candidats = [], fiches = new Map() }) {
  const disponibles = candidats.filter((c) => c?.user_id && c.user_id !== etat.utilisateur.id);
  if (!disponibles.length) {
    toast("Personne à qui le tendre pour l'instant.");
    return false;
  }
  if (objet.state === "confiscated") {
    toast("Cet objet est confisqué.", { corps: "Vous n'en disposez pas.", type: "attn" });
    return false;
  }

  let destinataire = disponibles[0].user_id;
  let mode = "lend";
  let mot = "";

  const valide = await ouvrirModale({
    titre: `Tendre ${nomObjet(objet).toLowerCase()}`,
    corps: () => el("div.transfert",
      el("div.transfert__objet", vignetteObjet(objet, { moiId: etat.utilisateur.id })),

      el("label.champ",
        el("span.champ__label", "À qui"),
        el("select.saisie", {
          onchange: (e) => { destinataire = e.currentTarget.value; }
        }, disponibles.map((c) => el("option", { value: c.user_id },
          nomAffiche(fiches.get(c.user_id), c.profil || c) || c.nom || "Participant")))),

      el("div.champ",
        el("span.champ__label", "Le geste"),
        MODES.map((m) => el("label.choix",
          el("input", { type: "radio", name: "mode-transfert", value: m.cle,
            checked: m.cle === mode,
            onchange: (e) => { mode = m.cle; marquer(e.currentTarget); } }),
          el("span",
            el("strong", m.libelle),
            el("span.petit.faible", { style: { display: "block" } }, m.aide))))),

      el("label.champ",
        el("span.champ__label", "Un mot, si besoin"),
        el("input.saisie", { placeholder: "Rends-la-moi avant l'appel.",
          oninput: (e) => { mot = e.currentTarget.value; } })),

      fiche(objet.kind)?.consomme && objet.level != null
        ? el("p.petit.faible", icone("alerte", 12),
            ` Il est ${niveauEnMots(objet.level)} : dites-le, cela vaut mieux.`)
        : null
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Continuer", variante: "primaire", valeur: true }
    ]
  });
  if (!valide) return false;

  const cible = disponibles.find((c) => c.user_id === destinataire);
  const proche = await exigerProximite({
    motif: "objet", cible: cible?.profil || cible,
    personnage: fiches.get(destinataire),
    detail: `${nomObjet(objet)} — ${mode === "give" ? "donné" : "prêté"}`
  });
  if (!proche) return false;

  try {
    await remisesObjet.tendre({
      belonging_id: objet.id, from_user: etat.utilisateur.id, to_user: destinataire,
      class_id: classe?.id || null, session_id: session?.id || null,
      kind: mode, direction: "offer", note: mot.trim() || null, attested: true
    });
    succes(mode === "give" ? "Objet tendu" : "Prêt proposé",
      "Il ne sera à lui que lorsqu'il l'aura pris.");
    journal.ecrire({
      class_id: classe?.id || null, session_id: session?.id || null,
      user_id: etat.utilisateur.id, action: "affaires.tendu",
      meta: { objet: objet.id, kind: objet.kind, mode, vers: destinataire }
    });
    return true;
  } catch (err) {
    // La contrainte d'unicité dit exactement ce qu'il faut dire.
    const m = messageErreur(err);
    erreur("Remise impossible", /unique|duplicate|bh_en_cours/i.test(m)
      ? "Cet objet est déjà entre d'autres mains, ou déjà proposé."
      : m);
    return false;
  }
}

/* ===========================================================================
   Demander un objet
   ========================================================================= */

/** « Tu me prêtes ta règle ? » — c'est le même transfert, vu de l'autre bout. */
export async function demanderObjet({ classe = null, session = null, candidats = [], fiches = new Map(), kind = null }) {
  const disponibles = candidats.filter((c) => c?.user_id && c.user_id !== etat.utilisateur.id);
  if (!disponibles.length) {
    toast("Personne à qui le demander pour l'instant.");
    return false;
  }

  let aQui = disponibles[0].user_id;
  let quoi = kind || "regle";
  let mode = "lend";
  let mot = "";

  const ordonnes = [...TYPES].sort((a, b) => nomType(a).localeCompare(nomType(b), "fr"));

  const valide = await ouvrirModale({
    titre: "Demander quelque chose",
    corps: () => el("div.transfert",
      el("p.petit.faible",
        "On demande un objet, pas celui-là en particulier : c'est l'autre qui "
        + "choisit lequel il sort de son sac."),

      el("label.champ",
        el("span.champ__label", "À qui"),
        el("select.saisie", { onchange: (e) => { aQui = e.currentTarget.value; } },
          disponibles.map((c) => el("option", { value: c.user_id },
            nomAffiche(fiches.get(c.user_id), c.profil || c) || c.nom || "Participant")))),

      el("label.champ",
        el("span.champ__label", "Quoi"),
        el("select.saisie", { onchange: (e) => { quoi = e.currentTarget.value; } },
          ordonnes.map((k) => el("option", { value: k, selected: k === quoi }, nomType(k))))),

      el("div.champ",
        el("span.champ__label", "Pour combien de temps"),
        MODES.map((m) => el("label.choix",
          el("input", { type: "radio", name: "mode-demande", value: m.cle,
            checked: m.cle === mode,
            onchange: (e) => { mode = m.cle; marquer(e.currentTarget); } }),
          el("span",
            el("strong", m.libelle === "Prêter" ? "Emprunter" : "Se faire donner"),
            el("span.petit.faible", { style: { display: "block" } },
              m.cle === "lend" ? "Je le rends." : "Je le garde."))))),

      el("label.champ",
        el("span.champ__label", "Un mot"),
        el("input.saisie", { placeholder: "J'ai oublié la mienne.",
          oninput: (e) => { mot = e.currentTarget.value; } }))
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Continuer", variante: "primaire", valeur: true }
    ]
  });
  if (!valide) return false;

  const cible = disponibles.find((c) => c.user_id === aQui);
  const proche = await exigerProximite({
    motif: "demande", cible: cible?.profil || cible,
    personnage: fiches.get(aQui), detail: nomType(quoi)
  });
  if (!proche) return false;

  try {
    await remisesObjet.demander({
      belonging_id: null, asked_kind: quoi, asked_label: nomType(quoi),
      from_user: etat.utilisateur.id, to_user: aQui,
      class_id: classe?.id || null, session_id: session?.id || null,
      kind: mode, direction: "request", note: mot.trim() || null, attested: true
    });
    succes("Demande transmise", "Il reste libre de refuser.");
    return true;
  } catch (err) {
    erreur("Demande impossible", messageErreur(err));
    return false;
  }
}

/* ===========================================================================
   Recevoir
   ========================================================================= */

/**
 * Ce qu'on nous tend, ou ce qu'on nous demande. Deux écrans très proches,
 * parce que c'est la même décision : je donne suite, ou pas.
 */
export async function repondreRemise(remise, { objets = [], fiches = new Map(), profils = new Map() } = {}) {
  const demande = remise.direction === "request";
  const nom = nomAffiche(fiches.get(demande ? remise.from_user : remise.from_user),
    profils.get(remise.from_user)) || "Quelqu'un";

  // On nous demande quelque chose : il faut choisir lequel des nôtres sortir.
  let choisi = null;
  const candidats = demande
    ? objets.filter((o) => o.kind === remise.asked_kind
        && String(o.owner_id) === String(etat.utilisateur.id)
        && !indisponible(o, etat.utilisateur.id))
    : [];
  if (demande && candidats.length) choisi = candidats[0].id;

  const objetTendu = !demande
    ? objets.find((o) => String(o.id) === String(remise.belonging_id)) || null
    : null;

  const decision = await ouvrirModale({
    titre: demande ? "On vous demande quelque chose" : "On vous tend quelque chose",
    corps: () => el("div.reception",
      el("p.petit.faible",
        el("strong", nom),
        demande
          ? ` vous demande ${remise.kind === "give" ? "de lui donner" : "de lui prêter"} `
          : ` vous ${remise.kind === "give" ? "donne" : "prête"} `,
        el("strong", demande ? nomType(remise.asked_kind) : (objetTendu ? nomObjet(objetTendu) : "un objet")),
        "."),

      remise.note ? el("blockquote.reception__mot", remise.note) : null,

      objetTendu
        ? el("div.reception__main", vignetteObjet(objetTendu, { moiId: etat.utilisateur.id }))
        : null,

      demande
        ? (candidats.length
            ? el("label.champ",
                el("span.champ__label", "Lequel sortez-vous ?"),
                el("select.saisie", { onchange: (e) => { choisi = e.currentTarget.value; } },
                  candidats.map((o) => el("option", { value: o.id },
                    nomObjet(o) + (fiche(o.kind)?.consomme && o.level != null ? ` — ${niveauEnMots(o.level)}` : "")))))
            : el("p.etiq.etiq--attn", icone("alerte", 12),
                ` Vous n'avez pas de ${nomType(remise.asked_kind).toLowerCase()} disponible.`))
        : null,

      el("p.petit.faible.reception__note", icone("bouclier", 12),
        remise.kind === "give"
          ? " Un objet donné ne se reprend pas : il faudra le redemander."
          : " Un prêt se rend. Vous saurez toujours à qui.")
    ),
    actions: [
      { libelle: "Plus tard", valeur: null },
      { libelle: "Refuser", variante: "danger", valeur: "refused" },
      { libelle: demande ? "Le lui donner" : "Le prendre", variante: "primaire",
        action: () => (demande && !candidats.length)
          ? (toast("Vous n'avez rien à sortir."), false)
          : "accepted" }
    ]
  });
  if (!decision) return null;

  try {
    if (decision === "refused") {
      await remisesObjet.refuser(remise.id);
      succes("Refusé", "Rien n'a bougé.");
      return "refused";
    }
    await remisesObjet.accepter(remise.id, demande ? choisi : null);
    succes(remise.kind === "give" ? "C'est à vous" : "Vous l'avez en main");
    return "accepted";
  } catch (err) {
    erreur("Réponse non enregistrée", messageErreur(err));
    return null;
  }
}

/* ===========================================================================
   Rendre
   ========================================================================= */

export async function rendreRemise(remise, { objets = [] } = {}) {
  const objet = objets.find((o) => String(o.id) === String(remise.belonging_id));
  const ok = await confirmer({
    titre: "Rendre",
    message: `${objet ? nomObjet(objet) : "Cet objet"} retourne à son propriétaire. `
      + "Le prêt sera clos.",
    libelle: "Rendre"
  });
  if (!ok) return false;
  try {
    await remisesObjet.rendre(remise.id);
    succes("Rendu");
    return true;
  } catch (err) {
    erreur("Impossible", messageErreur(err));
    return false;
  }
}

/** Reprendre une offre qu'on n'a pas encore vue acceptée. */
export async function reprendreRemise(remise) {
  try {
    await remisesObjet.reprendre(remise.id);
    toast("Offre retirée");
    return true;
  } catch (err) {
    erreur("Impossible", messageErreur(err));
    return false;
  }
}

/* ===========================================================================
   Confisquer

   Jamais automatique. C'est un geste d'autorité, prononcé dans la scène puis
   porté ici — et la base ne l'accepte que sur un objet qui a été apporté.
   ========================================================================= */
export async function confisquerObjet({ objet, classe, proprietaire = null, fiche: ficheRP = null }) {
  const nom = nomAffiche(ficheRP, proprietaire) || "ce cadet";
  const motif = await demander({
    titre: `Confisquer ${nomObjet(objet).toLowerCase()}`,
    label: "Motif",
    placeholder: "Jouait avec pendant la leçon",
    aide: `L'objet reste à ${nom}, mais il n'en dispose plus. Il saura qui l'a et pourquoi.`
  });
  if (motif === null) return false;
  try {
    await depotAffaires.confisquer(objet.id, classe.id, motif || null);
    succes("Confisqué");
    return true;
  } catch (err) {
    const m = messageErreur(err);
    erreur("Confiscation impossible", /hors de portée/.test(m)
      ? "Cet objet n'a pas été apporté : il est hors de portée."
      : m);
    return false;
  }
}

export async function restituerObjet(objet) {
  try {
    await depotAffaires.restituer(objet.id);
    succes("Rendu à son propriétaire");
    return true;
  } catch (err) {
    erreur("Impossible", messageErreur(err));
    return false;
  }
}

/* ===========================================================================
   Créer un objet — pour l'encadrement qui dote, et pour soi
   ========================================================================= */

/** Se procurer un objet du catalogue. Ce n'est pas une boutique : c'est
 *  l'intendance, et elle ne demande rien en échange. */
export async function acquerirObjet({ pour = null } = {}) {
  const ordonnes = [...TYPES].sort((a, b) => nomType(a).localeCompare(nomType(b), "fr"));
  let kind = "plume";
  let intitule = "";
  let zoneAide = null;
  const apercu = () => { if (zoneAide) zoneAide.textContent = CATALOGUE[kind]?.aide || ""; };

  const valide = await ouvrirModale({
    titre: "Se procurer un objet",
    corps: () => el("div",
      el("p.petit.faible", "L'intendance fournit le nécessaire. Un objet, un nom, et c'est à vous."),
      el("label.champ",
        el("span.champ__label", "Quel objet"),
        el("select.saisie", {
          onchange: (e) => { kind = e.currentTarget.value; apercu(); }
        }, ordonnes.map((k) => el("option", { value: k, selected: k === kind }, nomType(k)))),
        el("span.champ__aide", { ref: (n) => { zoneAide = n; } }, CATALOGUE[kind]?.aide || "")),
      el("label.champ",
        el("span.champ__label", "Un nom, si vous voulez"),
        el("input.saisie", { placeholder: "Plume de service",
          oninput: (e) => { intitule = e.currentTarget.value; } }),
        el("span.champ__aide", "Sinon il portera le nom de son type."))
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Le prendre", variante: "primaire", valeur: true }
    ]
  });
  if (!valide) return null;

  const f = CATALOGUE[kind] || {};
  try {
    const cree = await depotAffaires.creer({
      owner_id: pour || etat.utilisateur.id,
      kind, label: intitule.trim(), category: f.categorie || "autre",
      is_container: Boolean(f.contenant),
      level: f.consomme ? 100 : null,
      quantity: f.nombre ? 10 : 1
    });
    succes(`${nomType(kind)} — à vous`);
    return cree;
  } catch (err) {
    erreur("Impossible", messageErreur(err));
    return null;
  }
}
