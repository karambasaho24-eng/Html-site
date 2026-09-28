/* ---------------------------------------------------------------------------
 * La console : Classe Parallèle en petit, au-dessus du jeu.
 *
 * Réduire la scène à 30 % ne sert à rien : on n'y lit plus rien. En petite
 * fenêtre, l'interface CHANGE de comportement : un seul panneau à la fois
 * (le bureau, le sac, le cahier, la note, les documents, les personnes), et
 * la barre des gestes en dessous. En toute petite fenêtre, la barre seule ;
 * le panneau s'ouvre par-dessus quand on touche un geste.
 *
 * Les règles restent les mêmes qu'en grand : c'est le même bureau, les mêmes
 * objets, le même « pas d'outil en main, pas d'écriture ».
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { toast } from "../ui/toast.js";
import { fiche, nomObjet, imageDetouree } from "./affaires.js";
import { OUTILS_REQUIS } from "./portee.js";
import { bandePersonnes } from "./personnes.js";
import { formulaireNote } from "./note-rapide.js";
import { panneauDocuments } from "./gestes.js";
import { creerEditeurCahier } from "./editeur-cahier.js";
import { diagnostic, pretAEcrire } from "./pret-a-ecrire.js";

/**
 * @param {object} o
 * @param {Array}  o.panneaux  [{ cle, mot, image?, figure?, rendre(zone, api), pastille?() }]
 * @param {string} [o.defaut]  panneau ouvert d'emblée en taille « compact »
 * @param {boolean} [o.avecBarre] la console porte-t-elle sa propre barre
 */
export function creerConsole({ panneaux, defaut = "bureau", avecBarre = true, enTete = null }) {
  const zone = el("div.console__panneau");
  const barre = el("nav.console__barre", { "aria-label": "Gestes" });
  let ouvert = null;
  let jeton = 0;
  const noeud = el("div.console", { dataset: { ouvert: "" } },
    enTete, zone, avecBarre ? barre : null);

  async function ouvrir(cle, { basculer = false } = {}) {
    const p = panneaux.find((x) => x.cle === cle);
    if (!p) return;
    if (basculer && ouvert === cle && etat.taille === "mini") { fermer(); return; }
    ouvert = cle;
    noeud.dataset.ouvert = cle;
    const moi = ++jeton;
    peindreBarre();
    const cible = el("div.console__contenu", { dataset: { panneau: cle } },
      el("div.console__titre", el("span", p.mot),
        el("button.console__replier", { type: "button", "aria-label": "Replier", onclick: fermer }, icone("croix", 13))));
    render(zone, cible);
    try {
      const corps = el("div.console__corps");
      cible.appendChild(corps);
      await p.rendre(corps, api);
    } catch (err) {
      if (moi === jeton) render(zone, el("p.console__vide", err?.message || "Indisponible."));
    }
  }

  function fermer() {
    ouvert = null;
    noeud.dataset.ouvert = "";
    render(zone, []);
    peindreBarre();
  }

  function peindreBarre() {
    if (!avecBarre) return;
    render(barre, panneaux.map((p) => el("button.actions__geste", {
      type: "button", "aria-pressed": String(ouvert === p.cle),
      "aria-current": ouvert === p.cle ? "true" : null,
      title: p.mot, "aria-label": p.mot,
      onclick: () => (p.geste ? p.geste() : ouvrir(p.cle, { basculer: true }))
    },
      el("span.actions__objet", p.image ? el("img", { src: imageDetouree(p.image), alt: "" }) : p.figure?.()),
      el("span.actions__mot", p.mot),
      p.pastille?.() ? el("span.actions__pastille", String(p.pastille())) : null)));
  }

  const api = {
    noeud, ouvrir, fermer,
    ouvert: () => ouvert,
    rafraichir: () => (ouvert ? ouvrir(ouvert) : null),
    peindreBarre,
    demarrer: () => { peindreBarre(); if (etat.taille !== "mini" && defaut) ouvrir(defaut); }
  };
  return api;
}

/* ===========================================================================
   Les panneaux
   ========================================================================= */

/** Ce qui est sur le bureau, et ce qu'on tient. */
export function panneauBureau(bureau, { surCahier = null, surSac = null, surDossier = null } = {}) {
  return (zone) => {
    const tenu = bureau.enMain();
    const devant = [
      ...bureau.cahiersSurLeBureau().map((c) => ["cahier", c]),
      ...bureau.surLeBureau().map((o) => ["objet", o])
    ];
    render(zone,
      tenu ? el("p.console__main", el("img", { src: imageDetouree(tenu.kind), alt: "" }),
        el("span", "En main : ", el("b", nomObjet(tenu)))) : null,
      devant.length
        ? el("div.console__objets", devant.map(([genre, c]) => {
            const kind = genre === "cahier" ? (c.support || "cahier") : c.kind;
            const nom = genre === "cahier" ? (c.title || "Cahier") : nomObjet(c);
            const f = fiche(kind) || {};
            return el("div.console__objet", { class: tenu?.id === c.id ? "console__objet--main" : "" },
              el("button.console__prise", {
                type: "button",
                title: genre === "cahier" ? "Ouvrir" : f.papiers ? "Ouvrir le dossier" : tenu?.id === c.id ? "Reposer" : "Prendre en main",
                onclick: () => {
                  if (genre === "cahier") return surCahier?.(c);
                  if (f.papiers && surDossier) return surDossier(c);
                  if (f.contenant && bureau.porter) return bureau.porter(c);
                  bureau.prendre(tenu?.id === c.id ? null : c);
                }
              }, el("img", { src: imageDetouree(kind), alt: "", draggable: false }), el("span", nom)),
              el("button.console__ranger", {
                type: "button", title: "Remettre dans le sac", "aria-label": `Remettre ${nom} dans le sac`,
                onclick: () => bureau.ranger(c, genre)
              }, icone("sac", 11)));
          }))
        : el("div.console__vide",
            el("p", "Rien sur le bureau."),
            surSac ? el("button.btn.btn--primaire", { type: "button", onclick: surSac }, "Ouvrir le sac") : null));
  };
}

/** Le sac ouvert : une poche par contenant, un clic pour sortir. */
export function panneauSac(bureau, { apres = null } = {}) {
  return (zone) => {
    const sac = bureau.sacsPortes()[0];
    if (!sac) { render(zone, el("p.console__vide", "Vous n'avez pas de sac.")); return; }
    const contenu = [
      ...bureau.cahiersDansMonSac().map((c) => ["cahier", c]),
      ...bureau.dansMonSac().map((o) => ["objet", o])
    ];
    const poches = new Map();
    for (const [g, c] of contenu) {
      const k = String(c.container_id || sac.id);
      if (!poches.has(k)) poches.set(k, []);
      poches.get(k).push([g, c]);
    }
    const nomPoche = (k) => nomObjet(bureau.objets().find((o) => String(o.id) === k) || sac);
    render(zone, contenu.length
      ? [...poches.keys()].map((k) => el("div.console__poche",
          el("span.console__poche-nom", nomPoche(k)),
          el("div.console__objets", poches.get(k).map(([genre, c]) => {
            const kind = genre === "cahier" ? (c.support || "cahier") : c.kind;
            const nom = genre === "cahier" ? (c.title || "Cahier") : nomObjet(c);
            return el("div.console__objet",
              el("button.console__prise", {
                type: "button", title: `Sortir ${nom}`, "aria-label": `Sortir ${nom}`,
                onclick: async (e) => {
                  e.currentTarget.closest(".console__objet").classList.add("console__objet--part");
                  if (await bureau.sortir(c, genre)) { toast(`${nom} posé sur le bureau`, { duree: 1800 }); apres?.(); }
                }
              }, el("img", { src: imageDetouree(kind), alt: "", draggable: false }), el("span", nom)));
          }))))
      : el("p.console__vide", "Votre sac est vide."));
  };
}

/**
 * Le cahier, en petit : les outils posés en haut (on en prend un), la page
 * en dessous. Sans outil en main, on lit ; on n'écrit pas.
 */
export function panneauCahier(bureau, { surSac = null, choisi = () => null, choisir = () => {}, surNouveau = null } = {}) {
  let editeur = null;
  return (zone, api) => {
    editeur?.detruire?.();
    editeur = null;
    const cahiers = bureau.cahiersSurLeBureau();
    const etat_ = diagnostic(bureau);
    const preparer = async (e) => {
      e.currentTarget.disabled = true;
      const { cahier: pose } = await pretAEcrire(bureau);
      if (pose) choisir(pose);
      else api?.rafraichir();
    };
    if (!cahiers.length) {
      render(zone, el("div.console__vide",
        el("p", etat_.phrase || "Aucun cahier sur le bureau."),
        etat_.faisable
          ? el("button.btn.btn--primaire", { type: "button", onclick: preparer }, icone("crayon", 14), "Prêt à écrire")
          : !bureau.supports().length && surNouveau
            ? el("button.btn.btn--primaire", { type: "button", onclick: async (e) => {
                e.currentTarget.disabled = true;
                const c = await surNouveau();
                if (c) choisir(c); else api?.rafraichir();
              } }, icone("plus", 14), "Prendre un cahier neuf")
            : surSac ? el("button.btn", { type: "button", onclick: surSac }, "Ouvrir le sac") : null));
      return;
    }
    const cahier = cahiers.find((c) => String(c.id) === String(choisi())) || cahiers[0];
    const tenu = bureau.enMain();
    const outils = bureau.surLeBureau().filter((o) => OUTILS_REQUIS.ecrire.includes(o.kind)
      || ["gomme", "regle", "equerre", "compas", "regle-a-calcul", "boulier"].includes(o.kind));
    const verdict = bureau.peutFaire("ecrire");

    editeur = creerEditeurCahier({
      cahier, compact: true,
      peutEcrire: verdict.ok,
      manqueEcriture: verdict.ok ? null : verdict,
      garde: (action) => bureau.peutFaire(action)
    });

    const bandeau = etat_.pret
      ? el("div.console__pret.console__pret--ok",
          tenu ? el("img", { src: imageDetouree(tenu.kind), alt: "" }) : null,
          el("span", tenu ? `${nomObjet(tenu)} en main — vous pouvez écrire.` : "Vous pouvez écrire."))
      : el("div.console__pret",
          etat_.outil ? el("img", { src: imageDetouree(etat_.outil.kind), alt: "" }) : null,
          el("span", etat_.phrase),
          etat_.faisable ? el("button.btn.btn--primaire.btn--petit", { type: "button", onclick: preparer }, "Prêt à écrire") : null);

    render(zone,
      bandeau,
      cahiers.length > 1 ? el("div.console__onglets", cahiers.map((c) => el("button.console__onglet", {
        type: "button", "aria-pressed": String(c.id === cahier.id), onclick: () => choisir(c)
      }, c.title))) : null,
      el("div.console__outils", outils.length
        ? outils.map((o) => el("button.console__outil", {
            type: "button", "aria-pressed": String(tenu?.id === o.id),
            class: verdict.prendre?.id === o.id ? "console__outil--appel" : "",
            title: tenu?.id === o.id ? "Reposer" : `Prendre ${nomObjet(o).toLowerCase()}`,
            onclick: () => bureau.prendre(tenu?.id === o.id ? null : o)
          }, el("img", { src: imageDetouree(o.kind), alt: "" })))
        : null),
      el("div.console__page", editeur.noeud));
  };
}

/** Le bandeau « prêt à écrire », pour les panneaux qui montrent un cahier. */
export function bandeauEcriture(bureau, { apres = null } = {}) {
  const d = diagnostic(bureau);
  const tenu = bureau.enMain();
  if (d.pret) {
    return el("div.console__pret.console__pret--ok",
      tenu ? el("img", { src: imageDetouree(tenu.kind), alt: "" }) : null,
      el("span", tenu ? `${nomObjet(tenu)} en main — vous pouvez écrire.` : "Vous pouvez écrire."));
  }
  return el("div.console__pret",
    d.outil ? el("img", { src: imageDetouree(d.outil.kind), alt: "" }) : null,
    el("span", d.phrase),
    d.faisable ? el("button.btn.btn--primaire.btn--petit", {
      type: "button",
      onclick: async (e) => { e.currentTarget.disabled = true; const r = await pretAEcrire(bureau); apres?.(r); }
    }, "Prêt à écrire") : null);
}

export function panneauNote({ bureau, classe = null, session = null, gens = () => [], nomDe }) {
  return (zone, api) => {
    const f = formulaireNote({ bureau, classe, session, gens: gens(), nomDe, avecBouton: true,
      surEnvoi: () => api.ouvrir("bureau") });
    render(zone, f.noeud);
  };
}

export function panneauDocumentsConsole() {
  return async (zone) => render(zone, await panneauDocuments());
}

/** Les personnes, en bande ; toucher quelqu'un propose les gestes vers lui. */
export function panneauPersonnes({ gens = () => [], nomDe, roleDe = () => "", gestes = () => [] }) {
  return (zone) => {
    const actions = el("div.console__gestes-personne");
    render(zone,
      bandePersonnes({
        personnes: gens(), nomDe, roleDe, choisi: "",
        surChoix: (p) => render(actions,
          el("span.console__qui", nomDe(p)),
          gestes(p).map((g) => el("button.btn.btn--petit", { type: "button", onclick: g.action }, g.libelle)))
      }),
      actions);
  };
}
