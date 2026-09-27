/* ---------------------------------------------------------------------------
 * La note qu'on fait passer.
 *
 * Trois gestes, pas davantage : on écrit sur un bout de papier, on choisit à
 * qui, on la tend. Mais c'est une vraie note : il faut de quoi écrire et une
 * feuille sur le bureau, et la feuille quitte la pile. Celui qui la reçoit la
 * trouve dans ses papiers, et le sait tout de suite.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { ouvrirModale } from "../ui/modal.js";
import { toast, succes, erreur, messageErreur } from "../ui/toast.js";
import { etat } from "../core/store.js";
import { papiers, affaires } from "../data/index.js";
import { imageDetouree, nomObjet } from "./affaires.js";
import { peutFaire, situer } from "./portee.js";
import { indexer } from "./affaires.js";

/** Ce qu'il faut pour écrire une note, ici et maintenant. */
export function deQuoiEcrireUneNote(bureau) {
  const objets = bureau.objets();
  const ctx = bureau.ctx;
  const moiId = etat.utilisateur.id;
  const outil = peutFaire("ecrire", objets, { moiId, ctx });
  if (!outil.ok) return { ok: false, message: "Aucun outil d'écriture disponible.", conseil: outil.conseil };
  const index = indexer(objets);
  const feuilles = objets.find((o) => ["feuilles", "feuille"].includes(o.kind)
    && Number(o.quantity ?? 1) > 0 && situer(o, { moiId, ctx, index }).ok);
  if (!feuilles) {
    const auSac = objets.find((o) => ["feuilles", "feuille"].includes(o.kind)
      && situer(o, { moiId, ctx, index }).lieu === "sac");
    return {
      ok: false, message: "Pas de feuille sur votre bureau.",
      conseil: auSac ? "Sortez vos feuilles de votre sac." : "Demandez une feuille à quelqu'un."
    };
  }
  return { ok: true, outil: outil.avec, feuilles };
}

export async function ecrireUneNote({ bureau, classe, session, gens = [], nomDe, silhouette, destinataire = null }) {
  const moiId = etat.utilisateur.id;
  const verdict = deQuoiEcrireUneNote(bureau);
  if (!verdict.ok) {
    toast(verdict.message, { corps: verdict.conseil, type: "attn", duree: 6000 });
    return false;
  }
  const autres = gens.filter((p) => p.user_id !== moiId);
  if (!autres.length) { toast("Personne à qui la tendre pour l'instant."); return false; }

  let texte = "";
  let qui = destinataire?.user_id || null;
  let atteste = false;
  let zoneTexte;

  const choix = await ouvrirModale({
    titre: "Une note",
    corps: () => {
      const boutons = autres.map((p) => el("button.note-rapide__qui", {
        type: "button", "aria-pressed": String(p.user_id === qui),
        onclick: (e) => {
          qui = p.user_id;
          e.currentTarget.parentElement.querySelectorAll("button")
            .forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
        }
      }, silhouette(p), el("span", nomDe(p))));
      return el("div.note-rapide",
        el("div.note-rapide__papier",
          zoneTexte = el("textarea", {
            placeholder: "Écrivez…", maxlength: "600",
            oninput: (e) => { texte = e.currentTarget.value; }
          })),
        el("div.note-rapide__gens", boutons),
        el("label.case.note-rapide__attestation",
          el("input", { type: "checkbox", onchange: (e) => { atteste = e.currentTarget.checked; } }),
          el("span", "Je la lui tends en main propre, en jeu.")),
        el("p.petit.faible",
          el("img", { src: imageDetouree(verdict.outil.kind), alt: "", style: { height: "18px", verticalAlign: "-4px" } }),
          ` Avec ${nomObjet(verdict.outil).toLowerCase()}, sur une feuille de votre pile.`));
    },
    actions: [
      { libelle: "Garder", valeur: false },
      {
        libelle: "Tendre la note", variante: "primaire",
        action: () => {
          if (!texte.trim()) { zoneTexte?.focus(); return false; }
          if (!qui) { toast("À qui ?", { corps: "Touchez la personne à qui vous la tendez." }); return false; }
          if (!atteste) { toast("Tendez-la en jeu", { corps: "Cochez que vous la lui tendez vraiment.", type: "attn" }); return false; }
          return true;
        }
      }
    ]
  });
  if (!choix) return false;

  try {
    const papier = await papiers.creer({
      title: "Mot", body: texte.trim(), model: "note", seal: null,
      class_id: classe?.id || null, author_id: moiId
    });
    await papiers.tendre({
      paper_id: papier.id, from_user: moiId, to_user: qui,
      class_id: classe?.id || null, session_id: session?.id || null, attested: true
    });
    // La feuille quitte la pile : une note écrite en est une de moins.
    const f = verdict.feuilles;
    if (f.quantity != null) {
      await affaires.majorer(f.id, { quantity: Math.max(0, Number(f.quantity) - 1) }).catch(() => null);
      f.quantity = Math.max(0, Number(f.quantity) - 1);
    }
    const p = autres.find((x) => x.user_id === qui);
    succes(`Note tendue à ${nomDe(p)}`);
    return true;
  } catch (err) {
    erreur("La note n'est pas partie", messageErreur(err));
    return false;
  }
}
