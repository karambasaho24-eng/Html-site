/* ---------------------------------------------------------------------------
 * Éditeur de cahier — la pièce maîtresse.
 *
 * Utilisé pour :
 *   · le cahier personnel (privé, hors ligne tolérant)
 *   · le cahier commun d'une classe (lecture seule ou collaboratif)
 *   · la consultation d'une archive
 *
 * Sauvegarde différée, réordonnancement par glisser-déposer, synchronisation
 * temps réel optionnelle.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { pages as depotPages, temps } from "../data/index.js";
import { assainirHTML, injecterHTML, texteBrut } from "../core/assainir.js";
import { debounce, dateLongue, heure, depuis } from "../core/util.js";
import { dateRP, REGLAGES_RP_DEFAUT } from "../core/rp.js";
import { confirmer, demander, menu } from "../ui/modal.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { etat } from "../core/store.js";
import { local } from "../core/util.js";

const REGLURES = ["reglure", "quadrille", "blanc"];

/**
 * creerEditeurCahier({ cahier, peutEcrire, pageInitiale, surPage, surCapture, compact, tempsReel })
 */
export function creerEditeurCahier(options) {
  const {
    cahier,
    peutEcrire = true,
    pageInitiale = null,
    surPage = null,
    compact = false,
    tempsReel = false,
    actionsSupplementaires = null,
    rp = REGLAGES_RP_DEFAUT
  } = options;

  let listePages = [];
  let pageCourante = null;
  let reglure = local.lire(`ojm.reglure.${cahier.id}`, "reglure");
  let abonnement = null;
  let enEdition = false;

  const trancheListe = el("div.tranche__pages");
  const zoneFeuillet = el("div.feuillet__zone");
  const barreFeuillet = el("div.feuillet__barre");
  const etiquetteSauvegarde = el("span.petit.faible", "");

  const racine = el("div.cahier", { class: compact ? "cahier--sans-tranche" : "" },
    compact ? null : el("aside.tranche",
      el("div.tranche__entete",
        el("span.tranche__titre", cahier.title),
        el("button.btn.btn--fantome.btn--icone", {
          "aria-label": "Options du cahier",
          onclick: (e) => menuCahier(e.currentTarget)
        }, icone("points", 15))
      ),
      trancheListe,
      peutEcrire ? el("div.tranche__pied",
        el("button.btn.btn--bloc", { onclick: ajouterPage }, icone("plus", 15), "Nouvelle page")
      ) : null
    ),
    el("section.feuillet", barreFeuillet, zoneFeuillet)
  );

  /* --- Sauvegarde ---------------------------------------------------------- */
  const sauvegarder = debounce(async () => {
    if (!pageCourante || !peutEcrire) return;
    const patch = {
      title: pageCourante.title,
      body: pageCourante.body,
      attachments: pageCourante.attachments || []
    };
    etiquetteSauvegarde.textContent = "Enregistrement…";
    try {
      const maj = await depotPages.majorer(pageCourante.id, patch);
      pageCourante.updated_at = maj.updated_at;
      etiquetteSauvegarde.textContent = `Enregistré à ${heure(maj.updated_at || Date.now())}`;
      brouillonRetirer(pageCourante.id);
    } catch (err) {
      etiquetteSauvegarde.textContent = "Non enregistré — conservé localement";
      brouillonEcrire(pageCourante.id, patch);
      console.warn("[cahier] sauvegarde différée", err);
    }
  }, 900);

  function brouillonEcrire(pageId, donnees) {
    local.ecrire(`ojm.brouillon.${pageId}`, { ...donnees, horodatage: Date.now() });
  }
  function brouillonLire(pageId) { return local.lire(`ojm.brouillon.${pageId}`, null); }
  function brouillonRetirer(pageId) { local.retirer(`ojm.brouillon.${pageId}`); }

  /* --- Chargement ---------------------------------------------------------- */
  async function charger(idCible = null) {
    listePages = await depotPages.liste(cahier.id);
    if (!listePages.length && peutEcrire) {
      await depotPages.creer(cahier.id, { title: "Page 1", created_by: etat.utilisateur?.id });
      listePages = await depotPages.liste(cahier.id);
    }
    const cible = idCible || pageCourante?.id || pageInitiale;
    const trouvee = listePages.find((p) => p.id === cible) || listePages[0] || null;
    peindreTranche();
    if (trouvee) ouvrirPage(trouvee.id);
    else render(zoneFeuillet, el("div.vide", el("span.vide__titre", "Cahier vide")));
  }

  function peindreTranche() {
    if (compact) return;
    render(trancheListe, listePages.map((page, index) => el("div.onglet-page", {
      "aria-current": String(page.id === pageCourante?.id),
      draggable: peutEcrire,
      dataset: { id: page.id },
      onclick: () => ouvrirPage(page.id),
      oncontextmenu: (e) => { e.preventDefault(); menuPage(e.currentTarget, page); },
      ondragstart: (e) => {
        e.currentTarget.classList.add("glisse");
        e.dataTransfer.setData("text/plain", page.id);
        e.dataTransfer.effectAllowed = "move";
      },
      ondragend: (e) => e.currentTarget.classList.remove("glisse"),
      ondragover: (e) => { if (peutEcrire) { e.preventDefault(); e.currentTarget.classList.add("cible"); } },
      ondragleave: (e) => e.currentTarget.classList.remove("cible"),
      ondrop: async (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("cible");
        const source = e.dataTransfer.getData("text/plain");
        await deplacerPage(source, index);
      }
    },
      el("span.onglet-page__num", String(index + 1)),
      el("span.onglet-page__titre", page.title || "Sans titre"),
      page.origin === "board" ? el("span.onglet-page__marque", { title: "Capture du tableau" }, "▣") : null,
      page.origin === "document" ? el("span.onglet-page__marque", { title: "Issue d'un document" }, "▤") : null
    )));
  }

  async function deplacerPage(sourceId, indexCible) {
    const depart = listePages.findIndex((p) => p.id === sourceId);
    if (depart < 0 || depart === indexCible) return;
    const copie = [...listePages];
    const [deplacee] = copie.splice(depart, 1);
    copie.splice(indexCible, 0, deplacee);
    listePages = copie.map((p, i) => ({ ...p, position: i }));
    peindreTranche();
    try { await depotPages.reordonner(listePages); }
    catch (err) { erreur("Réordonnancement impossible", messageErreur(err)); await charger(); }
  }

  /* --- Page ---------------------------------------------------------------- */
  function ouvrirPage(pageId) {
    const page = listePages.find((p) => p.id === pageId);
    if (!page) return;

    const brouillon = brouillonLire(pageId);
    pageCourante = brouillon && new Date(brouillon.horodatage) > new Date(page.updated_at || 0)
      ? { ...page, ...brouillon }
      : { ...page };

    peindreTranche();
    peindreBarre();
    peindreParchemin();
    surPage?.(pageCourante);
  }

  function peindreBarre() {
    const commande = (nom, valeur = null) => () => {
      document.execCommand(nom, false, valeur);
      corps?.focus();
      capturerCorps();
    };

    render(barreFeuillet,
      peutEcrire ? el("div.outils-texte",
        outil("Gras", "texte", commande("bold"), "B"),
        outil("Italique", "texte", commande("italic"), "I"),
        outil("Souligné", "texte", commande("underline"), "U"),
        outil("Surligner", "surligneur", commande("hiliteColor", "#d8bd63")),
        sep(),
        outil("Titre", "texte", commande("formatBlock", "<h2>"), "T1"),
        outil("Sous-titre", "texte", commande("formatBlock", "<h3>"), "T2"),
        outil("Paragraphe", "texte", commande("formatBlock", "<p>"), "¶"),
        sep(),
        outil("Liste à puces", "liste", commande("insertUnorderedList")),
        outil("Liste numérotée", "liste", commande("insertOrderedList"), "1."),
        outil("Citation", "texte", commande("formatBlock", "<blockquote>"), "❝"),
        sep(),
        outil("Image", "image", insererImage),
        rp.hrpAutorise ? outil("Passage hors-roleplay", "texte", marquerHRP, "(( ))") : null,
        outil("Annuler", "annuler", commande("undo")),
        outil("Refaire", "refaire", commande("redo"))
      ) : el("span.etiq.etiq--info", icone("oeil", 13), "Lecture seule"),

      el("span.pousse"),
      actionsSupplementaires ? actionsSupplementaires(pageCourante) : null,
      el("button.btn.btn--fantome.btn--icone", {
        "aria-label": "Type de réglure", title: "Réglure",
        onclick: (e) => menu(e.currentTarget, REGLURES.map((r) => ({
          libelle: { reglure: "Lignes", quadrille: "Carreaux", blanc: "Page blanche" }[r]
            + (reglure === r ? "  ✓" : ""),
          action: () => {
            reglure = r;
            local.ecrire(`ojm.reglure.${cahier.id}`, r);
            peindreParchemin();
          }
        })))
      }, icone("grille", 15)),
      etiquetteSauvegarde
    );
  }

  function outil(titre, nomIcone, action, texte = null) {
    return el("button.btn.btn--fantome.btn--icone", {
      type: "button", title: titre, "aria-label": titre,
      onmousedown: (e) => e.preventDefault(),
      onclick: action
    }, texte ? el("span.petit.mono", texte) : icone(nomIcone, 15));
  }

  function sep() {
    return el("span", { style: { width: "1px", height: "18px", background: "var(--ligne)", margin: "0 4px" } });
  }

  let corps = null;

  function peindreParchemin() {
    if (!pageCourante) return;
    const classeReglure = reglure === "quadrille" ? "parchemin--quadrille"
      : reglure === "blanc" ? "" : "parchemin--reglure";

    corps = el("div.parchemin__corps", {
      contenteditable: peutEcrire ? "true" : "false",
      "data-vide": "Commencez à écrire…",
      spellcheck: "true",
      role: "textbox", "aria-multiline": "true", "aria-label": "Contenu de la page",
      oninput: capturerCorps,
      onfocus: () => { enEdition = true; },
      onblur: () => { enEdition = false; sauvegarder.immediat(); },
      onpaste: (e) => {
        // On ne colle que du texte : aucun HTML étranger n'entre dans la page.
        e.preventDefault();
        const texte = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, texte);
      }
    });
    injecterHTML(corps, pageCourante.body || "");

    const titre = el("input.parchemin__titre", {
      value: pageCourante.title || "",
      placeholder: "Titre de la page",
      readonly: !peutEcrire,
      "aria-label": "Titre de la page",
      oninput: (e) => {
        pageCourante.title = e.target.value;
        const index = listePages.findIndex((p) => p.id === pageCourante.id);
        if (index >= 0) listePages[index].title = e.target.value;
        peindreTranche();
        sauvegarder();
      }
    });

    const numero = listePages.findIndex((p) => p.id === pageCourante.id) + 1;

    render(zoneFeuillet,
      el("article.parchemin", { class: classeReglure },
        el("header.parchemin__entete",
          titre,
          el("span", {
            class: rp.actif ? "parchemin__date date-rp" : "parchemin__date",
            title: rp.actif ? dateLongue(pageCourante.created_at) : null
          }, rp.actif ? dateRP(pageCourante.created_at, rp) : dateLongue(pageCourante.created_at))
        ),
        pageCourante.drawing?.image ? el("figure.parchemin__capture",
          el("img", { src: pageCourante.drawing.image, alt: "Capture du tableau", loading: "lazy" }),
          el("figcaption", pageCourante.drawing.legende || "Tableau du professeur")
        ) : null,
        corps,
        el("footer.parchemin__pied",
          el("span", `${cahier.title} — page ${numero}`),
          el("span", pageCourante.updated_at ? `Modifiée ${depuis(pageCourante.updated_at)}` : "Nouvelle page")
        )
      )
    );
  }

  function capturerCorps() {
    if (!pageCourante || !corps) return;
    pageCourante.body = assainirHTML(corps.innerHTML);
    sauvegarder();
  }

  /**
   * Met la sélection à part comme passage hors-roleplay. Sans sélection, pose
   * un marqueur où écrire. La classe « hrp » fait partie de la liste blanche
   * de l'assainisseur : elle survit à l'enregistrement et au rechargement.
   */
  function marquerHRP() {
    const selection = window.getSelection();
    const texte = selection && !selection.isCollapsed ? selection.toString() : "";
    const echappe = texte.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    document.execCommand("insertHTML", false,
      `<span class="hrp">${echappe || "hors roleplay"}</span>&nbsp;`);
    capturerCorps();
  }

  async function insererImage() {
    const url = await demander({
      titre: "Insérer une image",
      label: "Adresse de l'image",
      placeholder: "https://…",
      aide: "Seules les adresses http(s) sont acceptées."
    });
    if (!url) return;
    document.execCommand("insertHTML", false,
      `<img src="${url.replace(/"/g, "&quot;")}" alt="">`);
    capturerCorps();
  }

  /* --- Actions sur les pages ------------------------------------------------ */
  async function ajouterPage() {
    try {
      const page = await depotPages.creer(cahier.id, {
        title: `Page ${listePages.length + 1}`,
        created_by: etat.utilisateur?.id
      });
      listePages.push(page);
      peindreTranche();
      ouvrirPage(page.id);
    } catch (err) {
      erreur("Ajout impossible", messageErreur(err));
    }
  }

  function menuPage(ancre, page) {
    menu(ancre, [
      { titre: page.title || "Page" },
      { libelle: "Ouvrir", icone: "cahier", action: () => ouvrirPage(page.id) },
      peutEcrire && {
        libelle: "Renommer", icone: "crayon",
        action: async () => {
          const titre = await demander({ titre: "Renommer la page", label: "Titre", valeur: page.title });
          if (!titre) return;
          await depotPages.majorer(page.id, { title: titre });
          await charger(page.id);
        }
      },
      peutEcrire && {
        libelle: "Dupliquer", icone: "copier",
        action: async () => {
          await depotPages.creer(cahier.id, {
            title: `${page.title} (copie)`, body: page.body,
            drawing: page.drawing, attachments: page.attachments,
            created_by: etat.utilisateur?.id
          });
          await charger();
        }
      },
      peutEcrire && { separateur: true },
      peutEcrire && {
        libelle: "Supprimer", icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Supprimer la page",
            message: `« ${page.title} » sera définitivement perdue.`,
            libelle: "Supprimer", danger: true
          });
          if (!ok) return;
          await depotPages.supprimer(page.id);
          if (pageCourante?.id === page.id) pageCourante = null;
          await charger();
        }
      }
    ].filter(Boolean));
  }

  function menuCahier(ancre) {
    menu(ancre, [
      { titre: cahier.title },
      { libelle: "Imprimer / exporter en PDF", icone: "telecharger", action: () => window.print() },
      {
        libelle: "Copier le texte de la page", icone: "copier",
        action: async () => {
          const { copier } = await import("../core/util.js");
          await copier(texteBrut(pageCourante?.body));
          toast("Texte copié");
        }
      }
    ]);
  }

  /* --- Temps réel ----------------------------------------------------------- */
  if (tempsReel) {
    abonnement = temps.sabonner({
      cle: `cahier:${cahier.id}`,
      tables: [{ table: "notebook_pages", filtre: `notebook_id=eq.${cahier.id}` }],
      surChangement: async ({ type, nouveau }) => {
        if (type === "UPDATE" && nouveau?.id === pageCourante?.id) {
          // Écho de notre propre enregistrement : rien à faire.
          const identique = nouveau.body === pageCourante.body
            && nouveau.title === pageCourante.title;
          if (identique) return;

          // Une modification distante n'écrase jamais une saisie en cours.
          if (enEdition) {
            toast("Cette page a été modifiée ailleurs", {
              corps: "Votre saisie est conservée ; rechargez la page pour voir la version à jour.",
              type: "attn"
            });
            return;
          }
        }
        await charger(pageCourante?.id);
      }
    });
  }

  const surFermeture = () => sauvegarder.immediat();
  window.addEventListener("pagehide", surFermeture);

  charger();

  return {
    noeud: racine,
    async rafraichir(idCible) { await charger(idCible); },
    allerPage(pageId) { ouvrirPage(pageId); },
    pageCourante: () => pageCourante,
    pages: () => listePages,
    detruire() {
      sauvegarder.immediat();
      window.removeEventListener("pagehide", surFermeture);
      abonnement?.fermer();
    }
  };
}
