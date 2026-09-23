/* ---------------------------------------------------------------------------
 * Tendre son cahier.
 *
 * On pouvait tendre un papier, et l'encadrement pouvait demander un cahier.
 * Entre les deux il manquait le geste le plus ordinaire de la classe :
 * « tiens, regarde », et « je te le prête ».
 *
 * Deux gestes seulement, parce qu'il n'y en a que deux :
 *
 *   PRÊTER — il l'a entre les mains, il le lit, il peut écrire dans la marge
 *   mais jamais dans le texte. On le reprend d'un clic : montrer une page à
 *   quelqu'un, c'est un prêt qu'on reprend tout de suite, et cela ne méritait
 *   pas un troisième mécanisme.
 *
 *   DONNER — il change de propriétaire. Irréversible de votre côté : c'est à
 *   lui de vous le rendre s'il le veut bien.
 *
 * On ne force rien sur personne : l'autre accepte ou refuse. Un objet qui
 * atterrit dans les mains de quelqu'un sans qu'il ait dit oui n'est pas un
 * don, c'est un dépôt — et le RP s'en trouve vidé de son sel.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { remisesCahier, cahiers as depotCahiers } from "../data/index.js";
import { ouvrirModale, confirmer } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";
import { exigerProximite } from "./proximite.js";
import { nomAffiche } from "../core/rp.js";

const NOMS_SUPPORT = { feuille: "feuille", cahier: "cahier", carnet: "carnet", dossier: "dossier" };

/**
 * « Tiens, regarde. » On choisit un support, quelqu'un qui se tient là, et
 * la nature du geste.
 */
export async function tendreSonCahier({ classe = null, session = null, candidats = [], fiches = new Map() }) {
  const disponibles = candidats.filter((c) => c?.user_id && c.user_id !== etat.utilisateur.id);
  if (!disponibles.length) {
    toast("Personne à qui le tendre pour l'instant.");
    return null;
  }

  let mes = [];
  try { mes = await depotCahiers.mesCahiers(etat.utilisateur.id); } catch { mes = []; }
  if (!mes.length) {
    toast("Vous n'avez aucun support à tendre.");
    return null;
  }

  let cahierChoisi = String(mes[0].id);
  let destinataire = String(disponibles[0].user_id);
  let geste = "lend";

  const valide = await ouvrirModale({
    titre: "Tendre un cahier",
    corps: () => el("div",
      el("p.petit.faible",
        "Il le lira de ses yeux. Prêté, il peut écrire dans la marge, jamais "
        + "dans votre texte — et vous le reprenez quand vous voulez."),

      el("label.champ",
        el("span.champ__label", "Lequel"),
        el("select.saisie", {
          onchange: (e) => { cahierChoisi = e.currentTarget.value; }
        }, mes.map((c) => el("option", { value: String(c.id) },
          `${c.title} — ${NOMS_SUPPORT[c.support] || "cahier"}`)))),

      el("label.champ",
        el("span.champ__label", "À qui"),
        el("select.saisie", {
          onchange: (e) => { destinataire = e.currentTarget.value; }
        }, disponibles.map((c) => el("option", { value: String(c.user_id) },
          nomAffiche(fiches.get(c.user_id), c.profil || c) || c.nom || "Participant")))),

      el("label.champ",
        el("span.champ__label", "Le geste"),
        el("select.saisie", { onchange: (e) => { geste = e.currentTarget.value; } },
          el("option", { value: "lend" }, "Le prêter — il me le rend"),
          el("option", { value: "give" }, "Le donner — il est à lui")),
        el("span.champ__aide", "Donné, il ne vous appartient plus : c'est à lui de vous le rendre."))
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Continuer", variante: "primaire", valeur: true }
    ]
  });
  if (!valide) return null;

  const cible = disponibles.find((c) => String(c.user_id) === destinataire);
  const support = mes.find((c) => String(c.id) === cahierChoisi);

  if (geste === "give" && !await confirmer({
    titre: "Donner ce cahier",
    message: `« ${support.title} » ne sera plus à vous. Tout ce qu'il contient part avec.`,
    libelle: "Le donner", danger: true
  })) return null;

  const proche = await exigerProximite({
    motif: "cahier",
    cible: cible?.profil || cible,
    personnage: fiches.get(cible?.user_id),
    detail: `« ${support.title} » — ${geste === "give" ? "donné" : "prêté"}`
  });
  if (!proche) return null;

  try {
    const remise = await remisesCahier.tendre({
      notebook_id: support.id, from_user: etat.utilisateur.id, to_user: cible.user_id,
      class_id: classe?.id || null, session_id: session?.id || null,
      kind: geste, state: "offered", attested: true
    });
    succes(geste === "give" ? "Cahier tendu" : "Cahier tendu",
      "Il l'acceptera ou vous le rendra.");
    return remise;
  } catch (err) {
    // L'index partiel refuse un second prêt sur le même cahier : le dire
    // plutôt que de laisser croire à une panne.
    erreur("Cahier non tendu",
      /duplicate|unique/i.test(err?.message || "")
        ? "Ce cahier est déjà entre d'autres mains."
        : messageErreur(err));
    return null;
  }
}

/**
 * Ce qu'on nous tend. On accepte ou on refuse — et refuser est un geste de
 * scène en soi, pas un échec technique.
 */
export async function accueillirRemiseCahier(remise, { titre, de }) {
  const donne = remise.kind === "give";
  const choix = await ouvrirModale({
    titre: donne ? "On vous donne un cahier" : "On vous tend un cahier",
    corps: () => el("div",
      el("p", el("b", de || "Quelqu'un"), donne ? " vous donne " : " vous tend ",
        el("b", `« ${titre || "un cahier"} »`), "."),
      el("p.petit.faible", donne
        ? "Accepté, il sera à vous : vous pourrez y écrire comme dans les vôtres."
        : "Accepté, vous pourrez le lire et écrire dans sa marge — pas dans son texte. "
          + "Il peut le reprendre à tout moment.")
    ),
    actions: [
      { libelle: "Refuser", valeur: "refus" },
      { libelle: donne ? "L'accepter" : "Le prendre", variante: "primaire", valeur: "prise" }
    ]
  });
  if (!choix) return null;

  try {
    if (choix === "prise") {
      await remisesCahier.accepter(remise.id);
      succes(donne ? "Le cahier est à vous" : "Cahier en main");
      return "prise";
    }
    await remisesCahier.refuser(remise.id);
    toast("Vous l'avez refusé.");
    return "refus";
  } catch (err) {
    erreur("Remise impossible", messageErreur(err));
    return null;
  }
}

/** La liste de ce qui n'est pas à moi, et de ce qui n'est plus chez moi. */
export function ligneRemise({ remise, titre, avec, mien, surReprise, surRestitution }) {
  return el("div.remise__ligne",
    el("span.remise__objet", { dataset: { objet: "cahier" }, "aria-hidden": "true" }),
    el("div", { style: { flex: "1", minWidth: "0" } },
      el("div.tronque", titre || "Un cahier"),
      el("div.petit.faible",
        remise.kind === "give" ? "donné" : "prêté", " · ", avec || "quelqu'un")),
    mien
      ? el("button.btn.btn--fantome", { onclick: surReprise }, icone("entree", 14), "Reprendre")
      : el("button.btn.btn--fantome", { onclick: surRestitution }, icone("sortie", 14), "Rendre")
  );
}
