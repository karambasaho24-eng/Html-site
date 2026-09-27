/* ---------------------------------------------------------------------------
 * Les dossiers.
 *
 * Un dossier est un objet comme un autre : il a un nom qu'on lui donne, il
 * est dans le sac, sur le bureau, resté dans une salle ou tendu à quelqu'un.
 * Ce qu'il contient, ce sont des papiers qu'on y a classés. Et la règle est
 * la même que pour le stylo : un dossier qu'on n'a pas sous la main ne
 * s'ouvre pas. Oublié en salle, il y reste avec tout ce qu'il contient.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { affaires, classement, papiers } from "../data/index.js";
import { ouvrirModale, demander, menu } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";
import { depuis } from "../core/util.js";
import { fiche, nomObjet, imageObjet, indexer } from "./affaires.js";
import { contexte, situer, lieuEnMots } from "./portee.js";
import { rendrePapier, MODELES } from "./papier.js";

/** Les objets qui classent des papiers. */
export const estDossier = (o) => Boolean(fiche(o?.kind)?.papiers);

/** Un dossier est-il sous la main ? Même règle que tout objet. */
export function dossierAPortee(dossier, objets, moiId, ctx = contexte()) {
  return situer(dossier, { moiId, ctx, index: indexer(objets) });
}

/** Créer un dossier vide, chez soi. */
export async function creerDossier(moiId) {
  const nom = await demander({
    titre: "Nouveau dossier", label: "Nom du dossier", valeur: "",
    placeholder: "Rapports de patrouille, Convocations…",
    aide: "Il sera rangé chez vous. Mettez-le dans votre sac pour l'emporter."
  });
  if (nom === null) return null;
  const f = fiche("dossier") || {};
  try {
    const cree = await affaires.creer({
      owner_id: moiId, kind: "dossier", label: nom.trim() || "Dossier",
      category: "contenant", is_container: true, carried: false,
      size: f.volume || 3, capacity: f.capacite ?? 6
    });
    succes("Dossier créé");
    return cree;
  } catch (err) { erreur("Impossible", messageErreur(err)); return null; }
}

/**
 * Le panneau des dossiers : chacun, où il est, et ce qu'il contient.
 * `connus` : les papiers déjà chargés (les miens, ceux qu'on m'a remis).
 */
export async function panneauDossiers({ moiId, connus = [], ctx = contexte() }) {
  const zone = el("div.dossiers");

  async function peindre() {
    const objets = await affaires.toutes(moiId).catch(() => []);
    const dossiers = objets.filter(estDossier);
    const contenus = await classement.deDossiers(dossiers.map((d) => d.id)).catch(() => []);

    render(zone,
      el("div.ligne-flex",
        el("p.petit.faible",
          "Un dossier se range dans le sac comme un cahier. Oublié quelque part, "
          + "il n'est plus accessible — ni lui, ni ce qu'il contient."),
        el("span.pousse"),
        el("button.btn.btn--primaire.btn--petit", {
          onclick: async () => { if (await creerDossier(moiId)) peindre(); }
        }, icone("plus", 13), " Nouveau dossier")),

      dossiers.length
        ? el("div.dossiers__liste", dossiers.map((d) => {
            const ou = dossierAPortee(d, objets, moiId, ctx);
            const n = contenus.filter((c) => String(c.dossier_id) === String(d.id)).length;
            return el("button.dossier-carte", {
              type: "button", class: ou.ok ? "" : "dossier-carte--hors",
              onclick: () => ou.ok ? ouvrirDossier(d, { moiId, connus, surChange: peindre })
                : toast(`${nomObjet(d)} est indisponible`, {
                    corps: `📍 ${lieuEnMots(ou)}. Il faut aller le reprendre pour l'ouvrir.`,
                    type: "attn", duree: 6000
                  })
            },
              el("span.dossier-carte__figure", { style: { backgroundImage: `url("${imageObjet(d.kind)}")` } }),
              el("span.dossier-carte__nom", ou.ok ? "" : "❌ ", nomObjet(d)),
              el("span.petit.faible", `${n} papier${n > 1 ? "s" : ""}`),
              el("span.petit", { class: ou.ok ? "faible" : "dossier-carte__lieu" }, "📍 ", lieuEnMots(ou)));
          }))
        : el("p.petit.faible", "Aucun dossier. Créez-en un pour y classer vos papiers.")
    );
  }

  await peindre();
  return zone;
}

/** Ouvrir un dossier : ses papiers, les classer, les retirer. */
export async function ouvrirDossier(dossier, { moiId, connus = [], surChange = null }) {
  const zone = el("div");

  async function peindre() {
    const lignes = await classement.contenu(dossier.id).catch(() => []);
    const index = new Map(connus.map((p) => [String(p.id), p]));
    const manquants = lignes.map((l) => l.paper_id).filter((id) => !index.has(String(id)));
    for (const id of manquants) {
      const p = await papiers.lire(id).catch(() => null);
      if (p) index.set(String(p.id), p);
    }
    render(zone,
      lignes.length
        ? el("ul.dossier__papiers", lignes.map((l) => {
            const p = index.get(String(l.paper_id));
            return el("li.dossier__papier",
              el("button.btn.btn--fantome.btn--petit", {
                type: "button", disabled: !p,
                onclick: () => p && ouvrirModale({
                  titre: p.title || "Papier", large: true,
                  corps: () => rendrePapier(p, {}),
                  actions: [{ libelle: "Refermer", valeur: true }]
                })
              }, icone("papier", 13), " ", p?.title || "Papier illisible"),
              el("span.petit.faible", " ", MODELES[p?.model]?.libelle || "", " · classé ", depuis(l.created_at)),
              el("span.pousse"),
              el("button.btn.btn--fantome.btn--petit", {
                onclick: async () => {
                  try { await classement.sortir(l.id); await peindre(); surChange?.(); }
                  catch (err) { erreur("Impossible", messageErreur(err)); }
                }
              }, "Retirer"));
          }))
        : el("p.petit.faible", "Ce dossier est vide."),
      el("div.ligne-flex", { style: { marginTop: "var(--e-3)" } },
        el("button.btn.btn--petit", {
          onclick: (e) => {
            const deja = new Set(lignes.map((l) => String(l.paper_id)));
            const libres = connus.filter((p) => !deja.has(String(p.id)));
            if (!libres.length) { toast("Aucun papier à classer"); return; }
            menu(e.currentTarget, [
              { titre: "Classer dans ce dossier" },
              ...libres.slice(0, 30).map((p) => ({
                libelle: p.title || "Papier", icone: "papier",
                action: async () => {
                  try { await classement.ranger(dossier.id, p.id, moiId); await peindre(); surChange?.(); }
                  catch (err) { erreur("Impossible", messageErreur(err)); }
                }
              }))
            ]);
          }
        }, icone("plus", 12), " Classer un papier"))
    );
  }

  await ouvrirModale({
    titre: nomObjet(dossier),
    corps: () => { peindre(); return zone; },
    actions: [{ libelle: "Refermer", valeur: true }]
  });
}

/** Depuis un papier : le classer dans un dossier qu'on a sous la main. */
export async function classerPapier(papier, { moiId, ancre }) {
  const objets = await affaires.toutes(moiId).catch(() => []);
  const dossiers = objets.filter(estDossier)
    .map((d) => ({ d, ou: dossierAPortee(d, objets, moiId) }));
  if (!dossiers.length) {
    toast("Vous n'avez pas de dossier", { corps: "Créez-en un dans l'onglet Dossiers.", type: "attn" });
    return;
  }
  menu(ancre, [
    { titre: "Classer dans…" },
    ...dossiers.map(({ d, ou }) => ({
      libelle: ou.ok ? nomObjet(d) : `${nomObjet(d)} — indisponible`,
      icone: "sac",
      action: async () => {
        if (!ou.ok) {
          toast(`${nomObjet(d)} n'est pas sous la main`, { corps: `📍 ${lieuEnMots(ou)}`, type: "attn" });
          return;
        }
        try { await classement.ranger(d.id, papier.id, moiId); succes(`Classé dans ${nomObjet(d)}`); }
        catch (err) { erreur("Impossible", messageErreur(err)); }
      }
    }))
  ]);
}
