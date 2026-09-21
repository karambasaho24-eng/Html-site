/* ---------------------------------------------------------------------------
 * Mes cahiers — étagère personnelle.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { cahiers, pages } from "../data/index.js";
import { entete, vignetteCahier, blocVide, encartRoblox } from "../ui/fragments.js";
import { formulaire, confirmer, menu } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";

const COUVERTURES = [
  { cle: "parchment", libelle: "Parchemin" },
  { cle: "cuir", libelle: "Cuir" },
  { cle: "ardoise", libelle: "Ardoise" },
  { cle: "olive", libelle: "Olive" },
  { cle: "oxblood", libelle: "Bordeaux" },
  { cle: "encre", libelle: "Encre" }
];

export default async function vueCahiers() {
  const conteneur = el("div.grille.grille--3");
  const noeud = el("div.page",
    entete(L("Cahiers"), `Mes ${L("cahiers")}`,
      "Vos cahiers personnels restent privés : ni le professeur ni les autres élèves n'y ont accès.",
      [el("button.btn.btn--primaire", { onclick: creer }, icone("plus", 15), "Nouveau cahier")]
    ),
    conteneur,
    el("div", { style: { marginTop: "var(--e-6)" } }, encartRoblox())
  );

  async function peindre() {
    const liste = await cahiers.mesCahiers(etat.utilisateur.id);
    definir({ cahiers: liste });

    if (!liste.length) {
      render(conteneur, blocVide(
        "Votre étagère est vide",
        `Un ${L("cahier")} par matière, par formation ou par enquête : à vous de choisir l'organisation.`,
        { libelle: "Créer mon premier cahier", action: creer }
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
      el("button.btn.btn--fantome.btn--icone", {
        style: { position: "absolute", top: "8px", right: "8px" },
        "aria-label": "Actions du cahier",
        onclick: (e) => { e.preventDefault(); actions(e.currentTarget, cahier); }
      }, icone("points", 15))
    )));
  }

  function actions(ancre, cahier) {
    menu(ancre, [
      { libelle: "Ouvrir", icone: "cahier", action: () => aller(`/cahier/${cahier.id}`) },
      { libelle: "Renommer / couverture", icone: "crayon", action: () => modifier(cahier) },
      { separateur: true },
      {
        libelle: "Supprimer", icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Supprimer ce cahier",
            message: `« ${cahier.title} » et toutes ses pages seront définitivement perdus.`,
            libelle: "Supprimer", danger: true
          });
          if (!ok) return;
          try { await cahiers.supprimer(cahier.id); succes("Cahier supprimé"); await peindre(); }
          catch (err) { erreur("Suppression impossible", messageErreur(err)); }
        }
      }
    ]);
  }

  async function creer() {
    const sortie = await formulaire({
      titre: `Nouveau ${L("cahier")}`,
      champs: [
        { cle: "title", label: "Titre", valeur: "", placeholder: "Cahier de droit pénal", requis: true },
        { cle: "subtitle", label: "Sous-titre (facultatif)", valeur: "", placeholder: "Promotion 2026" },
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
      succes("Cahier créé");
      aller(`/cahier/${cahier.id}`);
    } catch (err) {
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
  return { noeud, titre: `Mes ${L("cahiers")}` };
}
