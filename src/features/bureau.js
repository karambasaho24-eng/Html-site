/* ---------------------------------------------------------------------------
 * Le bureau.
 *
 * On entre en séance avec son sac, pas avec ses affaires étalées devant soi.
 * On ouvre le sac, on sort ce dont on a besoin — le cahier, la plume,
 * l'encrier —, on laisse le reste dedans. Seul ce qui est SUR LE BUREAU sert :
 * c'est avec lui qu'on écrit, qu'on efface, qu'on trace.
 *
 * Et quand on part, ce qu'on n'a pas rangé reste sur le bureau. Il ne revient
 * pas tout seul dans le sac : il est dans la salle, et il faudra y retourner.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { affaires as depotAffaires, cahiers as depotCahiers } from "../data/index.js";
import { ouvrirModale } from "../ui/modal.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { fiche, nomObjet, nomType, imageObjet, indexer, vitrine } from "./affaires.js";
import { contexte, situer, dansLeSac, peutFaire } from "./portee.js";

const NOMS_SUPPORT = { feuille: "Feuille", cahier: "Cahier", carnet: "Carnet", dossier: "Dossier" };

export function creerBureau({ classe, session, surChange = null }) {
  const moi = etat.utilisateur.id;
  const ctx = contexte({ session, classe });
  let objets = [];
  let supports = [];

  const noeud = el("div.bureau", { role: "region", "aria-label": "Mon bureau" });

  /* --- Ce qu'on sait ------------------------------------------------------ */
  async function charger() {
    [objets, supports] = await Promise.all([
      depotAffaires.toutes(moi).catch(() => objets),
      depotCahiers.mesCahiers(moi).catch(() => supports)
    ]);
    peindre();
    return api;
  }

  const index = () => indexer(objets);
  const surLeBureau = () => objets.filter((o) => situer(o, { moiId: moi, ctx, index: index() }).lieu === "bureau");
  const cahiersSurLeBureau = () => supports.filter((c) =>
    c.place === "bureau" && String(c.place_session) === String(ctx.seance));
  const dansMonSac = () => objets.filter((o) =>
    !fiche(o.kind)?.contenant && situer(o, { moiId: moi, ctx, index: index() }).lieu === "sac");
  const cahiersDansMonSac = () => supports.filter((c) =>
    (c.place || "range") === "range" && dansLeSac(c, index()));
  const sacsPortes = () => objets.filter((o) => fiche(o.kind)?.contenant && o.carried
    && (o.place || "range") === "range" && !o.container_id);

  /* --- Les gestes --------------------------------------------------------- */
  async function sortir(chose, genre) {
    try {
      if (genre === "cahier") Object.assign(chose, await depotCahiers.sortir(chose, { session, classe }));
      else Object.assign(chose, await depotAffaires.sortir(chose, { session, classe }));
      peindre();
      surChange?.();
      return true;
    } catch (err) {
      erreur("Impossible de le sortir", messageErreur(err));
      return false;
    }
  }

  /** Où remettre : d'où il vient, sinon le premier sac qui a de la place. */
  function ouRanger(chose) {
    const ix = index();
    const place = (c) => Number(c.capacity ?? fiche(c.kind)?.capacite ?? 0)
      - objets.filter((o) => String(o.container_id || "") === String(c.id))
          .reduce((t, o) => t + Number(o.size || 1), 0)
      - supports.filter((s) => String(s.container_id || "") === String(c.id))
          .reduce((t, s) => t + Number(s.size || 4), 0);
    const taille = Number(chose.size || 1);
    const origine = chose.meta?.depuis ? ix.get(String(chose.meta.depuis)) : null;
    if (origine && (origine.carried || dansLeSac(origine, ix)) && place(origine) >= taille) return origine;
    const contenants = objets.filter((o) => fiche(o.kind)?.contenant && (o.place || "range") === "range"
      && (o.carried || dansLeSac(o, ix)));
    return contenants.find((c) => place(c) >= taille) || null;
  }

  async function ranger(chose, genre) {
    const cible = ouRanger(chose);
    if (!cible) {
      toast("Plus de place dans votre sac", {
        corps: "Rangez autre chose, ou gardez-le en main.", type: "attn"
      });
      return false;
    }
    try {
      if (genre === "cahier") Object.assign(chose, await depotCahiers.rangerDans(chose, cible.id));
      else Object.assign(chose, await depotAffaires.rangerDans(chose, cible.id));
      peindre();
      surChange?.();
      return true;
    } catch (err) {
      erreur("Impossible de le ranger", messageErreur(err));
      return false;
    }
  }

  async function rangerTout() {
    for (const o of surLeBureau()) await ranger(o, "objet");
    for (const c of cahiersSurLeBureau()) await ranger(c, "cahier");
  }

  /**
   * On part. Ce qui est encore sur le bureau reste dans la salle — on ne
   * demande pas, on constate : c'est un oubli, et un oubli ne prévient pas.
   */
  async function laisserTout() {
    const restes = [...surLeBureau().map((o) => ["objet", o]), ...cahiersSurLeBureau().map((c) => ["cahier", c])];
    for (const [genre, chose] of restes) {
      try {
        if (genre === "cahier") await depotCahiers.laisser(chose, { classe });
        else await depotAffaires.laisser(chose, { classe });
      } catch { /* on part quand même */ }
    }
    if (restes.length) {
      toast("Vous avez laissé des affaires sur le bureau", {
        corps: `${restes.map(([g, c]) => g === "cahier" ? c.title : nomObjet(c)).join(", ")} — restés : ${classe.name}.`,
        type: "attn", duree: 12000
      });
    }
    return restes.length;
  }

  /** Le sac ouvert : ce qu'il contient, et un clic pour le sortir. */
  async function ouvrirSac() {
    const grille = el("div.sac-ouvert__grille");
    const peindreSac = () => {
      const choses = [...cahiersDansMonSac().map((c) => ["cahier", c]), ...dansMonSac().map((o) => ["objet", o])];
      render(grille, choses.length
        ? choses.map(([genre, c]) => el("button.sac-ouvert__objet", {
            type: "button",
            title: `Sortir ${genre === "cahier" ? c.title : nomObjet(c)}`,
            onclick: async (e) => {
              const bouton = e.currentTarget;
              bouton.disabled = true;
              bouton.classList.add("sac-ouvert__objet--sort");
              if (await sortir(c, genre)) setTimeout(peindreSac, 220);
              else bouton.disabled = false;
            }
          },
            el("span.objet__figure", { "aria-hidden": "true",
              style: { backgroundImage: `url("${imageObjet(genre === "cahier" ? (c.support || "cahier") : c.kind)}")` } }),
            el("span.sac-ouvert__nom", genre === "cahier" ? c.title : nomObjet(c)),
            el("span.sac-ouvert__type", genre === "cahier" ? (NOMS_SUPPORT[c.support] || "Cahier")
              : nomType(c.kind))))
        : el("p.petit.faible", sacsPortes().length
            ? "Votre sac est vide."
            : "Vous n'avez pas pris de sac. Ce que vous n'avez pas emporté est resté chez vous."));
    };
    peindreSac();
    await ouvrirModale({
      titre: "Mon sac",
      corps: () => el("div.sac-ouvert",
        el("div.sac-ouvert__sacs", sacsPortes().map((s) => vitrine(s,
          objets.filter((o) => String(o.container_id || "") === String(s.id)), { taille: 88 }))),
        el("p.petit.faible", "Cliquez ce que vous voulez sortir. Il sera posé sur votre bureau."),
        grille),
      actions: [{ libelle: "Refermer le sac", variante: "primaire", valeur: true }]
    });
  }

  /* --- La bande ----------------------------------------------------------- */
  function peindre() {
    const devant = [...cahiersSurLeBureau().map((c) => ["cahier", c]), ...surLeBureau().map((o) => ["objet", o])];
    const sac = sacsPortes()[0];
    render(noeud,
      el("button.bureau__sac", { type: "button", onclick: ouvrirSac, title: "Ouvrir mon sac" },
        sac ? vitrine(sac, objets.filter((o) => String(o.container_id || "") === String(sac.id)),
                      { taille: 42, titre: false })
            : el("span.bureau__sans-sac", icone("sac", 18)),
        el("span.bureau__mot", "Mon sac")),
      el("div.bureau__plateau", devant.length
        ? devant.map(([genre, c]) => el("button.bureau__objet", {
            type: "button", title: `Ranger ${genre === "cahier" ? c.title : nomObjet(c)} dans le sac`,
            onclick: () => ranger(c, genre)
          },
            el("span.objet__figure", { "aria-hidden": "true",
              style: { backgroundImage: `url("${imageObjet(genre === "cahier" ? (c.support || "cahier") : c.kind)}")` } }),
            el("span.bureau__nom", genre === "cahier" ? c.title : nomObjet(c))))
        : el("span.petit.faible.bureau__vide", "Votre bureau est vide. Ouvrez votre sac pour sortir vos affaires.")),
      devant.length
        ? el("button.btn.btn--fantome.btn--petit", { type: "button", onclick: rangerTout,
            title: "Tout remettre dans le sac" }, icone("sac", 13), "Tout ranger")
        : null
    );
  }

  const api = {
    noeud, charger, ouvrirSac, rangerTout, laisserTout,
    objets: () => objets,
    supports: () => supports,
    cahiersSurLeBureau,
    ctx,
    peutFaire: (action) => peutFaire(action, objets, { moiId: moi, ctx })
  };
  return api;
}
