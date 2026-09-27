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
import { bandePersonnes } from "./personnes.js";

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

/**
 * Le formulaire, posé où l'on veut : dans une modale en grand, directement
 * dans le panneau de la console en petit. « À », puis le papier, puis
 * « Envoyer ».
 * @returns {{ noeud, valider: () => Promise<boolean> }}
 */
export function formulaireNote({ bureau, classe, session, gens = [], nomDe, destinataire = null, surEnvoi = null, avecBouton = false }) {
  const moiId = etat.utilisateur.id;
  const verdict = deQuoiEcrireUneNote(bureau);
  const autres = gens.filter((p) => p.user_id !== moiId);
  let texte = "";
  let qui = destinataire?.user_id || null;
  let atteste = false;
  let zoneTexte;

  if (!verdict.ok) {
    return {
      noeud: el("div.note-rapide.note-rapide--impossible",
        el("p.note-rapide__manque", el("b", verdict.message), el("span", verdict.conseil || ""))),
      valider: async () => { toast(verdict.message, { corps: verdict.conseil, type: "attn" }); return false; }
    };
  }

  async function valider() {
    if (!qui) { toast("À qui ?", { corps: "Touchez la personne à qui vous la tendez." }); return false; }
    if (!texte.trim()) { zoneTexte?.focus(); return false; }
    if (!atteste) { toast("Tendez-la en jeu", { corps: "Cochez que vous la lui tendez vraiment.", type: "attn" }); return false; }
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
      succes(`Note tendue à ${nomDe(autres.find((x) => x.user_id === qui))}`);
      surEnvoi?.();
      return true;
    } catch (err) {
      erreur("La note n'est pas partie", messageErreur(err));
      return false;
    }
  }

  const noeud = el("div.note-rapide",
    // D'abord à qui, puis quoi : c'est l'ordre du geste.
    el("div.note-rapide__a",
      el("span.note-rapide__label", "À"),
      autres.length
        ? bandePersonnes({
            personnes: autres, nomDe, choisi: qui || "",
            surChoix: (p) => { qui = p.user_id; setTimeout(() => zoneTexte?.focus(), 0); }
          })
        : el("span.petit.faible", "Personne à qui la tendre pour l'instant.")),
    el("div.note-rapide__papier",
      zoneTexte = el("textarea", {
        placeholder: "Écrivez…", maxlength: "600",
        oninput: (e) => { texte = e.currentTarget.value; }
      })),
    el("label.case.note-rapide__attestation",
      el("input", { type: "checkbox", onchange: (e) => { atteste = e.currentTarget.checked; } }),
      el("span", "Je la lui tends en main propre, en jeu.")),
    el("div.note-rapide__pied",
      el("p.note-rapide__outil",
        el("img", { src: imageDetouree(verdict.outil.kind), alt: "" }),
        ` ${nomObjet(verdict.outil)}, sur une feuille de votre pile.`),
      avecBouton ? el("button.btn.btn--primaire", {
        type: "button",
        onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { await valider(); } finally { b.disabled = false; }
        }
      }, "Envoyer") : null));

  return { noeud, valider };
}

export async function ecrireUneNote({ bureau, classe, session, gens = [], nomDe, destinataire = null }) {
  const verdict = deQuoiEcrireUneNote(bureau);
  if (!verdict.ok) {
    toast(verdict.message, { corps: verdict.conseil, type: "attn", duree: 6000 });
    return false;
  }
  const formulaire = formulaireNote({ bureau, classe, session, gens, nomDe, destinataire });
  const envoyee = await ouvrirModale({
    titre: "Note",
    corps: () => formulaire.noeud,
    actions: [
      { libelle: "Garder", valeur: false },
      { libelle: "Envoyer", variante: "primaire", action: async () => (await formulaire.valider()) || false }
    ]
  });
  return Boolean(envoyee);
}
