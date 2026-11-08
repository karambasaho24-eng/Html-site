/* ---------------------------------------------------------------------------
 * La sacoche : les papiers qu'on a EN MAIN.
 *
 * Un papier n'existe qu'une fois. Ce qu'on a rédigé et gardé, ce qu'on nous a
 * remis : tout est ici, pareil. Tendre un papier, c'est ne plus l'avoir ; le
 * recevoir, c'est l'avoir — pour le garder, le ranger dans un dossier, le
 * tendre à son tour, le jeter ou le déchirer.
 *
 *   Ma sacoche   ce que j'ai en main (et mes mains tendues, en attente)
 *   À recevoir   ce qu'on me tend et que je n'ai pas encore pris
 *   Dossiers     ce que j'ai rangé
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { papiers, personnages, profils, membres as depotMembres } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { menu, confirmer, ouvrirModale } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { depuis } from "../core/util.js";
import { ecouter } from "../core/bus.js";
import {
  rendrePapier, composerPapier, tendrePapier, recevoirPapier, MODELES
} from "../features/papier.js";
import { panneauDossiers, classerPapier } from "../features/dossiers.js";

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function vuePapiers() {
  let onglet = "mes";
  let premiereFois = true;
  const zone = el("div");
  const onglets = el("div.salle__panneau-onglets", { role: "tablist" });

  const noeud = el("div.page",
    entete("Ma sacoche", "Papiers",
      "Ce que vous avez en main. Un papier tendu n'est plus à vous.",
      [el("button.btn.btn--primaire", { onclick: rediger },
        icone("plus", 15), "Rédiger un papier")]),
    onglets,
    zone
  );

  let enMain = [];
  let aRecevoir = [];
  let enAttente = [];
  let auteurs = new Map();
  let fiches = new Map();

  async function charger() {
    [enMain, aRecevoir, enAttente] = await Promise.all([
      papiers.mesPapiers(etat.utilisateur.id).catch(() => []),
      papiers.recus(etat.utilisateur.id).catch(() => []),
      papiers.enAttente(etat.utilisateur.id).catch(() => [])
    ]);
    const ids = [...new Set(enMain.map((p) => p.author_id).filter((id) => id && id !== etat.utilisateur.id))];
    auteurs = new Map((ids.length ? await profils.parIds(ids).catch(() => []) : []).map((a) => [a.id, a]));
    // Le nom du personnage prime sur celui du compte, partout.
    const classesVues = [...new Set(aRecevoir.map((r) => r.class_id).filter(Boolean))];
    fiches = new Map();
    for (const c of classesVues) {
      const index = await personnages.index(c).catch(() => new Map());
      for (const [k, v] of index) if (!fiches.has(k)) fiches.set(k, v);
    }
    if (premiereFois) { premiereFois = false; if (aRecevoir.length) onglet = "recus"; }
  }

  function peindre() {
    render(onglets,
      [{ cle: "mes", libelle: "Ma sacoche", compteur: enMain.length },
       { cle: "recus", libelle: "À recevoir", compteur: aRecevoir.length, alerte: true },
       { cle: "dossiers", libelle: "Dossiers" }]
        .map((o) => el("button.onglet", {
          role: "tab", "aria-selected": String(o.cle === onglet),
          onclick: () => { onglet = o.cle; peindre(); }
        }, o.libelle, o.compteur ? el("span.pastille-compteur", String(o.compteur)) : null)));

    if (onglet === "dossiers") {
      render(zone, el("p.petit.faible", "…"));
      panneauDossiers({ moiId: etat.utilisateur.id, connus: enMain })
        .then((n) => { if (onglet === "dossiers") render(zone, n); });
      return;
    }
    render(zone, onglet === "recus" ? panneauRecus() : panneauMain());
  }

  const nomDe = (userId, profil) =>
    fiches.get(userId)?.name?.trim() || profil?.display_name || "Quelqu'un";

  /* --- Ce qu'on me tend ------------------------------------------------------ */
  function panneauRecus() {
    if (!aRecevoir.length) {
      return blocVide("Rien à recevoir",
        "Personne ne vous tend de papier pour l'instant. Cela se fait en face à face, en jeu.");
    }
    return el("div.grille.grille--2", aRecevoir.map((remise) => el("div.papier-carte",
      el("div.papier-carte__entete",
        el("span.etiq.etiq--attn", "Tendu pour vous"),
        el("span.petit.faible", "de ", nomDe(remise.from_user, remise.auteur), " · ", depuis(remise.created_at))),
      remise.papier
        ? el("button.papier-carte__objet", {
            type: "button", "aria-label": `Ouvrir « ${remise.papier.title} »`,
            onclick: () => ouvrirRecu(remise)
          }, rendrePapier(remise.papier, {
            auteur: remise.auteur, fiche: fiches.get(remise.from_user), miniature: true
          }))
        : el("p.petit.faible", "Ce papier n'est plus disponible."),
      el("div.papier-carte__pied",
        el("button.btn.btn--primaire", { onclick: () => ouvrirRecu(remise) }, "Le prendre en main")))));
  }

  async function ouvrirRecu(remise) {
    const decision = await recevoirPapier(remise, { fiche: fiches.get(remise.from_user) });
    if (!decision) return;
    await charger();
    if (decision === "accepted" || decision === "oui") onglet = "mes";
    peindre();
  }

  /* --- Ce que j'ai en main ----------------------------------------------------- */
  function panneauMain() {
    const blocs = [];
    if (!enMain.length) {
      blocs.push(blocVide("Votre sacoche est vide",
        "Un mot, un ordre, une convocation : choisissez un modèle et écrivez.",
        { libelle: "Rédiger un papier", action: rediger }));
    } else {
      blocs.push(el("div.grille.grille--2", enMain.map(cartePapier)));
    }
    if (enAttente.length) {
      blocs.push(el("section.sacoche__attente",
        el("h3.sacoche__attente-titre", "Tendus, en attente de réponse"),
        ...enAttente.map((o) => el("div.sacoche__attente-ligne",
          el("span", { class: "sacoche__attente-nom" }, `« ${o.papier?.title || "Papier"} » → ${nomDe(o.to_user, o.destinataire)}`),
          el("span.petit.faible", depuis(o.created_at)),
          el("button.btn.btn--petit", { onclick: () => reprendre(o) }, "Le reprendre")))));
    }
    return el("div.sacoche", blocs);
  }

  function cartePapier(p) {
    const miens = p.author_id === etat.utilisateur.id;
    const carte = el("div.papier-carte",
      el("div.papier-carte__entete",
        el("span.etiq", MODELES[p.model]?.libelle || "Papier"),
        el("span.petit.faible", miens ? depuis(p.created_at) : `de ${auteurs.get(p.author_id)?.display_name || "quelqu'un"}`),
        el("span.pousse"),
        el("button.btn.btn--fantome.btn--icone", {
          "aria-label": "Plus d'actions", onclick: (e) => actions(e.currentTarget, p, carte)
        }, icone("points", 15))),
      el("button.papier-carte__objet", {
        type: "button", "aria-label": `Ouvrir « ${p.title} »`,
        onclick: () => (miens ? modifier(p) : lire(p))
      }, rendrePapier(p, { auteur: miens ? etat.profil : auteurs.get(p.author_id), miniature: true })),
      el("div.papier-carte__pied",
        el("button.btn.btn--primaire", { onclick: () => remettre(p) }, icone("main", 15), "Tendre")));
    return carte;
  }

  function actions(ancre, papier, carte) {
    const miens = papier.author_id === etat.utilisateur.id;
    menu(ancre, [
      { libelle: "Le classer dans un dossier", icone: "sac",
        action: () => classerPapier(papier, { moiId: etat.utilisateur.id, ancre }) },
      miens
        ? { libelle: "Le reprendre pour l'écrire", icone: "crayon", action: () => modifier(papier) }
        : { libelle: "Le relire", icone: "oeil", action: () => lire(papier) },
      { separateur: true },
      { libelle: "Le jeter", icone: "corbeille", danger: true, action: () => detruire(papier, carte, "jete") },
      { libelle: "Le déchirer", icone: "corbeille", danger: true, action: () => detruire(papier, carte, "dechire") }
    ]);
  }

  /** Jeter ou déchirer : il n'existe plus nulle part. Une seule confirmation, puis un geste. */
  async function detruire(papier, carte, geste) {
    const dechire = geste === "dechire";
    const ok = await confirmer({
      titre: dechire ? "Déchirer ce papier" : "Jeter ce papier",
      message: `« ${papier.title} » n'existera plus. Cela ne se rattrape pas.`,
      libelle: dechire ? "Déchirer" : "Jeter", danger: true
    });
    if (!ok) return;
    try {
      await papiers.supprimer(papier.id);
      carte?.classList.add(dechire ? "papier-carte--dechire" : "papier-carte--jete");
      await attendre(430);
      await charger(); peindre();
    } catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function reprendre(offre) {
    try {
      await papiers.repondre(offre.id, "withdrawn");
      succes("Papier repris en main");
      await charger(); peindre();
    } catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function rediger() {
    const cree = await composerPapier({ classe: etat.classeActive || null });
    if (!cree) return;
    await charger(); onglet = "mes"; peindre();
  }

  async function modifier(papier) {
    const maj = await composerPapier({ classe: etat.classeActive || null, papier });
    if (!maj) return;
    await charger(); peindre();
  }

  /** Lire un papier reçu : on le tient, on ne le réécrit pas. */
  async function lire(papier) {
    await ouvrirModale({
      titre: papier.title,
      corps: () => rendrePapier(papier, { auteur: auteurs.get(papier.author_id) }),
      actions: [{ libelle: "Fermer", variante: "primaire", valeur: true }]
    });
  }

  /**
   * À qui peut-on tendre un papier ? À n'importe quel joueur inscrit : la fenêtre
   * de remise les liste tous. Ceux qu'on croise dans ses espaces passent en tête.
   */
  async function remettre(papier) {
    const espaces = etat.classes.filter((c) => !c.archived);
    const ordonnes = [
      ...espaces.filter((c) => c.id === papier.class_id),
      ...espaces.filter((c) => c.id !== papier.class_id)
    ];
    const parPersonne = new Map();
    const index = new Map();
    for (const espace of ordonnes) {
      const equipe = await depotMembres.liste(espace.id).catch(() => []);
      const fichesEspace = await personnages.index(espace.id).catch(() => new Map());
      for (const [k, v] of fichesEspace) if (!index.has(k)) index.set(k, v);
      for (const m of equipe) {
        if (m.status !== "active" || m.user_id === etat.utilisateur.id) continue;
        if (parPersonne.has(m.user_id)) continue;
        parPersonne.set(m.user_id, { user_id: m.user_id, profil: m.profil, nom: m.profil?.display_name, espace });
      }
    }
    const fait = await tendrePapier({ papier, classe: null, candidats: [...parPersonne.values()], fiches: index });
    if (fait) { await charger(); peindre(); }
  }

  await charger();
  peindre();
  // Une remise arrive, ou l'autre répond : la sacoche se met à jour.
  const lacher = ecouter("remises:change", async () => { await charger(); peindre(); });
  return { noeud, titre: "Ma sacoche", nettoyer: lacher };
}
