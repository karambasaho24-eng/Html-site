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
import { dateRP, REGLAGES_RP_DEFAUT } from "../core/rp.js";
import { confirmer, demander, menu } from "../ui/modal.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { etat } from "../core/store.js";
import { local } from "../core/util.js";

const REGLURES = ["reglure", "quadrille", "blanc"];
const COULEURS_REPERE = ["rouge", "bleu", "vert", "jaune", "violet"];
const COULEURS_PENSE_BETE = ["jaune", "rose", "vert", "bleu", "orange"];

/** Combien de pages tient chaque support. Une feuille n'en a qu'une. */
export const CAPACITE_SUPPORT = { feuille: 1, cahier: 10, carnet: 20, dossier: 30 };

const ANIMATION_REDUITE = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

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

  let corps = null;
  let piedTranche = null;
  let parcheminNoeud = null;
  let minuteurTournage = null;
  let penseBetesPage = [];

  const support = cahier.support || "cahier";
  const capacite = cahier.max_pages || CAPACITE_SUPPORT[support] || 10;

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
              background: `var(--repere-${page.marker_color}, #c9a227)`
            }
          })
        : null,
      el("span.onglet-page__titre", page.title || "Sans titre"),
      page.origin === "board" ? el("span.onglet-page__marque", { title: "Capture du tableau" }, "▣") : null,
      page.origin === "document" ? el("span.onglet-page__marque", { title: "Issue d'un document" }, "▤") : null
    )));
  }

  /**
   * Un support a une capacité. Une feuille volante n'a qu'une face ; un cahier
   * en tient dix. Le bouton dit ce qu'il en reste plutôt que d'échouer après
   * coup.
   */
  function peindrePiedTranche() {
    if (!piedTranche || !peutEcrire) return;
    const reste = capacite - listePages.length;

    render(piedTranche,
      el("button.btn.btn--bloc", {
        onclick: ajouterPage,
        disabled: reste <= 0,
        title: reste <= 0
          ? `Ce ${support} est plein : ${capacite} pages.`
          : `Encore ${reste} page${reste > 1 ? "s" : ""} disponible${reste > 1 ? "s" : ""}.`
      }, icone("plus", 15), reste > 0 ? "Nouvelle page" : `${support} plein`),
      reste > 0 && reste <= 3
        ? el("p.petit.faible.centre", { style: { margin: "6px 0 0" } },
            `Plus que ${reste} page${reste > 1 ? "s" : ""}.`)
        : null
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

    const avant = listePages.findIndex((p) => p.id === pageCourante?.id);
    const apres = listePages.findIndex((p) => p.id === pageId);
    if (sens === "auto") sens = avant < 0 || apres < 0 || apres === avant
      ? null : (apres > avant ? "avant" : "arriere");

    const brouillon = brouillonLire(pageId);
    pageCourante = brouillon && new Date(brouillon.horodatage) > new Date(page.updated_at || 0)
      ? { ...page, ...brouillon }
      : { ...page };

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

  /**
   * Construit l'objet une fois pour toutes : la reliure, l'épaisseur du bloc
   * de pages, la feuille elle-même. Seul son contenu est remplacé ensuite,
   * pour que l'animation de tournage porte sur un élément qui perdure.
   */
  function peindreParchemin() {
    if (!pageCourante) return;

    parcheminNoeud = el("article.parchemin", {
      class: support === "feuille" ? "parchemin--feuille" : ""
    });
    const reperes = el("div.reperes");

    render(zoneFeuillet,
      el("div.relieur", { class: support === "feuille" ? "relieur--feuille" : "" },
        parcheminNoeud, reperes)
    );
    remplirParchemin();
  }

  function remplirParchemin() {
    if (!pageCourante || !parcheminNoeud) return;
    const classeReglure = reglure === "quadrille" ? "parchemin--quadrille"
      : reglure === "blanc" ? "" : "parchemin--reglure";

    corps = el("div.parchemin__corps", {
      contenteditable: peutEcrire ? "true" : "false",
      // Une page vide qu'on ne peut pas remplir n'invite à rien : en
      // consultation, elle est simplement vide.
      "data-vide": peutEcrire ? "Commencez à écrire…" : "Cette page est restée blanche.",
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

    parcheminNoeud.className = `parchemin ${classeReglure}`
      + (support === "feuille" ? " parchemin--feuille" : "");

    render(parcheminNoeud,
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
          el("span", support === "feuille"
            ? cahier.title
            : `${cahier.title} — page ${numero} / ${listePages.length}`),
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
      contenteditable: peutEcrire ? "true" : "false",
      spellcheck: "true",
      "data-invite": "Note…",
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
      const surRelache = () => {
        window.removeEventListener("pointermove", surMouvement);
        window.removeEventListener("pointerup", surRelache);
        if (bouge) enregistrer({ x: mot.x, y: mot.y });
      };
      window.addEventListener("pointermove", surMouvement);
      window.addEventListener("pointerup", surRelache);
    });
  }

  async function collerPenseBete(couleur = "jaune") {
    if (!pageCourante || !peutEcrire) return;
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
    if (listePages.length >= capacite) {
      toast(`Ce ${support} est plein`, {
        corps: `Il ne tient que ${capacite} page${capacite > 1 ? "s" : ""}.`, type: "attn"
      });
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
