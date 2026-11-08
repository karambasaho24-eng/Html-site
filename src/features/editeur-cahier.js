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
import { pages as depotPages, temps, penseBetes } from "../data/index.js";
import { assainirHTML, injecterHTML, texteBrut } from "../core/assainir.js";
import { debounce, dateLongue, heure, depuis, clamp } from "../core/util.js";
import { confirmer, demander, menu } from "../ui/modal.js";
import { sortiePapier, ouvrirLivre } from "../ui/animations.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { etat, observer } from "../core/store.js";
import {
  reserver, peutProduire, coutTexte, coutPiece, bandeauEncre, estEncreEpuisee, estExempte,
  MESSAGE_ENCRE_EPUISEE, synchroniserBientot
} from "./encre.js";
import { local } from "../core/util.js";

const REGLURES = ["reglure", "quadrille", "blanc"];
const COULEURS_REPERE = ["rouge", "bleu", "vert", "jaune", "violet"];
const COULEURS_PENSE_BETE = ["jaune", "rose", "vert", "bleu", "orange"];

const ANIMATION_REDUITE = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * creerEditeurCahier({ cahier, peutEcrire, pageInitiale, surPage, compact, tempsReel })
 *
 * L'encre : écrire coûte de l'encre (voir encre.js). À court d'encre, la page
 * reste lisible mais ne se laisse plus remplir ; la base fait foi.
 */
export function creerEditeurCahier(options) {
  const {
    cahier,
    peutEcrire = true,
    pageInitiale = null,
    surPage = null,
    compact = false,
    tempsReel = false,
    actionsSupplementaires = null
  } = options;

  let corps = null;
  let piedTranche = null;
  let parcheminNoeud = null;
  let livreOuvert = false;
  let minuteurTournage = null;
  let penseBetesPage = [];

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
      peutEcrire ? el("div.tranche__pied", { ref: (n) => { piedTranche = n; } }) : null
    ),
    el("section.feuillet", peutEcrire ? bandeauEncre() : null, barreFeuillet, zoneFeuillet)
  );

  /* --- Sauvegarde ----------------------------------------------------------
   * Deux règles, apprises d'un texte perdu.
   *
   * 1. L'enregistrement est attaché à UNE page, pas au cahier. La version
   *    précédente différait un appel qui relisait `pageCourante` au moment de
   *    partir : en changeant de page dans la seconde, on écrivait la nouvelle
   *    à la place de l'ancienne — et ce qui venait d'être écrit disparaissait
   *    sans un mot. C'est le bug qui faisait « perdre » des pages entières.
   *
   * 2. Le brouillon local part à chaque frappe, pas seulement en cas d'échec.
   *    localStorage est synchrone : il survit à la fermeture brutale de
   *    l'onglet, ce qu'une requête réseau ne fait jamais.
   * ------------------------------------------------------------------------ */
  const enAttente = new Map();      // pageId -> patch qui n'est pas encore en base
  let ecritureEnCours = false;

  function patchDe(page) {
    return {
      title: page.title || "",
      body: page.body || "",
      attachments: page.attachments || []
    };
  }

  const memePatch = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);

  /** Note une modification : brouillon tout de suite, base à la trêve. */
  function noter(page) {
    if (!peutEcrire || !page) return;
    const patch = patchDe(page);
    enAttente.set(page.id, patch);
    brouillonEcrire(page.id, patch);
    refleter(page.id);
    direEtat("Modifié…");
    ecrireBientot();
  }

  // Vrai quand la base a refusé faute d'encre : on attend une recharge pour réessayer.
  let attendEncre = false;
  const ecrireBientot = debounce(() => { vider(); }, 900);

  /** Écrit tout ce qui attend — page par page, jamais l'une pour l'autre. */
  async function vider() {
    if (!peutEcrire || ecritureEnCours || !enAttente.size) return;
    ecritureEnCours = true;
    direEtat("Enregistrement…");

    let dernierEchec = null;
    let sansEncre = false;
    for (const [pageId, patch] of [...enAttente]) {
      try {
        const maj = await depotPages.majorer(pageId, patch);
        // Si rien n'a été frappé pendant l'écriture, la page est à jour.
        if (memePatch(enAttente.get(pageId), patch)) {
          enAttente.delete(pageId);
          brouillonRetirer(pageId);
        }
        const quand = maj?.updated_at || new Date().toISOString();
        const i = listePages.findIndex((p) => p.id === pageId);
        if (i >= 0) listePages[i].updated_at = quand;
        if (pageCourante?.id === pageId) pageCourante.updated_at = quand;
      } catch (err) {
        dernierEchec = err;
        if (estEncreEpuisee(err)) sansEncre = true;
        console.warn("[cahier] écriture refusée", err);
      }
    }
    ecritureEnCours = false;

    // Plus d'encre : la base refuse, le texte reste sur cet appareil (brouillon).
    // On ne réessaie PAS en boucle : on reprend quand le solde remonte.
    if (sansEncre) {
      attendEncre = true;
      direEtat("Plus d'encre — votre texte est gardé sur cet appareil", true, MESSAGE_ENCRE_EPUISEE);
      synchroniserBientot();
      return;
    }
    if (!dernierEchec) synchroniserBientot();

    // Une fausse bonne nouvelle est pire qu'une erreur : on ne dit
    // « enregistré » que si la base l'a confirmé.
    if (dernierEchec) direEtat("Non enregistré — gardé sur cet appareil", true, messageErreur(dernierEchec));
    else direEtat(`Enregistré à ${heure(Date.now())}`);

    if (enAttente.size) ecrireBientot();
  }

  /** Vide la file sans attendre la trêve. */
  function viderMaintenant() {
    ecrireBientot.annuler();
    vider();
  }

  function direEtat(mot, echec = false, detail = "") {
    etiquetteSauvegarde.textContent = mot;
    etiquetteSauvegarde.classList.toggle("sauvegarde--echec", Boolean(echec));
    etiquetteSauvegarde.title = detail;
  }

  /**
   * Reporte sur la liste ce qui vient d'être tapé. Sans cela, quitter une page
   * puis y revenir affichait la version du serveur : le texte semblait effacé
   * alors qu'il n'avait simplement jamais été relu depuis la mémoire.
   */
  function refleter(pageId) {
    const i = listePages.findIndex((p) => p.id === pageId);
    if (i < 0 || pageCourante?.id !== pageId) return;
    Object.assign(listePages[i], patchDe(pageCourante));
  }

  function brouillonEcrire(pageId, donnees) {
    local.ecrire(`ojm.brouillon.${pageId}`, { ...donnees, horodatage: Date.now() });
  }
  function brouillonLire(pageId) { return local.lire(`ojm.brouillon.${pageId}`, null); }
  function brouillonRetirer(pageId) { local.retirer(`ojm.brouillon.${pageId}`); }

  /* --- Chargement ---------------------------------------------------------- */
  async function charger(idCible = null) {
    listePages = await depotPages.liste(cahier.id);
    // Une relecture du serveur ne doit jamais écraser ce qui n'y est pas
    // encore arrivé.
    for (const [pageId, patch] of enAttente) {
      const i = listePages.findIndex((p) => p.id === pageId);
      if (i >= 0) Object.assign(listePages[i], patch);
    }
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
    peindrePiedTranche();
    render(trancheListe, listePages.map((page, index) => el("div.onglet-page", {
      "aria-current": String(page.id === pageCourante?.id),
      draggable: peutEcrire,
      dataset: { id: page.id },
      onclick: () => ouvrirPage(page.id, "auto"),
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
      page.marker_color
        ? el("span", {
            title: page.marker_label || "Repère",
            style: {
              width: "6px", height: "14px", borderRadius: "1px", flex: "0 0 auto",
              background: `var(--repere-${page.marker_color}, #e8e8e8)`
            }
          })
        : null,
      el("span.onglet-page__titre", page.title || "Sans titre"),
      page.origin === "board" ? el("span.onglet-page__marque", { title: "Capture du tableau" }, "▣") : null,
      page.origin === "document" ? el("span.onglet-page__marque", { title: "Issue d'un document" }, "▤") : null
    )));
  }

  /** La limite de pages d'un cahier personnel (réglée par le PDG ; 0 = aucune ; exemptés : aucune). */
  const pagesMax = () => (cahier.kind !== "personal" || estExempte() || !etat.commerce
    ? 0 : Number(etat.commerce.pages_max || 0));
  const cahierPlein = () => pagesMax() > 0 && listePages.length >= pagesMax();

  function peindrePiedTranche() {
    if (!piedTranche || !peutEcrire) return;
    const plein = cahierPlein();
    render(piedTranche,
      el("button.btn.btn--bloc", {
        onclick: ajouterPage, disabled: plein,
        title: plein ? `Ce cahier est plein : ${pagesMax()} pages au maximum.` : ""
      }, icone("plus", 15), plein ? `Cahier plein (${pagesMax()} pages)` : "Nouvelle page")
    );
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
  /**
   * Ouvre une page. Quand on passe d'une page à l'autre, la feuille tourne :
   * le contenu est remplacé à mi-course, pendant que l'animation continue sur
   * le même élément. Sans cela on verrait la page sauter.
   */
  function ouvrirPage(pageId, sens = null) {
    const page = listePages.find((p) => p.id === pageId);
    if (!page) return;

    // On quitte une page : ce qu'elle porte part maintenant, tant qu'on sait
    // encore de quelle page il s'agit.
    if (pageCourante && pageCourante.id !== pageId) viderMaintenant();

    const avant = listePages.findIndex((p) => p.id === pageCourante?.id);
    const apres = listePages.findIndex((p) => p.id === pageId);
    if (sens === "auto") sens = avant < 0 || apres < 0 || apres === avant
      ? null : (apres > avant ? "avant" : "arriere");

    // Un brouillon plus récent que la base, c'est du texte écrit hors ligne
    // ou perdu par une fermeture brutale. On le remonte, ET on le remet dans
    // la file : sinon il resterait prisonnier de cet appareil.
    const brouillon = brouillonLire(pageId);
    const orphelin = brouillon
      && new Date(brouillon.horodatage) > new Date(page.updated_at || 0);
    pageCourante = orphelin ? { ...page, ...brouillon } : { ...page };
    if (orphelin && peutEcrire) {
      enAttente.set(pageId, patchDe(pageCourante));
      refleter(pageId);
      ecrireBientot();
    }

    peindreTranche();
    peindreBarre();

    penseBetesPage = [];
    chargerPenseBetes().then(() => {
      if (pageCourante?.id === pageId) peindrePenseBetes();
    });

    if (sens && parcheminNoeud && !ANIMATION_REDUITE()) {
      parcheminNoeud.classList.remove("tourne-avant", "tourne-arriere");
      void parcheminNoeud.offsetWidth;          // relance l'animation
      parcheminNoeud.classList.add(`tourne-${sens}`);
      clearTimeout(minuteurTournage);
      minuteurTournage = setTimeout(() => remplirParchemin(), 190);
    } else {
      peindreParchemin();
    }
    surPage?.(pageCourante);
  }

  function peindreBarre() {
    const commande = (nom, valeur = null) => () => {
      document.execCommand(nom, false, valeur);
      corps?.focus();
      capturerCorps();
    };

    render(barreFeuillet,
      selecteurPagesCompact(),
      peutEcrire ? el("div.outils-texte",
        outil("Gras", "texte", commande("bold"), "B"),
        outil("Italique", "texte", commande("italic"), "I"),
        outil("Souligné", "texte", commande("underline"), "U"),
        outil("Surligner", "surligneur", commande("hiliteColor", "#d9d9d9")),
        sep(),
        boutonMenu("Police d'écriture", "Aa", menuPolices),
        boutonMenu("Taille du texte", "A↕", menuTailles),
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
        sep(),
        el("button.btn.btn--fantome.btn--icone", {
          type: "button", title: "Coller un pense-bête", "aria-label": "Coller un pense-bête",
          onmousedown: (e) => e.preventDefault(),
          onclick: (e) => menu(e.currentTarget, [
            { titre: "Coller un pense-bête" },
            ...COULEURS_PENSE_BETE.map((c) => ({
              libelle: { jaune: "Jaune", rose: "Rose", vert: "Vert", bleu: "Bleu", orange: "Orange" }[c],
              action: () => collerPenseBete(c)
            }))
          ])
        }, icone("cahier", 15)),
        el("button.btn.btn--fantome.btn--icone", {
          type: "button", title: "Poser un repère sur cette page", "aria-label": "Poser un repère",
          onmousedown: (e) => e.preventDefault(),
          onclick: (e) => menu(e.currentTarget, [
            { titre: "Repère de tranche" },
            ...COULEURS_REPERE.map((c) => ({
              libelle: { rouge: "Rouge", bleu: "Bleu", vert: "Vert", jaune: "Jaune", violet: "Violet" }[c]
                + (pageCourante?.marker_color === c ? "  ✓" : ""),
              action: () => basculerRepere(c)
            })),
            pageCourante?.marker_color ? { separateur: true } : null,
            pageCourante?.marker_color
              ? { libelle: "Retirer le repère", icone: "croix",
                  action: () => basculerRepere(pageCourante.marker_color) }
              : null
          ].filter(Boolean))
        }, icone("drapeau", 15)),
        outil("Annuler", "annuler", commande("undo")),
        outil("Refaire", "refaire", commande("redo")),
        sep(),
        outil("Faire un calcul", "grille", calculer, "×÷")
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

  /**
   * Dans une petite fenêtre (mode flottant), la liste des pages est masquée :
   * à la place, un sélecteur tient sur une ligne. Il reste caché ailleurs (CSS).
   */
  function selecteurPagesCompact() {
    if (compact) return null;
    const i = listePages.findIndex((p) => p.id === pageCourante?.id);
    const voisine = (delta) => {
      const cible = listePages[i + delta];
      if (cible) ouvrirPage(cible.id, "auto");
    };
    const bouton = (titre, nomIcone, action, desactive = false) => el("button.btn.btn--fantome.btn--icone", {
      type: "button", title: titre, "aria-label": titre, disabled: desactive, onclick: action
    }, icone(nomIcone, 15));
    return el("div.pages-compactes",
      bouton("Page précédente", "chevronG", () => voisine(-1), i <= 0),
      el("select.pages-compactes__liste", {
        "aria-label": "Page du cahier",
        onchange: (e) => ouvrirPage(e.target.value, "auto")
      }, listePages.map((p, k) => el("option",
        { value: p.id, selected: p.id === pageCourante?.id }, `${k + 1}. ${p.title || "Sans titre"}`))),
      bouton("Page suivante", "chevronD", () => voisine(1), i < 0 || i >= listePages.length - 1),
      peutEcrire ? bouton(cahierPlein() ? "Cahier plein" : "Nouvelle page", "plus", ajouterPage, cahierPlein()) : null
    );
  }

  /* --- Police et taille : l'écriture n'est pas uniforme ----------------------- */
  const POLICES = [
    { nom: "Stylo bille", famille: "Kalam" },
    { nom: "Écriture rapide", famille: "Caveat" },
    { nom: "Feutre", famille: "Patrick Hand" },
    { nom: "Imprimé", famille: "Spectral" }
  ];
  // Les tailles du navigateur (1 à 7) : « 3 » est la taille normale.
  const TAILLES = [
    { nom: "Petit", valeur: "2" }, { nom: "Normal", valeur: "3" },
    { nom: "Moyen", valeur: "4" }, { nom: "Grand", valeur: "5" }, { nom: "Très grand", valeur: "6" }
  ];

  /** On garde la sélection : ouvrir un menu ne doit pas la faire perdre. */
  function garderSelection() {
    const sel = corps?.ownerDocument?.getSelection?.();
    return sel && sel.rangeCount && corps.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  }

  function appliquerStyle(plage, nom, valeur) {
    if (!corps) return;
    const doc = corps.ownerDocument;
    corps.focus();
    if (plage) {
      const sel = doc.getSelection();
      sel.removeAllRanges(); sel.addRange(plage);
    }
    doc.execCommand("styleWithCSS", false, true);     // des <span style>, pas des <font>
    doc.execCommand(nom, false, valeur);
    capturerCorps();
  }

  function menuPolices(ancre, plage) {
    menu(ancre, [
      { titre: "Police d'écriture" },
      ...POLICES.map((p) => ({ libelle: p.nom, action: () => appliquerStyle(plage, "fontName", p.famille) }))
    ]);
  }
  function menuTailles(ancre, plage) {
    menu(ancre, [
      { titre: "Taille du texte" },
      ...TAILLES.map((t) => ({ libelle: t.nom, action: () => appliquerStyle(plage, "fontSize", t.valeur) }))
    ]);
  }

  function boutonMenu(titre, texte, ouvrir) {
    return el("button.btn.btn--fantome.btn--icone", {
      type: "button", title: titre, "aria-label": titre,
      onmousedown: (e) => e.preventDefault(),
      onclick: (e) => ouvrir(e.currentTarget, garderSelection())
    }, el("span.petit.mono", texte));
  }

  function outil(titre, nomIcone, action, texte = null) {
    return el("button.btn.btn--fantome.btn--icone", {
      type: "button", title: titre, "aria-label": titre,
      onmousedown: (e) => e.preventDefault(),
      onclick: action
    }, texte ? el("span.petit.mono", texte) : icone(nomIcone, 15));
  }

  function sep() {
    return el("span", { style: { width: "1px", height: "18px", background: "var(--b2)", margin: "0 4px" } });
  }

  /**
   * Construit l'objet une fois pour toutes : la reliure, l'épaisseur du bloc
   * de pages, la feuille elle-même. Seul son contenu est remplacé ensuite,
   * pour que l'animation de tournage porte sur un élément qui perdure.
   */
  function peindreParchemin() {
    if (!pageCourante) return;

    parcheminNoeud = el("article.parchemin");
    const reperes = el("div.reperes");
    const relieur = el("div.relieur", parcheminNoeud, reperes);

    render(zoneFeuillet, relieur);
    // Le livre ne s'ouvre qu'à l'arrivée dans le cahier, pas à chaque page tournée.
    if (!livreOuvert && !compact) { livreOuvert = true; ouvrirLivre(relieur); }
    remplirParchemin();
  }

  function remplirParchemin() {
    if (!pageCourante || !parcheminNoeud) return;
    const classeReglure = reglure === "quadrille" ? "parchemin--quadrille"
      : reglure === "blanc" ? "" : "parchemin--reglure";

    corps = el("div.parchemin__corps", {
      contenteditable: peutEcrire && peutProduire() ? "true" : "false",
      // Une page vide qu'on ne peut pas remplir n'invite à rien : en
      // consultation, elle est simplement vide.
      "data-vide": peutEcrire ? "Commencez à écrire…" : "Cette page est restée blanche.",
      spellcheck: "true",
      role: "textbox", "aria-multiline": "true", "aria-label": "Contenu de la page",
      oninput: capturerCorps,
      onbeforeinput: (e) => {
        if (!peutEcrire) return;
        const type = String(e.inputType);
        // Effacer, annuler, mettre en forme : ne produit aucun texte, jamais refusé.
        if (type.startsWith("delete") || type.startsWith("history") || type.startsWith("format")) return;
        const saisi = e.data != null ? e.data.length
          : String(e.dataTransfer?.getData?.("text/plain") || "").length || 1;
        if (!reserver(coutTexte(saisi))) {
          e.preventDefault();
          signalerManque({ message: MESSAGE_ENCRE_EPUISEE });
        }
      },
      onclick: () => { if (peutEcrire && !peutProduire()) signalerManque({ message: MESSAGE_ENCRE_EPUISEE }); },
      onfocus: () => { enEdition = true; },
      onblur: () => { enEdition = false; viderMaintenant(); },
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
      readonly: !peutEcrire || !peutProduire(),
      "aria-label": "Titre de la page",
      oninput: (e) => {
        pageCourante.title = e.target.value;
        const index = listePages.findIndex((p) => p.id === pageCourante.id);
        if (index >= 0) listePages[index].title = e.target.value;
        peindreTranche();
        noter(pageCourante);
      }
    });

    const numero = listePages.findIndex((p) => p.id === pageCourante.id) + 1;

    parcheminNoeud.className = `parchemin ${classeReglure}`;

    render(parcheminNoeud,
        el("header.parchemin__entete",
          titre,
          el("span.parchemin__date", dateLongue(pageCourante.created_at))
        ),
        pageCourante.drawing?.image ? el("figure.parchemin__capture",
          el("img", { src: pageCourante.drawing.image, alt: "Capture du tableau", loading: "lazy" }),
          el("figcaption", pageCourante.drawing.legende || "Tableau du professeur")
        ) : null,
        corps,
        el("footer.parchemin__pied",
          el("span", `${cahier.title} — page ${numero} / ${listePages.length}`),
          el("span", pageCourante.updated_at ? `Modifiée ${depuis(pageCourante.updated_at)}` : "Nouvelle page")
        )
    );

    peindrePenseBetes();
    peindreReperes();
  }

  /* --- Repères de tranche --------------------------------------------------- */

  function peindreReperes() {
    const hote = zoneFeuillet.querySelector(".reperes");
    if (!hote) return;
    const marquees = listePages.filter((p) => p.marker_color);

    render(hote, marquees.map((page) => el("button.repere", {
      class: `repere--${page.marker_color}`,
      "aria-current": String(page.id === pageCourante?.id),
      title: page.marker_label || `Page ${listePages.indexOf(page) + 1}`,
      onclick: () => ouvrirPage(page.id, "auto")
    }, String(listePages.indexOf(page) + 1))));
  }

  /** Pose ou retire un repère sur la page courante. */
  async function basculerRepere(couleur) {
    if (!pageCourante || !peutEcrire) return;
    const retrait = pageCourante.marker_color === couleur;
    const patch = retrait
      ? { marker_color: null, marker_label: null }
      : { marker_color: couleur, marker_label: pageCourante.title || null };
    try {
      await depotPages.majorer(pageCourante.id, patch);
      Object.assign(pageCourante, patch);
      const i = listePages.findIndex((p) => p.id === pageCourante.id);
      if (i >= 0) Object.assign(listePages[i], patch);
      peindreTranche();
      peindreReperes();
    } catch (err) {
      erreur("Repère non posé", messageErreur(err));
    }
  }

  /* --- Pense-bêtes ---------------------------------------------------------- */

  async function chargerPenseBetes() {
    if (!pageCourante) { penseBetesPage = []; return; }
    penseBetesPage = await penseBetes.liste(pageCourante.id).catch(() => []);
  }

  function peindrePenseBetes() {
    if (!parcheminNoeud) return;
    for (const ancien of parcheminNoeud.querySelectorAll(".pense-bete")) ancien.remove();

    for (const mot of penseBetesPage) {
      parcheminNoeud.appendChild(construirePenseBete(mot));
    }
  }

  function construirePenseBete(mot) {
    const enregistrer = debounce(async (patch) => {
      try { await penseBetes.majorer(mot.id, patch); }
      catch (err) { console.warn("[pense-bête]", err); }
    }, 600);

    const noeud = el("div.pense-bete", {
      class: `pense-bete--${mot.color}`,
      style: {
        left: `${(mot.x ?? 0.7) * 100}%`,
        top: `${(mot.y ?? 0.1) * 100}%`,
        transform: `rotate(${mot.rotation || 0}deg)`
      },
      role: "note",
      "aria-label": "Pense-bête"
    });

    // La prise est la bande de colle : on attrape le papier par là, pas par le texte.
    noeud.appendChild(el("div.pense-bete__prise", { "aria-hidden": "true" }));

    /* Le texte vit dans son propre nœud : un conteneur dont le seul enfant est
       un bouton non éditable n'offre aucune place au curseur. */
    const texte = el("div.pense-bete__texte", {
      contenteditable: peutEcrire && peutProduire() ? "true" : "false",
      spellcheck: "true",
      "data-invite": "Note…",
      onbeforeinput: (e) => {
        const type = String(e.inputType);
        if (type.startsWith("delete") || type.startsWith("history") || type.startsWith("format")) return;
        if (!reserver(coutTexte(e.data != null ? e.data.length : 1))) {
          e.preventDefault();
          signalerManque({ message: MESSAGE_ENCRE_EPUISEE });
        }
      },
      oninput: (e) => {
        mot.body = e.currentTarget.textContent;
        enregistrer({ body: mot.body });
      }
    }, mot.body || "");
    noeud.appendChild(texte);

    if (peutEcrire) {
      noeud.appendChild(el("button.pense-bete__retirer", {
        type: "button", "aria-label": "Retirer le pense-bête",
        onclick: async (e) => {
          e.stopPropagation();
          await penseBetes.supprimer(mot.id).catch(() => {});
          penseBetesPage = penseBetesPage.filter((m) => m.id !== mot.id);
          peindrePenseBetes();
        }
      }, icone("croix", 12)));

      rendreDeplacable(noeud, mot, enregistrer);
    }
    return noeud;
  }

  /** Un pense-bête se décolle et se recolle où l'on veut sur la page. */
  function rendreDeplacable(noeud, mot, enregistrer) {
    noeud.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".pense-bete__retirer")) return;
      // Écrire n'est pas déplacer : le texte garde ses clics et sa sélection.
      if (e.target.closest(".pense-bete__texte")) return;
      const page = parcheminNoeud.getBoundingClientRect();
      const depart = noeud.getBoundingClientRect();
      const decalageX = e.clientX - depart.left;
      const decalageY = e.clientY - depart.top;
      let bouge = false;

      const surMouvement = (ev) => {
        bouge = true;
        noeud.setPointerCapture?.(e.pointerId);
        const x = clamp((ev.clientX - decalageX - page.left) / page.width, 0, 0.88);
        const y = clamp((ev.clientY - decalageY - page.top) / page.height, 0, 0.92);
        mot.x = x; mot.y = y;
        noeud.style.left = `${x * 100}%`;
        noeud.style.top = `${y * 100}%`;
      };
      // La fenêtre du cahier : en fenêtre flottante, ce n'est pas `window`.
      const fen = noeud.ownerDocument?.defaultView || window;
      const surRelache = () => {
        fen.removeEventListener("pointermove", surMouvement);
        fen.removeEventListener("pointerup", surRelache);
        if (bouge) enregistrer({ x: mot.x, y: mot.y });
      };
      fen.addEventListener("pointermove", surMouvement);
      fen.addEventListener("pointerup", surRelache);
    });
  }

  async function collerPenseBete(couleur = "jaune") {
    if (!pageCourante || !peutEcrire) return;
    if (!peutProduire()) { signalerManque({ message: MESSAGE_ENCRE_EPUISEE }); return; }
    try {
      const mot = await penseBetes.creer({
        page_id: pageCourante.id,
        author_id: etat.utilisateur?.id || null,
        body: "",
        color: couleur,
        x: 0.62 + Math.random() * 0.12,
        y: 0.08 + Math.random() * 0.1,
        rotation: Math.round((Math.random() * 6 - 3) * 10) / 10
      });
      penseBetesPage.push(mot);
      peindrePenseBetes();
      const frais = parcheminNoeud.querySelector(`.pense-bete:last-of-type .pense-bete__texte`);
      frais?.focus();
    } catch (err) {
      erreur("Pense-bête non collé", messageErreur(err));
    }
  }

  /** On dit ce qui manque, une fois toutes les quelques secondes — pas à
   *  chaque frappe. */
  let dernierSignal = 0;
  function signalerManque(verdict) {
    if (Date.now() - dernierSignal < 2500) return;
    dernierSignal = Date.now();
    toast(verdict.message || "Impossible", { corps: verdict.conseil || "", type: "attn", duree: 6000 });
  }

  /**
   * Faire un calcul : le résultat s'écrit dans la page (et coûte donc de l'encre
   * comme tout ce qu'on y écrit).
   */
  async function calculer() {
    if (!peutProduire()) { signalerManque({ message: MESSAGE_ENCRE_EPUISEE }); return; }
    const expression = await demander({
      titre: "Faire un calcul", label: "Opération", placeholder: "12 × 7 + 3",
      aide: "Chiffres, + − × ÷, parenthèses. Le résultat s'écrira dans la page."
    });
    if (!expression) return;
    const normale = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
    if (!/^[\d\s+\-*/().]+$/.test(normale)) {
      toast("Ce n'est pas une opération", { type: "attn" });
      return;
    }
    let resultat;
    try { resultat = Function(`"use strict"; return (${normale});`)(); }
    catch { toast("Opération illisible", { type: "attn" }); return; }
    if (!Number.isFinite(resultat)) { toast("Résultat impossible", { type: "attn" }); return; }
    const arrondi = Math.round(resultat * 1e6) / 1e6;
    corps?.focus();
    document.execCommand("insertText", false, `${expression.trim()} = ${String(arrondi).replace(".", ",")}`);
    capturerCorps();
  }

  function capturerCorps() {
    if (!pageCourante || !corps) return;
    pageCourante.body = assainirHTML(corps.innerHTML);
    noter(pageCourante);
  }

  async function insererImage() {
    if (!reserver(coutPiece())) { signalerManque({ message: MESSAGE_ENCRE_EPUISEE }); return; }
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
    if (cahierPlein()) {
      toast("Ce cahier est plein", { corps: `Il tient ${pagesMax()} pages au maximum. Un autre cahier se commande en boutique.`, type: "attn" });
      return;
    }
    try {
      const page = await depotPages.creer(cahier.id, {
        title: `Page ${listePages.length + 1}`,
        created_by: etat.utilisateur?.id
      });
      listePages.push(page);
      peindreTranche();
      ouvrirPage(page.id, "auto");
    } catch (err) {
      if (err?.code === "PG001") {
        toast("Ce cahier est plein", { corps: messageErreur(err), type: "attn" });
        peindrePiedTranche();
      } else erreur("Ajout impossible", messageErreur(err));
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
          const sortie = sortiePapier(ancre.closest(".onglet-page") || ancre, "jete");
          try { await depotPages.supprimer(page.id); }
          catch (err) { sortie.annuler(); throw err; }
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

          // Une modification distante n'écrase jamais une saisie en cours,
          // ni un texte qui n'est pas encore parti.
          if (enEdition || enAttente.has(pageCourante.id)) {
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

  /* --- L'encre ---------------------------------------------------------------
     Épuisée, la page se lit mais ne se remplit plus ; rechargée, tout se rouvre
     sans quitter la page, et ce qui attendait d'être enregistré repart. */
  function appliquerEncre() {
    const libre = peutEcrire && peutProduire();
    racine.classList.toggle("cahier--sans-encre", peutEcrire && !peutProduire());
    if (corps) {
      corps.setAttribute("contenteditable", libre ? "true" : "false");
      corps.setAttribute("data-vide", libre ? "Commencez à écrire…"
        : peutEcrire ? "Plus d'encre — cette page reste lisible." : "Cette page est restée blanche.");
    }
    for (const t of racine.querySelectorAll(".pense-bete__texte")) t.setAttribute("contenteditable", libre ? "true" : "false");
    const champTitre = racine.querySelector(".parchemin__titre");
    if (champTitre) champTitre.readOnly = !libre;
    if (libre && attendEncre && enAttente.size) { attendEncre = false; vider(); }
  }
  const quitterEncre = observer("commerce", appliquerEncre);

  // Trois occasions de partir : fermer, masquer l'onglet, basculer sur le
  // jeu. Le brouillon est déjà écrit, mais autant tenter la base.
  const surFermeture = () => viderMaintenant();
  const surMasquage = () => { if (document.visibilityState === "hidden") viderMaintenant(); };
  window.addEventListener("pagehide", surFermeture);
  document.addEventListener("visibilitychange", surMasquage);

  charger();

  return {
    noeud: racine,
    async rafraichir(idCible) { await charger(idCible); },
    allerPage(pageId) { ouvrirPage(pageId); },
    pageCourante: () => pageCourante,
    pages: () => listePages,
    /** Reste-t-il quelque chose qui n'est pas en base ? */
    enSuspens: () => enAttente.size,
    detruire() {
      viderMaintenant();
      window.removeEventListener("pagehide", surFermeture);
      document.removeEventListener("visibilitychange", surMasquage);
      abonnement?.fermer();
      quitterEncre();
    }
  };
}
