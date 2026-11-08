/* ---------------------------------------------------------------------------
 * Châssis : une barre de contexte (où je suis, onglets, encre), la vue, et un
 * tiroir pour tout le reste. Rendu une seule fois ; seuls les fragments
 * concernés sont recalculés.
 *
 * En fenêtre flottante (posée à côté du jeu), on ne propose que l'essentiel :
 * les cahiers et les documents.
 * ------------------------------------------------------------------------- */
import { el, render } from "./dom.js";
import { icone } from "./icons.js";
import { etat, observer, definir } from "../core/store.js";
import { aller, chemin } from "../core/router.js";
import { config } from "../core/config.js";
import { L } from "../core/lexique.js";
import { estEnseignant, estAdmin, estModerateur, encadreUneClasse } from "../core/permissions.js";
import { initiales, local } from "../core/util.js";
import { menu } from "./modal.js";
import { docHote, fenetreHote } from "../core/hote.js";
import { construireBarreActions } from "./barre-actions.js";
import { basculerFenetreFlottante, estFlottant, flottantAuPremierPlan, flottantDisponible }
  from "../features/fenetre-flottante.js";
import { deconnecter, notificationsNonLues, rafraichirNotifications } from "../core/session.js";
import { barreConsole } from "../features/console-rp.js";
import { marque, nomDuSite } from "../features/apparence.js";
import { ecouter } from "../core/bus.js";
import { jaugeEncre } from "../features/encre.js";
import { notifications as depotNotifications, pilote } from "../data/index.js";

let refs = {};

export function construireChassis(hote) {
  // Plus de rail ni de tableau de bord : une ligne de contexte en haut (où je
  // suis), la vue, et la barre des gestes en bas. Le reste de l'application
  // se range dans le tiroir « ⋯ ».
  const chassis = el("div.chassis.chassis--monde", { dataset: { taille: "grand" } },
    el("header.contexte",
      refs.sceau = el("button.contexte__sceau", { type: "button", title: "Chez moi", "aria-label": "Chez moi",
        onclick: () => aller("/") }, marque()),
      refs.fil = el("div.contexte__lieu"),
      refs.onglets = el("nav.nav-principale", { "aria-label": "Navigation principale" }),
      refs.statut = el("div.contexte__statut"),
      refs.outils = el("div.contexte__outils")
    ),
    refs.vue = el("div#vue.vue", { role: "main", tabindex: "-1" }),
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
  peindreOnglets();
  suivreLaTaille();

  const marquerRoute = () => { document.body.dataset.route = etat.route?.nom || ""; };
  marquerRoute();
  observer("route", marquerRoute);
  observer(["route", "classes", "profil"], () => { peindreRail(); peindreFil(); peindreOnglets(); majActions(); });
  observer(["notifications", "reseau", "utilisateur", "flottant"], peindreOutils);
  // La marque (logo ou nom) suit les réglages d'apparence, en direct.
  ecouter("apparence", () => { if (refs.sceau) render(refs.sceau, marque()); peindreRail(); peindreFil(); });
  observer(["classeActive", "sessionActive"], peindreFil);
  observer("flottant", () => { peindreOnglets(); setTimeout(suivreLaTaille, 60); });
  observer("utilisateur", peindreOnglets);

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

/* --- Onglets ---------------------------------------------------------------- */
function onglet(href, libelle, icone_, actif) {
  return el("a.nav-lien", { href: `#${href}`, "aria-current": actif ? "page" : null, title: libelle },
    icone(icone_, 15), el("span.nav-lien__mot", libelle));
}

function peindreOnglets() {
  if (!etat.utilisateur) { render(refs.onglets, []); return; }
  const { nom } = etat.route;
  const chezMoi = nom === "accueil";
  const cahiers = ["cahiers", "cahier"].includes(nom);
  const documents = nom === "documents";
  const classes = ["classes", "classe", "salle"].includes(nom);
  // À côté du jeu, on ne garde que ce qui sert à travailler.
  render(refs.onglets,
    etat.flottant ? null : onglet("/", "Chez moi", "accueil", chezMoi),
    onglet("/cahiers", L("Cahiers"), "cahiers", cahiers),
    onglet("/documents", "Documents", "documents", documents),
    etat.flottant ? null : onglet("/classes", L("Classes"), "classe", classes),
    // À côté du jeu : retrouver d'un clic la séance (tableau + cahier) quittée pour un autre cahier.
    etat.flottant && local.lire("ojm.derniereSalle", null)
      ? onglet(`/classe/${local.lire("ojm.derniereSalle", null)}/salle`, "Séance", "tableau", nom === "salle") : null
  );
}

/* --- Tiroir ----------------------------------------------------------------- */
function lienRail(href, libelle, icone_, compteur = null) {
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
        el("span.tiroir__mail", nomDuSite())),
      el("button.contexte__bouton", { type: "button", "aria-label": "Fermer", onclick: fermer }, icone("croix", 15))),
    el("div.rail__titre", "Mes lieux"),
    lienRail("/", "Chez moi", "accueil"),
    lienRail("/classes", `Mes ${L("classes")}`, "classe", classesActives.length || null),
    ...classesActives.slice(0, 6).map((c) => lienRail(`/classe/${c.id}`, c.name, "entree")),
    el("div.rail__titre", "Mes affaires"),
    lienRail("/affaires", "Tout ce que je possède", "sac"),
    lienRail("/cahiers", `Mes ${L("cahiers")}`, "cahiers"),
    lienRail("/papiers", "Papiers et dossiers", "papier"),
    lienRail("/documents", "Documents", "documents"),
    lienRail("/boutique", "Encre et cahiers", "stylo"),
    lienRail("/exercices", L("Exercices"), "exercices"),
    lienRail("/archives", "Archives", "archives"),
    lienRail("/recherche", "Rechercher", "recherche"),

    enseignant ? el("div.rail__titre", "Encadrement") : null,
    enseignant ? lienRail("/professeur", "Vue d'ensemble", "grille") : null,
    enseignant ? lienRail("/modeles", "Modèles", "cours") : null,

    estModerateur() ? el("div.rail__titre", estAdmin() ? "Administration" : "Modération") : null,
    estModerateur() ? lienRail("/administration",
      estAdmin() ? "Comptes, boutique, journal" : "Modération et journal", "bouclier") : null,

    el("div.rail__pied",
      etat.utilisateur ? el("button.rail__lien", { type: "button", onclick: async () => {
        fermer();
        const { ouvrirApparence } = await import("../features/mon-personnage.js");
        ouvrirApparence();
      } }, icone("eleves", 16), el("span", "Mon personnage")) : null,
      lienRail("/profil", "Profil", "profil"),
      lienRail("/reglages", "Réglages", "reglages"),
      // La console de commandes : d'ici, ou avec la touche « ² ».
      etat.utilisateur ? el("button.rail__lien", { type: "button", onclick: () => {
        fermer();
        docHote().querySelector(".commandes__bouton")?.click();
      } }, icone("cours", 16), el("span", "Commandes (touche ²)")) : null,
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
    cahiers: [`Mes ${L("cahiers")}`, null], classes: [`Mes ${L("classes")}`, null],
    papiers: ["Papiers", null], affaires: ["Mes affaires", null], boutique: ["Encre et cahiers", null],
    documents: ["Documents", null], exercices: [L("Exercices"), null], exercice: [L("Exercice"), null],
    archives: ["Archives", null], archive: ["Archive", null], profil: ["Profil", null], reglages: ["Réglages", null],
    professeur: [`Espace ${L("professeur")}`, null],
    modeles: ["Modèles", null], administration: ["Administration", null], recherche: ["Recherche", null],
    connexion: [nomDuSite(), null]
  };
  // Les trois onglets disent déjà où l'on est : pas la peine de le répéter.
  if (["accueil", "cahiers", "documents", "classes"].includes(nom)) { render(refs.fil, []); return; }
  const [lieu, precision] = lieux[nom] || [nomDuSite(), null];
  const direct = etat.sessionActive?.status === "live" && nom === "salle";
  render(refs.fil,
    el("span.contexte__nom", lieu),
    precision ? el("span.contexte__precision", precision) : null,
    direct ? el("span.contexte__direct", "En séance") : null);
}

/** Un écran peut poser sa ligne d'état. */
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

  // La barre du haut est minuscule : des icônes, pas de phrases. Tout ce qui
  // demande des mots passe en info-bulle.
  render(refs.outils,
    etatReseau !== "ok" ? el("span.contexte__reseau", { dataset: { etat: etatReseau }, title: libelleReseau, "aria-label": libelleReseau },
      el("span.contexte__voyant"), etatReseau === "local" ? el("span", "Démo") : null) : null,

    etat.utilisateur ? jaugeEncre({ compacte: Boolean(etat.flottant) }) : null,

    flottantDisponible() && etat.utilisateur ? el("button.contexte__bouton.contexte__bouton--flottant", {
      type: "button",
      "aria-label": estFlottant() ? "Revenir dans le navigateur" : "Au-dessus du jeu",
      title: estFlottant() ? "Revenir dans le navigateur"
        : flottantAuPremierPlan() ? "Mode flottant : poser le cahier par-dessus la fenêtre de jeu" : "Détacher dans sa propre fenêtre",
      "aria-pressed": String(estFlottant()),
      onclick: () => basculerFenetreFlottante()
    }, icone(estFlottant() ? "entree" : "incruste", 15)) : null,

    etat.utilisateur ? el("button.contexte__bouton", {
      type: "button",
      "aria-label": `Notifications${nonLues ? ` (${nonLues} non lues)` : ""}`,
      title: "Notifications",
      onclick: (e) => panneauNotifications(e.currentTarget)
    },
      icone("cloche", 15),
      nonLues ? el("span.contexte__pastille", nonLues > 9 ? "9+" : String(nonLues)) : null
    ) : null,

    etat.utilisateur ? el("button.contexte__bouton", {
      type: "button", "aria-label": "Tout le reste", title: "Tout le reste",
      onclick: () => docHote().body.classList.toggle("tiroir-ouvert")
    }, icone("points", 15)) : null
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
