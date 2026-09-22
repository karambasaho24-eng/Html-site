/* ---------------------------------------------------------------------------
 * CLASSE PARALLÈLE — amorçage.
 *
 * Environnement scolaire numérique fonctionnant en parallèle d'un serveur
 * Roblox RP : les cahiers, le tableau, les documents, les exercices et la vie
 * de classe vivent ici, le jeu reste dédié au RolePlay.
 * ------------------------------------------------------------------------- */
import { initialiserDonnees, auth, pilote } from "./data/index.js";
import { definirRoute, demarrerRouteur, aller, resoudre } from "./core/router.js";
import { chargerSession, rafraichirNotifications } from "./core/session.js";
import { etat, definir } from "./core/store.js";
import { construireChassis, zoneVue } from "./ui/chassis.js";
import { surveillerReseau } from "./core/reseau.js";
import { restaurerInterface, activerRaccourcis, enregistrerAction, cyclerDensite, appliquerDensite } from "./core/interface.js";
import { erreur, toast } from "./ui/toast.js";
import { el, render } from "./ui/dom.js";
import { ecouter } from "./core/bus.js";
import { stockageLocal, stockageSession } from "./core/stockage.js";

/* --- Table de routage ------------------------------------------------------ */
function declarerRoutes() {
  // Les imports sont écrits en toutes lettres plutôt que construits à la
  // volée : chaque vue reste chargée à la demande, mais le chemin est
  // analysable statiquement — ce qui permet aussi d'empaqueter l'application
  // en un fichier unique pour les contextes qui ne servent pas de modules.
  definirRoute("/connexion",        { nom: "connexion", vue: () => import("./vues/auth.js"), publique: true });
  definirRoute("/",                 { nom: "accueil", vue: () => import("./vues/accueil.js"), prive: true });
  definirRoute("/cahiers",          { nom: "cahiers", vue: () => import("./vues/cahiers.js"), prive: true });
  definirRoute("/cahier/:id",       { nom: "cahier", vue: () => import("./vues/cahier.js"), prive: true });
  definirRoute("/papiers",          { nom: "papiers", vue: () => import("./vues/papiers.js"), prive: true });
  definirRoute("/classes",          { nom: "classes", vue: () => import("./vues/classes.js"), prive: true });
  definirRoute("/classe/:id",       { nom: "classe", vue: () => import("./vues/classe.js"), prive: true });
  definirRoute("/classe/:id/salle", { nom: "salle", vue: () => import("./vues/salle.js"), prive: true });
  definirRoute("/documents",        { nom: "documents", vue: () => import("./vues/documents.js"), prive: true });
  definirRoute("/bibliotheque",     { nom: "bibliotheque", vue: () => import("./vues/documents.js"), prive: true });
  definirRoute("/exercices",        { nom: "exercices", vue: () => import("./vues/exercices.js"), prive: true });
  definirRoute("/exercice/:id",     { nom: "exercice", vue: () => import("./vues/exercice.js"), prive: true });
  definirRoute("/archives",         { nom: "archives", vue: () => import("./vues/archives.js"), prive: true });
  definirRoute("/archive/:id",      { nom: "archive", vue: () => import("./vues/archive.js"), prive: true });
  definirRoute("/professeur",       { nom: "professeur", vue: () => import("./vues/professeur.js"), prive: true });
  definirRoute("/modeles",          { nom: "modeles", vue: () => import("./vues/modeles.js"), prive: true });
  definirRoute("/administration",   { nom: "administration", vue: () => import("./vues/administration.js"), prive: true });
  definirRoute("/recherche",        { nom: "recherche", vue: () => import("./vues/recherche.js"), prive: true });
  definirRoute("/profil",           { nom: "profil", vue: () => import("./vues/profil.js"), prive: true });
  definirRoute("/reglages",         { nom: "reglages", vue: () => import("./vues/reglages.js"), prive: true });
  definirRoute("*",                 { nom: "introuvable", vue: () => import("./vues/introuvable.js") });
}

/* --- Raccourcis globaux ---------------------------------------------------- */
function declarerRaccourcis() {
  enregistrerAction("cahiers.liste",    () => aller("/cahiers"));
  enregistrerAction("classes.liste",    () => aller("/classes"));
  enregistrerAction("recherche.ouvrir", () => aller("/recherche"));
  enregistrerAction("densite.cycler",   () => cyclerDensite());
  enregistrerAction("densite.minimal",  () => appliquerDensite(etat.densite === "minimal" ? "grand" : "minimal"));
  enregistrerAction("aide.raccourcis",  () => aller("/reglages?onglet=raccourcis"));
  enregistrerAction("cahier.ouvrir", () => {
    const dernier = etat.cahiers?.[0];
    aller(dernier ? `/cahier/${dernier.id}` : "/cahiers");
  });
  enregistrerAction("tableau.ouvrir", () => {
    if (etat.classeActive) aller(`/classe/${etat.classeActive.id}/salle`);
    else aller("/classes");
  });
}

/* --- Démarrage -------------------------------------------------------------- */
async function demarrer() {
  const ecran = document.getElementById("ecran-chargement");
  const hote = document.getElementById("application");

  try {
    restaurerInterface();
    await initialiserDonnees();

    if (pilote.repli) {
      toast("Projet Supabase injoignable", {
        corps: "Bascule en mode démonstration locale. Vérifiez la configuration dans Réglages.",
        type: "attn", duree: 9000
      });
    }

    await chargerSession();

    hote.hidden = false;
    const vue = construireChassis(hote);

    declarerRoutes();
    declarerRaccourcis();
    activerRaccourcis();
    surveillerReseau();

    demarrerRouteur(vue, {
      rendu: (noeud) => render(vue, noeud)
    });

    // Réaction aux changements d'authentification (autre onglet, expiration…)
    auth.surChangement(async (evenement) => {
      if (evenement === "SIGNED_OUT") {
        definir({ utilisateur: null, profil: null, classes: [], notifications: [] });
        aller("/connexion");
      } else if (evenement === "SIGNED_IN" || evenement === "TOKEN_REFRESHED") {
        if (!etat.utilisateur) {
          await chargerSession();
          const retour = stockageSession.getItem("ojm.retour");
          stockageSession.removeItem("ojm.retour");
          aller(retour ? retour.replace(/^#/, "") : "/");
        }
      }
    });

    // Rafraîchissement périodique discret des notifications
    setInterval(() => {
      if (document.visibilityState === "visible" && etat.utilisateur) rafraichirNotifications();
    }, 90_000);

    definir({ pret: true });
    ecran?.remove();

    if (!etat.utilisateur && !location.hash.startsWith("#/connexion")) {
      aller("/connexion", true);
    }
  } catch (err) {
    console.error("[amorçage]", err);
    ecran?.remove();
    hote.hidden = false;
    render(hote, ecranPanne(err));
  }
}

function ecranPanne(err) {
  return el("div.page",
    el("div.page__entete",
      el("div.page__titre",
        el("span.page__surtitre", "Panne au démarrage"),
        el("h1", "L'académie n'a pas pu s'ouvrir")
      )
    ),
    el("div.carte",
      el("p", "Une erreur est survenue pendant l'initialisation :"),
      el("pre.mono.petit", { style: { whiteSpace: "pre-wrap", color: "var(--alerte)" } }, String(err?.message || err)),
      el("p.doux.petit", "Vérifiez la configuration Supabase dans config.js, ou relancez en mode démonstration en laissant les champs vides."),
      el("div.ligne-flex",
        el("button.btn.btn--primaire", { onclick: () => location.reload() }, "Recharger"),
        el("button.btn", {
          onclick: () => {
            try { stockageLocal.removeItem("ojm.config"); } catch { /* ignoré */ }
            location.reload();
          }
        }, "Réinitialiser la configuration locale")
      )
    )
  );
}

/* Les erreurs non capturées ne doivent jamais laisser l'écran figé. */
window.addEventListener("unhandledrejection", (evenement) => {
  console.error("[promesse]", evenement.reason);
  if (etat.pret) erreur("Une action a échoué", evenement.reason?.message);
});

ecouter("route:erreur", ({ erreur: err }) => {
  render(zoneVue(), el("div.page",
    el("div.vide",
      el("span.vide__titre", "Cette page n'a pas pu s'afficher"),
      el("p", String(err?.message || err)),
      el("button.btn", { onclick: () => resoudre() }, "Réessayer")
    )
  ));
});

demarrer();
