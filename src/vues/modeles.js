/* ---------------------------------------------------------------------------
 * Cours préparés et modèles.
 *
 * Un cours est une suite d'étapes ordonnées (page, document, exercice, tableau).
 * On le prépare à froid, puis on le déroule pendant la séance : chaque étape
 * devient une page du cahier commun que le professeur fait défiler pour toute
 * la classe.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { cours, cahiers, pages as depotPages } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { formulaire, confirmer, menu } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { estEnseignant } from "../core/permissions.js";
import { depuis, pluriel } from "../core/util.js";

const GENRES = [
  { valeur: "page", libelle: "Page de cours" },
  { valeur: "note", libelle: "Note pour le professeur" },
  { valeur: "exercise", libelle: "Exercice (rappel)" },
  { valeur: "document", libelle: "Document à afficher" },
  { valeur: "board", libelle: "Moment au tableau" }
];

export default async function vueModeles() {
  if (!estEnseignant()) {
    return {
      noeud: el("div.page", blocVide("Espace réservé", "Réservé aux professeurs et formateurs.",
        { libelle: "Accueil", action: () => aller("/") })),
      titre: "Modèles"
    };
  }

  const classesEncadrees = etat.classes.filter((c) =>
    ["teacher", "assistant"].includes(c.membre?.role) || c.owner_id === etat.utilisateur.id);

  let selection = null;
  const listeZone = el("div.panneau__corps.panneau__corps--serre");
  const detailZone = el("div");

  const noeud = el("div.page.page--large",
    entete("Préparation", "Cours et modèles",
      "Préparez le déroulé d'une séance, puis versez-le dans le cahier commun le jour venu.",
      [el("button.btn.btn--primaire", { onclick: creerCours }, icone("plus", 15), "Nouveau cours")]),
    el("div.colonnes",
      detailZone,
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Mes cours")),
        listeZone
      )
    )
  );

  async function peindreListe() {
    const liste = await cours.liste({ owner_id: etat.utilisateur.id });
    render(listeZone, liste.length
      ? el("div.liste", liste.map((c) => el("div.liste__item.liste__item--cliquable", {
          "aria-current": String(c.id === selection?.id),
          onclick: () => { selection = c; peindreDetail(); peindreListe(); },
          oncontextmenu: (e) => { e.preventDefault(); menuCours(e.currentTarget, c); }
        },
          icone(c.is_template ? "livre" : "cours", 16),
          el("div.liste__principal",
            el("div.liste__nom", c.title),
            el("div.liste__detail", c.is_template ? "Modèle" : `Modifié ${depuis(c.created_at)}`)
          )
        )))
      : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucun cours préparé."));
  }

  async function peindreDetail() {
    if (!selection) {
      render(detailZone, blocVide("Aucun cours sélectionné",
        "Choisissez un cours à droite, ou créez-en un nouveau."));
      return;
    }
    const etapes = await cours.etapes(selection.id);

    render(detailZone, el("div.pile",
      el("div.ligne-flex.ligne-flex--entre.enrouler",
        el("div",
          el("h2", selection.title),
          selection.description ? el("p.doux.petit", selection.description) : null
        ),
        el("div.ligne-flex",
          el("button.btn", { onclick: () => ajouterEtape(selection.id) }, icone("plus", 15), "Étape"),
          el("button.btn.btn--primaire", { onclick: () => deployer(selection, etapes) },
            icone("cahier", 15), "Verser dans un cahier")
        )
      ),

      etapes.length
        ? el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
            el("div.liste", etapes.map((etape, index) => el("div.liste__item",
              el("span.mono.faible", String(index + 1).padStart(2, "0")),
              el("div.liste__principal",
                el("div.liste__nom", etape.title),
                el("div.liste__detail",
                  `${GENRES.find((g) => g.valeur === etape.kind)?.libelle || etape.kind}`
                  + (etape.payload?.corps ? ` · ${etape.payload.corps.slice(0, 60)}…` : ""))
              ),
              el("div.liste__fin",
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Monter", disabled: index === 0,
                  onclick: () => deplacer(etapes, index, -1)
                }, icone("chevronG", 14)),
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Descendre", disabled: index === etapes.length - 1,
                  onclick: () => deplacer(etapes, index, 1)
                }, icone("chevronD", 14)),
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Modifier", onclick: () => modifierEtape(etape)
                }, icone("crayon", 14)),
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Supprimer",
                  onclick: async () => { await cours.supprimerEtape(etape.id); await peindreDetail(); }
                }, icone("corbeille", 14))
              )
            )))
          ))
        : blocVide("Cours vide", "Ajoutez les étapes : introduction, définition, exemple, exercice, correction…",
            { libelle: "Ajouter une étape", action: () => ajouterEtape(selection.id) })
    ));
  }

  async function deplacer(etapes, index, delta) {
    const cible = index + delta;
    if (cible < 0 || cible >= etapes.length) return;
    await cours.majorerEtape(etapes[index].id, { position: cible });
    await cours.majorerEtape(etapes[cible].id, { position: index });
    await peindreDetail();
  }

  async function creerCours() {
    const sortie = await formulaire({
      titre: "Nouveau cours",
      champs: [
        { cle: "title", label: "Titre", placeholder: "Certification I — séance 1", requis: true },
        { cle: "description", label: "Objet", type: "textarea" },
        { cle: "class_id", label: "Classe (facultatif)", type: "select", valeur: "",
          options: [{ valeur: "", libelle: "Aucune — modèle réutilisable" },
            ...classesEncadrees.map((c) => ({ valeur: c.id, libelle: c.name }))] },
        { cle: "is_template", label: "Marquer comme modèle réutilisable", type: "checkbox" }
      ],
      libelle: "Créer"
    });
    if (!sortie) return;
    try {
      selection = await cours.creer({
        owner_id: etat.utilisateur.id, class_id: sortie.class_id || null,
        title: sortie.title, description: sortie.description || null,
        is_template: Boolean(sortie.is_template)
      });
      await peindreListe();
      await peindreDetail();
    } catch (err) {
      erreur("Création impossible", messageErreur(err));
    }
  }

  async function ajouterEtape(coursId) {
    const sortie = await formulaire({
      titre: "Ajouter une étape",
      champs: [
        { cle: "title", label: "Intitulé", placeholder: "Introduction", requis: true },
        { cle: "kind", label: "Nature", type: "select", valeur: "page", options: GENRES },
        { cle: "corps", label: "Contenu de la page", type: "textarea", lignes: 6,
          aide: "Ce texte deviendra le corps de la page du cahier commun." }
      ],
      libelle: "Ajouter"
    });
    if (!sortie) return;
    await cours.ajouterEtape(coursId, {
      title: sortie.title, kind: sortie.kind, payload: { corps: sortie.corps || "" }
    });
    await peindreDetail();
  }

  async function modifierEtape(etape) {
    const sortie = await formulaire({
      titre: "Modifier l'étape",
      champs: [
        { cle: "title", label: "Intitulé", valeur: etape.title, requis: true },
        { cle: "kind", label: "Nature", type: "select", valeur: etape.kind, options: GENRES },
        { cle: "corps", label: "Contenu", type: "textarea", lignes: 6, valeur: etape.payload?.corps || "" }
      ]
    });
    if (!sortie) return;
    await cours.majorerEtape(etape.id, {
      title: sortie.title, kind: sortie.kind,
      payload: { ...etape.payload, corps: sortie.corps || "" }
    });
    await peindreDetail();
  }

  async function deployer(coursChoisi, etapes) {
    if (!etapes.length) { erreur("Cours vide", "Ajoutez au moins une étape."); return; }

    const cibles = [];
    for (const classe of classesEncadrees) {
      const commun = await cahiers.commun(classe.id);
      if (commun) cibles.push({ valeur: commun.id, libelle: `${classe.name} — cahier commun` });
    }
    const mesCahiers = await cahiers.mesCahiers(etat.utilisateur.id);
    cibles.push(...mesCahiers.map((c) => ({ valeur: c.id, libelle: `${c.title} (personnel)` })));

    if (!cibles.length) { erreur("Aucun cahier disponible"); return; }

    const sortie = await formulaire({
      titre: "Verser le cours dans un cahier",
      note: `${pluriel(etapes.length, "étape")} deviendront autant de pages, dans l'ordre.`,
      champs: [{ cle: "cahier", label: "Cahier", type: "select", valeur: cibles[0].valeur, options: cibles }],
      libelle: "Verser"
    });
    if (!sortie) return;

    try {
      for (const etape of etapes) {
        const corps = String(etape.payload?.corps || "")
          .split("\n")
          .map((l) => `<p>${l.replace(/[<>&]/g, "")}</p>`).join("");
        await depotPages.creer(sortie.cahier, {
          title: etape.title, body: corps,
          origin: "course", origin_ref: coursChoisi.id,
          created_by: etat.utilisateur.id
        });
      }
      succes("Cours versé", `${pluriel(etapes.length, "page")} ajoutée${etapes.length > 1 ? "s" : ""}.`);
      aller(`/cahier/${sortie.cahier}`);
    } catch (err) {
      erreur("Versement impossible", messageErreur(err));
    }
  }

  function menuCours(ancre, coursChoisi) {
    menu(ancre, [
      { titre: coursChoisi.title },
      { libelle: "Dupliquer", icone: "copier", action: async () => {
        await cours.dupliquer(coursChoisi.id);
        await peindreListe();
        toast("Cours dupliqué");
      } },
      { libelle: coursChoisi.is_template ? "Retirer des modèles" : "Marquer comme modèle", icone: "livre",
        action: async () => {
          await cours.majorer(coursChoisi.id, { is_template: !coursChoisi.is_template });
          await peindreListe();
        } },
      { separateur: true },
      { libelle: "Supprimer", icone: "corbeille", danger: true, action: async () => {
        if (!await confirmer({ titre: "Supprimer le cours", message: coursChoisi.title, libelle: "Supprimer", danger: true })) return;
        await cours.supprimer(coursChoisi.id);
        if (selection?.id === coursChoisi.id) selection = null;
        await peindreListe(); await peindreDetail();
      } }
    ]);
  }

  await peindreListe();
  await peindreDetail();
  return { noeud, titre: "Cours et modèles" };
}
