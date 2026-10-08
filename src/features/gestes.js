/* ---------------------------------------------------------------------------
 * Les gestes essentiels, partout.
 *
 * Bureau · Sac · Cahier · Note · Documents · Personnes. La barre d'actions ne
 * sait pas ce qu'ils font : elle demande au contexte. Chez soi, « Sac » ouvre
 * le sac posé à côté du bureau ; ailleurs, il y ramène. L'écran courant
 * « prend la main » sur les gestes qu'il sait mieux faire, et la rend en
 * partant.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller, chemin } from "../core/router.js";
import { emettre } from "../core/bus.js";
import { nomAffiche } from "../core/rp.js";
import { ouvrirModale } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { depuis } from "../core/util.js";
import { papiers as depotPapiers, membres as depotMembres, personnages } from "../data/index.js";
import { creerBureauMaison } from "./bureau-maison.js";
import { ecrireUneNote } from "./note-rapide.js";
import { composerPapier, tendrePapier, recevoirPapier, rendrePapier, MODELES } from "./papier.js";
import { ouvrirBande } from "./personnes.js";

const courants = new Map();

/** L'écran courant fournit ses propres gestes ; il les rend en partant. */
export function prendreLesGestes(table) {
  for (const [cle, fn] of Object.entries(table)) courants.set(cle, fn);
  emettre("gestes:change");
  return () => {
    for (const [cle, fn] of Object.entries(table)) if (courants.get(cle) === fn) courants.delete(cle);
    emettre("gestes:change");
  };
}

export function faireGeste(cle, ancre = null) {
  const fn = courants.get(cle) || DEFAUTS[cle];
  return fn?.(ancre);
}

/** Demander au bureau de la chambre d'ouvrir le sac, le cahier… */
function auBureau(demande) {
  definir({ demandeBureau: demande });
  if (chemin() !== "/") aller("/");
}

/** L'espace où l'on se tient : celui qu'on regarde, sinon le premier. */
export function espaceCourant() {
  const ouverts = etat.classes.filter((c) => !c.archived);
  return ouverts.find((c) => c.id === etat.classeActive?.id) || ouverts[0] || null;
}

/** Ceux qu'on peut croiser dans l'espace courant. */
export async function gensDeLEspace(classe = espaceCourant()) {
  if (!classe) return { gens: [], nomDe: () => "—" };
  const [equipe, fiches] = await Promise.all([
    depotMembres.liste(classe.id).catch(() => []),
    personnages.index(classe.id).catch(() => new Map())
  ]);
  const gens = equipe
    .filter((m) => m.status === "active" && m.user_id !== etat.utilisateur.id)
    .map((m) => ({ user_id: m.user_id, profil: m.profil, role: m.role }));
  const nomDe = (p) => {
    const n = nomAffiche(fiches.get(p?.user_id), p?.profil || p);
    return n && n !== "—" ? n : "Quelqu'un";
  };
  return { gens, nomDe, classe, fiches };
}

/* --- Les gestes par défaut ------------------------------------------------ */
const DEFAUTS = {
  bureau: () => aller("/"),
  sac: () => auBureau("sac"),
  cahier: () => auBureau("cahier"),
  note: () => noteDePartout(),
  documents: (ancre) => ouvrirDocuments(ancre),
  personnes: (ancre) => personnesDePartout(ancre)
};

export async function noteDePartout(destinataire = null) {
  const bureau = await creerBureauMaison().charger();
  const { gens, nomDe, classe } = await gensDeLEspace();
  return ecrireUneNote({ bureau, classe, session: null, gens, nomDe, destinataire });
}

export async function personnesDePartout(ancre) {
  const { gens, nomDe, classe } = await gensDeLEspace();
  ouvrirBande(ancre, {
    personnes: gens, nomDe,
    roleDe: (p) => (["teacher", "owner", "assistant"].includes(p.role) ? "responsable" : ""),
    legende: classe ? `${gens.length} · ${classe.name}` : "Aucun espace",
    surChoix: (p) => noteDePartout(p)
  });
}

/* --- Les documents, sous la main ----------------------------------------- */
export async function ouvrirDocuments() {
  let fermer = null;
  const zone = await panneauDocuments({ surQuitter: () => fermer?.() });
  await ouvrirModale({
    titre: "Documents",
    corps: (api) => { fermer = () => api.fermer(); return zone; },
    actions: [{ libelle: "Refermer", valeur: true }]
  });
}

/** Ce qu'on m'a remis, ce que j'ai écrit, et de quoi en rédiger un. */
export async function panneauDocuments({ surQuitter = null } = {}) {
  const moi = etat.utilisateur.id;
  const zone = el("div.documents-rapides");
  const fermer = surQuitter;

  async function peindre() {
    const [recus, miens] = await Promise.all([
      depotPapiers.recus(moi).catch(() => []),
      depotPapiers.mesPapiers(moi).catch(() => [])
    ]);
    const aLire = recus.filter((r) => r.state === "offered");
    const gardes = recus.filter((r) => r.state === "accepted" && r.papier).map((r) => ({ ...r.papier, _de: r }));
    const ligne = (p, action, marque = null) => el("button.doc-ligne", { type: "button", onclick: action },
      el("span.doc-ligne__feuille", { "aria-hidden": "true" }),
      el("span.doc-ligne__titre", p?.title || "Papier"),
      el("span.doc-ligne__meta", marque || MODELES[p?.model]?.libelle || ""),
      el("span.doc-ligne__date", p?.created_at ? depuis(p.created_at) : ""));

    render(zone,
      aLire.length ? el("section",
        el("h3.doc-titre", "À lire ", el("span.doc-compte", String(aLire.length))),
        aLire.map((r) => ligne(r.papier, async () => { await recevoirPapier(r); emettre("papiers:change"); peindre(); }, "remis en main"))) : null,
      el("section",
        el("h3.doc-titre", "Mes papiers"),
        [...gardes, ...miens].slice(0, 12).map((p) => ligne(p, () => lire(p)))
          .concat(gardes.length + miens.length ? [] : [el("p.petit.faible", "Aucun papier pour l'instant.")])),
      el("div.doc-actions",
        el("button.btn.btn--primaire", { onclick: rediger }, icone("plume", 14), " Rédiger un document"),
        el("button.btn.btn--fantome", { onclick: () => { fermer?.(); aller("/papiers"); } }, "Tout voir")));
  }

  function lire(p) {
    ouvrirModale({ titre: p.title || "Papier", large: true, corps: () => rendrePapier(p, {}),
      actions: [{ libelle: "Refermer", valeur: true }] });
  }

  async function rediger() {
    const classe = espaceCourant();
    const papier = await composerPapier({ classe });
    if (!papier) return;
    const { gens, fiches } = await gensDeLEspace(classe);
    if (gens.length) await tendrePapier({ papier, classe, session: etat.sessionActive, candidats: gens, fiches });
    else toast("Le papier est dans votre sacoche.");
    peindre();
  }

  await peindre();
  return zone;
}
