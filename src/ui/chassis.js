/* ---------------------------------------------------------------------------
 * Châssis : marque, barre supérieure, rail de navigation, zone de vue.
 * Rendu une seule fois ; seuls les fragments concernés sont recalculés.
 * ------------------------------------------------------------------------- */
import { el, render } from "./dom.js";
import { icone } from "./icons.js";
import { etat, observer, definir } from "../core/store.js";
import { aller, chemin } from "../core/router.js";
import { config } from "../core/config.js";
import { L } from "../core/lexique.js";
import { estEnseignant, estAdmin, estModerateur, encadreUneClasse } from "../core/permissions.js";
import { initiales } from "../core/util.js";
import { menu } from "./modal.js";
import { docHote, fenetreHote } from "../core/hote.js";
import { construireBarreActions } from "./barre-actions.js";
import { basculerFenetreFlottante, ouvrirFenetreFlottante, estFlottant,
         flottantAuPremierPlan, flottantDisponible, FORMES }
  from "../features/fenetre-flottante.js";
import { deconnecter, notificationsNonLues, rafraichirNotifications } from "../core/session.js";
import { barreConsole } from "../features/console-rp.js";
import { basculerTheme, appliquerDensite, DENSITES } from "../core/interface.js";
import { notifications as depotNotifications } from "../data/index.js";
import { pilote } from "../data/index.js";

let refs = {};

export function construireChassis(hote) {
  // Plus de rail ni de tableau de bord : une ligne de contexte en haut (où je
  // suis), la vue, et la barre des gestes en bas. Le reste de l'application
  // se range dans le tiroir « ⋯ ».
  const chassis = el("div.chassis.chassis--monde", { dataset: { taille: "grand" } },
    el("header.contexte",
      el("button.contexte__sceau", { type: "button", title: "Chez moi", "aria-label": "Chez moi",
        onclick: () => aller("/") }, icone("accueil", 16)),
      refs.fil = el("div.contexte__lieu"),
      refs.statut = el("div.contexte__statut"),
      refs.outils = el("div.contexte__outils")
    ),
    refs.vue = el("main#vue.vue", { tabindex: "-1" }),
    refs.actions = construireBarreActions(),
    refs.rail = el("nav.rail.tiroir", { "aria-label": "Tout le reste" }),
    refs.console = el("div.console-hote", { hidden: true })
  );
  refs.chassis = chassis;

  render(hote, chassis);
  peindreRail();
  peindreOutils();
  peindreFil();
  majActions();
  suivreLaTaille();

  observer(["route", "classes", "profil"], () => { peindreRail(); peindreFil(); majActions(); });
  observer(["notifications", "reseau", "densite", "theme", "utilisateur", "flottant"], peindreOutils);
  observer(["classeActive", "sessionActive"], peindreFil);
  observer("flottant", () => setTimeout(suivreLaTaille, 60));

  // Le tiroir se referme comme on s'y attend : Échap, un clic à côté, ou
  // dès qu'on est allé quelque part.
  const fermerTiroir = () => docHote().body.classList.remove("tiroir-ouvert");
  observer("route", fermerTiroir);
  const docsBranches = new WeakSet();
  const brancherDoc = (doc) => {
    if (!doc || docsBranches.has(doc)) return;
    docsBranches.add(doc);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerTiroir(); });
    doc.addEventListener("pointerdown", (e) => {
      if (!docHote().body.classList.contains("tiroir-ouvert")) return;
      if (e.target.closest?.(".tiroir, .contexte__bouton")) return;
      fermerTiroir();
    }, true);
  };
  brancherDoc(hote.ownerDocument);
  // La fenêtre posée sur le jeu est un autre document : on l'écoute aussi.
  observer("flottant", () => setTimeout(() => brancherDoc(docHote()), 80));

  return refs.vue;
}

/**
 * La taille décide du COMPORTEMENT, pas seulement du zoom : au-dessous d'un
 * certain seuil, la scène cède la place à la console (un panneau à la fois).
 */
function suivreLaTaille() {
  const chassis = refs.chassis;
  const calculer = () => {
    const r = chassis.getBoundingClientRect();
    const w = r.width || fenetreHote().innerWidth;
    const h = r.height || fenetreHote().innerHeight;
    const t = w >= 1000 && h >= 620 ? "grand"
      : w >= 720 && h >= 460 ? "moyen"
      : w >= 360 && h >= 330 ? "compact"
      : "mini";
    if (chassis.dataset.taille !== t) {
      chassis.dataset.taille = t;
      docHote().body.dataset.taille = t;
      definir({ taille: t });
    }
  };
  refs.ecouteTaille?.();
  const fen = fenetreHote();
  fen.addEventListener("resize", calculer);
  let ro = null;
  try { ro = new fen.ResizeObserver(calculer); ro.observe(chassis); } catch { /* ancien navigateur */ }
  refs.ecouteTaille = () => { fen.removeEventListener("resize", calculer); ro?.disconnect(); };
  calculer();
}

/** La barre des gestes n'a pas sa place là où l'écran a déjà la sienne. */
function majActions() {
  const nom = etat.route?.nom;
  const cachee = !etat.utilisateur || ["connexion", "salle"].includes(nom);
  refs.actions.hidden = cachee;
  refs.chassis?.classList.toggle("chassis--sans-actions", cachee);
}

/* --- Rail ------------------------------------------------------------------ */
function lienRail(href, nom, libelle, icone_, compteur = null) {
  const actif = chemin() === href || (href !== "/" && chemin().startsWith(href));
  return el("a.rail__lien", {
    href: `#${href}`,
    "aria-current": actif ? "page" : null,
    title: libelle,
    onclick: () => docHote().body.classList.remove("tiroir-ouvert")
  }, icone(icone_, 16), el("span", libelle),
     compteur ? el("span.compteur", String(compteur)) : null);
}

function peindreRail() {
  const enseignant = encadreUneClasse();
  const classesActives = etat.classes.filter((c) => !c.archived);
  const fermer = () => docHote().body.classList.remove("tiroir-ouvert");

  render(refs.rail,
    el("div.tiroir__entete",
      el("div.tiroir__qui",
        el("span.tiroir__nom", etat.profil?.display_name || "—"),
        el("span.tiroir__mail", "Pseudo RP")),
      el("button.contexte__bouton", { type: "button", "aria-label": "Fermer", onclick: fermer }, icone("croix", 15))),
    el("div.rail__titre", "Mes lieux"),
    lienRail("/", "accueil", "Chez moi", "accueil"),
    lienRail("/classes", "classes", "Mes espaces", "classe", classesActives.length || null),
    ...classesActives.slice(0, 6).map((c) => lienRail(`/classe/${c.id}`, "classe", c.name, "entree")),
    el("div.rail__titre", "Mes affaires"),
    lienRail("/affaires", "affaires", "Tout ce que je possède", "sac"),
    lienRail("/cahiers", "cahiers", `Mes ${L("cahiers")}`, "cahiers"),
    lienRail("/papiers", "papiers", "Papiers et dossiers", "papier"),
    lienRail("/documents", "documents", "Documents", "documents"),
    lienRail("/exercices", "exercices", L("Exercices"), "exercices"),
    lienRail("/archives", "archives", "Archives", "archives"),
    lienRail("/recherche", "recherche", "Rechercher", "recherche"),

    enseignant ? el("div.rail__titre", "Encadrement") : null,
    enseignant ? lienRail("/professeur", "professeur", "Vue d'ensemble", "grille") : null,
    enseignant ? lienRail("/bibliotheque", "bibliotheque", "Bibliothèque", "livre") : null,
    enseignant ? lienRail("/modeles", "modeles", "Modèles", "cours") : null,

    estModerateur() ? el("div.rail__titre", estAdmin() ? "Administration" : "Modération") : null,
    estModerateur() ? lienRail("/administration", "administration",
      estAdmin() ? "Comptes, modération, journal" : "Modération et journal", "bouclier") : null,

    el("div.rail__pied",
      etat.utilisateur ? el("button.rail__lien", { type: "button", onclick: async () => {
        fermer();
        const { ouvrirApparence } = await import("../features/apparence.js");
        ouvrirApparence();
      } }, icone("eleves", 16), el("span", "Mon personnage")) : null,
      lienRail("/profil", "profil", "Profil", "profil"),
      lienRail("/reglages", "reglages", "Réglages", "reglages"),
      el("button.rail__lien", { type: "button", onclick: () => { basculerTheme(); fermer(); } },
        icone("oeil", 16), el("span", etat.theme === "nuit" ? "Thème clair" : "Thème sombre")),
      etat.utilisateur ? el("button.rail__lien.rail__lien--danger", { type: "button", onclick: async () => {
        fermer(); await deconnecter(); aller("/connexion");
      } }, icone("sortie", 16), el("span", "Se déconnecter")) : null
    )
  );
}

/**
 * Monte ou démonte la console. On la reconstruit à chaque apparition : elle
 * compte ce qui attend une réponse, et ce nombre ne vaut que maintenant.
 */
function majConsole() {
  const visible = Boolean(etat.flottant || etat.console);
  refs.console.hidden = !visible;
  docHote().body.classList.toggle("avec-console", visible);
  render(refs.console, visible ? barreConsole() : []);
}

/* --- L'espace actuel ------------------------------------------------------ */
/** Où je suis : une ligne, jamais un fil d'Ariane de site. */
function peindreFil() {
  const { nom } = etat.route;
  const lieux = {
    accueil: ["Chez moi", null],
    salle: [etat.classeActive?.name || L("Classe"), etat.sessionActive?.title || "En séance"],
    classe: [etat.classeActive?.name || L("Classe"), "Espace"],
    cahier: ["Cahier", etat.classeActive?.name || null],
    cahiers: [`Mes ${L("cahiers")}`, null], classes: ["Mes espaces", null],
    papiers: ["Papiers", null], affaires: ["Mes affaires", null],
    documents: ["Documents", null], exercices: [L("Exercices"), null], exercice: [L("Exercice"), null],
    archives: ["Archives", null], archive: ["Archive", null], profil: ["Profil", null], reglages: ["Réglages", null],
    professeur: [`Espace ${L("professeur")}`, null], bibliotheque: ["Bibliothèque", null],
    modeles: ["Modèles", null], administration: ["Administration", null], recherche: ["Recherche", null],
    connexion: [config.academyName || "Classe Parallèle", null]
  };
  const [lieu, precision] = lieux[nom] || [config.academyName || "Classe Parallèle", null];
  const direct = etat.sessionActive?.status === "live" && nom === "salle";
  render(refs.fil,
    el("span.contexte__nom", lieu),
    precision ? el("span.contexte__precision", precision) : null,
    direct ? el("span.contexte__direct", "En séance") : null,
    etat.modeExamen ? el("span.etiq.etiq--alerte", "Mode examen") : null);
}

/** Un écran peut poser sa ligne d'état (présence du responsable…). */
export function definirStatut(noeud) {
  if (refs.statut) render(refs.statut, noeud || []);
}

/* --- Outils de la barre ---------------------------------------------------- */
function peindreOutils() {
  const nonLues = notificationsNonLues();
  const etatReseau = pilote?.mode === "local" ? "local" : etat.reseau;
  const libelleReseau = {
    ok: "En ligne", rompu: "Hors ligne", reprise: "Reconnexion…", local: "Démonstration"
  }[etatReseau];

  render(refs.outils,
    etatReseau !== "ok" ? el("span.contexte__reseau", { dataset: { etat: etatReseau }, title: libelleReseau },
      el("span.contexte__voyant"), el("span", libelleReseau)) : null,

    flottantDisponible() && etat.utilisateur ? el("button.contexte__action", {
      type: "button",
      "aria-label": estFlottant() ? "Revenir dans le navigateur" : "Au-dessus du jeu",
      title: estFlottant() ? "Revenir dans le navigateur"
        : flottantAuPremierPlan() ? "Poser la fenêtre au-dessus de Roblox" : "Détacher dans sa propre fenêtre",
      "aria-pressed": String(estFlottant()),
      onclick: () => basculerFenetreFlottante()
    }, icone(estFlottant() ? "entree" : "incruste", 15),
      el("span", estFlottant() ? "Revenir" : "Au-dessus du jeu")) : null,

    etat.utilisateur ? el("button.contexte__bouton", {
      type: "button",
      "aria-label": `Notifications${nonLues ? ` (${nonLues} non lues)` : ""}`,
      title: "Notifications",
      onclick: (e) => panneauNotifications(e.currentTarget)
    },
      icone("cloche", 16),
      nonLues ? el("span.contexte__pastille", nonLues > 9 ? "9+" : String(nonLues)) : null
    ) : null,

    etat.utilisateur ? el("button.contexte__bouton", {
      type: "button", "aria-label": "Tout le reste", title: "Tout le reste",
      onclick: () => docHote().body.classList.toggle("tiroir-ouvert")
    }, icone("points", 16)) : null
  );
}

/* --- Panneau de notifications --------------------------------------------- */
export function panneauNotifications(ancre) {
  const liste = etat.notifications.slice(0, 12);
  if (!liste.length) {
    menu(ancre, [{ titre: "Notifications" }, { libelle: "Aucune notification", action: () => {} }]);
    return;
  }
  menu(ancre, [
    { titre: "Notifications" },
    ...liste.map((n) => ({
      libelle: `${n.read_at ? "" : "• "}${n.title}`,
      action: async () => {
        if (!n.read_at) { await depotNotifications.lire(n.id); await rafraichirNotifications(); }
        if (n.link) aller(n.link);
      }
    })),
    { separateur: true },
    {
      libelle: "Tout marquer comme lu", icone: "coche",
      action: async () => {
        await depotNotifications.toutLire(etat.utilisateur.id);
        await rafraichirNotifications();
      }
    }
  ]);
}

export function zoneVue() { return refs.vue; }

/** Affiche la vue en pleine hauteur (tableau, salle, cahier). */
export function modePleineVue(actif) {
  refs.vue?.classList.toggle("vue--pleine", Boolean(actif));
}

/**
 * Le mode immersif : plus de rail ni de barre d'application. Il ne reste que
 * ce que le personnage a devant lui — c'est une interface de jeu, pas un site.
 */
export function modeImmersif(actif) {
  refs.vue?.closest(".chassis")?.classList.toggle("chassis--immersif", Boolean(actif));
}
