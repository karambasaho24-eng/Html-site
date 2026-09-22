/* ---------------------------------------------------------------------------
 * Salle de cours en direct.
 *
 * Le professeur ouvre une session, la classe entre avec le code, et tout ce
 * qui se passe ici est synchronisé : tableau, page du cahier commun, document
 * affiché, exercice lancé, sondage, minuterie, présences, questions.
 *
 * Roblox reste à côté : cette page est conçue pour cohabiter avec le jeu
 * (densités Compact et Minimal).
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import {
  sessions as depotSessions, tableaux, cahiers, presence as depotPresence,
  questions as depotQuestions, mains, sondages, minuteries, annonces,
  exercices, documents, temps, journal, notifications, membres as depotMembres, pages as depotPages,
  cartable as depotCartable, renvois, cahiers as depotCahiers, classes as depotClasses
} from "../data/index.js";
import { activerClasse } from "../core/session.js";
import { encadre, peutDessiner, peutContribuer, estObservateur } from "../core/permissions.js";
import { creerTableau, OUTILS, TEINTES, EPAISSEURS } from "../features/tableau.js";
import { compterPagesPdf, pdfEnImages } from "../features/import-document.js";
import { creerEditeurCahier } from "../features/editeur-cahier.js";
import { modePleineVue } from "../ui/chassis.js";
import { avatar, blocVide, pastillePresence } from "../ui/fragments.js";
import { confirmer, demander, formulaire, menu, ouvrirModale } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { duree, heure, depuis, initiales, local, debounce, pluriel } from "../core/util.js";
import { personnages } from "../data/index.js";
import { baliserHRP, contientHRP, universDe, reglagesRP, dateRP, nomAffiche } from "../core/rp.js";
import { inscrireAuLivret } from "../features/livret.js";
import { LISTE_MODES, mode as modeDe, offre } from "../features/modes.js";
import { preparerAffaires, materielAttendu, ligneMateriel } from "../features/cartable.js";
import { exigerProximite } from "../features/proximite.js";
import { composerPapier, tendrePapier } from "../features/papier.js";
import { creerEditeurCahier as ouvrirCahierInspecte } from "../features/editeur-cahier.js";

const COULEURS_PARTICIPANTS = ["#c9a227", "#8fb8d8", "#9ecf8f", "#e08b84", "#c4a3e0", "#d8a15e", "#7fbfb3"];

export default async function vueSalle({ params }) {
  const classe = await activerClasse(params.id);
  if (!classe) return vueErreur("Classe introuvable");

  const session = await depotSessions.enCours(classe.id);
  if (!session) {
    return {
      noeud: el("div.page", blocVide(
        "Aucune session en cours",
        encadre()
          ? "Démarrez une session depuis la fiche de la classe pour ouvrir le tableau."
          : `Le ${L("professeur")} n'a pas encore ouvert la séance.`,
        { libelle: "Retour à la classe", action: () => aller(`/classe/${classe.id}`) }
      )),
      titre: classe.name
    };
  }

  definir({ sessionActive: session });

  const staff = encadre();
  const contributeur = peutContribuer();

  /* --- État local ------------------------------------------------------------ */
  let tableau = await tableaux.pourSession(session.id, classe.id);
  let pagesTableau = await tableaux.pages(tableau.id);
  let indexPage = Math.min(tableau.current_page || 0, Math.max(0, pagesTableau.length - 1));
  let cahierCommun = await cahiers.commun(classe.id);
  let scene = "tableau";                 // tableau | cahier | document | exercice
  let refScene = null;
  let suit = staff ? false : local.lire(`ojm.suivi.${session.id}`, true);
  let ongletPanneau = staff ? "eleves" : "notes";
  let participants = [];
  let listeMains = [];
  let listeQuestions = [];
  let sondageActif = null;
  let votesSondage = [];
  let minuterie = null;
  let exerciceActif = null;
  let documentAffiche = null;
  let presences = [];
  let equipe = [];
  let sacs = new Map();            // cartables déposés, par utilisateur
  let listeRenvois = [];
  let modeSeance = modeDe(session);
  const attendu = materielAttendu(classe);

  // En RP, c'est le personnage qui est présent à l'appel, pas le compte.
  const enRP = universDe(classe) !== "aucun";
  let fichesRP = enRP ? await personnages.index(classe.id).catch(() => new Map()) : new Map();
  const maFiche = () => fichesRP.get(etat.utilisateur.id) || null;
  const monNom = () => nomAffiche(maFiche(), etat.profil);

  let moteurTableau = null;
  let editeurCommun = null;
  let canalSession = null;
  let canalTableau = null;
  let tictac = null;

  definir({ suitProfesseur: suit });

  /* --- Ossature -------------------------------------------------------------- */
  const zoneScene = el("div.salle__scene");
  const zonePanneau = el("div.salle__panneau-corps");
  const ongletsPanneau = el("div.salle__panneau-onglets", { role: "tablist" });
  const bandeau = el("div.bandeau");

  const noeud = el("div.salle",
    bandeau,
    el("div.salle__corps", zoneScene,
      el("aside.salle__panneau", ongletsPanneau, zonePanneau))
  );

  /* --- Bandeau --------------------------------------------------------------- */
  function peindreBandeau() {
    const presentsCount = participants.length;
    render(bandeau,
      el("span.etiq.etiq--direct", "En direct"),
      el("div",
        el("div.bandeau__titre", session.title),
        el("div.bandeau__meta",
          `${classe.name} · ${pluriel(presentsCount, "connecté", "connectés")} · ouverte ${depuis(session.started_at)}`)
      ),
      el("div.bandeau__outils",
        staff
          ? el("button.mode-seance", {
              dataset: { mode: session.mode || "cours" },
              title: "Changer le mode de la séance",
              onclick: (e) => choisirMode(e.currentTarget)
            }, icone(modeSeance.icone, 13), modeSeance.libelle)
          : el("span.mode-seance", { dataset: { mode: session.mode || "cours" } },
              icone(modeSeance.icone, 13), modeSeance.libelle),

        minuterie ? blocMinuterie() : null,

        !staff ? el("button.suivi", {
          dataset: { actif: suit ? "1" : "0" },
          title: "Suivre la page affichée par le professeur",
          onclick: () => basculerSuivi(!suit)
        }, icone(suit ? "lien" : "main", 13), suit ? "Je suis le cours" : "Navigation libre") : null,

        !staff && contributeur ? el("button.btn", {
          onclick: basculerMain
        }, icone("main", 15),
          maMainLevee() ? modeSeance.parole.annuler : modeSeance.parole.demander) : null,

        !staff && contributeur && (session.mode || "cours") === "cours"
          ? el("button.btn", { onclick: poserQuestion },
              icone("interro", 15), "J'ai une question") : null,

        !staff && offre(session, "cartable") ? el("button.btn", {
          onclick: () => ouvrirCartable(), title: "Ce que j'ai apporté en séance"
        }, icone("sac", 15), "Mes affaires") : null,

        offre(session, "papiers") ? el("button.btn", {
          // Sans la lambda, le gestionnaire recevrait l'événement comme
          // destinataire — et le papier partirait à personne.
          onclick: () => remettreUnPapier(), title: "Rédiger et tendre un papier"
        }, icone("papier", 15), "Papier") : null,

        staff ? el("button.btn", { onclick: (e) => menuProfesseur(e.currentTarget) },
          icone("reglages", 15), "Outils") : null,

        staff ? el("button.btn.btn--danger", { onclick: terminerSession },
          icone("stop", 15), "Terminer") : null,

        el("button.btn.btn--fantome.btn--icone", {
          "aria-label": "Quitter la salle", title: "Quitter la salle",
          onclick: () => aller(`/classe/${classe.id}`)
        }, icone("sortie", 16))
      )
    );
  }

  function blocMinuterie() {
    const restant = calculerMinuterie();
    return el("span.chrono", { dataset: { etat: minuterie.state } },
      el("span.chrono__label", minuterie.label),
      el("span", duree(restant)),
      staff ? el("button.btn.btn--fantome.btn--icone", {
        "aria-label": "Piloter la minuterie",
        onclick: (e) => menu(e.currentTarget, [
          { libelle: minuterie.state === "running" ? "Mettre en pause" : "Démarrer", icone: minuterie.state === "running" ? "pause" : "lecture",
            action: () => pilotageMinuterie(minuterie.state === "running" ? "pause" : "reprise") },
          { libelle: "Réinitialiser", icone: "rejouer", action: () => pilotageMinuterie("reset") },
          { libelle: "Retirer", icone: "corbeille", danger: true, action: () => pilotageMinuterie("retirer") }
        ])
      }, icone("points", 13)) : null
    );
  }

  function calculerMinuterie() {
    if (!minuterie) return 0;
    const ecoule = minuterie.state === "running" && minuterie.started_at
      ? minuterie.elapsed_sec + Math.floor((Date.now() - new Date(minuterie.started_at).getTime()) / 1000)
      : minuterie.elapsed_sec;
    return minuterie.kind === "chrono"
      ? ecoule
      : Math.max(0, minuterie.duration_sec - ecoule);
  }

  /* --- Scène ----------------------------------------------------------------- */
  async function peindreScene() {
    editeurCommun?.detruire();
    editeurCommun = null;

    if (scene === "tableau") return peindreTableau();
    if (scene === "cahier") return peindreCahierCommun();
    if (scene === "document") return peindreDocument();
    if (scene === "exercice") return peindreExercice();
    return peindreTableau();
  }

  /* --- Scène : tableau -------------------------------------------------------- */
  async function peindreTableau() {
    const pageCourante = pagesTableau[indexPage];
    if (!pageCourante) {
      render(zoneScene, blocVide("Tableau vide", "Aucune page de tableau."));
      return;
    }

    const ecriture = peutDessiner(tableau);
    moteurTableau = creerTableau({
      lectureSeule: !ecriture,
      fond: pageCourante.background === "slate" ? "ardoise" : pageCourante.background,
      surElementTermine: async (element) => {
        try {
          await tableaux.ajouterElement({
            id: element.id, page_id: pageCourante.id, kind: element.kind,
            data: element.data, author_id: etat.utilisateur.id, z: element.z, deleted: false
          });
        } catch (err) {
          erreur("Tracé non enregistré", messageErreur(err));
          moteurTableau.retirerElement(element.id);
        }
      },
      surElementRetire: async (element) => {
        try { await tableaux.supprimerElement(element.id); } catch { /* déjà supprimé */ }
      },
      surFragment: (fragment) => canalSession?.envoyer("fragment", { ...fragment, page: pageCourante.id }),
      surCurseur: (x, y) => canalSession?.envoyer("curseur", {
        id: etat.utilisateur.id, x, y,
        nom: monNom(), page: pageCourante.id
      })
    });

    const elements = await tableaux.elements(pageCourante.id);
    moteurTableau.definirElements(elements);
    if (pageCourante.background_image) {
      await moteurTableau.definirImageFond(pageCourante.background_image).catch(() => {});
    }

    render(zoneScene,
      el("div.tableau",
        barreTableau(ecriture, pageCourante),
        el("div.tableau__scene", moteurTableau.noeud)
      )
    );

    brancherCanalTableau(pageCourante.id);
  }

  function barreTableau(ecriture, pageCourante) {
    const barre = el("div.tableau__barre");

    const groupeOutils = el("div.outils", OUTILS.map((o) => el("button.outil", {
      type: "button", title: o.libelle, "aria-label": o.libelle,
      "aria-pressed": String(moteurTableau.outil() === o.cle),
      onclick: (e) => {
        moteurTableau.definirOutil(o.cle);
        groupeOutils.querySelectorAll(".outil").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
      }
    }, icone(o.icone, 16))));

    const groupeTeintes = el("div.teintes", TEINTES.map((t) => el("button.teinte", {
      type: "button", "aria-label": `Couleur ${t}`, style: { background: t },
      "aria-pressed": String(moteurTableau.couleur() === t),
      onclick: (e) => {
        moteurTableau.definirCouleur(t);
        groupeTeintes.querySelectorAll(".teinte").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
      }
    })));

    const groupeEpaisseurs = el("div.epaisseurs", EPAISSEURS.map((ep) => el("button.epaisseur", {
      type: "button", "aria-label": `Épaisseur ${ep}`,
      "aria-pressed": String(moteurTableau.epaisseur() === ep),
      onclick: (e) => {
        moteurTableau.definirEpaisseur(ep);
        groupeEpaisseurs.querySelectorAll(".epaisseur").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
      }
    }, el("i", { style: { width: `${Math.min(ep, 12)}px`, height: `${Math.min(ep, 12)}px` } }))));

    render(barre,
      ...(ecriture ? [groupeOutils, groupeTeintes, groupeEpaisseurs,
        el("div.outils",
          el("button.outil", { title: "Annuler", onclick: annulerTrace }, icone("annuler", 16)),
          el("button.outil", { title: "Refaire", onclick: refaireTrace }, icone("refaire", 16)),
          el("button.outil", { title: "Tout effacer", onclick: viderTableau }, icone("corbeille", 16))
        )] : [el("span.etiq.etiq--info", icone("oeil", 13), "Lecture seule")]),

      el("span.pousse"),

      el("div.pages-tableau",
        pagesTableau.map((page, i) => el("button.page-tableau", {
          "aria-current": String(i === indexPage),
          title: page.title,
          onclick: () => changerPageTableau(i)
        }, String(i + 1))),
        staff ? el("button.page-tableau", { title: "Ajouter une page", onclick: ajouterPageTableau },
          icone("plus", 13)) : null
      ),

      staff ? el("button.btn", { onclick: capturerTableau },
        icone("appareil", 15), "Capturer") : null,

      staff ? el("button.btn.btn--fantome.btn--icone", {
        "aria-label": "Réglages du tableau",
        onclick: (e) => menuTableau(e.currentTarget, pageCourante)
      }, icone("reglages", 15)) : null
    );
    return barre;
  }

  function annulerTrace() {
    const action = moteurTableau.annuler();
    if (!action) return;
    if (action.type === "retrait") tableaux.supprimerElement(action.element.id).catch(() => {});
    else reinsererElement(action.element);
  }

  function refaireTrace() {
    const action = moteurTableau.refaire();
    if (!action) return;
    if (action.type === "ajout") reinsererElement(action.element);
    else tableaux.supprimerElement(action.element.id).catch(() => {});
  }

  async function reinsererElement(element) {
    const pageCourante = pagesTableau[indexPage];
    try {
      await tableaux.ajouterElement({
        id: element.id, page_id: pageCourante.id, kind: element.kind,
        data: element.data, author_id: etat.utilisateur.id, z: element.z, deleted: false
      });
    } catch { /* l'élément existe déjà côté base */ }
  }

  async function viderTableau() {
    const ok = await confirmer({
      titre: "Effacer le tableau",
      message: "Tout le contenu de cette page de tableau sera perdu. Les pages capturées dans le cahier restent intactes.",
      libelle: "Effacer", danger: true
    });
    if (!ok) return;
    const pageCourante = pagesTableau[indexPage];
    await tableaux.viderPage(pageCourante.id);
    moteurTableau.vider();
    canalSession?.envoyer("vider", { page: pageCourante.id });
  }

  async function ajouterPageTableau() {
    const page = await tableaux.ajouterPage(tableau.id);
    pagesTableau.push(page);
    await changerPageTableau(pagesTableau.length - 1);
  }

  async function changerPageTableau(index) {
    indexPage = index;
    if (staff) {
      await tableaux.majorer(tableau.id, { current_page: index });
      await diffuserFocus({ kind: "tableau", ref: tableau.id, page: index });
    }
    await peindreTableau();
  }

  function menuTableau(ancre, pageCourante) {
    menu(ancre, [
      { titre: "Mode d'écriture" },
      ...[
        ["locked", "Professeur seul"],
        ["participative", "Élèves sélectionnés"],
        ["open", "Toute la classe"]
      ].map(([mode, libelle]) => ({
        libelle: libelle + (tableau.mode === mode ? "  ✓" : ""),
        action: async () => {
          tableau = await tableaux.majorer(tableau.id, { mode });
          toast(`Tableau : ${libelle.toLowerCase()}`);
          await peindreTableau();
        }
      })),
      { separateur: true },
      {
        libelle: "Choisir les élèves autorisés", icone: "eleves",
        action: choisirAutorises
      },
      { separateur: true },
      { titre: "Poser sous le tableau" },
      { libelle: "Une image", icone: "image", action: () => poserFondImage(pageCourante, "image") },
      { libelle: "Une page de PDF", icone: "documents", action: () => poserFondImage(pageCourante, "pdf") },
      pageCourante.background_image
        ? { libelle: "Retirer ce qui est posé", icone: "croix",
            action: () => retirerFondImage(pageCourante) }
        : null,
      { separateur: true },
      { titre: "Fond" },
      ...[["ardoise", "Ardoise"], ["craie", "Bleu nuit"], ["quadrille", "Quadrillé"], ["papier", "Papier"]]
        .map(([fond, libelle]) => ({
          libelle: libelle + (pageCourante.background === fond ? "  ✓" : ""),
          action: async () => {
            await tableaux.majorerPage(pageCourante.id, { background: fond });
            pageCourante.background = fond;
            moteurTableau.definirFond(fond);
          }
        })),
      { separateur: true },
      pagesTableau.length > 1 && {
        libelle: "Supprimer cette page de tableau", icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Supprimer la page de tableau",
            message: `« ${pageCourante.title} » et son contenu seront perdus.`,
            libelle: "Supprimer", danger: true
          });
          if (!ok) return;
          await tableaux.supprimerPage(pageCourante.id);
          pagesTableau = await tableaux.pages(tableau.id);
          indexPage = Math.max(0, Math.min(indexPage, pagesTableau.length - 1));
          await peindreTableau();
        }
      }
    ].filter(Boolean));
  }

  /**
   * Poser quelque chose sous le tableau. L'image devient un calque : on écrit
   * dessus, on efface ses propres traits sans l'emporter, et on la retire
   * quand on veut. Elle est stockée avec la page, donc toute la classe la voit.
   */
  async function poserFondImage(pageCourante, genre) {
    const entree = el("input", {
      type: "file",
      accept: genre === "pdf" ? "application/pdf" : "image/*"
    });
    entree.click();

    const fichier = await new Promise((resoudre) => {
      entree.onchange = () => resoudre(entree.files?.[0] || null);
      // Annuler la boîte de fichiers ne déclenche rien : on n'attend pas indéfiniment.
      window.addEventListener("focus", () => setTimeout(() => resoudre(entree.files?.[0] || null), 400),
        { once: true });
    });
    if (!fichier) return;

    let source;
    try {
      if (genre === "pdf") {
        const total = await compterPagesPdf(fichier);
        const choix = total > 1
          ? await formulaire({
              titre: "Quelle page ?",
              champs: [{ cle: "page", label: `Page (1 à ${total})`, type: "number",
                valeur: 1, min: 1, max: total }],
              libelle: "Poser"
            })
          : { page: 1 };
        if (!choix) return;
        const numero = Math.max(1, Math.min(total, Number(choix.page) || 1));
        toast("Conversion de la page…");
        const images = await pdfEnImages(fichier, { pagesVoulues: [numero], echelle: 2 });
        source = images[0];
      } else {
        source = await new Promise((resoudre, rejeter) => {
          const lecteur = new FileReader();
          lecteur.onload = () => resoudre(lecteur.result);
          lecteur.onerror = () => rejeter(lecteur.error);
          lecteur.readAsDataURL(fichier);
        });
      }
    } catch (err) {
      erreur("Conversion impossible", messageErreur(err));
      return;
    }
    if (!source) return;

    try {
      await tableaux.majorerPage(pageCourante.id, { background_image: source });
      pageCourante.background_image = source;
      await moteurTableau.definirImageFond(source);
      succes(genre === "pdf" ? "Page posée au tableau" : "Image posée au tableau");
    } catch (err) {
      // Une page de PDF en pleine résolution dépasse vite ce qu'une colonne
      // de texte accepte : on le dit plutôt que d'échouer en silence.
      erreur("Impossible de poser cette image", messageErreur(err));
    }
  }

  async function retirerFondImage(pageCourante) {
    try {
      await tableaux.majorerPage(pageCourante.id, { background_image: null });
      pageCourante.background_image = null;
      await moteurTableau.definirImageFond(null);
      toast("Retiré. Les annotations restent.");
    } catch (err) {
      erreur("Impossible", messageErreur(err));
    }
  }

  async function choisirAutorises() {
    equipe = await depotMembres.liste(classe.id);
    const eleves = equipe.filter((m) => m.status === "active" && m.role === "student");
    const autorises = new Set(Array.isArray(tableau.allowed) ? tableau.allowed : []);

    const sortie = await formulaire({
      titre: "Élèves autorisés au tableau",
      note: "En mode « élèves sélectionnés », seuls ces élèves peuvent écrire.",
      champs: eleves.map((m) => ({
        cle: m.user_id, type: "checkbox",
        label: m.profil?.display_name || "Élève",
        valeur: autorises.has(m.user_id)
      })),
      libelle: "Enregistrer"
    });
    if (!sortie) return;

    const liste = Object.entries(sortie).filter(([, v]) => v).map(([k]) => k);
    tableau = await tableaux.majorer(tableau.id, { allowed: liste, mode: "participative" });
    toast(`${pluriel(liste.length, "élève")} autorisé${liste.length > 1 ? "s" : ""} au tableau`);
    await peindreTableau();
  }

  async function capturerTableau() {
    if (!cahierCommun) {
      erreur("Aucun cahier commun", "Créez-le depuis la fiche de la classe.");
      return;
    }
    const pageCourante = pagesTableau[indexPage];
    const instantane = moteurTableau.instantane();
    try {
      const page = await depotPages.capturerTableau(
        pageCourante.id, cahierCommun.id,
        `${session.title} — ${pageCourante.title}`,
        { image: instantane, legende: `Tableau du ${heure(Date.now())}` }
      );
      journal.ecrire({
        class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id,
        action: "board.capture", meta: { page: page.id }
      });
      succes("Tableau capturé", "Ajouté au cahier commun de la classe.");
    } catch (err) {
      erreur("Capture impossible", messageErreur(err));
    }
  }

  /* --- Scène : cahier commun --------------------------------------------------- */
  async function peindreCahierCommun() {
    if (!cahierCommun) {
      render(zoneScene, blocVide("Pas de cahier commun",
        staff ? "Créez-le depuis la fiche de la classe." : "Le professeur n'en a pas encore ouvert."));
      return;
    }
    const peutEcrire = staff || (cahierCommun.collaborative && contributeur);
    editeurCommun = creerEditeurCahier({
      cahier: cahierCommun,
      peutEcrire,
      rp: reglagesRP(classe),
      pageInitiale: refScene,
      tempsReel: true,
      surPage: (page) => {
        if (staff) diffuserFocus({ kind: "cahier", ref: cahierCommun.id, page: page.id });
      }
    });
    render(zoneScene, editeurCommun.noeud);
  }

  /* --- Scène : document --------------------------------------------------------- */
  async function peindreDocument() {
    if (!documentAffiche) {
      render(zoneScene, blocVide("Aucun document affiché", "Le professeur n'a rien distribué pour l'instant."));
      return;
    }
    try {
      const url = await documents.url(documentAffiche);
      render(zoneScene,
        el("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: "0" } },
          el("div.feuillet__barre",
            icone("documents", 15),
            el("b", documentAffiche.title),
            el("span.pousse"),
            el("a.btn", { href: url, target: "_blank", rel: "noopener" },
              icone("televerser", 14), "Ouvrir dans un onglet")
          ),
          documentAffiche.kind === "image"
            ? el("div.feuillet__zone", el("img", {
                src: url, alt: documentAffiche.title,
                style: { maxWidth: "100%", objectFit: "contain", borderRadius: "var(--r-sm)" }
              }))
            : el("iframe", {
                src: url, title: documentAffiche.title,
                style: { flex: "1", border: "0", background: "var(--encre-800)" }
              })
        )
      );
    } catch (err) {
      render(zoneScene, blocVide("Document indisponible", messageErreur(err)));
    }
  }

  /* --- Scène : exercice ---------------------------------------------------------- */
  async function peindreExercice() {
    if (!exerciceActif) {
      render(zoneScene, blocVide("Aucun exercice en cours", ""));
      return;
    }
    const { rendreExerciceEnLigne } = await import("../features/exercice-direct.js");
    render(zoneScene, await rendreExerciceEnLigne({
      exercice: exerciceActif, classe, session, staff,
      surFermeture: async () => {
        await exercices.fermer(exerciceActif.id);
        toast("Exercice fermé");
      }
    }));
  }

  /* --- Panneau latéral ------------------------------------------------------------ */
  function peindrePanneau() {
    const onglets = staff
      ? [
          { cle: "eleves", libelle: L("Eleves"), compteur: participants.length },
          { cle: "questions", libelle: "Questions", compteur: listeQuestions.filter((q) => q.status === "open").length },
          { cle: "sondage", libelle: "Sondage" },
          { cle: "journal", libelle: "Journal" }
        ]
      : [
          { cle: "notes", libelle: "Mes notes" },
          { cle: "classe", libelle: "La classe", compteur: participants.length },
          { cle: "sondage", libelle: "Sondage" },
          { cle: "annonces", libelle: "Annonces" }
        ];

    render(ongletsPanneau, onglets.map((o) => el("button.onglet", {
      role: "tab", "aria-selected": String(o.cle === ongletPanneau),
      onclick: () => { ongletPanneau = o.cle; peindrePanneau(); }
    }, o.libelle,
      o.compteur ? el("span.pastille-compteur", String(o.compteur)) : null
    )));

    const rendus = {
      eleves: panneauEleves, classe: panneauEleves, questions: panneauQuestions,
      sondage: panneauSondage, journal: panneauJournal, notes: panneauNotes,
      annonces: panneauAnnonces
    };
    render(zonePanneau, (rendus[ongletPanneau] || panneauEleves)());
  }

  function panneauEleves() {
    if (!participants.length) {
      return el("p.petit.faible", { style: { padding: "var(--e-4)" } }, "Personne pour l'instant.");
    }
    const mainsParUtilisateur = new Map(listeMains.map((m) => [m.user_id, m]));
    const renvoyes = new Set(listeRenvois.map((r) => r.user_id));
    const controleMateriel = staff && offre(session, "cartable")
      && (attendu.supports.length > 0 || attendu.fournitures.length > 0);

    return el("div",
      controleMateriel ? el("div.controle-materiel",
        el("span.controle-materiel__titre", icone("sac", 12), " Matériel demandé"),
        el("span.petit.faible",
          [...attendu.supports.map((x) => x.title), ...attendu.fournitures].join(" · "))
      ) : null,

      participants.map((p) => {
        const main = mainsParUtilisateur.get(p.user_id);
        const renvoye = renvoyes.has(p.user_id);
        return el("div.eleve", {
          class: [main ? "eleve--main-levee" : "", renvoye ? "eleve--renvoye" : ""]
            .filter(Boolean).join(" ")
        },
          pastillePresence(renvoye ? "absent" : (p.statut || "present")),
          el("span.avatar", { class: p.role === "teacher" ? "avatar--prof" : "" }, initiales(p.nom)),
          el("div.eleve__infos",
            el("div.eleve__nom",
              p.grade ? el("span.fiche__grade", { style: { marginRight: "6px" } }, p.grade) : null,
              p.grade ? " " : null,
              p.nom || "Participant"),
            el("div.eleve__activite",
              renvoye ? el("em", "renvoyé de la séance")
                : main ? el("em", `✋ ${modeSeance.parole.demander.toLowerCase()}`)
                : (p.activite || libelleScene(p.scene))),
            controleMateriel && p.role !== "teacher"
              ? el("div.eleve__materiel",
                  ligneMateriel(sacs.get(p.user_id), attendu, { court: true }))
              : null
          ),
          staff
            ? el("div.liste__fin",
                main ? el("button.btn.btn--fantome.btn--icone", {
                  title: "Donner la parole",
                  onclick: () => repondreMain(main, "accepted")
                }, icone("coche", 14)) : null,
                main ? el("button.btn.btn--fantome.btn--icone", {
                  title: "Faire redescendre la main",
                  onclick: () => repondreMain(main, "lowered")
                }, icone("croix", 14)) : null,
                p.role !== "teacher" ? el("button.btn.btn--fantome.btn--icone", {
                  title: `Agir sur ${p.nom || "ce membre"}`,
                  "aria-label": `Agir sur ${p.nom || "ce membre"}`,
                  onclick: (e) => menuParticipant(e.currentTarget, p, renvoye)
                }, icone("points", 14)) : null
              )
            : null
        );
      }),

      staff ? blocRenvoyes() : null
    );
  }

  /**
   * Un renvoyé quitte la salle, donc il disparaît de la liste des présents.
   * Sans cette section, l'instructeur n'aurait plus aucun moyen de revenir
   * sur sa décision : on garde les renvois sous les yeux jusqu'à la fin de la
   * séance.
   */
  function blocRenvoyes() {
    const dehors = listeRenvois.filter((r) =>
      !participants.some((p) => p.user_id === r.user_id));
    if (!dehors.length) return null;

    const parId = new Map(equipe.map((m) => [m.user_id, m]));
    return el("div.renvoyes",
      el("span.renvoyes__titre", icone("renvoi", 12), " Renvoyés de cette séance"),
      dehors.map((r) => {
        const membre = parId.get(r.user_id);
        const nom = nomAffiche(fichesRP.get(r.user_id), membre?.profil) || "Un membre";
        return el("div.renvoyes__ligne",
          el("div", { style: { flex: "1", minWidth: "0" } },
            el("div.tronque", nom),
            el("div.petit.faible", (r.reason || "").trim() || "Aucun motif porté.")),
          el("button.btn.btn--fantome.btn--icone", {
            title: "Lever le renvoi", "aria-label": `Lever le renvoi de ${nom}`,
            onclick: () => leverRenvoi({ user_id: r.user_id, nom })
          }, icone("entree", 14))
        );
      })
    );
  }

  /**
   * Ce qu'un encadrant peut faire d'un participant. Trois de ces gestes
   * supposent qu'on soit à côté de lui : le site le demande avant, il ne le
   * vérifie pas après.
   */
  function menuParticipant(ancre, participant, renvoye) {
    menu(ancre, [
      offre(session, "cartable")
        ? { libelle: "Demander son cahier", icone: "cahier",
            action: () => inspecterSupport(participant) }
        : null,
      offre(session, "papiers")
        ? { libelle: "Lui tendre un papier", icone: "papier",
            action: () => remettreUnPapier(participant) }
        : null,
      enRP
        ? { libelle: "Inscrire au livret", icone: "etoile",
            action: () => inscrire(participant.user_id) }
        : null,
      { separateur: true },
      renvoye
        ? { libelle: "Lever le renvoi", icone: "entree",
            action: () => leverRenvoi(participant) }
        : { libelle: "Le renvoyer de la séance", icone: "renvoi", danger: true,
            action: () => renvoyer(participant) }
    ].filter(Boolean));
  }

  /* --- Inspection d'un support apporté --------------------------------------- */

  /**
   * L'encadrement a le droit d'ouvrir ce qu'on a apporté — c'est un droit, pas
   * une demande. Mais il ne s'exerce pas à distance, et jamais en cachette :
   * le propriétaire en est averti par la procédure elle-même.
   */
  async function inspecterSupport(participant) {
    const sac = sacs.get(participant.user_id);
    const apportes = depotCartable.apportes(sac);
    if (!apportes.length) {
      toast(`${participant.nom || "Ce membre"} n'a rien apporté : il n'y a rien à ouvrir.`);
      return;
    }

    let supports = [];
    try {
      supports = (await depotCahiers.mesCahiers(participant.user_id))
        .filter((c) => apportes.includes(String(c.id)));
    } catch { supports = []; }

    if (!supports.length) {
      // Le sac dit qu'il a apporté quelque chose, mais on n'y a pas accès :
      // on tente quand même par identifiant, la procédure tranchera.
      const intitules = sac?.notebooks && !Array.isArray(sac.notebooks) ? sac.notebooks : {};
      supports = apportes.map((id) => ({
        id, title: intitules[id] || "Support apporté", support: "cahier"
      }));
    }

    const choix = supports.length === 1 ? supports[0].id : await formulaire({
      titre: "Quel support ?",
      champs: [{
        cle: "cahier", label: "Ce qu'il a dans son sac", type: "select",
        valeur: supports[0].id,
        options: supports.map((c) => ({ valeur: c.id, libelle: c.title }))
      }],
      libelle: "Continuer"
    }).then((r) => r?.cahier);
    if (!choix) return;

    const proche = await exigerProximite({
      motif: "cahier",
      cible: participant.profil || participant,
      personnage: fichesRP.get(participant.user_id),
      detail: supports.find((c) => String(c.id) === String(choix))?.title || null
    });
    if (!proche) return;

    let cahier;
    try {
      cahier = await depotCahiers.inspecter(choix, classe.id);
    } catch (err) {
      erreur("Consultation impossible", messageErreur(err));
      return;
    }

    const ligne = Array.isArray(cahier) ? cahier[0] : cahier;
    const editeur = ouvrirCahierInspecte({
      cahier: ligne, peutEcrire: false, compact: true, rp: reglagesRP(classe)
    });

    await ouvrirModale({
      titre: `Le ${ligne.support || "cahier"} de ${participant.nom || "ce membre"}`,
      large: true,
      corps: () => el("div.inspection",
        el("p.petit.faible",
          icone("oeil", 12),
          " Consultation en lecture seule. L'intéressé a été prévenu."),
        editeur.noeud),
      actions: [{ libelle: "Rendre le cahier", variante: "primaire", valeur: true }],
      surFermeture: () => editeur.detruire()
    });

    journal.ecrire({
      class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id,
      action: "cahier.inspection", meta: { cahier: ligne.id, membre: participant.user_id }
    });
  }

  /* --- Renvoi ---------------------------------------------------------------- */

  /**
   * « Vous ne faites pas partie de ce cours. » On sort de la séance, pas de la
   * classe : le lien reste, la scène s'arrête là pour aujourd'hui.
   */
  async function renvoyer(participant) {
    const sortie = await formulaire({
      titre: `Renvoyer ${participant.nom || "ce membre"}`,
      note: "Le motif sera lu par l'intéressé et porté au registre de la séance.",
      champs: [{
        cle: "motif", label: "Motif", type: "textarea", lignes: 3,
        placeholder: "Ne figure pas sur la liste des inscrits à cette instruction."
      }],
      libelle: "Continuer"
    });
    if (!sortie) return;

    const proche = await exigerProximite({
      motif: "renvoi",
      cible: participant.profil || participant,
      personnage: fichesRP.get(participant.user_id)
    });
    if (!proche) return;

    try {
      await renvois.renvoyer(session.id, participant.user_id, sortie.motif, true);
      listeRenvois = await renvois.liste(session.id).catch(() => listeRenvois);
      succes(`${participant.nom || "Le membre"} a été prié de sortir`);
      peindrePanneau();
    } catch (err) {
      erreur("Renvoi impossible", messageErreur(err));
    }
  }

  async function leverRenvoi(participant) {
    const ligne = listeRenvois.find((r) => r.user_id === participant.user_id);
    if (!ligne) return;
    try {
      await renvois.lever(ligne.id);
      listeRenvois = listeRenvois.filter((r) => r.id !== ligne.id);
      toast("Renvoi levé : il peut revenir.");
      peindrePanneau();
    } catch (err) {
      erreur("Impossible", messageErreur(err));
    }
  }

  /* --- Mode de la séance ------------------------------------------------------ */
  function choisirMode(ancre) {
    menu(ancre, LISTE_MODES.map((m) => ({
      libelle: m.libelle, icone: m.icone,
      action: async () => {
        if (m.cle === (session.mode || "cours")) return;
        try {
          const maj = await depotSessions.definirMode(session.id, m.cle);
          session.mode = maj?.mode || m.cle;
          modeSeance = modeDe(session);
          if (!offre(session, "tableau") && scene === "tableau") scene = "cahier";
          await diffuserFocus({ kind: scene, ref: null, mode: session.mode });
          peindreBandeau(); peindrePanneau(); await peindreScene();
          toast(`Séance en mode « ${m.libelle} »`);
        } catch (err) {
          erreur("Changement impossible", messageErreur(err));
        }
      }
    })));
  }

  /* --- Cartable et papiers ---------------------------------------------------- */
  async function ouvrirCartable() {
    await preparerAffaires({
      classe,
      surEnregistrement: async () => {
        sacs = await depotCartable.liste(classe.id).catch(() => sacs);
        peindrePanneau();
      }
    });
  }

  /** Rédiger puis tendre. Le papier existe avant le geste, jamais l'inverse. */
  async function remettreUnPapier(destinataire = null) {
    const papier = await composerPapier({ classe });
    if (!papier) return;

    const candidats = (destinataire ? [destinataire] : participants)
      .filter((p) => p.user_id !== etat.utilisateur.id)
      .map((p) => ({ user_id: p.user_id, profil: p.profil || null, nom: p.nom }));

    if (!candidats.length) {
      toast("Le papier est dans votre sacoche : vous le tendrez quand quelqu'un sera là.");
      return;
    }
    await tendrePapier({ papier, classe, session, candidats, fiches: fichesRP });
  }

  function libelleScene(nom) {
    return { tableau: "Regarde le tableau", cahier: "Cahier commun",
             document: "Consulte un document", exercice: "Répond à l'exercice" }[nom] || "En ligne";
  }

  /** Nom à afficher pour l'auteur d'une question : le personnage d'abord. */
  function nomDe(ligne) {
    return nomAffiche(fichesRP.get(ligne.user_id), ligne.profil) || "Participant";
  }

  function panneauQuestions() {
    const ouvertes = listeQuestions.filter((q) => q.status !== "dismissed");
    if (!ouvertes.length) {
      return el("p.petit.faible", { style: { padding: "var(--e-4)" } }, "Aucune question posée.");
    }
    return el("div", ouvertes.map((q) => el("div.question", { dataset: { statut: q.status } },
      el("div.question__entete",
        el("span.avatar", initiales(nomDe(q))),
        el("b.petit", nomDe(q)),
        q.out_of_character ? el("span.etiq.etiq--hrp", "hors-RP") : null,
        el("span.petit.faible", depuis(q.created_at))
      ),
      el("div.question__corps",
        q.out_of_character ? el("span.hrp", q.body) : baliserHRP(q.body)),
      q.context ? el("span.petit.faible", q.context) : null,
      q.answer ? el("div.question__reponse", baliserHRP(q.answer)) : null,
      staff && q.status === "open"
        ? el("div.ligne-flex", { style: { marginTop: "var(--e-2)" } },
            el("button.btn.petit", { onclick: () => repondreQuestion(q) }, "Répondre"),
            el("button.btn.btn--fantome.petit", {
              onclick: async () => { await depotQuestions.ignorer(q.id); await rafraichirQuestions(); }
            }, "Écarter")
          )
        : null
    )));
  }

  function panneauSondage() {
    if (!sondageActif) {
      return el("div", { style: { padding: "var(--e-4)" } },
        el("p.petit.faible", "Aucun sondage en cours."),
        staff ? el("button.btn.btn--bloc", { onclick: lancerSondage },
          icone("sondage", 15), "Lancer un sondage") : null
      );
    }
    const total = votesSondage.length;
    const monVote = votesSondage.find((v) => v.user_id === etat.utilisateur.id);

    return el("div.sondage",
      el("div.sondage__question", sondageActif.question),
      (sondageActif.options || []).map((option, i) => {
        const compte = votesSondage.filter((v) => v.choice === i).length;
        const part = total ? Math.round((compte / total) * 100) : 0;
        return el("button.sondage__option", {
          "aria-pressed": String(monVote?.choice === i),
          disabled: sondageActif.status !== "open" || staff,
          onclick: () => voter(i)
        },
          (staff || monVote || sondageActif.status !== "open")
            ? el("span.sondage__barre", { style: { width: `${part}%` } })
            : null,
          el("span.sondage__texte",
            el("span", option),
            (staff || monVote || sondageActif.status !== "open")
              ? el("span.mono.petit", `${compte} · ${part} %`) : null
          )
        );
      }),
      el("div.ligne-flex", { style: { marginTop: "var(--e-3)" } },
        el("span.petit.faible", pluriel(total, "réponse")),
        staff && sondageActif.status === "open"
          ? el("button.btn.petit.pousse", {
              onclick: async () => { await sondages.fermer(sondageActif.id); await rafraichirSondage(); }
            }, "Clore le sondage")
          : null,
        staff && sondageActif.status !== "open"
          ? el("button.btn.petit.pousse", { onclick: lancerSondage }, "Nouveau sondage")
          : null
      )
    );
  }

  function panneauJournal() {
    return el("div.journal", { ref: async (noeud) => {
      const entrees = await journal.liste({ session_id: session.id }, 60);
      const LIBELLES = {
        "session.start": "Session ouverte", "session.check_in": "a rejoint la session",
        "session.end": "Session terminée", "board.capture": "Tableau capturé dans le cahier",
        "exercise.launch": "Exercice lancé", "exercise.close": "Exercice fermé",
        "exercise.submit": "a rendu l'exercice", "document.share": "Document distribué",
        "poll.open": "Sondage lancé", "announcement": "Annonce publiée",
        "livret.entree": "Inscription au livret",
        "focus": "Changement de page"
      };
      render(noeud, entrees.length
        ? entrees.map((e) => el("div.journal__ligne",
            el("span.journal__heure", heure(e.created_at)),
            el("span", `${e.meta?.nom ? e.meta.nom + " " : ""}${LIBELLES[e.action] || e.action}`)
          ))
        : el("p.petit.faible", { style: { padding: "var(--e-4)" } }, "Le journal se remplira au fil du cours."));
    } });
  }

  function panneauNotes() {
    const cle = `ojm.notes.${session.id}`;
    const enregistrer = debounce((valeur) => local.ecrire(cle, valeur), 500);
    return el("div", { style: { padding: "var(--e-3)" } },
      el("p.petit.faible", { style: { marginBottom: "var(--e-2)" } },
        "Visible de vous seul, même quand le professeur pilote l'affichage."),
      el("div.note-perso",
        el("textarea", {
          value: local.lire(cle, ""),
          placeholder: "Mes notes personnelles…",
          "aria-label": "Notes personnelles",
          oninput: (e) => enregistrer(e.target.value)
        })
      ),
      el("button.btn.btn--bloc", {
        style: { marginTop: "var(--e-3)" },
        onclick: verserNotesAuCahier
      }, icone("cahier", 15), "Verser dans mon cahier")
    );
  }

  async function verserNotesAuCahier() {
    const texte = local.lire(`ojm.notes.${session.id}`, "");
    if (!texte.trim()) { toast("Aucune note à verser"); return; }

    const mesCahiers = await cahiers.mesCahiers(etat.utilisateur.id);
    let cible = mesCahiers[0];
    if (!cible) {
      cible = await cahiers.creer({
        owner_id: etat.utilisateur.id, kind: "personal", title: "Notes de cours",
        cover: "parchment", color: "olive", icon: "book"
      });
    } else if (mesCahiers.length > 1) {
      const sortie = await formulaire({
        titre: "Verser mes notes",
        champs: [{
          cle: "cahier", label: "Cahier de destination", type: "select",
          valeur: mesCahiers[0].id,
          options: mesCahiers.map((c) => ({ valeur: c.id, libelle: c.title }))
        }],
        libelle: "Verser"
      });
      if (!sortie) return;
      cible = mesCahiers.find((c) => c.id === sortie.cahier);
    }

    const corps = texte.split("\n").map((l) => `<p>${l.replace(/[<>&]/g, "")}</p>`).join("");
    await depotPages.creer(cible.id, {
      title: `${session.title} — ${classe.name}`,
      body: corps, created_by: etat.utilisateur.id
    });
    succes("Notes versées", `Ajoutées à « ${cible.title} ».`);
  }

  function panneauAnnonces() {
    return el("div", { style: { padding: "var(--e-3)" }, ref: async (noeud) => {
      const liste = await annonces.liste({ class_id: classe.id }, 12);
      render(noeud, liste.length
        ? liste.map((a) => el("div.annonce", { dataset: { niveau: a.level } },
            el("div.annonce__titre",
              heure(a.created_at),
              a.out_of_character ? el("span.etiq.etiq--hrp", { style: { marginLeft: "6px" } }, "hors-RP") : null),
            el("div.annonce__corps",
              a.out_of_character ? el("span.hrp", a.title) : baliserHRP(a.title)),
            a.body ? el("p.petit.doux", { style: { margin: "6px 0 0" } }, baliserHRP(a.body)) : null
          ))
        : el("p.petit.faible", "Aucune annonce."));
    } });
  }

  /* --- Actions de session --------------------------------------------------------- */
  function maMainLevee() {
    return listeMains.some((m) => m.user_id === etat.utilisateur.id && m.status === "raised");
  }

  async function basculerMain() {
    try {
      if (maMainLevee()) await mains.baisser(session.id, etat.utilisateur.id);
      else {
        await mains.lever(session.id, etat.utilisateur.id);
        canalSession?.envoyer("main", { nom: monNom() });
      }
      await rafraichirMains();
    } catch (err) {
      erreur("Action impossible", messageErreur(err));
    }
  }

  async function repondreMain(main, statut) {
    await mains.majorer(main.id, { status: statut });
    if (statut === "accepted") {
      canalSession?.envoyer("parole", { utilisateur: main.user_id });
    }
    await rafraichirMains();
  }

  async function poserQuestion() {
    const rp = reglagesRP(classe);
    const sortie = await formulaire({
      titre: "Poser une question",
      note: rp.hrpAutorise
        ? "Votre personnage lève la main. Si la question vient de vous et non de lui, "
          + "cochez « hors-roleplay » : elle sera marquée comme telle et ne polluera pas la scène."
        : null,
      champs: [
        { cle: "body", label: "Votre question", type: "textarea", lignes: 3, requis: true,
          placeholder: "Je n'ai pas saisi la manœuvre, mon instructeur." },
        ...(rp.hrpAutorise
          ? [{ cle: "hrp", label: "Question hors-roleplay (elle sort du personnage)", type: "checkbox" }]
          : [])
      ],
      libelle: "Envoyer"
    });
    if (!sortie?.body) return;
    const texte = sortie.body;
    try {
      await depotQuestions.poser({
        session_id: session.id, user_id: etat.utilisateur.id,
        body: texte, context: contexteCourant(),
        out_of_character: Boolean(sortie.hrp) || contientHRP(texte)
      });
      canalSession?.envoyer("question", { nom: monNom() });
      succes("Question envoyée", `Le ${L("professeur")} la verra dans son panneau.`);
      await rafraichirQuestions();
    } catch (err) {
      erreur("Envoi impossible", messageErreur(err));
    }
  }

  function contexteCourant() {
    if (scene === "tableau") return `Tableau ${indexPage + 1}`;
    if (scene === "cahier") return "Cahier commun";
    if (scene === "document") return documentAffiche?.title || "Document";
    if (scene === "exercice") return exerciceActif?.title || "Exercice";
    return null;
  }

  async function repondreQuestion(question) {
    const reponse = await demander({
      titre: `Répondre à ${question.profil?.display_name || "l'élève"}`,
      label: "Réponse", valeur: "", multiligne: true, libelle: "Répondre"
    });
    if (!reponse) return;
    await depotQuestions.repondre(question.id, reponse, etat.utilisateur.id);
    await rafraichirQuestions();
  }

  async function lancerSondage() {
    const sortie = await formulaire({
      titre: "Lancer un sondage",
      champs: [
        { cle: "question", label: "Question", valeur: "Avez-vous compris ?", requis: true },
        { cle: "options", label: "Réponses (une par ligne)", type: "textarea",
          valeur: "Oui\nPartiellement\nNon", lignes: 4, requis: true }
      ],
      libelle: "Lancer"
    });
    if (!sortie) return;
    const options = sortie.options.split("\n").map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) { erreur("Deux réponses minimum"); return; }

    if (sondageActif?.status === "open") await sondages.fermer(sondageActif.id);
    await sondages.creer({
      session_id: session.id, author_id: etat.utilisateur.id,
      question: sortie.question, options, kind: "poll"
    });
    journal.ecrire({ class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id, action: "poll.open" });
    ongletPanneau = "sondage";
    await rafraichirSondage();
    peindrePanneau();
  }

  async function voter(choix) {
    try {
      await sondages.voter(sondageActif.id, etat.utilisateur.id, choix);
      await rafraichirSondage();
      peindrePanneau();
    } catch (err) {
      erreur("Vote impossible", messageErreur(err));
    }
  }

  async function pilotageMinuterie(action) {
    if (!minuterie) return;
    if (action === "retirer") {
      await minuteries.supprimer(minuterie.id);
      minuterie = null;
      peindreBandeau();
      return;
    }
    if (action === "pause") {
      const ecoule = minuterie.elapsed_sec
        + Math.floor((Date.now() - new Date(minuterie.started_at).getTime()) / 1000);
      minuterie = await minuteries.majorer(minuterie.id, { state: "paused", elapsed_sec: ecoule });
    } else if (action === "reprise") {
      minuterie = await minuteries.majorer(minuterie.id, { state: "running", started_at: new Date().toISOString() });
    } else if (action === "reset") {
      minuterie = await minuteries.majorer(minuterie.id, { state: "idle", elapsed_sec: 0, started_at: null });
    }
    peindreBandeau();
  }

  async function creerMinuterie() {
    const sortie = await formulaire({
      titre: "Minuterie de séance",
      champs: [
        { cle: "label", label: "Intitulé", valeur: "Travail individuel", requis: true },
        { cle: "kind", label: "Type", type: "select", valeur: "countdown", options: [
          { valeur: "countdown", libelle: "Compte à rebours" },
          { valeur: "chrono", libelle: "Chronomètre" }
        ] },
        { cle: "minutes", label: "Durée (minutes)", type: "number", valeur: 10, min: 1, max: 180 }
      ],
      libelle: "Lancer"
    });
    if (!sortie) return;
    minuterie = await minuteries.creer({
      session_id: session.id, label: sortie.label, kind: sortie.kind,
      duration_sec: Math.max(60, (sortie.minutes || 10) * 60),
      state: "running", started_at: new Date().toISOString(), elapsed_sec: 0
    });
    peindreBandeau();
  }

  async function diffuserFocus(focus) {
    refScene = focus.page ?? null;
    try {
      await depotSessions.majorer(session.id, { focus });
      canalSession?.envoyer("focus", focus);
    } catch (err) {
      console.warn("[salle] focus non diffusé", err);
    }
  }

  function basculerSuivi(actif) {
    suit = actif;
    definir({ suitProfesseur: actif });
    local.ecrire(`ojm.suivi.${session.id}`, actif);
    peindreBandeau();
    if (actif) appliquerFocus(session.focus);
    else toast("Navigation libre", { corps: "Vous ne suivez plus l'affichage du professeur." });
  }

  async function appliquerFocus(focus) {
    if (!focus?.kind) return;
    session.focus = focus;
    if (staff || !suit) return;

    if (focus.kind === "tableau") {
      scene = "tableau";
      indexPage = focus.page ?? 0;
      if (indexPage >= pagesTableau.length) pagesTableau = await tableaux.pages(tableau.id);
    } else if (focus.kind === "cahier") {
      scene = "cahier";
      refScene = focus.page || null;
    } else if (focus.kind === "document") {
      scene = "document";
      documentAffiche = await documents.lire(focus.ref).catch(() => null);
    } else if (focus.kind === "exercice") {
      scene = "exercice";
      exerciceActif = await exercices.lire(focus.ref).catch(() => null);
    }
    await peindreScene();
    majPresence();
  }

  function menuProfesseur(ancre) {
    menu(ancre, [
      { titre: "Afficher à la classe" },
      offre(session, "tableau") ? { libelle: "Le tableau", icone: "tableau", action: async () => {
        scene = "tableau"; await peindreScene(); await diffuserFocus({ kind: "tableau", ref: tableau.id, page: indexPage });
      } } : null,
      offre(session, "cahierCommun") ? { libelle: "Le cahier commun", icone: "cahier", action: async () => {
        scene = "cahier"; await peindreScene();
        await diffuserFocus({ kind: "cahier", ref: cahierCommun?.id, page: null });
      } } : null,
      offre(session, "documents")
        ? { libelle: "Un document", icone: "documents", action: distribuerDocument } : null,
      offre(session, "exercices")
        ? { libelle: "Un exercice", icone: "exercices", action: choisirExercice } : null,
      { separateur: true },
      { titre: "Animation" },
      { libelle: "Publier une annonce", icone: "megaphone", action: publierAnnonceSession },
      offre(session, "sondage")
        ? { libelle: modeSeance.motSondage || "Lancer un sondage", icone: "sondage", action: lancerSondage }
        : null,
      offre(session, "minuterie")
        ? { libelle: "Minuterie / compte à rebours", icone: "chrono", action: creerMinuterie } : null,
      { separateur: true },
      { libelle: "Appel et présences", icone: "eleves", action: ouvrirPresences },
      offre(session, "cartable")
        ? { libelle: "Demander du matériel", icone: "sac", action: definirMateriel } : null,
      enRP ? { libelle: "Inscrire au livret", icone: "etoile", action: () => inscrire() } : null
    ].filter(Boolean));
  }

  /**
   * « Apportez votre cahier rouge et une plume. »
   * La consigne vit dans les réglages de la classe : elle vaut pour les
   * séances suivantes tant qu'on ne la change pas.
   */
  async function definirMateriel() {
    const mesSupports = await depotCahiers.deClasse(classe.id).catch(() => []);
    const sortie = await formulaire({
      titre: "Matériel demandé",
      note: "Ce qui manquera se verra dans la liste des présents. Rien n'est bloqué : "
        + "arriver les mains vides est une scène, pas une erreur système.",
      champs: [
        { cle: "supports", label: "Supports attendus", type: "textarea", lignes: 3,
          valeur: attendu.supports.map((x) => x.title).join("\n"),
          placeholder: "Cahier de manœuvre\nCarnet de terrain",
          aide: "Un intitulé par ligne. Chacun apporte le sien." },
        { cle: "fournitures", label: "Trousse", type: "textarea", lignes: 2,
          valeur: attendu.fournitures.join(", "),
          placeholder: "Plume, encre, règle",
          aide: "Séparés par des virgules." }
      ],
      libelle: "Demander"
    });
    if (!sortie) return;

    const supports = String(sortie.supports || "").split("\n")
      .map((l) => l.trim()).filter(Boolean)
      .map((titre) => {
        const connu = mesSupports.find((c) => c.title.toLowerCase() === titre.toLowerCase());
        return { id: connu?.id || titre.toLowerCase(), title: titre };
      });
    const fournitures = String(sortie.fournitures || "").split(",")
      .map((l) => l.trim()).filter(Boolean);

    try {
      const maj = await depotClasses.majorer(classe.id, {
        settings: { ...(classe.settings || {}), materiel: { supports, fournitures } }
      });
      classe.settings = maj?.settings || { ...(classe.settings || {}), materiel: { supports, fournitures } };
      attendu.supports = supports;
      attendu.fournitures = fournitures;
      succes("Matériel demandé");
      notifications.diffuser(classe.id, {
        kind: "materiel", titre: "Matériel à apporter",
        corps: [...supports.map((x) => x.title), ...fournitures].join(" · ") || "Rien de particulier.",
        lien: `/classe/${classe.id}/salle`
      }).catch(() => {});
      peindrePanneau();
    } catch (err) {
      erreur("Consigne non enregistrée", messageErreur(err));
    }
  }

  async function distribuerDocument() {
    const liste = await documents.liste({ class_id: classe.id });
    if (!liste.length) {
      erreur("Aucun document", "Importez d'abord un document dans la bibliothèque de la classe.");
      return;
    }
    const sortie = await formulaire({
      titre: "Afficher un document",
      champs: [{
        cle: "document", label: "Document", type: "select",
        valeur: liste[0].id,
        options: liste.map((d) => ({ valeur: d.id, libelle: d.title }))
      }],
      libelle: "Afficher"
    });
    if (!sortie) return;

    documentAffiche = liste.find((d) => d.id === sortie.document);
    if (!documentAffiche.shared) await documents.majorer(documentAffiche.id, { shared: true });
    scene = "document";
    await peindreScene();
    await diffuserFocus({ kind: "document", ref: documentAffiche.id });
    journal.ecrire({
      class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id,
      action: "document.share", meta: { document: documentAffiche.id }
    });
    notifications.diffuser(classe.id, {
      kind: "document", titre: "Nouveau document disponible",
      corps: documentAffiche.title, lien: `/classe/${classe.id}/salle`
    }).catch(() => {});
  }

  async function choisirExercice() {
    const liste = await exercices.liste({ class_id: classe.id });
    if (!liste.length) {
      erreur("Aucun exercice", "Créez d'abord un exercice depuis l'espace professeur.");
      return;
    }
    const sortie = await formulaire({
      titre: "Lancer un exercice",
      champs: [{
        cle: "exercice", label: "Exercice", type: "select", valeur: liste[0].id,
        options: liste.map((ex) => ({ valeur: ex.id, libelle: `${ex.title}${ex.exam_mode ? " (examen)" : ""}` }))
      }],
      libelle: "Lancer"
    });
    if (!sortie) return;

    exerciceActif = await exercices.majorer(sortie.exercice, {
      status: "live", session_id: session.id,
      opened_at: new Date().toISOString(), closed_at: null
    });
    scene = "exercice";
    await peindreScene();
    await diffuserFocus({ kind: "exercice", ref: exerciceActif.id });
    journal.ecrire({
      class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id,
      action: "exercise.launch", meta: { exercice: exerciceActif.id }
    });
    notifications.diffuser(classe.id, {
      kind: "exercice", titre: `Exercice lancé — ${exerciceActif.title}`,
      lien: `/classe/${classe.id}/salle`
    }).catch(() => {});
  }

  async function publierAnnonceSession() {
    const rp = reglagesRP(classe);
    const sortie = await formulaire({
      titre: "Annonce à la classe",
      champs: [
        { cle: "title", label: "Message", type: "textarea", lignes: 3, requis: true,
          placeholder: "L'épreuve commencera au son de la cloche." },
        ...(rp.hrpAutorise
          ? [{ cle: "hrp", label: "Annonce hors-roleplay (consigne d'organisation)", type: "checkbox" }]
          : [])
      ],
      libelle: "Publier"
    });
    if (!sortie?.title) return;
    const texte = sortie.title;
    await annonces.creer({
      class_id: classe.id, session_id: session.id, author_id: etat.utilisateur.id,
      title: texte, body: null, level: "important",
      out_of_character: Boolean(sortie.hrp) || contientHRP(texte)
    });
    canalSession?.envoyer("annonce", { titre: texte });
    journal.ecrire({ class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id, action: "announcement" });
    succes("Annonce publiée");
  }

  /**
   * Décerner une mention, un blâme ou une aptitude sans quitter la manœuvre.
   * C'est là que l'encadrement en a besoin : à chaud, quand le fait vient de
   * se produire, pas une heure plus tard depuis un autre écran.
   */
  async function inscrire(cibleId = null) {
    const cibles = (await depotMembres.liste(classe.id))
      .filter((m) => m.status === "active")
      .map((m) => ({
        user_id: m.user_id,
        nom: nomAffiche(fichesRP.get(m.user_id), m.profil)
      }));

    const entree = await inscrireAuLivret({
      classe, membres: cibles, auteurId: etat.utilisateur.id,
      sessionId: session.id, membrePreselectionne: cibleId
    });
    if (!entree) return;

    journal.ecrire({
      class_id: classe.id, session_id: session.id, user_id: etat.utilisateur.id,
      action: "livret.entree", meta: { genre: entree.kind, concerne: entree.user_id }
    });
    // Une promotion change le grade : les fiches doivent suivre à l'écran.
    if (entree.kind === "promotion") {
      fichesRP = await personnages.index(classe.id).catch(() => fichesRP);
      majPresence();
    }
    peindrePanneau();
  }

  async function ouvrirPresences() {
    presences = await depotPresence.liste(session.id);
    const ETATS = [["present", "Présent"], ["away", "Absent temporaire"], ["absent", "Absent"], ["offline", "Déconnecté"]];

    await formulaire({
      titre: `${L("Presences")} — ${session.title}`,
      large: true,
      note: "L'état est relevé automatiquement à l'entrée ; vous pouvez le corriger.",
      champs: presences.map((p) => ({
        cle: p.id, label: `${p.profil?.display_name || "Élève"} — arrivé à ${heure(p.arrived_at)}`,
        type: "select", valeur: p.status,
        options: ETATS.map(([valeur, libelle]) => ({ valeur, libelle }))
      })),
      libelle: "Enregistrer"
    }).then(async (sortie) => {
      if (!sortie) return;
      for (const [id, statut] of Object.entries(sortie)) {
        const ligne = presences.find((p) => p.id === id);
        if (ligne && ligne.status !== statut) {
          await depotPresence.majorer(id, { status: statut, manual: true });
        }
      }
      toast("Présences enregistrées");
    });
  }

  async function terminerSession() {
    const ok = await confirmer({
      titre: "Terminer la session",
      message: "Le tableau, le cahier, les exercices et les présences seront archivés. Les élèves quitteront la salle.",
      libelle: "Terminer et archiver"
    });
    if (!ok) return;
    try {
      const close = await depotSessions.terminer(session.id);
      canalSession?.envoyer("fin", { session: session.id });
      definir({ sessionActive: null });
      succes("Session terminée", `${close.summary?.participants || 0} participants · archivée.`);
      aller(`/archive/${session.id}`);
    } catch (err) {
      erreur("Clôture impossible", messageErreur(err));
    }
  }

  /* --- Rafraîchissements ------------------------------------------------------------ */
  async function rafraichirMains() {
    listeMains = await mains.liste(session.id).catch(() => []);
    peindreBandeau();
    if (["eleves", "classe"].includes(ongletPanneau)) peindrePanneau();
  }

  async function rafraichirQuestions() {
    listeQuestions = await depotQuestions.liste(session.id).catch(() => []);
    peindrePanneau();
  }

  async function rafraichirSondage() {
    sondageActif = await sondages.actif(session.id).catch(() => null);
    if (!sondageActif) {
      const toutes = await sondages.liste(session.id).catch(() => []);
      sondageActif = toutes[0] || null;
    }
    votesSondage = sondageActif ? await sondages.votes(sondageActif.id).catch(() => []) : [];
  }

  /* --- Présence -------------------------------------------------------------------- */
  const majPresence = debounce(() => {
    canalSession?.majPresence({
      user_id: etat.utilisateur.id,
      nom: monNom(),
      grade: maFiche()?.rank || null,
      role: staff ? "teacher" : estObservateur() ? "observer" : "student",
      scene, statut: "present", horodatage: Date.now()
    });
  }, 250);

  /* --- Canaux temps réel ------------------------------------------------------------ */
  function brancherCanalSession() {
    canalSession = temps.sabonner({
      cle: `session:${session.id}`,
      tables: [
        { table: "class_sessions", filtre: `id=eq.${session.id}` },
        { table: "hands", filtre: `session_id=eq.${session.id}` },
        { table: "rp_profiles", filtre: `class_id=eq.${classe.id}` },
        { table: "session_questions", filtre: `session_id=eq.${session.id}` },
        { table: "polls", filtre: `session_id=eq.${session.id}` },
        { table: "poll_votes" },
        { table: "timers", filtre: `session_id=eq.${session.id}` },
        { table: "announcements", filtre: `class_id=eq.${classe.id}` },
        { table: "exercises", filtre: `class_id=eq.${classe.id}` },
        { table: "attendance", filtre: `session_id=eq.${session.id}` },
        { table: "board_pages", filtre: `board_id=eq.${tableau.id}` },
        { table: "class_bags", filtre: `class_id=eq.${classe.id}` },
        { table: "session_ejections", filtre: `session_id=eq.${session.id}` }
      ],
      surChangement: async ({ table, type, nouveau }) => {
        switch (table) {
          case "class_sessions":
            if (nouveau?.status === "ended") return surFinDeSession();
            if (nouveau?.mode && nouveau.mode !== session.mode) {
              session.mode = nouveau.mode;
              modeSeance = modeDe(session);
              toast(`Séance en mode « ${modeSeance.libelle} »`, { type: "info" });
              peindreBandeau(); peindrePanneau();
            }
            if (nouveau?.focus) await appliquerFocus(nouveau.focus);
            break;
          case "class_bags":
            sacs = await depotCartable.liste(classe.id).catch(() => sacs);
            if (["eleves", "classe"].includes(ongletPanneau)) peindrePanneau();
            break;
          case "session_ejections":
            listeRenvois = await renvois.liste(session.id).catch(() => listeRenvois);
            if (!staff) {
              const mien = listeRenvois.find((r) => r.user_id === etat.utilisateur.id);
              if (mien) return sortirRenvoye(mien);
            }
            if (["eleves", "classe"].includes(ongletPanneau)) peindrePanneau();
            break;
          case "rp_profiles":
            fichesRP = await personnages.index(classe.id).catch(() => fichesRP);
            peindrePanneau();
            break;
          case "hands": await rafraichirMains(); break;
          case "session_questions": await rafraichirQuestions(); break;
          case "polls":
          case "poll_votes": await rafraichirSondage(); peindrePanneau(); break;
          case "timers":
            minuterie = type === "DELETE" ? null : nouveau;
            peindreBandeau();
            break;
          case "announcements":
            if (type === "INSERT" && nouveau?.session_id === session.id) {
              toast("📢 Annonce", { corps: nouveau.title, type: "attn", duree: 9000 });
              if (ongletPanneau === "annonces") peindrePanneau();
            }
            break;
          case "exercises":
            if (nouveau?.session_id === session.id && nouveau.status === "live" && !staff) {
              exerciceActif = nouveau;
              toast("📝 Exercice lancé", { corps: nouveau.title, type: "attn" });
              if (suit) { scene = "exercice"; await peindreScene(); }
            } else if (nouveau?.id === exerciceActif?.id) {
              exerciceActif = nouveau;
              if (scene === "exercice") await peindreScene();
            }
            break;
          case "attendance":
            presences = await depotPresence.liste(session.id).catch(() => presences);
            break;
          case "board_pages":
            pagesTableau = await tableaux.pages(tableau.id);
            if (scene === "tableau") await peindreTableau();
            break;
        }
      },
      diffusion: {
        fragment: (fragment) => {
          if (scene !== "tableau") return;
          if (fragment.page !== pagesTableau[indexPage]?.id) return;
          moteurTableau?.fragmentDistant(fragment);
        },
        curseur: (position) => {
          if (scene !== "tableau" || position.id === etat.utilisateur.id) return;
          if (position.page !== pagesTableau[indexPage]?.id) return;
          moteurTableau?.curseurDistant(position.id, position.x, position.y, position.nom,
            couleurParticipant(position.id));
        },
        vider: ({ page }) => {
          if (scene === "tableau" && page === pagesTableau[indexPage]?.id) moteurTableau?.vider();
        },
        focus: (focus) => appliquerFocus(focus),
        main: ({ nom }) => { if (staff) toast("✋ Main levée", { corps: nom, type: "attn" }); },
        question: ({ nom }) => { if (staff) toast("❓ Question", { corps: `${nom} vous interroge.`, type: "attn" }); },
        parole: ({ utilisateur }) => {
          if (utilisateur === etat.utilisateur.id) toast("Vous avez la parole", { type: "ok" });
        },
        annonce: ({ titre }) => { if (!staff) toast("📢 Annonce", { corps: titre, type: "attn", duree: 9000 }); },
        fin: () => surFinDeSession()
      },
      presence: {
        meta: {
          user_id: etat.utilisateur.id, nom: monNom(),
          grade: maFiche()?.rank || null,
          role: staff ? "teacher" : "student", scene, statut: "present", horodatage: Date.now()
        },
        surMaj: (liste) => {
          const uniques = new Map();
          for (const p of liste) if (p?.user_id) uniques.set(p.user_id, p);
          participants = [...uniques.values()].sort((a, b) =>
            (a.role === "teacher" ? -1 : 1) - (b.role === "teacher" ? -1 : 1)
            || String(a.nom).localeCompare(String(b.nom)));
          peindreBandeau();
          if (["eleves", "classe"].includes(ongletPanneau)) peindrePanneau();
        }
      }
    });
  }

  function brancherCanalTableau(pageId) {
    canalTableau?.fermer();
    canalTableau = temps.sabonner({
      cle: `tableau:${pageId}`,
      tables: [{ table: "board_elements", filtre: `page_id=eq.${pageId}` }],
      surChangement: ({ type, nouveau, ancien }) => {
        if (!moteurTableau) return;
        if (type === "INSERT" && nouveau.author_id !== etat.utilisateur.id) {
          moteurTableau.ajouterElement({
            id: nouveau.id, kind: nouveau.kind, data: nouveau.data, z: nouveau.z
          });
        } else if (type === "UPDATE" && nouveau.deleted) {
          moteurTableau.retirerElement(nouveau.id);
        } else if (type === "DELETE") {
          moteurTableau.retirerElement(ancien?.id);
        }
      }
    });
  }

  function couleurParticipant(id) {
    const index = participants.findIndex((p) => p.user_id === id);
    return COULEURS_PARTICIPANTS[(index < 0 ? 0 : index) % COULEURS_PARTICIPANTS.length];
  }

  /** Renvoyé : on quitte la salle, on garde la raison en clair. */
  function sortirRenvoye(ligne) {
    definir({ sessionActive: null });
    toast("Vous avez été prié de quitter la séance", {
      corps: (ligne?.reason || "").trim() || "Aucun motif n'a été porté.",
      type: "attn", duree: 12000
    });
    aller(`/classe/${classe.id}`);
    return {
      noeud: el("div.page", blocVide(
        "Vous avez été renvoyé de cette séance",
        (ligne?.reason || "").trim() || "Aucun motif n'a été porté au registre.",
        { libelle: "Retour à la classe", action: () => aller(`/classe/${classe.id}`) })),
      titre: classe.name
    };
  }

  function surFinDeSession() {
    if (staff) return;
    definir({ sessionActive: null });
    toast("Session terminée", { corps: "Le professeur a clos la séance.", type: "attn", duree: 8000 });
    aller(`/classe/${classe.id}`);
  }

  /* --- Démarrage ------------------------------------------------------------------- */
  await depotPresence.pointer(session.id).catch((err) => console.warn("[salle] pointage", err));
  await Promise.all([rafraichirMains(), rafraichirQuestions(), rafraichirSondage()]);
  minuterie = await minuteries.active(session.id).catch(() => null);
  [sacs, listeRenvois, equipe] = await Promise.all([
    depotCartable.liste(classe.id).catch(() => new Map()),
    renvois.liste(session.id).catch(() => []),
    depotMembres.liste(classe.id).catch(() => [])
  ]);

  // Renvoyé avant même d'entrer : on ne force pas la porte.
  if (!staff && listeRenvois.some((r) => r.user_id === etat.utilisateur.id)) {
    return sortirRenvoye(listeRenvois.find((r) => r.user_id === etat.utilisateur.id));
  }

  // Le sac se prépare avant d'entrer, pas pendant. On le rappelle une fois.
  if (!staff && offre(session, "cartable")
      && (attendu.supports.length || attendu.fournitures.length)
      && !sacs.get(etat.utilisateur.id)) {
    setTimeout(() => {
      toast("Vous n'avez pas préparé vos affaires", {
        corps: "L'encadrement verra ce qui manque.", type: "attn", duree: 9000
      });
    }, 1200);
  }

  brancherCanalSession();
  peindreBandeau();
  peindrePanneau();

  if (!staff && suit && session.focus?.kind) await appliquerFocus(session.focus);
  else await peindreScene();

  tictac = setInterval(() => {
    if (minuterie?.state === "running") {
      peindreBandeau();
      if (minuterie.kind === "countdown" && calculerMinuterie() <= 0) {
        minuteries.majorer(minuterie.id, { state: "done" }).catch(() => {});
        minuterie.state = "done";
        toast("⏱️ Temps écoulé", { corps: minuterie.label, type: "attn", duree: 9000 });
      }
    }
  }, 1000);

  modePleineVue(true);

  return {
    noeud,
    titre: `${session.title} — ${classe.name}`,
    nettoyer: () => {
      clearInterval(tictac);
      canalSession?.fermer();
      canalTableau?.fermer();
      editeurCommun?.detruire();
      modePleineVue(false);
      definir({ sessionActive: null, suitProfesseur: false });
    }
  };
}

function vueErreur(message) {
  return { noeud: el("div.page", blocVide(message, "")), titre: message };
}
