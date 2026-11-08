/* ---------------------------------------------------------------------------
 * Mes cahiers — l'accueil.
 *
 * L'étagère de l'élève : ses cahiers, un bouton pour en créer, un rappel de
 * ce qu'il reste d'encre. Le premier cahier est gratuit, les suivants
 * s'achètent : l'écran le dit AVANT de demander un titre, mais c'est la base
 * qui tranche (une création refusée répond NB001).
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { cahiers, pages, papiers, transferts } from "../data/index.js";
import { entete, vignetteCahier, blocVide, encartRoblox } from "../ui/fragments.js";
import { formulaire, confirmer, menu } from "../ui/modal.js";
import { sortiePapier } from "../ui/animations.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { chargerCommerce, estCahierAAcheter, estExempte } from "../features/encre.js";
import { nomRPLibre, choisirNomRP } from "../features/nom-rp.js";
import { donner, panneauRemises } from "../features/transferts.js";

const COUVERTURES = [
  { cle: "parchment", libelle: "Parchemin" },
  { cle: "cuir", libelle: "Cuir" },
  { cle: "ardoise", libelle: "Ardoise" },
  { cle: "olive", libelle: "Olive" },
  { cle: "oxblood", libelle: "Bordeaux" },
  { cle: "encre", libelle: "Encre" }
];

export default async function vueAccueil() {
  const conteneur = el("div.grille.grille--3");
  const droits = el("p.petit.faible.droits-cahiers");
  const etagerePapiers = el("div.grille.grille--3");
  let tendus = new Set();
  const remises = panneauRemises({ surChangement: () => peindre() });

  const noeud = el("div.page",
    remises,                       // ce qu'on me tend passe avant tout le reste
    el("section.panneau.entree",
      el("div.entree__texte",
        el("p.entree__sur", "Bienvenue"),
        el("div.entree__titre", `Bonjour ${etat.profil?.display_name || ""}`.trim()),
        el("p.entree__lead",
          "Votre école, à côté du jeu : prenez vos notes sans quitter le cours. "
          + "Vos cahiers sont privés, personne d'autre que vous n'y a accès, et ils restent consultables même sans encre."),
        el("div.entree__actions",
          el("button.btn.btn--primaire.btn--grand", { onclick: creer }, icone("plus", 15), `Nouveau ${L("cahier")}`),
          el("button.btn.btn--grand", { onclick: () => aller("/classes") }, icone("classe", 15), "Mes classes")),
        el("div.entree__faits",
          el("span.etiq", "Cahiers privés"), el("span.etiq", "Notes en plein cours"), el("span.etiq", "Classes et exercices"))
      )
    ),
    nomRPLibre() ? el("div.panneau", { style: { marginBottom: "var(--e-4)" } },
      el("div.panneau__corps.pile",
        el("b", "Quel est le nom de votre personnage ?"),
        el("p.petit.doux", "Choisissez-le une fois : il s'affichera partout à la place de votre pseudo Discord."),
        el("div", el("button.btn.btn--primaire", {
          onclick: async () => { if (await choisirNomRP()) aller("/"); }
        }, icone("profil", 15), "Choisir mon nom RP"))
      )) : null,
    el("h1.entree__etagere", `Mes ${L("cahiers")}`),
    droits,
    conteneur,
    el("div.etagere__tete",
      el("h2.entree__etagere", "Mes papiers"),
      el("button.btn", { type: "button", onclick: nouveauPapier }, icone("plus", 15), "Nouveau papier")),
    etagerePapiers,
    encartRoblox() ? el("div", { style: { marginTop: "var(--e-6)" } }, encartRoblox()) : null
  );

  /** « Vous pouvez encore créer 1 cahier. » ou la règle du cahier payant. */
  function peindreDroits() {
    const c = etat.commerce?.cahiers;
    if (!c || estExempte()) { droits.textContent = ""; return; }
    droits.textContent = c.restants > 0
      ? `Vous pouvez encore créer ${c.restants} ${c.restants > 1 ? "cahiers" : "cahier"}.`
      : "Votre cahier offert est créé : un nouveau cahier s'achète. Supprimer un cahier ne rend pas ce droit.";
  }

  async function peindrePapiers() {
    const liste = await papiers.enMain(etat.utilisateur.id).catch(() => []);
    render(etagerePapiers, liste.length ? liste.map((p) => el("a.carte-papier", { href: `#/papier/${p.id}` },
      icone("papier", 18), el("b.tronque", p.title || "Papier"),
      el("span.petit.faible", tendus.has(p.id) ? "Tendu · verrouillé" : p.seal ? "Signé" : "Brouillon")))
      : el("p.petit.faible", "Aucun papier en main. Un papier s'écrit, se signe et se donne."));
  }

  async function nouveauPapier() {
    try {
      const p = await papiers.creer({ author_id: etat.utilisateur.id, title: "Nouveau papier", body: "" });
      aller(`/papier/${p.id}`);
    } catch (err) { erreur("Création impossible", messageErreur(err)); }
  }

  async function peindre() {
    tendus = new Set((await transferts.enAttente(etat.utilisateur.id).catch(() => ({ tendus: [] }))).tendus.map((r) => r.objetId));
    remises.peindre();
    peindrePapiers();
    const liste = await cahiers.mesCahiers(etat.utilisateur.id);
    definir({ cahiers: liste });
    peindreDroits();

    if (!liste.length) {
      render(conteneur, blocVide(
        "Votre étagère est vide",
        `Un ${L("cahier")} par matière, par cours ou par sujet : à vous de choisir l'organisation. Le premier est offert.`,
        { libelle: `Créer mon premier ${L("cahier")}`, action: creer }
      ));
      return;
    }

    const compte = new Map();
    await Promise.all(liste.map(async (c) => {
      try { compte.set(c.id, (await pages.liste(c.id)).length); }
      catch { compte.set(c.id, 0); }
    }));

    render(conteneur, liste.map((cahier) => el("div", { style: { position: "relative" } },
      vignetteCahier(cahier, { pages: compte.get(cahier.id) }),
      tendus.has(cahier.id) ? el("span.etiq.cahier__verrou", icone("cadenas", 12), "Tendu") : null,
      el("button.btn.btn--fantome.btn--icone", {
        style: { position: "absolute", top: "8px", right: "8px" },
        "aria-label": "Actions du cahier",
        onclick: (e) => { e.preventDefault(); actions(e.currentTarget, cahier); }
      }, icone("points", 15))
    )));
  }

  function actions(ancre, cahier) {
    if (tendus.has(cahier.id)) {
      menu(ancre, [{ libelle: "Ouvrir (lecture)", icone: "cahier", action: () => aller(`/cahier/${cahier.id}`) }]);
      return;
    }
    menu(ancre, [
      { libelle: "Ouvrir", icone: "cahier", action: () => aller(`/cahier/${cahier.id}`) },
      { libelle: "Donner", icone: "echange", action: async () => {
        if (await donner({ type: "cahier", objetId: cahier.id, titre: cahier.title })) peindre();
      } },
      { libelle: "Renommer / couverture", icone: "crayon", action: () => modifier(cahier) },
      { separateur: true },
      {
        libelle: "Supprimer", icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Supprimer ce cahier",
            message: `« ${cahier.title} » et toutes ses pages seront définitivement perdus. `
              + "Supprimer un cahier ne donne droit ni à un remboursement ni à un nouveau cahier gratuit.",
            libelle: "Supprimer", danger: true
          });
          if (!ok) return;
          const sortie = sortiePapier(ancre.parentElement, "dechire");
          try { await cahiers.supprimer(cahier.id); succes("Cahier supprimé"); await peindre(); }
          catch (err) { sortie.annuler(); erreur("Suppression impossible", messageErreur(err)); }
        }
      }
    ]);
  }

  /** Le droit de créer est épuisé : on l'explique, on renvoie à la boutique. */
  async function proposerAchat() {
    const ok = await confirmer({
      titre: `Un ${L("cahier")} supplémentaire s'achète`,
      message: "Votre premier cahier est offert ; les suivants sont payants. "
        + "Vos cahiers existants restent intacts et consultables.",
      libelle: "Voir la boutique"
    });
    if (ok) aller("/boutique");
  }

  async function creer() {
    await chargerCommerce();                       // l'état le plus frais avant de proposer
    if (etat.commerce && !estExempte() && etat.commerce.cahiers.restants <= 0) {
      peindreDroits();
      await proposerAchat();
      return;
    }
    const sortie = await formulaire({
      titre: `Nouveau ${L("cahier")}`,
      champs: [
        { cle: "title", label: "Titre", valeur: "", placeholder: "Histoire — chapitre 1", requis: true },
        { cle: "subtitle", label: "Sous-titre (facultatif)", valeur: "", placeholder: "Année 2026" },
        { cle: "cover", label: "Couverture", type: "select", valeur: "parchment",
          options: COUVERTURES.map((c) => ({ valeur: c.cle, libelle: c.libelle })) }
      ],
      libelle: "Créer"
    });
    if (!sortie) return;
    try {
      const cahier = await cahiers.creer({
        owner_id: etat.utilisateur.id, kind: "personal", class_id: null,
        title: sortie.title, subtitle: sortie.subtitle || null, cover: sortie.cover,
        color: "olive", icon: "book", collaborative: false
      });
      await pages.creer(cahier.id, { title: "Page 1", created_by: etat.utilisateur.id });
      await chargerCommerce();
      succes("Cahier créé");
      aller(`/cahier/${cahier.id}`);
    } catch (err) {
      if (estCahierAAcheter(err)) { await chargerCommerce(); peindreDroits(); await proposerAchat(); return; }
      erreur("Création impossible", messageErreur(err));
    }
  }

  async function modifier(cahier) {
    const sortie = await formulaire({
      titre: "Modifier le cahier",
      champs: [
        { cle: "title", label: "Titre", valeur: cahier.title, requis: true },
        { cle: "subtitle", label: "Sous-titre", valeur: cahier.subtitle || "" },
        { cle: "cover", label: "Couverture", type: "select", valeur: cahier.cover,
          options: COUVERTURES.map((c) => ({ valeur: c.cle, libelle: c.libelle })) }
      ]
    });
    if (!sortie) return;
    try {
      await cahiers.majorer(cahier.id, {
        title: sortie.title, subtitle: sortie.subtitle || null, cover: sortie.cover
      });
      await peindre();
    } catch (err) {
      erreur("Modification impossible", messageErreur(err));
    }
  }

  await peindre();
  return { noeud, titre: `Mes ${L("cahiers")}`, nettoyer: () => remises.fermer() };
}
