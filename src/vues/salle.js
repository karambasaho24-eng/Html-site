/* ---------------------------------------------------------------------------
 * La séance — ce dont on a besoin pendant un cours, et rien d'autre.
 *
 *   · à gauche, la scène : le tableau du professeur en direct, ou le document
 *     qu'il affiche ;
 *   · à droite, de quoi travailler : MON CAHIER (on y écrit pendant le cours),
 *     les documents de la classe, et pour l'encadrement la liste des présents.
 *
 * Pas d'objets, pas de bureau, pas de sac : le tableau, le cahier et les
 * documents suffisent. Tracer ou écrire consomme de l'encre comme partout
 * ailleurs ; sans encre, on continue de regarder et de lire.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir, observer } from "../core/store.js";
import { aller } from "../core/router.js";
import { local } from "../core/util.js";
import { L } from "../core/lexique.js";
import { activerClasse } from "../core/session.js";
import { encadre, peutDessiner, mesClassesEncadrees } from "../core/permissions.js";
import {
  sessions as depotSessions, presence as depotPresence, tableaux, documents,
  cahiers, pages, annonces, temps, exercices, notifications
} from "../data/index.js";
import { blocVide, onglets as fOnglets } from "../ui/fragments.js";
import { confirmer, demander } from "../ui/modal.js";
import { toast, erreur, succes, messageErreur } from "../ui/toast.js";
import { modePleineVue } from "../ui/chassis.js";
import { creerTableau, OUTILS, TEINTES, EPAISSEURS, POLICES_TABLEAU, TAILLES_TEXTE } from "../features/tableau.js";
import { creerEditeurCahier } from "../features/editeur-cahier.js";
import { definirModeFlottant } from "../features/fenetre-flottante.js";
import { vueReponseEleve } from "../features/exercice-direct.js";
import vueExercice from "./exercice.js";
import { peutProduire, estEncreEpuisee, MESSAGE_ENCRE_EPUISEE, synchroniserBientot } from "../features/encre.js";

const COULEURS_PARTICIPANTS = ["#e8e8e8", "#6fa8dc", "#93c47d", "#e06666", "#b4a7d6", "#f6b26b"];
const FONDS = [
  { cle: "slate", libelle: "Ardoise" }, { cle: "chalk", libelle: "Craie" },
  { cle: "paper", libelle: "Papier" }, { cle: "grid", libelle: "Quadrillé" },
  { cle: "lines", libelle: "Lignes" }, { cle: "seyes", libelle: "Seyès" }
];
/** Le moteur parle français (« ardoise »), la base anglais (« slate »). */
const NOMS_FONDS = { slate: "ardoise", chalk: "craie", paper: "papier", grid: "quadrille", lines: "lignes", seyes: "seyes" };
const nomFond = (fond) => NOMS_FONDS[fond] || fond || "ardoise";

export default async function vueSalle({ params }) {
  const classe = await activerClasse(params.id);
  if (!classe) {
    return { noeud: el("div.page", blocVide("Classe introuvable", "Elle a peut-être été supprimée.")), titre: "Séance" };
  }

  const session = await depotSessions.enCours(classe.id);
  if (!session) {
    return {
      noeud: el("div.page", blocVide(
        "Aucune séance en cours",
        encadre()
          ? "Démarrez une séance depuis la fiche de la classe pour ouvrir le tableau."
          : `Le ${L("professeur")} n'a pas encore ouvert la séance.`,
        { libelle: "Retour à la classe", action: () => aller(`/classe/${classe.id}`) }
      )),
      titre: classe.name
    };
  }

  definir({ sessionActive: session });
  const staff = encadre();
  const moiId = etat.utilisateur.id;
  const monNom = () => etat.profil?.display_name || "Moi";

  /* --- État --------------------------------------------------------------- */
  let tableau = await tableaux.pourSession(session.id, classe.id);
  let pagesTableau = await tableaux.pages(tableau.id);
  let indexPage = Math.min(tableau.current_page || 0, Math.max(0, pagesTableau.length - 1));
  let scene = "tableau";                         // tableau | document
  let documentAffiche = null;
  let exerciceAffiche = null;
  let suit = staff ? false : local.lire(`ojm.suivi.${session.id}`, true);
  let ongletPanneau = "cahier";
  let participants = [];
  let moteur = null;
  let canalSession = null;
  let canalTableau = null;
  let editeur = null;
  let quitte = false;
  // Dans la petite fenêtre flottante, on ne montre qu'une moitié à la fois :
  // « panneau » (mon cahier, documents) ou « scene » (le tableau).
  let zoneVisible = "panneau";
  // Pour y revenir d'un clic depuis le mode flottant.
  local.ecrire("ojm.derniereSalle", classe.id);

  const zoneScene = el("div.salle__scene");
  const zonePanneau = el("aside.salle__panneau");
  const barre = el("div.salle__barre");
  const racine = el("div.salle", { dataset: { focus: zoneVisible } }, barre, el("div.salle__corps", zoneScene, zonePanneau));

  /** Mode flottant : cahier (fenêtre étroite) ou tableau (fenêtre large). */
  function choisirZone(zone) {
    zoneVisible = zone;
    racine.dataset.focus = zone;
    peindreBarre();
    if (etat.flottant) definirModeFlottant(zone === "scene" ? "tableau" : "cahier");
  }
  // À chaque ouverture du mode flottant, on repart du cahier.
  const oublierFlottant = observer("flottant", () => {
    if (!etat.flottant) return;
    zoneVisible = "panneau";
    racine.dataset.focus = zoneVisible;
    peindreBarre();
  });

  /* --- Barre : où on en est, ce qu'on peut faire -------------------------- */
  function peindreBarre() {
    render(barre,
      el("div.salle__bascule", { role: "group", "aria-label": "Que montrer ?" },
        el("button.btn", { type: "button", "aria-pressed": String(zoneVisible === "panneau"), onclick: () => choisirZone("panneau") },
          icone("cahier", 14), "Cahier"),
        el("button.btn", { type: "button", "aria-pressed": String(zoneVisible === "scene"), onclick: () => choisirZone("scene") },
          icone("tableau", 14), "Tableau")),
      el("strong.salle__titre", session.title || classe.name),
      el("span.petit.faible", `${participants.length} présent${participants.length > 1 ? "s" : ""}`),
      el("span.pousse"),
      staff ? null : el("label.petit.salle__suivre",
        el("input", {
          type: "checkbox", checked: suit,
          onchange: async (e) => {
            suit = e.target.checked;
            local.ecrire(`ojm.suivi.${session.id}`, suit);
            if (suit && session.focus?.kind) await appliquerFocus(session.focus);
          }
        }), ` Suivre le ${L("professeur")}`),
      staff ? el("button.btn", { onclick: annoncer }, icone("cloche", 14), "Annonce") : null,
      staff ? el("button.btn.btn--danger", { onclick: terminer }, "Terminer la séance") : null
    );
  }

  /* --- Scène : le tableau ------------------------------------------------- */
  async function peindreTableau() {
    fermerSuiviExercice();
    const page = pagesTableau[indexPage];
    if (!page) { render(zoneScene, blocVide("Tableau vide", "Aucune page de tableau.")); return; }

    const ecriture = peutDessiner(tableau);
    moteur = creerTableau({
      lectureSeule: !ecriture,
      fond: nomFond(page.background),
      // Plus d'objets : tous les outils sont là. Seule l'encre limite, et la base fait foi.
      garde: () => (peutProduire() ? { ok: true } : { ok: false, message: MESSAGE_ENCRE_EPUISEE }),
      surRefus: (verdict) => toast("Plus d'encre", { corps: verdict.message, type: "attn", duree: 6000 }),
      surElementTermine: async (element) => {
        try {
          await tableaux.ajouterElement({
            id: element.id, page_id: page.id, kind: element.kind, data: element.data,
            author_id: moiId, z: element.z || 0, deleted: false
          });
          synchroniserBientot();
        } catch (err) {
          moteur.retirerElement(element.id);             // le tracé refusé disparaît
          if (estEncreEpuisee(err)) {
            toast("Plus d'encre", { corps: MESSAGE_ENCRE_EPUISEE, type: "attn", duree: 7000 });
            synchroniserBientot();
          } else erreur("Tracé non enregistré", messageErreur(err));
        }
      },
      surElementRetire: async (element) => { try { await tableaux.supprimerElement(element.id); } catch { /* déjà supprimé */ } },
      surFragment: (fragment) => canalSession?.envoyer("fragment", { ...fragment, page: page.id }),
      surCurseur: (x, y) => canalSession?.envoyer("curseur", { id: moiId, x, y, nom: monNom(), page: page.id })
    });
    moteur.definirElements(await tableaux.elements(page.id));
    if (page.background_image) await moteur.definirImageFond(page.background_image).catch(() => {});

    render(zoneScene, el("div.tableau", barreTableau(ecriture, page), el("div.tableau__scene", moteur.noeud)));
    brancherCanalTableau(page.id);
  }

  function barreTableau(ecriture, page) {
    const outils = el("div.outils", OUTILS.map((o) => el("button.outil", {
      type: "button", title: o.libelle, "aria-label": o.libelle,
      "aria-pressed": String(moteur.outil() === o.cle),
      onclick: (e) => {
        moteur.definirOutil(o.cle);
        outils.querySelectorAll(".outil").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
      }
    }, icone(o.icone, 16))));
    const teintes = el("div.teintes", TEINTES.map((t) => el("button.teinte", {
      type: "button", "aria-label": `Couleur ${t}`, style: { background: t },
      "aria-pressed": String(moteur.couleur() === t),
      onclick: (e) => {
        moteur.definirCouleur(t);
        teintes.querySelectorAll(".teinte").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
      }
    })));
    const epaisseurs = el("div.epaisseurs", EPAISSEURS.map((ep) => el("button.epaisseur", {
      type: "button", "aria-label": `Épaisseur ${ep}`,
      "aria-pressed": String(moteur.epaisseur() === ep),
      onclick: (e) => {
        moteur.definirEpaisseur(ep);
        epaisseurs.querySelectorAll(".epaisseur").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
      }
    }, el("i", { style: { width: `${Math.min(ep, 12)}px`, height: `${Math.min(ep, 12)}px` } }))));

    const tailles = el("select.select-fond", {
      "aria-label": "Taille du texte", title: "Taille du texte (outil T)",
      onchange: (e) => moteur.definirTailleTexte(Number(e.target.value))
    }, TAILLES_TEXTE.map((t) => el("option", { value: t.px, selected: moteur.tailleTexte() === t.px }, `Texte : ${t.libelle}`)));
    const polices = el("select.select-fond", {
      "aria-label": "Police du texte", title: "Police du texte (outil T)",
      onchange: (e) => moteur.definirPolice(e.target.value)
    }, POLICES_TABLEAU.map((f) => el("option", { value: f.cle, selected: moteur.police() === f.cle }, f.libelle)));

    return el("div.tableau__barre",
      ...(ecriture ? [outils, teintes, epaisseurs, tailles, polices,
        el("div.outils",
          el("button.outil", { title: "Annuler", onclick: annulerTrace }, icone("annuler", 16)),
          el("button.outil", { title: "Refaire", onclick: refaireTrace }, icone("refaire", 16)),
          staff ? el("button.outil", { title: "Tout effacer", onclick: viderTableau }, icone("corbeille", 16)) : null)]
        : [el("span.etiq.etiq--info", icone("oeil", 13), "Lecture seule")]),
      el("span.pousse"),
      el("div.pages-tableau",
        pagesTableau.map((p, i) => el("button.page-tableau", {
          "aria-current": String(i === indexPage), title: p.title,
          onclick: () => changerPage(i)
        }, String(i + 1))),
        staff ? el("button.page-tableau", { title: "Ajouter une page", onclick: ajouterPage }, icone("plus", 13)) : null),
      staff ? el("select.select-fond", {
        "aria-label": "Fond du tableau",
        onchange: async (e) => {
          await tableaux.majorerPage(page.id, { background: e.target.value });
          page.background = e.target.value;
          moteur.definirFond(nomFond(e.target.value));
        }
      }, FONDS.map((f) => el("option", { value: f.cle, selected: (page.background || "slate") === f.cle }, f.libelle))) : null,
      staff ? el("button.btn", { onclick: basculerParticipation },
        icone("eleves", 14), tableau.mode === "locked" ? "Ouvrir aux élèves" : "Fermer aux élèves") : null,
      staff ? el("button.btn", { onclick: capturer }, icone("appareil", 14), "Capturer") : null
    );
  }

  function annulerTrace() {
    const action = moteur.annuler();
    if (!action) return;
    if (action.type === "retrait") tableaux.supprimerElement(action.element.id).catch(() => {});
    else reinserer(action.element);
  }
  function refaireTrace() {
    const action = moteur.refaire();
    if (!action) return;
    if (action.type === "ajout") reinserer(action.element);
    else tableaux.supprimerElement(action.element.id).catch(() => {});
  }
  async function reinserer(element) {
    try {
      await tableaux.ajouterElement({
        id: element.id, page_id: pagesTableau[indexPage].id, kind: element.kind,
        data: element.data, author_id: moiId, z: element.z, deleted: false
      });
    } catch (err) {
      if (estEncreEpuisee(err)) toast("Plus d'encre", { corps: MESSAGE_ENCRE_EPUISEE, type: "attn" });
    }
  }

  async function viderTableau() {
    const ok = await confirmer({
      titre: "Effacer le tableau", libelle: "Effacer", danger: true,
      message: "Tout le contenu de cette page de tableau sera perdu. Les pages capturées dans le cahier restent intactes."
    });
    if (!ok) return;
    const page = pagesTableau[indexPage];
    await tableaux.viderPage(page.id);
    moteur.vider();
    canalSession?.envoyer("vider", { page: page.id });
  }

  async function ajouterPage() {
    const page = await tableaux.ajouterPage(tableau.id);
    pagesTableau.push(page);
    await changerPage(pagesTableau.length - 1);
  }

  async function changerPage(index) {
    indexPage = index;
    if (staff) {
      tableau = await tableaux.majorer(tableau.id, { current_page: index });
      await diffuserFocus({ kind: "tableau", page: index });
    }
    scene = "tableau"; documentAffiche = null;
    await peindreTableau();
  }

  async function basculerParticipation() {
    const mode = tableau.mode === "locked" ? "open" : "locked";
    tableau = await tableaux.majorer(tableau.id, { mode });
    toast(mode === "open" ? "Les élèves peuvent tracer au tableau" : "Tableau fermé aux élèves");
    await peindreTableau();
  }

  /** Une capture du tableau, versée dans le cahier commun de la classe. */
  async function capturer() {
    try {
      const commun = await cahiers.commun(classe.id);
      if (!commun) { toast("Cette classe n'a pas de cahier commun", { type: "attn" }); return; }
      const page = pagesTableau[indexPage];
      await pages.capturerTableau(page.id, commun.id, `Tableau — ${new Date().toLocaleDateString("fr-FR")}`, moteur.instantane());
      succes("Capture ajoutée au cahier commun");
    } catch (err) { erreur("Capture impossible", messageErreur(err)); }
  }

  function brancherCanalTableau(pageId) {
    canalTableau?.fermer();
    canalTableau = temps.sabonner({
      cle: `tableau:${pageId}`,
      tables: [{ table: "board_elements", filtre: `page_id=eq.${pageId}` }],
      surChangement: ({ type, nouveau, ancien }) => {
        if (!moteur) return;
        if (type === "INSERT" && nouveau.author_id !== moiId) {
          moteur.ajouterElement({ id: nouveau.id, kind: nouveau.kind, data: nouveau.data, z: nouveau.z });
        } else if (type === "UPDATE" && nouveau.deleted) moteur.retirerElement(nouveau.id);
        else if (type === "DELETE") moteur.retirerElement(ancien?.id);
      }
    });
  }

  /* --- Scène : un exercice (lancé par le professeur, reçu par toute la classe) --- */
  let racineExercice = null;
  function fermerSuiviExercice() {
    racineExercice?.dispatchEvent(new Event("ojm:detruire"));
    racineExercice = null;
  }

  async function peindreExercice() {
    fermerSuiviExercice();
    const ex = exerciceAffiche;
    if (!ex) { await peindreTableau(); return; }
    const questions = await exercices.questions(ex.id);
    if (staff) {
      const { noeud } = await vueExercice({
        params: { id: ex.id },
        integre: {
          ongletInitial: ex.status === "live" ? "suivi" : "questions",
          surLancement: async (e) => {
            exerciceAffiche = { ...exerciceAffiche, ...e };
            await diffuserFocus({ kind: "exercice", ref: e.id });
            peindrePanneau();
          },
          ouvrir: (id) => ouvrirExercice(id),
          fermer: async () => { exerciceAffiche = null; scene = "tableau"; await peindreTableau(); peindrePanneau(); }
        }
      });
      racineExercice = noeud;
    } else {
      racineExercice = await vueReponseEleve({ exercice: ex, questions, classe, session });
    }
    render(zoneScene,
      el("div.salle__document",
        el("div.tableau__barre",
          el("strong", ex.title), el("span.pousse"),
          el("button.btn", {
            onclick: async () => {
              const diffuse = session.focus?.kind === "exercice" && session.focus.ref === ex.id;
              if (staff) { if (diffuse) await diffuserFocus({ kind: "tableau", page: indexPage }); }
              else suit = false;
              scene = "tableau"; exerciceAffiche = null;
              await peindreTableau();
            }
          }, "Revenir au tableau")),
        el("div.salle__document-corps", racineExercice)));
  }

  /** Le professeur prépare ou modifie un exercice sans quitter la salle (la classe ne voit rien). */
  async function ouvrirExercice(id) {
    exerciceAffiche = await exercices.lire(id);
    scene = "exercice";
    await peindreExercice();
  }

  /** Un clic : l'exercice est ouvert, annoncé et affiché sur l'écran de toute la classe. */
  async function lancerPourLaClasse(ex) {
    try {
      let courant = ex, neuf = false;
      if (ex.status !== "live") {
        if (!(await exercices.questions(ex.id)).length) { erreur("Exercice vide", "Ajoutez au moins une question."); return; }
        courant = await exercices.lancer(ex.id);
        neuf = true;
        notifications.diffuser(classe.id, { kind: "exercice", titre: `Exercice lancé — ${ex.title}`, lien: `/exercice/${ex.id}` }).catch(() => {});
      }
      exerciceAffiche = { ...ex, ...courant };
      await diffuserFocus({ kind: "exercice", ref: ex.id });
      scene = "exercice";
      await peindreExercice();
      if (neuf) succes("Exercice lancé", "La classe le reçoit sur son écran.");
      peindrePanneau();
    } catch (err) { erreur("Lancement impossible", messageErreur(err)); }
  }

  async function nouvelExercice() {
    const titre = await demander({ titre: "Nouvel exercice", label: "Titre", libelle: "Créer" });
    if (!titre) return;
    try {
      const ex = await exercices.creer({
        class_id: classe.id, author_id: moiId, title: titre, instructions: null,
        status: "draft", exam_mode: false, duration_sec: null, settings: {}
      });
      await ouvrirExercice(ex.id);
      peindrePanneau();
    } catch (err) { erreur("Création impossible", messageErreur(err)); }
  }

  async function panneauExercices() {
    const autres = mesClassesEncadrees().filter((c) => c.id !== classe.id);
    const [ici, ailleurs] = await Promise.all([
      exercices.liste({ class_id: [classe.id] }, 100).catch(() => []),
      autres.length ? exercices.liste({ class_id: autres.map((c) => c.id) }, 100).catch(() => []) : []
    ]);
    const ligne = (ex, copier) => el("li",
      el("span", ex.title, ex.status === "live" ? el("span.etiq.etiq--direct", { style: { marginLeft: "6px" } }, "En cours") : null),
      copier
        ? el("button.btn.btn--petit", {
            onclick: async () => {
              try { await exercices.dupliquer(ex.id, classe.id, moiId); succes("Exercice copié", "Il est dans « À lancer »."); peindrePanneau(); }
              catch (err) { erreur("Copie impossible", messageErreur(err)); }
            }
          }, "Copier ici")
        : el("span.ligne-flex", { style: { gap: "6px" } },
            el("button.btn.btn--fantome.btn--petit", { onclick: () => ouvrirExercice(ex.id) }, "Modifier"),
            el("button.btn.btn--petit", { onclick: () => lancerPourLaClasse(ex) },
              ex.status === "live" ? "Afficher" : ex.status === "draft" ? "Lancer" : "Relancer")));
    const dossier = (titre, items, copier = false, ouvert = true) => el("details", ouvert ? { open: true } : {},
      el("summary", `${titre} (${items.length})`),
      items.length ? el("ul.liste-documents", items.map((ex) => ligne(ex, copier))) : el("p.petit.faible", "Aucun exercice."));
    return el("div",
      el("button.btn.btn--primaire", { onclick: nouvelExercice }, icone("plus", 15), "Nouvel exercice"),
      dossier("À lancer", ici.filter((e) => e.status === "draft")),
      dossier("En cours", ici.filter((e) => e.status === "live")),
      dossier("Déjà faits — à réutiliser", ici.filter((e) => ["closed", "graded"].includes(e.status)), false, false),
      autres.map((c) => dossier(c.name, ailleurs.filter((e) => e.class_id === c.id), true, false)));
  }

  /* --- Scène : un document affiché ---------------------------------------- */
  async function peindreDocument() {
    fermerSuiviExercice();
    if (!documentAffiche) { await peindreTableau(); return; }
    const d = documentAffiche;
    let url = null;
    try { url = await documents.url(d); } catch { /* introuvable */ }
    const contenu = !url ? el("p.faible", "Ce document n'est plus disponible.")
      : d.kind === "image" ? el("img.salle__image", { src: url, alt: d.title })
      : d.kind === "pdf" ? el("iframe.salle__pdf", { src: url, title: d.title })
      : el("a.btn", { href: url, target: "_blank", rel: "noopener" }, icone("telecharger", 14), "Ouvrir le document");
    render(zoneScene,
      el("div.salle__document",
        el("div.tableau__barre",
          el("strong", d.title), el("span.pousse"),
          el("button.btn", {
            onclick: async () => {
              if (staff) await diffuserFocus({ kind: "tableau", page: indexPage });
              else suit = false;
              scene = "tableau"; documentAffiche = null;
              await peindreTableau();
            }
          }, "Revenir au tableau"),
          url ? el("a.btn.btn--fantome", { href: url, target: "_blank", rel: "noopener" }, "Ouvrir à part") : null),
        el("div.salle__document-corps", contenu)));
  }

  /** Le professeur change ce que la classe regarde. */
  async function diffuserFocus(focus) {
    session.focus = focus;
    try { await depotSessions.majorer(session.id, { focus }); } catch (err) { console.warn("[salle] focus", err); }
    canalSession?.envoyer("focus", focus);
  }

  async function appliquerFocus(focus, force = false) {
    if (!focus || (!staff && !suit && !force)) return;
    if (focus.kind === "exercice") {
      exerciceAffiche = await exercices.lire(focus.ref).catch(() => null);
      scene = "exercice";
      await peindreExercice();
    } else if (focus.kind === "document") {
      documentAffiche = await documents.lire(focus.ref).catch(() => null);
      scene = "document";
      await peindreDocument();
    } else {
      scene = "tableau"; documentAffiche = null;
      if (typeof focus.page === "number") {
        if (focus.page >= pagesTableau.length) pagesTableau = await tableaux.pages(tableau.id);
        indexPage = Math.min(focus.page, Math.max(0, pagesTableau.length - 1));
      }
      await peindreTableau();
    }
  }

  /* --- Panneau : mon cahier, documents, présents -------------------------- */
  async function peindrePanneau() {
    const liste = [{ cle: "cahier", libelle: "Mon cahier" }, { cle: "documents", libelle: "Documents" },
      ...(staff ? [{ cle: "exercices", libelle: "Exercices" }] : []),
    ];
    const corps = await contenuPanneau();
    render(zonePanneau,
      fOnglets(liste, ongletPanneau, (cle) => { ongletPanneau = cle; peindrePanneau(); }),
      el("div.salle__panneau-corps", corps));
  }

  async function contenuPanneau() {
    if (ongletPanneau !== "cahier") { editeur?.detruire(); editeur = null; }
    if (ongletPanneau === "exercices" && staff) return await panneauExercices();
    if (ongletPanneau === "documents") return await panneauDocuments();
    if (ongletPanneau === "presents") return panneauPresents();
    return await panneauCahier();
  }

  async function panneauCahier() {
    editeur?.detruire(); editeur = null;
    const mes = await cahiers.mesCahiers(moiId);
    if (!mes.length) {
      return blocVide("Pas encore de cahier",
        "Créez un cahier pour prendre vos notes pendant le cours.",
        { libelle: "Mes cahiers", action: () => aller("/") });
    }
    const dernier = local.lire("ojm.dernierCahier", null);
    const choisi = mes.find((c) => c.id === dernier) || mes[0];
    editeur = creerEditeurCahier({ cahier: choisi, peutEcrire: true, compact: true });
    return el("div.salle__cahier",
      el("select.select-cahier", {
        "aria-label": "Choisir le cahier",
        onchange: (e) => { local.ecrire("ojm.dernierCahier", e.target.value); peindrePanneau(); }
      }, mes.map((c) => el("option", { value: c.id, selected: c.id === choisi.id }, c.title))),
      editeur.noeud);
  }

  async function panneauDocuments() {
    const liste = await documents.liste({ class_id: classe.id }).catch(() => []);
    const visibles = staff ? liste : liste.filter((d) => d.shared);
    if (!visibles.length) return blocVide("Aucun document", `Le ${L("professeur")} n'en a pas encore partagé.`);
    return el("ul.liste-documents", visibles.map((d) => el("li",
      el("span", d.title),
      el("button.btn.btn--petit", {
        onclick: async () => {
          if (staff) {
            if (!d.shared) await documents.majorer(d.id, { shared: true });
            await diffuserFocus({ kind: "document", ref: d.id });
          } else suit = false;
          documentAffiche = d; scene = "document";
          await peindreDocument();
        }
      }, staff ? "Afficher à la classe" : "Ouvrir"))));
  }

  function panneauPresents() {
    if (!participants.length) return el("p.faible", "Personne en ligne pour l'instant.");
    return el("ul.liste-presents", participants.map((p, i) => el("li",
      el("span.pastille-couleur", { style: { background: COULEURS_PARTICIPANTS[i % COULEURS_PARTICIPANTS.length] } }),
      el("span", p.nom), p.role === "teacher" ? el("span.etiq", L("professeur")) : null)));
  }

  /* --- Annonce, fin ------------------------------------------------------- */
  async function annoncer() {
    const texte = await demander({ titre: "Annonce à la classe", label: "Message", multiligne: true, libelle: "Publier" });
    if (!texte) return;
    try {
      await annonces.creer({
        class_id: classe.id, session_id: session.id, author_id: moiId,
        title: texte, body: null, level: "important"
      });
      canalSession?.envoyer("annonce", { titre: texte });
      succes("Annonce publiée");
    } catch (err) { erreur("Annonce impossible", messageErreur(err)); }
  }

  async function terminer() {
    const ok = await confirmer({
      titre: "Terminer la séance", libelle: "Terminer et archiver",
      message: "Le tableau, les présences et les documents affichés seront archivés. Les élèves quitteront la salle."
    });
    if (!ok) return;
    try {
      await depotSessions.terminer(session.id);
      local.ecrire("ojm.derniereSalle", null);
      canalSession?.envoyer("fin", { session: session.id });
      definir({ sessionActive: null });
      succes("Séance terminée");
      aller(`/archive/${session.id}`);
    } catch (err) { erreur("Clôture impossible", messageErreur(err)); }
  }

  function surFin() {
    if (quitte) return;
    local.ecrire("ojm.derniereSalle", null);
    definir({ sessionActive: null });
    toast("Séance terminée", { corps: `Le ${L("professeur")} a clos la séance.`, type: "attn", duree: 8000 });
    aller(`/classe/${classe.id}`);
  }

  /* --- Temps réel --------------------------------------------------------- */
  canalSession = temps.sabonner({
    cle: `session:${session.id}`,
    tables: [
      { table: "class_sessions", filtre: `id=eq.${session.id}` },
      { table: "board_pages", filtre: `board_id=eq.${tableau.id}` },
      { table: "boards", filtre: `id=eq.${tableau.id}` }
    ],
    surChangement: async ({ table, type, nouveau }) => {
      if (quitte) return;
      if (table === "class_sessions" && nouveau?.status === "ended") return surFin();
      if (table === "boards" && nouveau) {
        const change = nouveau.mode !== tableau.mode || JSON.stringify(nouveau.allowed) !== JSON.stringify(tableau.allowed);
        tableau = { ...tableau, ...nouveau };
        if (change && scene === "tableau") await peindreTableau();
      }
      if (table === "board_pages") {
        pagesTableau = await tableaux.pages(tableau.id);
        if (type === "UPDATE" && scene === "tableau" && nouveau?.id === pagesTableau[indexPage]?.id) {
          moteur?.definirFond(nomFond(nouveau.background));
        }
      }
    },
    diffusion: {
      fragment: (f) => { if (scene === "tableau" && f.page === pagesTableau[indexPage]?.id) moteur?.fragmentDistant(f); },
      curseur: (p) => {
        if (scene !== "tableau" || p.id === moiId || p.page !== pagesTableau[indexPage]?.id) return;
        const i = Math.max(0, participants.findIndex((x) => x.user_id === p.id));
        moteur?.curseurDistant(p.id, p.x, p.y, p.nom, COULEURS_PARTICIPANTS[i % COULEURS_PARTICIPANTS.length]);
      },
      vider: ({ page }) => { if (scene === "tableau" && page === pagesTableau[indexPage]?.id) moteur?.vider(); },
      focus: (focus) => { session.focus = focus; if (!staff) appliquerFocus(focus); },
      annonce: ({ titre }) => { if (!staff) toast("Annonce", { corps: titre, type: "attn", duree: 9000 }); },
      fin: () => surFin()
    },
    presence: {
      meta: { user_id: moiId, nom: monNom(), role: staff ? "teacher" : "student", horodatage: Date.now() },
      surMaj: (liste) => {
        const uniques = new Map();
        for (const p of liste) if (p?.user_id) uniques.set(p.user_id, p);
        participants = [...uniques.values()].sort((a, b) =>
          (a.role === "teacher" ? -1 : 1) - (b.role === "teacher" ? -1 : 1) || String(a.nom).localeCompare(String(b.nom)));
        peindreBarre();
        if (ongletPanneau === "presents") peindrePanneau();
      }
    }
  });

  /* --- Démarrage ---------------------------------------------------------- */
  await depotPresence.pointer(session.id).catch((err) => console.warn("[salle] pointage", err));
  peindreBarre();
  if (!staff && suit && session.focus?.kind) await appliquerFocus(session.focus, true);
  else await peindreTableau();
  await peindrePanneau();
  modePleineVue(true);

  return {
    noeud: racine,
    titre: session.title || classe.name,
    nettoyer: () => {
      quitte = true;
      oublierFlottant();
      canalSession?.fermer(); canalTableau?.fermer();
      editeur?.detruire();
      modePleineVue(false);
      definir({ sessionActive: null });
    }
  };
}
