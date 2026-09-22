/* ---------------------------------------------------------------------------
 * Documents et bibliothèque : import, dossiers, distribution, conversion
 * en pages de cahier.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { documents, dossiers, cahiers, journal, notifications } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { confirmer, demander, menu, ouvrirModale } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { estEnseignant } from "../core/permissions.js";
import { poids, depuis, pluriel } from "../core/util.js";

const TYPES_ACCEPTES = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv";
const TAILLE_MAX = 25 * 1024 * 1024;

export default async function vueDocuments({ requete }) {
  const classesEncadrees = etat.classes.filter((c) =>
    ["teacher", "assistant"].includes(c.membre?.role) || c.owner_id === etat.utilisateur.id);
  const peutImporter = estEnseignant() || classesEncadrees.length > 0;

  let classeFiltre = requete?.classe || (classesEncadrees[0]?.id ?? etat.classes[0]?.id ?? null);
  let dossierCourant = null;
  const zone = el("div");
  const filArbre = el("div.ligne-flex.enrouler", { style: { marginBottom: "var(--e-4)" } });

  const noeud = el("div.page",
    entete("Bibliothèque", "Documents",
      "PDF, images et fiches. Le professeur les distribue, les affiche en cours ou les convertit en pages de cahier.",
      peutImporter ? [
        el("button.btn", { onclick: creerDossier }, icone("dossier", 15), "Nouveau dossier"),
        el("button.btn.btn--primaire", { onclick: () => selecteur.click() }, icone("televerser", 15), "Importer")
      ] : null),
    el("div.onglets", { ref: peindreClasses }),
    filArbre,
    zone
  );

  const selecteur = el("input", {
    type: "file", accept: TYPES_ACCEPTES, multiple: true, hidden: true,
    onchange: (e) => importer([...e.target.files])
  });
  noeud.appendChild(selecteur);

  // Glisser-déposer sur toute la page
  noeud.addEventListener("dragover", (e) => { e.preventDefault(); noeud.classList.add("survol"); });
  noeud.addEventListener("dragleave", () => noeud.classList.remove("survol"));
  noeud.addEventListener("drop", (e) => {
    e.preventDefault();
    noeud.classList.remove("survol");
    if (peutImporter && e.dataTransfer.files.length) importer([...e.dataTransfer.files]);
  });

  function peindreClasses(hote) {
    const items = etat.classes.filter((c) => !c.archived);
    if (!items.length) return;
    render(hote, items.map((c) => el("button.onglet", {
      role: "tab", "aria-selected": String(c.id === classeFiltre),
      onclick: () => { classeFiltre = c.id; dossierCourant = null; peindreClasses(hote); peindre(); }
    }, c.name)));
  }

  async function peindre() {
    if (!classeFiltre) {
      render(zone, blocVide("Aucune classe", "Rejoignez une classe pour accéder à ses documents."));
      return;
    }
    render(zone, el("p.petit.faible", "Chargement…"));

    const classe = etat.classes.find((c) => c.id === classeFiltre);
    const staff = ["teacher", "assistant"].includes(classe?.membre?.role)
      || classe?.owner_id === etat.utilisateur.id;

    const [listeDossiers, listeDocuments] = await Promise.all([
      dossiers.liste({ class_id: classeFiltre }).catch(() => []),
      documents.liste({ class_id: classeFiltre }).catch(() => [])
    ]);

    const visibles = (staff ? listeDocuments : listeDocuments.filter((d) => d.shared))
      .filter((d) => (d.folder_id || null) === (dossierCourant?.id || null));
    const sousDossiers = listeDossiers.filter((d) => (d.parent_id || null) === (dossierCourant?.id || null));

    render(filArbre,
      el("button.btn.btn--fantome.petit", {
        onclick: () => { dossierCourant = null; peindre(); }
      }, icone("dossier", 13), classe?.name || "Racine"),
      dossierCourant ? el("span.faible", "›") : null,
      dossierCourant ? el("b.petit", dossierCourant.name) : null
    );

    if (!visibles.length && !sousDossiers.length) {
      render(zone, blocVide("Dossier vide",
        staff ? "Déposez un fichier ici ou cliquez sur Importer." : "Le professeur n'a rien distribué.",
        staff ? { libelle: "Importer un document", action: () => selecteur.click() } : null));
      return;
    }

    render(zone,
      sousDossiers.length ? el("div.grille.grille--4", { style: { marginBottom: "var(--e-5)" } },
        sousDossiers.map((d) => el("button.carte.carte--cliquable", {
          onclick: () => { dossierCourant = d; peindre(); },
          oncontextmenu: (e) => { e.preventDefault(); if (staff) menuDossier(e.currentTarget, d); }
        },
          el("div.ligne-flex", icone("dossier", 18), el("b.tronque", d.name))
        ))
      ) : null,

      el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
        el("div.liste", visibles.map((d) => el("div.liste__item.liste__item--cliquable", {
          onclick: () => ouvrir(d)
        },
          icone(d.kind === "image" ? "image" : d.kind === "pdf" ? "documents" : "cahier", 16),
          el("div.liste__principal",
            el("div.liste__nom", d.title),
            el("div.liste__detail",
              `${poids(d.size_bytes)} · importé ${depuis(d.created_at)}${d.page_count ? ` · ${pluriel(d.page_count, "page")}` : ""}`)
          ),
          el("div.liste__fin",
            d.shared ? el("span.etiq.etiq--ok", "Distribué") : el("span.etiq", "Privé"),
            el("button.btn.btn--fantome.btn--icone", {
              "aria-label": "Actions",
              onclick: (e) => { e.stopPropagation(); menuDocument(e.currentTarget, d, staff); }
            }, icone("points", 15))
          )
        )))
      ))
    );
  }

  /* --- Import ---------------------------------------------------------------- */
  async function importer(fichiers) {
    if (!classeFiltre) { erreur("Choisissez d'abord une classe"); return; }
    for (const fichier of fichiers) {
      if (fichier.size > TAILLE_MAX) {
        erreur("Fichier trop volumineux", `${fichier.name} dépasse ${poids(TAILLE_MAX)}.`);
        continue;
      }
      const fermer = toast(`Import de ${fichier.name}…`, { duree: 0 });
      try {
        const doc = await documents.televerser(fichier, {
          classeId: classeFiltre, dossierId: dossierCourant?.id || null,
          proprietaireId: etat.utilisateur.id, partage: false
        });
        fermer();
        succes("Document importé", doc.title);
        await peindre();
        if (doc.kind === "pdf" || doc.kind === "image" || doc.kind === "text") {
          proposerConversion(doc, fichier);
        }
      } catch (err) {
        fermer();
        erreur("Import impossible", messageErreur(err));
      }
    }
    selecteur.value = "";
  }

  /* --- Conversion en cahier ---------------------------------------------------- */
  async function proposerConversion(doc, fichier) {
    const mesCahiers = await cahiers.mesCahiers(etat.utilisateur.id);
    const cahierClasse = await cahiers.commun(classeFiltre);
    const cibles = [cahierClasse, ...mesCahiers].filter(Boolean);
    if (!cibles.length) return;

    let total = null;
    if (doc.kind === "pdf") {
      try {
        const { compterPagesPdf } = await import("../features/import-document.js");
        total = await compterPagesPdf(fichier);
        await documents.majorer(doc.id, { page_count: total });
      } catch { total = null; }
    }

    let champCahier = null;
    let champPages = null;

    const sortie = await ouvrirModale({
      titre: "Convertir en pages de cahier",
      corps: () => el("div",
        el("p.doux", total
          ? `« ${doc.title} » comporte ${pluriel(total, "page")}. Chaque page deviendra une page de cahier.`
          : `« ${doc.title} » sera versé dans le cahier choisi.`),
        el("label.champ",
          el("span.champ__label", "Cahier de destination"),
          champCahier = el("select.saisie",
            cibles.map((c) => el("option", { value: c.id },
              c.kind === "shared" ? `${c.title} (commun)` : c.title)))
        ),
        total ? el("label.champ",
          el("span.champ__label", "Pages à importer"),
          champPages = el("input.saisie", { placeholder: `1-${total} (vide = toutes)` }),
          el("span.champ__aide", "Exemple : 1-4, 7, 10-12")
        ) : null
      ),
      actions: [
        { libelle: "Plus tard", valeur: null },
        { libelle: "Convertir", variante: "primaire", action: () => ({
          cahier: champCahier.value,
          pages: champPages?.value || ""
        }) }
      ]
    });
    if (!sortie) return;

    const pagesVoulues = analyserIntervalle(sortie.pages, total);
    const fermer = toast("Conversion en cours…", { duree: 0 });
    try {
      const { verserDansCahier } = await import("../features/import-document.js");
      const creees = await verserDansCahier({
        cahierId: sortie.cahier, document: doc, fichier, pagesVoulues,
        surProgression: () => {}
      });
      fermer();
      succes("Document converti", `${pluriel(creees.length, "page")} ajoutée${creees.length > 1 ? "s" : ""}.`);
      aller(`/cahier/${sortie.cahier}`);
    } catch (err) {
      fermer();
      erreur("Conversion impossible", messageErreur(err));
    }
  }

  function analyserIntervalle(expression, total) {
    if (!expression?.trim() || !total) return null;
    const sortie = new Set();
    for (const bloc of expression.split(",")) {
      const morceau = bloc.trim();
      const intervalle = /^(\d+)\s*-\s*(\d+)$/.exec(morceau);
      if (intervalle) {
        for (let i = Number(intervalle[1]); i <= Number(intervalle[2]); i++) {
          if (i >= 1 && i <= total) sortie.add(i);
        }
      } else if (/^\d+$/.test(morceau)) {
        const n = Number(morceau);
        if (n >= 1 && n <= total) sortie.add(n);
      }
    }
    return sortie.size ? [...sortie].sort((a, b) => a - b) : null;
  }

  /* --- Actions ------------------------------------------------------------------- */
  async function ouvrir(doc) {
    try {
      const url = await documents.url(doc);
      window.open(url, "_blank", "noopener");
      journal.ecrire({
        class_id: doc.class_id, user_id: etat.utilisateur.id,
        action: "document.open", meta: { document: doc.id }
      });
    } catch (err) {
      erreur("Document indisponible", messageErreur(err));
    }
  }

  function menuDocument(ancre, doc, staff) {
    menu(ancre, [
      { titre: doc.title },
      { libelle: "Ouvrir", icone: "oeil", action: () => ouvrir(doc) },
      staff && {
        libelle: doc.shared ? "Retirer de la classe" : "Distribuer à la classe",
        icone: doc.shared ? "cadenas" : "megaphone",
        action: async () => {
          await documents.majorer(doc.id, { shared: !doc.shared });
          if (!doc.shared) {
            notifications.diffuser(doc.class_id, {
              kind: "document", titre: "Nouveau document disponible",
              corps: doc.title, lien: `/documents?classe=${doc.class_id}`
            }).catch(() => {});
          }
          toast(doc.shared ? "Document retiré" : "Document distribué");
          await peindre();
        }
      },
      {
        libelle: "Convertir en pages de cahier", icone: "cahier",
        action: async () => {
          try {
            const url = await documents.url(doc);
            const reponse = await fetch(url);
            const blob = await reponse.blob();
            const fichier = new File([blob], doc.meta?.nom_fichier || doc.title,
              { type: doc.meta?.type_mime || blob.type });
            await proposerConversion(doc, fichier);
          } catch (err) {
            erreur("Conversion impossible", messageErreur(err));
          }
        }
      },
      staff && { separateur: true },
      staff && {
        libelle: "Renommer", icone: "crayon",
        action: async () => {
          const titre = await demander({ titre: "Renommer", label: "Titre", valeur: doc.title });
          if (!titre) return;
          await documents.majorer(doc.id, { title: titre });
          await peindre();
        }
      },
      staff && {
        libelle: "Supprimer", icone: "corbeille", danger: true,
        action: async () => {
          if (!await confirmer({ titre: "Supprimer le document", message: doc.title, libelle: "Supprimer", danger: true })) return;
          await documents.supprimer(doc);
          toast("Document supprimé");
          await peindre();
        }
      }
    ].filter(Boolean));
  }

  function menuDossier(ancre, dossier) {
    menu(ancre, [
      { titre: dossier.name },
      { libelle: "Ouvrir", icone: "dossier", action: () => { dossierCourant = dossier; peindre(); } },
      { libelle: "Renommer", icone: "crayon", action: async () => {
        const nom = await demander({ titre: "Renommer le dossier", label: "Nom", valeur: dossier.name });
        if (!nom) return;
        await dossiers.majorer(dossier.id, { name: nom });
        await peindre();
      } },
      { libelle: "Supprimer", icone: "corbeille", danger: true, action: async () => {
        if (!await confirmer({ titre: "Supprimer le dossier", message: "Les documents qu'il contient seront déplacés à la racine.", libelle: "Supprimer", danger: true })) return;
        await dossiers.supprimer(dossier.id);
        await peindre();
      } }
    ]);
  }

  async function creerDossier() {
    if (!classeFiltre) { erreur("Choisissez d'abord une classe"); return; }
    const nom = await demander({
      titre: "Nouveau dossier", label: "Nom du dossier",
      placeholder: "Certifications", libelle: "Créer"
    });
    if (!nom) return;
    await dossiers.creer({
      owner_id: etat.utilisateur.id, class_id: classeFiltre,
      parent_id: dossierCourant?.id || null, name: nom, icon: "folder"
    });
    await peindre();
  }

  await peindre();
  return { noeud, titre: "Documents" };
}
