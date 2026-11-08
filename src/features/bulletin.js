/* ---------------------------------------------------------------------------
 * Les notes.
 *
 * La table `grades` existait depuis la première migration et n'avait jamais
 * servi : on pouvait faire cours, corriger, renvoyer — mais rien ne restait
 * d'un cadet d'une séance à l'autre. Une académie sans relevé n'est qu'une
 * suite de scènes sans mémoire.
 *
 * Une note porte donc trois choses, et pas une de plus : un intitulé (de
 * quoi il s'agit), un chiffre, et une appréciation. La dernière compte
 * autant que le chiffre — c'est elle qu'on relit.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { notes } from "../data/index.js";
import { formulaire, confirmer } from "../ui/modal.js";
import { succes, erreur, messageErreur } from "../ui/toast.js";
import { etat } from "../core/store.js";

/** Les barèmes qu'on rencontre. Le premier est celui de la maison. */
export const BAREMES = [20, 10, 100, 5];

/**
 * Porter une note à quelqu'un. Le geste est court exprès : s'il demandait
 * trois écrans, personne ne noterait jamais en séance.
 */
export async function porterUneNote({ classe, session = null, participant }) {
  const sortie = await formulaire({
    titre: `Noter ${participant.nom || "ce cadet"}`,
    note: "La note et l'appréciation lui seront visibles, et resteront à son relevé.",
    champs: [
      { cle: "label", label: "Intitulé", requis: true,
        placeholder: "Récitation du règlement", valeur: session?.title || "" },
      { cle: "score", label: "Note obtenue", type: "number", requis: true, placeholder: "14" },
      { cle: "max_score", label: "Sur", type: "select", valeur: "20",
        options: BAREMES.map((b) => ({ valeur: String(b), libelle: String(b) })) },
      { cle: "comment", label: "Appréciation", type: "textarea", lignes: 3,
        placeholder: "Sait sa leçon, manque d'assurance à l'oral." }
    ],
    libelle: "Porter la note"
  });
  if (!sortie) return null;

  const max = Number(sortie.max_score) || 20;
  const score = Number(sortie.score);
  if (!Number.isFinite(score) || score < 0 || score > max) {
    erreur("Note impossible", `Elle doit tenir entre 0 et ${max}.`);
    return null;
  }

  try {
    const ligne = await notes.creer({
      class_id: classe.id, user_id: participant.user_id,
      session_id: session?.id || null, source_kind: "manual",
      label: sortie.label.trim(), score, max_score: max,
      comment: (sortie.comment || "").trim() || null,
      graded_by: etat.utilisateur.id
    });
    succes("Note portée", `${score}/${max} — ${sortie.label.trim()}`);
    return ligne;
  } catch (err) {
    erreur("Note non enregistrée", messageErreur(err));
    return null;
  }
}

/** La moyenne, ramenée sur 20 pour que des barèmes différents se comparent. */
export function moyenne(lignes) {
  const utiles = lignes.filter((n) => Number(n.max_score) > 0);
  if (!utiles.length) return null;
  const somme = utiles.reduce((t, n) => t + (Number(n.score) / Number(n.max_score)) * 20, 0);
  return Math.round((somme / utiles.length) * 10) / 10;
}

/**
 * Le relevé. `surEffacement` n'est fourni qu'à qui peut défaire : le cadet
 * lit ses notes, il ne les retire pas.
 */
export function releveDeNotes({ lignes, surEffacement = null, vide = "Aucune note pour l'instant." }) {
  if (!lignes.length) return el("p.petit.faible", vide);
  const moy = moyenne(lignes);

  return el("div.releve",
    moy != null
      ? el("div.releve__moyenne",
          el("span.releve__chiffre", String(moy).replace(".", ",")),
          el("span.petit.faible", `moyenne sur 20 · ${lignes.length} note${lignes.length > 1 ? "s" : ""}`))
      : null,
    lignes.map((n) => el("div.releve__ligne",
      el("span.releve__note", `${n.score}`, el("small", `/${n.max_score}`)),
      el("div", { style: { flex: "1", minWidth: "0" } },
        el("div.tronque", n.label || "Évaluation"),
        n.comment ? el("div.petit.faible", n.comment) : null),
      surEffacement
        ? el("button.btn.btn--fantome.btn--icone", {
            title: "Retirer cette note",
            onclick: async () => {
              if (!await confirmer({
                titre: "Retirer la note", message: `${n.label} — ${n.score}/${n.max_score}`,
                libelle: "Retirer", danger: true
              })) return;
              try { await notes.supprimer(n.id); surEffacement(n); }
              catch (err) { erreur("Retrait impossible", messageErreur(err)); }
            }
          }, icone("corbeille", 14))
        : null
    ))
  );
}

/** Le bloc complet, qui va chercher ses lignes lui-même. */
export function blocNotes({ classeId, utilisateurId, peutNoter = false }) {
  const zone = el("div");
  const racine = el("div", zone);

  async function recharger() {
    let lignes = [];
    try {
      lignes = await notes.liste(
        utilisateurId ? { class_id: classeId, user_id: utilisateurId } : { class_id: classeId });
    } catch { lignes = []; }
    render(zone, releveDeNotes({
      lignes,
      surEffacement: peutNoter ? () => recharger() : null,
      vide: peutNoter ? "Personne n'a encore été noté." : "Vous n'avez pas encore de note."
    }));
  }

  recharger();
  return { noeud: racine, recharger };
}
